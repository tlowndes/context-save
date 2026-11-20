/**
 * Everything the services need from the outside world. The desktop app
 * implements these with Tauri commands (src/platform/desktop.ts); tests and
 * `npm run dev:web` use in-memory fakes.
 */
import type { RawMessage } from "../core/headers";

export interface MailBatch {
  inbox: RawMessage[];
  sent: RawMessage[];
}

/** Read-only access to Proton Mail Bridge over local IMAP. */
export interface Mail {
  /** Headers of every message from the last `days` days in the inbox and Sent. Never marks anything read. */
  fetch(days: number): Promise<MailBatch>;
}

/** Small JSON files in the app's own folder on this PC. */
export interface Store {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface Ports {
  mail: Mail;
  store: Store;
  clock: Clock;
}

export interface AppSettings {
  /** Bridge login, which is also your main address. */
  bridgeUser: string;
  host: string;
  port: number;
  /** Bridge's name for the Sent folder. */
  sentFolder: string;
  /** Other addresses that count as "you", comma or newline separated. */
  aliases: string;
  /** Senders or domains to never show, comma or newline separated. */
  skip: string;
  minDays: number;
  /** Set by the desktop side: a Bridge password is saved in Windows Credential Manager. */
  hasPassword: boolean;
}

export const splitList = (s: string): string[] =>
  s
    .split(/[\n,;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
