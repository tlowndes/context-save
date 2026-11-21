//! Read-only access to Proton Mail Bridge over local IMAP.
//!
//! Folders are opened with EXAMINE (read-only) and everything is read with
//! BODY.PEEK, so nothing is marked as read. The list only needs headers; a
//! whole email is read only when you open its next step.
//! Parsing happens in TypeScript (src/core/headers.ts), where it's tested.
use std::net::{IpAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

use chrono::{Duration as Days, Utc};
use native_tls::{TlsConnector, TlsStream};
use serde::Serialize;

use crate::settings::Settings;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawMessage {
    pub uid: u32,
    pub headers: String,
    pub internal_date: String,
}

#[derive(Serialize)]
pub struct MailBatch {
    pub inbox: Vec<RawMessage>,
    pub sent: Vec<RawMessage>,
}

type Session = imap::Session<TlsStream<TcpStream>>;

const TIMEOUT: Duration = Duration::from_secs(20);
/// More than this in one folder is not "emails you're avoiding", it's an archive.
const MAX_PER_FOLDER: usize = 2000;

/// Bridge only ever listens on this PC. Refusing anything else keeps mail
/// (and the relaxed certificate check below) off the network.
fn is_local(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false)
}

fn connect(s: &Settings, password: &str) -> Result<Session, String> {
    if !is_local(&s.host) {
        return Err("Next Step only connects to Bridge on this PC (127.0.0.1 or localhost).".into());
    }
    if s.bridge_user.is_empty() {
        return Err("Add your Bridge username in Settings.".into());
    }
    let addr = (s.host.as_str(), s.port)
        .to_socket_addrs()
        .map_err(|e| format!("Couldn't find Bridge at {}:{}: {e}", s.host, s.port))?
        .next()
        .ok_or("Couldn't find Bridge's address.")?;
    let stream = TcpStream::connect_timeout(&addr, TIMEOUT).map_err(|_| "Couldn't reach Bridge. Is Proton Mail Bridge running?".to_string())?;
    stream.set_read_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;

    // Bridge uses its own self-signed certificate. The connection never leaves
    // this PC (checked above), so the certificate isn't checked.
    let tls = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|e| e.to_string())?;
    let mut client = imap::Client::new(stream);
    client.read_greeting().map_err(|e| format!("Bridge didn't answer: {e}"))?;
    let client = client.secure(&s.host, &tls).map_err(|e| format!("Couldn't start a secure connection to Bridge: {e}"))?;
    client
        .login(&s.bridge_user, password)
        .map_err(|(e, _)| format!("Bridge didn't accept the login. Check the username and the Bridge password (not your Proton password). ({e})"))
}

/// IMAP's date format for SEARCH SINCE, e.g. `21-Oct-2026`.
fn since(days: u32) -> String {
    (Utc::now() - Days::days(i64::from(days))).format("%d-%b-%Y").to_string()
}

fn headers_in(session: &mut Session, folder: &str, days: u32) -> Result<Vec<RawMessage>, String> {
    session.examine(folder).map_err(|e| format!("Couldn't open the {folder} folder: {e}"))?;
    let mut uids: Vec<u32> = session
        .uid_search(format!("SINCE {}", since(days)))
        .map_err(|e| format!("Couldn't search {folder}: {e}"))?
        .into_iter()
        .collect();
    if uids.is_empty() {
        return Ok(vec![]);
    }
    uids.sort_unstable();
    let start = uids.len().saturating_sub(MAX_PER_FOLDER);
    let set = uids[start..].iter().map(u32::to_string).collect::<Vec<_>>().join(",");
    let fetched = session
        .uid_fetch(set, "(UID INTERNALDATE BODY.PEEK[HEADER])")
        .map_err(|e| format!("Couldn't read {folder}: {e}"))?;
    Ok(fetched
        .iter()
        .filter_map(|f| {
            Some(RawMessage {
                uid: f.uid?,
                headers: String::from_utf8_lossy(f.header()?).into_owned(),
                internal_date: f.internal_date().map(|d| d.to_rfc3339()).unwrap_or_default(),
            })
        })
        .collect())
}

pub fn fetch(s: &Settings, password: &str, days: u32) -> Result<MailBatch, String> {
    let mut session = connect(s, password)?;
    let inbox = headers_in(&mut session, "INBOX", days);
    let sent = inbox.as_ref().ok().map(|_| headers_in(&mut session, &s.sent_folder, days));
    let _ = session.logout();
    Ok(MailBatch { inbox: inbox?, sent: sent.unwrap_or_else(|| Ok(vec![]))? })
}

/// The start of a raw email is plenty to write a step from.
const MAX_MESSAGE_BYTES: u32 = 256 * 1024;

/// Message-IDs go inside a quoted IMAP string, so anything that could break out of it is refused.
fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 512 && id.chars().all(|c| c.is_ascii_graphic() && c != '"' && c != '\\')
}

/// One email from the inbox by Message-ID, or None if it's gone.
pub fn message(s: &Settings, password: &str, message_id: &str) -> Result<Option<String>, String> {
    if !safe_id(message_id) {
        return Err("That email's ID looks odd, so it wasn't read.".into());
    }
    let mut session = connect(s, password)?;
    let found = (|| {
        session.examine("INBOX").map_err(|e| format!("Couldn't open the inbox: {e}"))?;
        let uid = match session
            .uid_search(format!("HEADER Message-ID \"{message_id}\""))
            .map_err(|e| format!("Couldn't search the inbox: {e}"))?
            .into_iter()
            .max()
        {
            Some(u) => u,
            None => return Ok(None),
        };
        let fetched = session
            .uid_fetch(uid.to_string(), format!("BODY.PEEK[]<0.{MAX_MESSAGE_BYTES}>"))
            .map_err(|e| format!("Couldn't read the email: {e}"))?;
        Ok(fetched.iter().find_map(|f| f.body()).map(|b| String::from_utf8_lossy(b).into_owned()))
    })();
    let _ = session.logout();
    found
}

/// A quick check for Settings: logs in, opens the inbox read-only, logs out.
pub fn test(s: &Settings, password: &str) -> Result<String, String> {
    let mut session = connect(s, password)?;
    let inbox = session.examine("INBOX").map_err(|e| format!("Logged in, but couldn't open the inbox: {e}"))?;
    let sent = session.examine(&s.sent_folder).is_ok();
    let _ = session.logout();
    let mut msg = format!("Connected to Bridge. {} emails in your inbox.", inbox.exists);
    if !sent {
        msg.push_str(&format!(" Couldn't find a folder called \"{}\": check the Sent folder name.", s.sent_folder));
    }
    Ok(msg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_local_hosts() {
        for h in ["127.0.0.1", "localhost", "::1", "[::1]", "127.0.0.2"] {
            assert!(is_local(h), "{h}");
        }
        for h in ["imap.proton.me", "192.168.1.10", "10.0.0.1", ""] {
            assert!(!is_local(h), "{h}");
        }
    }

    #[test]
    fn message_ids_cant_escape_the_search() {
        assert!(safe_id("<m1@mock>"));
        for id in ["", "<a\"b>", "<a\\b>", "<a b>", "<a\r\nb>"] {
            assert!(!safe_id(id), "{id:?}");
        }
    }

    #[test]
    fn since_is_imap_format() {
        let s = since(3);
        assert_eq!(s.len(), 11, "{s}");
        assert_eq!(&s[2..3], "-");
    }
}
