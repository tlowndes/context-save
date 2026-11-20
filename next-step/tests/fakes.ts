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
  ...patch,
});

export function fakePorts(batch: MailBatch, now = NOW): Ports & { files: Map<string, string> } {
  const files = new Map<string, string>();
  let clock = now;
  return {
    files,
    mail: { fetch: async () => batch },
    store: { read: async (n) => files.get(n) ?? null, write: async (n, t) => void files.set(n, t) },
    clock: {
      now: () => clock,
      // Lets a test move time on.
      set: (d: Date) => (clock = d),
    } as Ports["clock"] & { set(d: Date): Date },
  };
}
