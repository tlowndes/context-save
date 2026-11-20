//! Context Save desktop shell. Save and restore logic lives in TypeScript;
//! this side owns what only native code can do: reading and moving windows,
//! starting programs, the tray, global shortcuts and writing into the vault.
mod desktop;
mod hotkeys;
mod settings;
mod tray;
mod vault;
mod windows;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WindowEvent};

pub struct AppState {
    pub settings: Mutex<settings::Settings>,
    pub hotkeys: Mutex<HashMap<u32, String>>,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<settings::Settings, String> {
    state.settings.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

/// Saves settings and re-registers the shortcuts. Returns shortcuts that couldn't be registered.
#[tauri::command]
fn set_settings(app: AppHandle, state: State<'_, AppState>, next: settings::Settings) -> Result<Vec<hotkeys::HotkeyFailure>, String> {
    if !next.vault.is_empty() && !std::path::Path::new(&next.vault).is_dir() {
        return Err("That vault folder doesn't exist.".into());
    }
    settings::store(&app, &next)?;
    *state.settings.lock().map_err(|e| e.to_string())? = next.clone();
    Ok(hotkeys::apply(&app, &state, &[("save", &next.save_shortcut), ("restore", &next.restore_shortcut)]))
}

#[tauri::command]
fn hide_window(app: AppHandle, which: String) {
    windows::hide(&app, &which);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch opens the restore panel instead of a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| windows::open_restore(app)))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(hotkeys::plugin())
        .setup(|app| {
            let s = settings::load(app.handle());
            app.manage(AppState { settings: Mutex::new(s.clone()), hotkeys: Mutex::new(HashMap::new()) });
            tray::build(app.handle(), &s)?;
            let state = app.state::<AppState>();
            hotkeys::apply(app.handle(), &state, &[("save", &s.save_shortcut), ("restore", &s.restore_shortcut)]);
            // First run: nothing works until the vault is chosen.
            if s.vault.is_empty() {
                windows::open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing any window keeps Context Save running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            hide_window,
            windows::show_window,
            hotkeys::apply_hotkeys,
            desktop::list_windows,
            desktop::list_monitors,
            desktop::place_window,
            desktop::minimise_windows,
            desktop::launch,
            desktop::file_exists,
            desktop::recent_shortcut,
            vault::vault_list,
            vault::vault_read,
            vault::vault_write,
            vault::vault_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Context Save");
}
