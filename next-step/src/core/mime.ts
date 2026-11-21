/**
 * Pulls the readable text out of one raw email, for writing a step.
 * Only the first part of the newest message matters: quoted replies,
 * signatures and HTML furniture are dropped. Pure and unit-tested.
 */
import { headerMap } from "./headers";

const bytesFrom = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function decodeText(body: string, encoding: string, charset: string): string {
  let bytes: Uint8Array;
  const enc = encoding.toLowerCase();
  if (enc === "base64") {
    try {
      bytes = bytesFrom(atob(body.replace(/\s+/g, "")));
    } catch {
      return body;
    }
  } else if (enc === "quoted-printable") {
    bytes = bytesFrom(body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))));
  } else {
    // 7bit/8bit: the IMAP side hands bytes over as Latin-1-ish text, so re-read them.
    bytes = bytesFrom(body);
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const param = (value: string, name: string): string => {
  const m = value.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? "") : "";
};

interface Part {
  type: string;
  text: string;
}

function split(raw: string): { head: string; body: string } {
  const norm = raw.replace(/\r\n/g, "\n");
  const i = norm.indexOf("\n\n");
  return i < 0 ? { head: norm, body: "" } : { head: norm.slice(0, i), body: norm.slice(i + 2) };
}

function parts(raw: string, depth = 0): Part[] {
  const { head, body } = split(raw);
  const h = headerMap(head);
  const ctype = h.get("content-type") ?? "text/plain";
  const type = ctype.split(";")[0].trim().toLowerCase();
  if (type.startsWith("multipart/") && depth < 5) {
    const boundary = param(ctype, "boundary");
    if (!boundary) return [];
    const chunks = body.split(`--${boundary}`).slice(1);
    return chunks.filter((c) => !c.startsWith("--")).flatMap((c) => parts(c.replace(/^\n/, ""), depth + 1));
  }
  if (!type.startsWith("text/")) return [];
  if ((h.get("content-disposition") ?? "").toLowerCase().startsWith("attachment")) return [];
  return [{ type, text: decodeText(body, h.get("content-transfer-encoding") ?? "7bit", param(ctype, "charset")) }];
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Keeps only what the sender just wrote: stops at the quoted reply or signature. */
export function newestText(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (t === "--" || t === "-- " || /^_{5,}$/.test(t)) break;
    if (/^On .{4,200} wrote:$/i.test(t) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(t) || /^From:\s/.test(t) || /^Sent from my /i.test(t)) break;
    if (t.startsWith(">")) continue;
    out.push(line.trimEnd());
  }
  return out
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The readable start of an email, at most `max` characters. */
export function bodyText(raw: string, max = 1500): string {
  const all = parts(raw);
  const plain = all.find((p) => p.type === "text/plain");
  const html = all.find((p) => p.type === "text/html");
  const text = plain ? plain.text : html ? htmlToText(html.text) : "";
  const clean = newestText(text);
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}
