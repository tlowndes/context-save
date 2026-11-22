//! Global shortcuts: one to save, one to restore. Bindings come from settings.
use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::{windows, AppState};

#[derive(Serialize)]
pub struct HotkeyFailure {
    action: String,
    accelerator: String,
    reason: String,
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let state = app.state::<AppState>();
            let action = state.hotkeys.lock().ok().and_then(|m| m.get(&shortcut.id()).cloned());
            match action.as_deref() {
                Some("save") => windows::open_save(app),
                Some("restore") => windows::open_restore(app),
                _ => {}
            }
        })
        .build()
}

/// Registers the shortcuts, replacing any before. Returns the ones that couldn't be registered.
pub fn apply(app: &AppHandle, state: &AppState, bindings: &[(&str, &str)]) -> Vec<HotkeyFailure> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut map = HashMap::new();
    let mut failures = Vec::new();
    for &(action, accelerator) in bindings {
        if accelerator.trim().is_empty() {
            continue;
        }
        let result = accelerator
            .parse::<Shortcut>()
            .map_err(|e| format!("Not a valid shortcut: {e}"))
            .and_then(|sc| {
                gs.register(sc).map_err(|_| "Another app is already using this shortcut.".to_string())?;
                Ok(sc)
            });
        match result {
            Ok(sc) => {
                map.insert(sc.id(), action.to_string());
            }
            Err(reason) => failures.push(HotkeyFailure { action: action.into(), accelerator: accelerator.into(), reason }),
        }
    }
    if let Ok(mut m) = state.hotkeys.lock() {
        *m = map;
    }
    failures
}

#[tauri::command]
pub fn apply_hotkeys(app: AppHandle, state: State<'_, AppState>) -> Vec<HotkeyFailure> {
    let s = match state.settings.lock() {
        Ok(s) => s.clone(),
        Err(_) => return vec![],
    };
    apply(&app, &state, &[("save", &s.save_shortcut), ("restore", &s.restore_shortcut)])
}
