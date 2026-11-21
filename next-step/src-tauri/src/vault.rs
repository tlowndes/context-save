//! The one note Next Step writes in your vault: `00 - Inbox/Next steps.md`.
//! Nothing else in the vault is read or written.
//!
//! Writes go to a temp file beside the note, are swapped in, then read back,
//! so Obsidian Sync never picks up half a note (the same rule as Flight Deck
//! and Context Save).
use std::fs;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::AppState;

/// The note's path inside a vault.
pub fn tasks_note(vault: &str) -> Option<PathBuf> {
    if vault.trim().is_empty() {
        return None;
    }
    Some(Path::new(vault).join("00 - Inbox").join("Next steps.md"))
}

/// True when `dir` looks like an Obsidian vault.
pub fn is_vault(dir: &str) -> bool {
    let p = Path::new(dir);
    p.is_dir() && p.join(".obsidian").is_dir()
}

fn note_path(state: &AppState) -> Result<PathBuf, String> {
    let vault = state.settings.lock().map_err(|e| e.to_string())?.vault.clone();
    tasks_note(&vault).ok_or_else(|| "Choose your Obsidian vault in Settings first.".into())
}

pub fn write_checked(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Couldn't make the 00 - Inbox folder: {e}"))?;
    }
    let tmp = path.with_file_name(".Next steps.md.tmp");
    fs::write(&tmp, text).map_err(|e| format!("Couldn't write Next steps.md: {e}"))?;
    // On Windows this replaces the existing file in one step.
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Couldn't save Next steps.md: {e}"));
    }
    match fs::read_to_string(path) {
        Ok(back) if back == text => Ok(()),
        Ok(_) => Err("Next steps.md changed while saving (a sync may have landed). Try again.".into()),
        Err(e) => Err(format!("Saved, but couldn't read Next steps.md back: {e}")),
    }
}

#[tauri::command]
pub fn tasks_read(state: State<'_, AppState>) -> Result<Option<String>, String> {
    match fs::read_to_string(note_path(&state)?) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read Next steps.md: {e}")),
    }
}

#[tauri::command]
pub fn tasks_write(state: State<'_, AppState>, text: String) -> Result<(), String> {
    write_checked(&note_path(&state)?, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_lives_in_the_inbox_folder() {
        assert_eq!(tasks_note("C:/Vault").unwrap(), Path::new("C:/Vault").join("00 - Inbox").join("Next steps.md"));
        assert!(tasks_note("  ").is_none());
    }

    #[test]
    fn writes_round_trip_and_leave_no_temp_file() {
        let dir = std::env::temp_dir().join(format!("ns-vault-{}", std::process::id()));
        let p = tasks_note(dir.to_str().unwrap()).unwrap();
        write_checked(&p, "one").unwrap();
        write_checked(&p, "two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        assert!(!p.with_file_name(".Next steps.md.tmp").exists());
        let _ = fs::remove_dir_all(dir);
    }
}
