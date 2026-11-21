//! Passwords and keys, kept in Windows Credential Manager, never in a file.
use keyring::Entry;

const BRIDGE: &str = "Next Step (Proton Mail Bridge)";
const CLAUDE: &str = "Next Step (Claude API)";
const CLAUDE_USER: &str = "api-key";

fn entry(service: &str, user: &str) -> Result<Entry, String> {
    Entry::new(service, user).map_err(|e| format!("Couldn't open Credential Manager: {e}"))
}

fn read(service: &str, user: &str, what: &str) -> Result<Option<String>, String> {
    if user.is_empty() {
        return Ok(None);
    }
    match entry(service, user)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Couldn't read the {what}: {e}")),
    }
}

pub fn get(user: &str) -> Result<Option<String>, String> {
    read(BRIDGE, user, "Bridge password")
}

pub fn set(user: &str, password: &str) -> Result<(), String> {
    entry(BRIDGE, user)?.set_password(password).map_err(|e| format!("Couldn't save the Bridge password: {e}"))
}

pub fn has(user: &str) -> bool {
    matches!(get(user), Ok(Some(_)))
}

pub fn claude_key() -> Result<Option<String>, String> {
    read(CLAUDE, CLAUDE_USER, "Claude API key")
}

/// An empty key removes the saved one.
pub fn set_claude_key(key: &str) -> Result<(), String> {
    let e = entry(CLAUDE, CLAUDE_USER)?;
    if key.is_empty() {
        return match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("Couldn't remove the Claude API key: {err}")),
        };
    }
    e.set_password(key).map_err(|err| format!("Couldn't save the Claude API key: {err}"))
}

pub fn has_claude_key() -> bool {
    matches!(claude_key(), Ok(Some(_)))
}
