//! Settings kept in the app's own config folder on this PC. The Bridge
//! password is not here: it lives in Windows Credential Manager (secrets.rs).
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub bridge_user: String,
    pub host: String,
    pub port: u16,
    pub sent_folder: String,
    pub aliases: String,
    pub skip: String,
    pub min_days: u32,
    /// Filled in when settings are read; never stored.
    #[serde(skip_deserializing)]
    pub has_password: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            bridge_user: String::new(),
            // Bridge's defaults.
            host: "127.0.0.1".into(),
            port: 1143,
            sent_folder: "Sent".into(),
            aliases: String::new(),
            skip: String::new(),
            min_days: 3,
            has_password: false,
        }
    }
}

pub fn config_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok()
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    config_dir(app).map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    file(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn store(app: &AppHandle, s: &Settings) -> Result<(), String> {
    let p = file(app).ok_or("Couldn't find the settings folder.")?;
    let mut copy = s.clone();
    copy.has_password = false;
    let text = serde_json::to_string_pretty(&copy).map_err(|e| e.to_string())?;
    write_atomic(&p, &text)
}

/// Writes a temp file beside the target and swaps it in, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = path.file_name().ok_or("No file name.")?.to_string_lossy().into_owned();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&tmp, text).map_err(|e| format!("Couldn't write {name}: {e}"))?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Couldn't save {name}: {e}"));
    }
    Ok(())
}
