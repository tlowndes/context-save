//! "Ask Claude": only runs when you tap the button, and sends just that one
//! email (the readable start of it) to Anthropic's Messages API.
use std::time::Duration;

use serde_json::{json, Value};

const URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-opus-5-5";
const VERSION: &str = "2026-10-21";

pub fn ask(key: &str, system: &str, user: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(concat!("next-step/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "model": MODEL,
        "max_tokens": 2000,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
        "output_config": { "effort": "low" },
    });
    let r = client
        .post(URL)
        .header("x-api-key", key)
        .header("anthropic-version", VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .map_err(|e| if e.is_timeout() { "Claude took too long. Try again.".to_string() } else { format!("Couldn't reach Claude: {e}") })?;
    let status = r.status().as_u16();
    let v: Value = r.json().unwrap_or(Value::Null);
    match status {
        200 => {}
        401 | 403 => return Err("Claude didn't accept the API key. Check it in Settings.".into()),
        429 | 529 => return Err("Claude is busy right now. Try again in a minute.".into()),
        _ => {
            let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("no details");
            return Err(format!("Claude couldn't answer ({status}): {msg}"));
        }
    }
    text_of(&v)
}

/// Joins the text blocks of a Messages API reply.
fn text_of(v: &Value) -> Result<String, String> {
    if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
        return Err("Claude didn't want to help with this one.".into());
    }
    let text: String = v
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| blocks.iter().filter(|b| b.get("type").and_then(Value::as_str) == Some("text")).filter_map(|b| b.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default();
    if text.trim().is_empty() {
        Err("Claude's answer was empty.".into())
    } else {
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_blocks_and_refusals() {
        let ok = json!({"stop_reason": "end_turn", "content": [{"type": "thinking", "thinking": "…"}, {"type": "text", "text": "Reply yes or no to Sam"}]});
        assert_eq!(text_of(&ok).unwrap(), "Reply yes or no to Sam");
        assert!(text_of(&json!({"stop_reason": "refusal", "content": []})).is_err());
        assert!(text_of(&json!({"content": []})).is_err());
    }
}
