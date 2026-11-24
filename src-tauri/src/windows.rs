//! Context Save's three windows: the save box, the restore panel and settings.
//! They are created hidden at start-up (tauri.conf.json) and shown on demand,
//! so they open instantly from a shortcut.
use tauri::{AppHandle, Emitter, Manager};

fn show(app: &AppHandle, label: &str, event: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        // The window resets itself on this event (fresh snapshot, fresh list).
        let _ = app.emit_to(label, event, ());
    }
}

pub fn open_save(app: &AppHandle) {
    hide(app, "restore");
    show(app, "save", "save-open");
}

pub fn open_restore(app: &AppHandle) {
    hide(app, "save");
    show(app, "restore", "restore-open");
}

pub fn open_settings(app: &AppHandle) {
    show(app, "settings", "settings-open");
}

pub fn hide(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.hide();
    }
}

pub fn minimise(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.minimize();
    }
}

#[tauri::command]
pub fn minimise_window(app: AppHandle, which: String) {
    minimise(&app, &which);
}

#[tauri::command]
pub fn show_window(app: AppHandle, which: String) {
    match which.as_str() {
        "save" => open_save(&app),
        "restore" => open_restore(&app),
        "settings" => open_settings(&app),
        _ => {}
    }
}
