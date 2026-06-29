// clawleash desktop companion.
//
// A menubar (tray) app that is a *desktop client of the same local clawleash
// daemon the phone PWA uses*. A background thread polls GET /api/status; when a
// permission is pending it slides a borderless, always-on-top card into the
// bottom-right corner with Allow/Deny. The tray menu can copy the phone link
// (Tailscale-first) to hand off to your phone when you leave.
//
// The daemon owns all the logic; this process only reads the token from
// ~/.config|Library/Application Support/clawleash/config.json and calls the API.

use std::time::Duration;

use serde_json::Value;
use tauri::{
    menu::MenuBuilder,
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, WebviewWindow,
};

// ── config + http ──────────────────────────────────────────────────────────

fn read_config() -> Value {
    if let Some(p) = dirs::config_dir().map(|d| d.join("clawleash").join("config.json")) {
        if let Ok(s) = std::fs::read_to_string(p) {
            if let Ok(v) = serde_json::from_str::<Value>(&s) {
                return v;
            }
        }
    }
    Value::Null
}

fn token_port() -> (String, u64) {
    let c = read_config();
    let token = c.get("token").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let port = c.get("port").and_then(|v| v.as_u64()).unwrap_or(4271);
    (token, port)
}

fn http_get_json(url: &str) -> Result<Value, String> {
    let body = ureq::get(url)
        .timeout(Duration::from_secs(3))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

fn fetch_pending() -> Value {
    let (token, port) = token_port();
    if token.is_empty() {
        return Value::Array(vec![]);
    }
    let url = format!("http://127.0.0.1:{}/api/status?k={}", port, token);
    match http_get_json(&url) {
        Ok(v) => v.get("pending").cloned().unwrap_or(Value::Array(vec![])),
        Err(_) => Value::Array(vec![]),
    }
}

// ── commands ────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_pending() -> Value {
    fetch_pending()
}

