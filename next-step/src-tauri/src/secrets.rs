//! The Bridge password, kept in Windows Credential Manager under "Next Step".
use keyring::Entry;

const SERVICE: &str = "Next Step (Proton Mail Bridge)";

fn entry(user: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, user).map_err(|e| format!("Couldn't open Credential Manager: {e}"))
}

pub fn get(user: &str) -> Result<Option<String>, String> {
    if user.is_empty() {
        return Ok(None);
    }
    match entry(user)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Couldn't read the Bridge password: {e}")),
    }
}

pub fn set(user: &str, password: &str) -> Result<(), String> {
    entry(user)?.set_password(password).map_err(|e| format!("Couldn't save the Bridge password: {e}"))
}

pub fn has(user: &str) -> bool {
    matches!(get(user), Ok(Some(_)))
}
