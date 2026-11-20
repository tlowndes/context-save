//! Reading and writing notes, only inside `<vault>/99 - Meta/Context Save`.
//!
//! Writes go to a temp file beside the note, are swapped in, then read back,
//! so Obsidian Sync never picks up half a note (the same rule as Flight Deck).
use std::fs;
use std::path::{Component, Path, PathBuf};

use tauri::State;

use crate::{settings, AppState};

/// True when `path` is inside `root`. Rejects `..` components outright.
pub fn is_inside(root: &Path, path: &Path) -> bool {
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    let norm = |p: &Path| p.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_lowercase();
    let (r, p) = (norm(root), norm(path));
    p == r || p.starts_with(&format!("{r}/"))
}

fn guard(state: &AppState, path: &str) -> Result<PathBuf, String> {
    let vault = state.settings.lock().map_err(|e| e.to_string())?.vault.clone();
    let root = settings::context_dir(&vault).ok_or("Pick your Obsidian vault in Settings first.")?;
    let p = PathBuf::from(path);
    if !p.is_absolute() || !is_inside(&root, &p) {
        return Err(format!("Context Save only reads and writes inside {}", root.display()));
    }
    Ok(p)
}

pub fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = path.file_name().ok_or("No file name.")?.to_string_lossy().into_owned();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    fs::write(&tmp, text).map_err(|e| format!("Couldn't write the note: {e}"))?;
    // On Windows this replaces an existing file in one step (MoveFileEx with REPLACE_EXISTING).
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Couldn't save the note: {e}"));
    }
    match fs::read_to_string(path) {
        Ok(back) if back == text => Ok(()),
        Ok(_) => Err("The note changed while saving (a sync may have landed). Try again.".into()),
        Err(e) => Err(format!("Saved, but couldn't read the note back: {e}")),
    }
}

#[tauri::command]
pub fn vault_list(state: State<'_, AppState>, path: String) -> Result<Vec<String>, String> {
    let p = guard(&state, &path)?;
    if !p.exists() {
        return Ok(vec![]);
    }
    let mut names: Vec<String> = fs::read_dir(p)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with('.'))
        .collect();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn vault_read(state: State<'_, AppState>, path: String) -> Result<String, String> {
    fs::read_to_string(guard(&state, &path)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_write(state: State<'_, AppState>, path: String, text: String) -> Result<(), String> {
    write_atomic(&guard(&state, &path)?, &text)
}

#[tauri::command]
pub fn vault_remove(state: State<'_, AppState>, path: String) -> Result<(), String> {
    match fs::remove_file(guard(&state, &path)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn containment() {
        let root = Path::new("C:/Vault/99 - Meta/Context Save");
        assert!(is_inside(root, Path::new("c:/vault/99 - meta/context save/Saves/a.md")));
        assert!(!is_inside(root, Path::new("C:/Vault/99 - Meta/Context Save/../Habits.md")));
        assert!(!is_inside(root, Path::new("C:/Vault/99 - Meta/Context SaveX/a.md")));
    }

    #[test]
    fn atomic_write_round_trips() {
        let dir = std::env::temp_dir().join(format!("cs-test-{}", std::process::id()));
        let p = dir.join("Saves").join("note.md");
        write_atomic(&p, "one").unwrap();
        write_atomic(&p, "two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        assert!(!dir.join("Saves").join(".note.md.tmp").exists());
        let _ = fs::remove_dir_all(dir);
    }
}
