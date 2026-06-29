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
            let dock = (12.0 * scale) as i32;
            let x = mpos.x + msize.width as i32 - wsize.width as i32 - margin;
            let y = mpos.y + msize.height as i32 - wsize.height as i32 - margin - dock;
            let _ = win.set_position(PhysicalPosition::new(x, y));
        }
    }
}

fn show_toast(win: &WebviewWindow) {
    position_bottom_right(win);
    let _ = win.show();
    let _ = win.set_always_on_top(true);
}

// ── app ──────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_pending,
            resolve_permission,
            copy_phone_link
        ])
        .setup(|app| {
            // Menubar-only: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Tray icon + menu.
            let menu = MenuBuilder::new(app)
                .text("copy", "Copy phone link")
                .text("show", "Show pending")
                .separator()
                .text("quit", "Quit clawleash")
                .build()?;

            let _tray = TrayIconBuilder::with_id("clawleash")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(false)
                .tooltip("clawleash")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
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
                .build(app)?;

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
