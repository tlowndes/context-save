//! Three windows: the tray panel, settings, and the daily nudge card. Created hidden at start-up
//! (tauri.conf.json) and shown on demand, so they open instantly.
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

/// Puts the panel in the bottom-right corner, above the taskbar, like a tray flyout.
fn place_by_tray(w: &WebviewWindow) {
    let (Ok(Some(mon)), Ok(size)) = (w.current_monitor().or_else(|_| w.primary_monitor()), w.outer_size()) else {
        return;
    };
    let area = mon.work_area();
    let gap = (12.0 * mon.scale_factor()) as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - gap;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - gap;
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

fn show(app: &AppHandle, label: &str, event: &str) {
    if let Some(w) = app.get_webview_window(label) {
        if label == "panel" {
            place_by_tray(&w);
        } else {
            let _ = w.center();
        }
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        // The window refreshes itself on this event.
        let _ = app.emit_to(label, event, ());
    }
}

pub fn open_panel(app: &AppHandle) {
    hide(app, "nudge");
    show(app, "panel", "panel-open");
}

/// The nudge card sits where a Windows notification would, and never takes focus from what you're doing.
#[tauri::command]
pub fn show_nudge(app: AppHandle) {
    if let Some(w) = app.get_webview_window("nudge") {
        place_by_tray(&w);
        let _ = w.show();
        let _ = app.emit_to("nudge", "nudge-open", ());
    }
}

/// The nudge's Show me: the panel, opened on that email.
#[tauri::command]
pub fn open_email(app: AppHandle, message_id: String) {
    hide(&app, "nudge");
    if let Some(w) = app.get_webview_window("panel") {
        place_by_tray(&w);
        let _ = w.show();
        let _ = w.set_focus();
        let _ = app.emit_to("panel", "panel-open", Some(message_id));
    }
}

pub fn toggle_panel(app: &AppHandle) {
    match app.get_webview_window("panel") {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
        }
        _ => open_panel(app),
    }
}

pub fn open_settings(app: &AppHandle) {
    hide(app, "panel");
    show(app, "settings", "settings-open");
}

pub fn hide(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn show_window(app: AppHandle, which: String) {
    match which.as_str() {
        "panel" => open_panel(&app),
        "settings" => open_settings(&app),
        "nudge" => show_nudge(app),
        _ => {}
    }
}

#[tauri::command]
pub fn hide_window(app: AppHandle, which: String) {
    hide(&app, &which);
}
