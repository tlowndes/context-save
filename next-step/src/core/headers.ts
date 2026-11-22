/**
 * Turns the raw header block the IMAP side fetches into a tidy message.
 * Pure and unit-tested: the Rust side only hands over bytes as text.
 */

export interface Address {
  name: string;
  /** Lower-cased `local@domain`. */
  address: string;
}

export interface Message {
  uid: number;
  folder: "inbox" | "sent";
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  from: Address | null;
  to: Address[];
  cc: Address[];
  subject: string;
  date: Date;
  /** Mailing lists, newsletters and machine mail. */
  bulk: boolean;
}

/** What the IMAP side returns per message. */
export interface RawMessage {
  uid: number;
  /** The header block, CRLF or LF line endings. */
  headers: string;
  /** IMAP INTERNALDATE as RFC 3339, used when the Date header is missing or broken. */
  internalDate: string;
}

/** Splits a header block into lower-cased name → unfolded value (first one wins). */
export function headerMap(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const unfolded = block.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    if (!out.has(name)) out.set(name, line.slice(i + 1).trim());
  }
  return out;
}

const bytesFrom = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Decodes RFC 2047 encoded words (`=?utf-8?Q?Caf=C3=A9?=`). */
export function decodeWords(value: string): string {
  // Whitespace between two encoded words is dropped (RFC 2047 §6.2).
  const joined = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
    const cs = charset.split("*")[0];
    if (enc.toUpperCase() === "B") {
      try {
        return decodeBytes(bytesFrom(atob(text)), cs);
      } catch {
        return text;
      }
    }
    const q = text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
    return decodeBytes(bytesFrom(q), cs);
  });
}

/** Parses an address list such as `"Patel, Sam" <sam@x.com>, bob@y.org`. */
export function parseAddresses(value: string | undefined): Address[] {
  if (!value) return [];
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle++;
    else if (!quoted && ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !quoted && angle === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: Address[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const m = p.match(/^(.*?)<([^>]+)>\s*$/);
    const address = (m ? m[2] : p).trim().toLowerCase();
    if (!address.includes("@")) continue;
    const name = m ? decodeWords(m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1")).trim() : "";
    out.push({ name, address });
  }
  return out;
}

const ids = (value: string | undefined): string[] => (value?.match(/<[^<>\s]+>/g) ?? []).map((s) => s.toLowerCase());

export function parseMessage(raw: RawMessage, folder: Message["folder"]): Message {
  const h = headerMap(raw.headers);
  const parsed = Date.parse(h.get("date") ?? "");
  const date = Number.isNaN(parsed) ? new Date(raw.internalDate) : new Date(parsed);
  const precedence = (h.get("precedence") ?? "").toLowerCase();
  const auto = (h.get("auto-submitted") ?? "no").toLowerCase();
  return {
    uid: raw.uid,
    folder,
    // A message with no Message-ID still needs a stable key.
    messageId: ids(h.get("message-id"))[0] ?? `<uid-${folder}-${raw.uid}>`,
    inReplyTo: ids(h.get("in-reply-to"))[0] ?? null,
    references: ids(h.get("references")),
    from: parseAddresses(h.get("from"))[0] ?? null,
    to: parseAddresses(h.get("to")),
    cc: parseAddresses(h.get("cc")),
    subject: decodeWords(h.get("subject") ?? "").trim(),
    date,
    bulk: h.has("list-unsubscribe") || h.has("list-id") || ["bulk", "list", "junk"].includes(precedence) || !auto.startsWith("no"),
  };
}