#[tauri::command]
fn resolve_permission(id: String, decision: String) -> Result<(), String> {
    let (token, port) = token_port();
    let d = if decision == "allow" { "allow" } else { "deny" };
    let url = format!(
        "http://127.0.0.1:{}/api/permission?k={}&id={}&decision={}",
        port, token, id, d
    );
    ureq::post(&url)
        .timeout(Duration::from_secs(3))
        .call()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn phone_link() -> Result<String, String> {
    let (token, port) = token_port();
    if token.is_empty() {
        return Err("clawleash isn't configured yet".into());
    }
    let url = format!("http://127.0.0.1:{}/api/urls?k={}", port, token);
    let v = http_get_json(&url)?;
    let arr = v.get("urls").and_then(|u| u.as_array()).cloned().unwrap_or_default();
    if arr.is_empty() {
        return Err("no phone URL — connect Wi-Fi or start Tailscale".into());
    }
    let pick = arr
        .iter()
        .find(|u| u.get("kind").and_then(|k| k.as_str()) == Some("tailscale"))
        .or_else(|| arr.first())
        .and_then(|u| u.get("url").and_then(|x| x.as_str()))
        .ok_or_else(|| "no url".to_string())?;
    Ok(pick.to_string())
}

#[tauri::command]
fn copy_phone_link() -> Result<String, String> {
    let link = phone_link()?;
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(link.clone()).map_err(|e| e.to_string())?;
    Ok(link)
}

// The phone link as a scannable QR (SVG) + the raw URL, for the QR window.
#[tauri::command]
fn phone_qr() -> Result<serde_json::Value, String> {
    let link = phone_link()?;
    let code = qrcode::QrCode::new(link.as_bytes()).map_err(|e| e.to_string())?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(220, 220)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#0b0b0d"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build();
    Ok(serde_json::json!({ "url": link, "svg": svg }))
}

// ── window placement ─────────────────────────────────────────────────────────

fn position_bottom_right(win: &WebviewWindow) {
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    if let Some(m) = monitor {
        let msize = m.size();
        let mpos = m.position();
        let scale = m.scale_factor();
        if let Ok(wsize) = win.outer_size() {
            let margin = (16.0 * scale) as i32;
            // Clear a standard bottom Dock so the card sits above it (and the
            // raised window level keeps it on top even if the Dock is larger).
            let dock = (96.0 * scale) as i32;
            let x = mpos.x + msize.width as i32 - wsize.width as i32 - margin;
            let y = mpos.y + msize.height as i32 - wsize.height as i32 - margin - dock;
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
    }
}

// Make the toast a true system overlay on macOS. Two things Tauri's
// cross-platform API can't do:
//   1. `always_on_top` only reaches NSFloatingWindowLevel (3), *below* the Dock
//      (level 20) — so the Dock covers it. We raise the level above the Dock.
//   2. `set_visible_on_all_workspaces` sets only canJoinAllSpaces, so the window
//      shows on normal desktops but NOT over full-screen apps (which get their
//      own Space). Adding fullScreenAuxiliary lets it float over full-screen
//      apps too.
#[cfg(target_os = "macos")]
fn configure_overlay(win: &WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = win.ns_window() {
        let ns = ptr as *mut AnyObject;
        if ns.is_null() {
            return;
        }
        unsafe {
            // CGAssistiveTechHighWindowLevel — floats above the Dock, menu bar,
            // and full-screen apps (the level clawd-on-desk uses).
            let level: isize = 1500;
            let _: () = msg_send![ns, setLevel: level];
            // CanJoinAllSpaces(1<<0) | Stationary(1<<4) | IgnoresCycle(1<<6)
            //   | FullScreenAuxiliary(1<<8) | FullScreenDisallowsTiling(1<<12)
            let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8) | (1 << 12);
            let _: () = msg_send![ns, setCollectionBehavior: behavior];
            // Don't let the overlay get hidden when the app deactivates or the
            // user hides apps.
            let no = false;
            let _: () = msg_send![ns, setCanHide: no];
            let _: () = msg_send![ns, setHidesOnDeactivate: no];
            let anim: isize = 2; // NSWindowAnimationBehaviorNone
            let _: () = msg_send![ns, setAnimationBehavior: anim];
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn configure_overlay(win: &WebviewWindow) {
    let _ = win.set_visible_on_all_workspaces(true);
}

fn show_toast(win: &WebviewWindow) {
    position_bottom_right(win);
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    configure_overlay(win); // level above Dock + all Spaces + over full-screen
}

#[tauri::command]
fn hide_self(window: WebviewWindow) {
    let _ = window.hide();
}

fn show_qr(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("qr") {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_always_on_top(true);
        configure_overlay(&w); // also reachable from a full-screen Space
        let _ = w.set_focus();
        let _ = w.emit("refresh-qr", ()); // re-fetch in case the IP changed
    }
}

// ── app ──────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_pending,
            resolve_permission,
            copy_phone_link,
            phone_qr,
            hide_self
        ])
        .setup(|app| {
            // Menubar-only: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Tray icon + menu.
            let menu = MenuBuilder::new(app)
                .text("qr", "Show QR code")
                .text("copy", "Copy phone link")
                .text("show", "Show pending")
                .separator()
                .text("quit", "Quit clawleash")
                .build()?;

            // Centered black + alpha crab silhouette used as a macOS *template*
            // image — the menu bar tints it white on dark, black on light, like
            // the native monochrome status items.
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate@2x.png"))
                .expect("valid tray PNG");

            let tray_result = TrayIconBuilder::with_id("clawleash")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("clawleash")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "qr" => show_qr(app),
                    "copy" => {
                        let _ = copy_phone_link();
                    }
                    "show" => {
                        if let Some(w) = app.get_webview_window("toast") {
                            show_toast(&w);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app);

            match tray_result {
                // CRITICAL on macOS: the TrayIcon must outlive setup, else the
                // status item is removed the moment this handle drops.
                Ok(tray) => {
                    app.manage(tray);
                }
                Err(e) => eprintln!("[clawleash] tray failed: {e}"),
            }

            // Background poller: owns window show/hide so it works even while the
            // (hidden) webview's JS timers are suspended by macOS.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut shown = false;
                loop {
                    let pending = fetch_pending();
                    let want = pending.as_array().map(|a| !a.is_empty()).unwrap_or(false);

                    // Keep the card's text fresh whether or not it's visible.
                    let _ = handle.emit_to("toast", "pending", pending.clone());

                    if want != shown {
                        shown = want;
                        let h2 = handle.clone();
                        let _ = handle.run_on_main_thread(move || {
                            if let Some(w) = h2.get_webview_window("toast") {
                                if want {
                                    show_toast(&w);
                                } else {
                                    let _ = w.hide();
                                }
                            }
                        });
                    }

                    std::thread::sleep(Duration::from_millis(700));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running clawleash desktop");
}
