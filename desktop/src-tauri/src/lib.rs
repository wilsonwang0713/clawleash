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

// Pick a permission suggestion (e.g. "always allow …") by its index.
#[tauri::command]
fn pick_suggestion(id: String, index: u32) -> Result<(), String> {
    let (token, port) = token_port();
    let url = format!(
        "http://127.0.0.1:{}/api/permission?k={}&id={}&s={}",
        port, token, id, index
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
// Private SkyLight (WindowServer) API — the only reliable way to float a window
// over *other apps'* full-screen Spaces. We create one absolute-level system
// Space and move the overlay window into it (mirrors clawd-on-desk's approach).
// SkyLight is a private framework that lives only in the dyld shared cache on
// modern macOS, so we resolve it at runtime instead of linking against it.
#[cfg(target_os = "macos")]
mod sky {
    use std::ffi::c_void;
    use std::os::raw::c_int;
    use std::sync::OnceLock;

    type FnConn = unsafe extern "C" fn() -> c_int;
    type FnCreate = unsafe extern "C" fn(c_int, c_int, c_int) -> c_int;
    type FnSetLevel = unsafe extern "C" fn(c_int, c_int, c_int) -> c_int;
    type FnShow = unsafe extern "C" fn(c_int, *const c_void) -> c_int;
    type FnAddRemove = unsafe extern "C" fn(c_int, c_int, *const c_void, c_int) -> c_int;

    pub struct Sky {
        pub main_conn: FnConn,
        pub space_create: FnCreate,
        pub set_abs_level: FnSetLevel,
        pub show_spaces: FnShow,
        pub add_remove: FnAddRemove,
    }

    static SKY: OnceLock<Option<Sky>> = OnceLock::new();

    pub fn get() -> Option<&'static Sky> {
        SKY.get_or_init(|| unsafe {
            let lib = libloading::Library::new(
                "/System/Library/PrivateFrameworks/SkyLight.framework/Versions/A/SkyLight",
            )
            .ok()?;
            let lib: &'static libloading::Library = Box::leak(Box::new(lib));
            Some(Sky {
                main_conn: *lib.get::<FnConn>(b"SLSMainConnectionID\0").ok()?,
                space_create: *lib.get::<FnCreate>(b"SLSSpaceCreate\0").ok()?,
                set_abs_level: *lib.get::<FnSetLevel>(b"SLSSpaceSetAbsoluteLevel\0").ok()?,
                show_spaces: *lib.get::<FnShow>(b"SLSShowSpaces\0").ok()?,
                add_remove: *lib.get::<FnAddRemove>(b"SLSSpaceAddWindowsAndRemoveFromSpaces\0").ok()?,
            })
        })
        .as_ref()
    }
}

#[cfg(target_os = "macos")]
static SKY_SPACE: std::sync::OnceLock<std::os::raw::c_int> = std::sync::OnceLock::new();

// Build an NSArray containing one NSNumber(int). NSArray* is toll-free bridged
// to CFArrayRef, which is what the SLS functions expect.
#[cfg(target_os = "macos")]
unsafe fn ns_int_array(v: std::os::raw::c_int) -> *mut objc2::runtime::AnyObject {
    use objc2::msg_send;
    let num: *mut objc2::runtime::AnyObject = msg_send![objc2::class!(NSNumber), numberWithInt: v];
    let arr: *mut objc2::runtime::AnyObject = msg_send![objc2::class!(NSArray), arrayWithObject: num];
    arr
}

#[cfg(target_os = "macos")]
fn delegate_to_stationary_space(ns: *mut objc2::runtime::AnyObject) {
    use objc2::msg_send;
    let Some(s) = sky::get() else { return };
    unsafe {
        let cid = (s.main_conn)();
        let space = *SKY_SPACE.get_or_init(|| {
            let sp = (s.space_create)(cid, 1, 0);
            (s.set_abs_level)(cid, sp, 100);
            (s.show_spaces)(cid, ns_int_array(sp) as *const std::ffi::c_void);
            sp
        });
        let wn: isize = msg_send![ns, windowNumber];
        if wn != 0 {
            (s.add_remove)(
                cid,
                space,
                ns_int_array(wn as std::os::raw::c_int) as *const std::ffi::c_void,
                7,
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn configure_overlay(win: &WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    match win.ns_window() {
        Ok(ptr) => {
            let ns = ptr as *mut AnyObject;
            if ns.is_null() {
                eprintln!("[clawleash] configure_overlay: ns_window is null");
                return;
            }
            unsafe {
                // CGAssistiveTechHighWindowLevel — floats above the Dock, menu
                // bar, and full-screen apps (the level clawd-on-desk uses).
                let level: isize = 1500;
                let _: () = msg_send![ns, setLevel: level];
                // CanJoinAllSpaces(1<<0) | Stationary(1<<4) | IgnoresCycle(1<<6)
                //   | FullScreenAuxiliary(1<<8) | FullScreenDisallowsTiling(1<<12)
                let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8) | (1 << 12);
                let _: () = msg_send![ns, setCollectionBehavior: behavior];
                let no = false;
                let _: () = msg_send![ns, setCanHide: no];
                let _: () = msg_send![ns, setHidesOnDeactivate: no];
                let anim: isize = 2; // NSWindowAnimationBehaviorNone
                let _: () = msg_send![ns, setAnimationBehavior: anim];

                // Deterministic rounded corners: round the content view's layer.
                // The vibrancy mask can go square after a resize; this is
                // re-applied every poll tick so it always survives.
                let content: *mut AnyObject = msg_send![ns, contentView];
                if !content.is_null() {
                    let yes = true;
                    let _: () = msg_send![content, setWantsLayer: yes];
                    let layer: *mut AnyObject = msg_send![content, layer];
                    if !layer.is_null() {
                        let radius: f64 = 22.0;
                        let _: () = msg_send![layer, setCornerRadius: radius];
                        let _: () = msg_send![layer, setMasksToBounds: yes];
                    }
                }
            }
            // The decisive bit for other apps' full-screen Spaces.
            delegate_to_stationary_space(ns);
        }
        Err(e) => eprintln!("[clawleash] configure_overlay: ns_window err: {e}"),
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

// Resize the toast to the rendered card height so the window hugs its content
// (the frontend measures and calls this).
#[tauri::command]
fn fit_toast(window: WebviewWindow, height: f64) {
    let h = height.clamp(80.0, 460.0);
    let _ = window.set_size(tauri::LogicalSize::new(340.0, h));
    // Re-apply the vibrancy effect so its rounded-corner mask follows the new
    // size (otherwise a resized window shows square corners).
    use tauri::window::{Effect, EffectState, EffectsBuilder};
    let _ = window.set_effects(
        EffectsBuilder::new()
            .effect(Effect::Popover)
            .state(EffectState::Active)
            .radius(22.0)
            .build(),
    );
    position_bottom_right(&window);
    configure_overlay(&window);
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
            pick_suggestion,
            fit_toast,
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

                    let first = want && !shown;
                    let should_hide = !want && shown;
                    shown = want;
                    let h2 = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Some(w) = h2.get_webview_window("toast") {
                            if want {
                                if first {
                                    position_bottom_right(&w);
                                    let _ = w.show();
                                }
                                // Re-assert every tick — Tauri otherwise resets
                                // the level back below the Dock / off full-screen.
                                configure_overlay(&w);
                            } else if should_hide {
                                let _ = w.hide();
                            }
                        }
                    });

                    std::thread::sleep(Duration::from_millis(700));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running clawleash desktop");
}
