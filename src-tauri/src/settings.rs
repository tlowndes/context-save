//! Settings kept in the app's own config folder (not the vault, as they differ per PC):
//! where the vault is, this PC's name and the shortcuts.
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Vault root, the folder holding `.obsidian`. Empty until chosen.
    pub vault: String,
    pub pc: String,
    pub save_shortcut: String,
    pub restore_shortcut: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            vault: String::new(),
            pc: std::env::var("COMPUTERNAME").unwrap_or_else(|_| "This PC".into()),
            save_shortcut: "Ctrl+Alt+S".into(),
            restore_shortcut: "Ctrl+Alt+R".into(),
        }
    }
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    file(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn store(app: &AppHandle, s: &Settings) -> Result<(), String> {
    let p = file(app).ok_or("Couldn't find the settings folder.")?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    crate::vault::write_atomic(&p, &text)
}

/// The folder inside the vault that Context Save may read and write.
pub fn context_dir(vault: &str) -> Option<PathBuf> {
    if vault.trim().is_empty() {
        return None;
    }
    Some(Path::new(vault).join("99 - Meta").join("Context Save"))
}
