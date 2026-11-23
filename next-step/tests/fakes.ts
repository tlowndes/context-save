import type { RawMessage } from "../src/core/headers";
import type { AppSettings, MailBatch, Ports } from "../src/services/ports";

export const NOW = new Date("2026-11-20T10:00:00Z");
export const daysAgo = (d: number, from = NOW) => new Date(from.getTime() - d * 86_400_000);

let uid = 1;
export function raw(h: Record<string, string>, date: Date): RawMessage {
  const lines = Object.entries({ Date: date.toUTCString(), ...h }).map(([k, v]) => `${k}: ${v}`);
  return { uid: uid++, headers: lines.join("\r\n") + "\r\n", internalDate: date.toISOString() };
}

export const ME = "tom@proton.me";

export function fromSam(days: number, extra: Record<string, string> = {}): RawMessage {
  return raw({ From: '"Sam Patel" <sam@example.com>', To: ME, Subject: "Saturday, are you in or out?", "Message-ID": `<sam-${days}@example.com>`, ...extra }, daysAgo(days));
}

export const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  bridgeUser: ME,
  host: "127.0.0.1",
  port: 1143,
  sentFolder: "Sent",
  aliases: "",
  skip: "",
  minDays: 3,
  hasPassword: true,
  hasClaudeKey: false,
  autoSort: true,
  vault: "C:/Vault",
  ...patch,
});

export function fakePorts(batch: MailBatch, now = NOW): Ports & { files: Map<string, string>; note: { text: string | null }; opened: string[] } {
  const files = new Map<string, string>();
  const note: { text: string | null } = { text: null };
  const opened: string[] = [];
  let clock = now;
  return {
    files,
    note,
    opened,
    flightDeck: { open: async (link) => void opened.push(link) },
    vault: { read: async () => note.text, write: async (t) => void (note.text = t) },
    mail: { fetch: async () => batch, message: async () => null, folders: async () => ["INBOX", "Sent"], fetchFolder: async () => [], move: async () => 0 },
    model: { status: async () => ({ state: "missing", sizeMb: 1100 }), download: async () => undefined, generate: async () => "" },
    claude: { ask: async () => Promise.reject(new Error("No Claude key")) },
    store: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t) },
    clock: {
      now: () => clock,
      // Lets a test move time on.
      set: (d: Date) => (clock = d),
    } as Ports["clock"] & { set(d: Date): Date },
  };
}
