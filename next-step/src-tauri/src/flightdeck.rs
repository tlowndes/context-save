//! Print now: hands a task to Flight Deck on this PC by opening a `flightdeck://print?…` link.
//! Flight Deck registers the link for itself; if it isn't running, Windows starts it.

const PRINT: &str = "flightdeck://print?";

/// Only print links, and nothing that could be read as a command-line switch.
pub fn allowed(link: &str) -> bool {
    link.starts_with(PRINT) && link.len() < 4096 && !link.chars().any(|c| c.is_control() || c == '"' || c == ' ')
}

#[tauri::command]
pub fn open_flightdeck(link: String) -> Result<(), String> {
    if !allowed(&link) {
        return Err("That isn't a Flight Deck print link.".into());
    }
    #[cfg(windows)]
    let spawned = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", &link])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
    };
    #[cfg(not(windows))]
    let spawned = std::process::Command::new("xdg-open").arg(&link).spawn();
    spawned.map(|_| ()).map_err(|e| format!("Couldn't open Flight Deck ({e}). Is it installed on this PC?"))
}

#[cfg(test)]
mod tests {
    use super::allowed;

    #[test]
    fn only_print_links_go_through() {
        assert!(allowed("flightdeck://print?note=00%20-%20Inbox%2FNext%20steps.md&task=%23task%20Reply"));
        assert!(!allowed("flightdeck://clear/mai004"));
        assert!(!allowed("https://example.com"));
        assert!(!allowed("flightdeck://print?task=a b"));
        assert!(!allowed("flightdeck://print?task=\"--x\""));
    }
}
