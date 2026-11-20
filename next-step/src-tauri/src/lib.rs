//! Next Step desktop shell. Spotting and deciding live in TypeScript; this
//! side owns what only native code can do: the tray, reading mail from
//! Bridge, the Credential Manager and the app's small files.
mod mail;
mod secrets;
mod settings;
mod tray;
mod windows;

use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WindowEvent};

pub struct AppState {
    pub settings: Mutex<settings::Settings>,
}

fn current(state: &State<'_, AppState>) -> Result<settings::Settings, String> {
    state.settings.lock().map(|s| s.clone()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<settings::Settings, String> {
    let mut s = current(&state)?;
    s.has_password = secrets::has(&s.bridge_user);
    Ok(s)
}

/// Saves settings. A non-empty `password` replaces the saved Bridge password.
#[tauri::command]
fn set_settings(app: AppHandle, state: State<'_, AppState>, next: settings::Settings, password: String) -> Result<(), String> {
    if next.port == 0 {
        return Err("The IMAP port should be a number, usually 1143.".into());
    }
    if !password.is_empty() {
        if next.bridge_user.is_empty() {
            return Err("Add your Bridge username first.".into());
        }
        secrets::set(&next.bridge_user, &password)?;
    }
    settings::store(&app, &next)?;
    *state.settings.lock().map_err(|e| e.to_string())? = next;
    Ok(())
}

fn with_password(state: &State<'_, AppState>) -> Result<(settings::Settings, String), String> {
    let s = current(state)?;
    let pw = secrets::get(&s.bridge_user)?.ok_or("Add your Bridge password in Settings.")?;
    Ok((s, pw))
}

#[tauri::command]
async fn fetch_mail(state: State<'_, AppState>, days: u32) -> Result<mail::MailBatch, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::fetch(&s, &pw, days.clamp(1, 120)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn test_bridge(state: State<'_, AppState>) -> Result<String, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::test(&s, &pw)).await.map_err(|e| e.to_string())?
}

/// Only plain names like `marks.json`: the UI can't reach any other file.
fn store_path(app: &AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let ok = !name.is_empty() && name.len() <= 64 && name.ends_with(".json") && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.') && !name.starts_with('.');
    if !ok || name == "settings.json" {
        return Err(format!("Not allowed: {name}"));
    }
    Ok(settings::config_dir(app).ok_or("Couldn't find the app's folder.")?.join(name))
}

#[tauri::command]
fn store_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let p = store_path(&app, &name)?;
    match std::fs::read_to_string(p) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn store_write(app: AppHandle, name: String, text: String) -> Result<(), String> {
    settings::write_atomic(&store_path(&app, &name)?, &text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch opens the panel instead of a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| windows::open_panel(app)))
        .setup(|app| {
            let s = settings::load(app.handle());
            let first_run = s.bridge_user.is_empty();
            app.manage(AppState { settings: Mutex::new(s) });
            tray::build(app.handle())?;
            if first_run {
                windows::open_settings(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing keeps Next Step running in the tray.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // The panel behaves like a tray flyout: clicking away hides it.
            WindowEvent::Focused(false) if window.label() == "panel" => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            fetch_mail,
            test_bridge,
            store_read,
            store_write,
            tray::set_waiting,
            windows::show_window,
            windows::hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Next Step");
}
