//! Next Step desktop shell. Spotting and deciding live in TypeScript; this
//! side owns what only native code can do: the tray, reading mail from
//! Bridge (and moving it, for the Sort tab), the one tasks note in the vault, the Credential Manager, the built-in model, Ask Claude and the
//! app's small files.
mod claude;
mod mail;
mod model;
mod secrets;
mod settings;
mod tray;
mod flightdeck;
mod vault;
mod windows;

use std::sync::{Arc, Mutex};

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
    s.has_claude_key = secrets::has_claude_key();
    Ok(s)
}

/// Saves settings. A non-empty `password` replaces the saved Bridge password.
/// `claude_key`: None leaves it alone, "" removes it, anything else replaces it.
#[tauri::command]
fn set_settings(app: AppHandle, state: State<'_, AppState>, next: settings::Settings, password: String, claude_key: Option<String>) -> Result<(), String> {
    if next.port == 0 {
        return Err("The IMAP port should be a number, usually 1143.".into());
    }
    if !next.vault.is_empty() && !vault::is_vault(&next.vault) {
        return Err("That folder isn't an Obsidian vault (it has no .obsidian folder inside).".into());
    }
    if !password.is_empty() {
        if next.bridge_user.is_empty() {
            return Err("Add your Bridge username first.".into());
        }
        secrets::set(&next.bridge_user, &password)?;
    }
    if let Some(key) = claude_key {
        let key = key.trim();
        if !key.is_empty() && !key.starts_with("sk-ant-") {
            return Err("That doesn't look like a Claude API key (they start with sk-ant-).".into());
        }
        secrets::set_claude_key(key)?;
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
async fn fetch_message(state: State<'_, AppState>, message_id: String) -> Result<Option<String>, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::message(&s, &pw, &message_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_folders(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::folders(&s, &pw)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fetch_folder(state: State<'_, AppState>, folder: String, days: u32) -> Result<Vec<mail::RawMessage>, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::folder_headers(&s, &pw, &folder, days.clamp(1, 365)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn move_messages(state: State<'_, AppState>, message_ids: Vec<String>, from: String, to: String) -> Result<usize, String> {
    let (s, pw) = with_password(&state)?;
    tauri::async_runtime::spawn_blocking(move || mail::move_messages(&s, &pw, &message_ids, &from, &to))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn model_status(model: State<'_, Arc<model::ModelState>>) -> model::Status {
    model.status()
}

#[tauri::command]
fn model_download(model: State<'_, Arc<model::ModelState>>) -> Result<(), String> {
    model::ModelState::start_download(model.inner().clone())
}

#[tauri::command]
async fn model_generate(model: State<'_, Arc<model::ModelState>>, prompt: String, max_tokens: usize) -> Result<String, String> {
    let m = model.inner().clone();
    tauri::async_runtime::spawn_blocking(move || m.generate(&prompt, max_tokens)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ask_claude(system: String, user: String) -> Result<String, String> {
    let key = secrets::claude_key()?.ok_or("Add a Claude API key in Settings first.")?;
    tauri::async_runtime::spawn_blocking(move || claude::ask(&key, &system, &user)).await.map_err(|e| e.to_string())?
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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let s = settings::load(app.handle());
            let first_run = s.bridge_user.is_empty();
            app.manage(AppState { settings: Mutex::new(s) });
            let models = app.path().app_data_dir().ok().map(|d| d.join("models"));
            app.manage(Arc::new(model::ModelState::new(models)));
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
            fetch_message,
            list_folders,
            fetch_folder,
            move_messages,
            model_status,
            model_download,
            model_generate,
            ask_claude,
            vault::tasks_read,
            vault::tasks_write,
            flightdeck::open_flightdeck,
            test_bridge,
            store_read,
            store_write,
            tray::set_waiting,
            windows::show_window,
            windows::hide_window,
            windows::show_nudge,
            windows::open_email,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Next Step");
}
