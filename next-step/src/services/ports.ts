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

/** Proton Mail Bridge over local IMAP. Reads only, apart from moving between folders. */
export interface Mail {
  /** Headers of every message from the last `days` days in the inbox and Sent. Never marks anything read. */
  fetch(days: number): Promise<MailBatch>;
  /** One whole email by Message-ID, read with BODY.PEEK. Null when it's gone. */
  message(messageId: string): Promise<string | null>;
  /** Every folder Bridge shows, e.g. "INBOX", "Archive", "Folders/Receipts". */
  folders(): Promise<string[]>;
  /** Who-sent-what headers from one folder, to learn where things get filed. */
  fetchFolder(folder: string, days: number): Promise<RawMessage[]>;
  /** The only write: moves emails by Message-ID. Resolves to how many moved. */
  move(messageIds: string[], from: string, to: string): Promise<number>;
}

export type ModelStatus =
  | { state: "missing"; sizeMb: number }
  | { state: "downloading"; done: number; total: number }
  | { state: "ready" }
  | { state: "error"; message: string };

/** The small language model built into the app. Runs on this PC only. */
export interface Model {
  status(): Promise<ModelStatus>;
  /** Starts the one-off download. Progress shows up in status(). */
  download(): Promise<void>;
  /** Plain text completion, stops at the end of the assistant's turn. */
  generate(prompt: string, maxTokens: number): Promise<string>;
}

/** Ask Claude: only ever called when you tap the button. */
export interface Claude {
  ask(system: string, user: string): Promise<string>;
}

/**
 * The one note Next Step may touch in your vault: `00 - Inbox/Next steps.md`.
 * Rejects when no vault is chosen.
 */
export interface Vault {
  /** The note's text, or null when it doesn't exist yet. */
  read(): Promise<string | null>;
  /** Saves safely (temp file, swap, read back) so Obsidian Sync never sees half a note. */
  write(text: string): Promise<void>;
}

/** Flight Deck on this PC, which prints Ticket Rail tickets to the pocket printer. */
export interface FlightDeck {
  /** Opens a `flightdeck://print?…` link. Flight Deck starts if it isn't running. */
  open(link: string): Promise<void>;
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
  model: Model;
  claude: Claude;
  vault: Vault;
  flightDeck: FlightDeck;
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
  /** Folders Sort never suggests or moves mail into, comma or newline separated. */
  skipFolders: string;
  /** Daily nudge time, "10:30". Empty for no nudge. */
  nudgeAt: string;
  minDays: number;
  /** Set by the desktop side: a Bridge password is saved in Windows Credential Manager. */
  hasPassword: boolean;
  /** Set by the desktop side: a Claude API key is saved in Credential Manager. */
  hasClaudeKey: boolean;
  /** Obsidian vault folder (the one holding .obsidian). Empty until chosen. */
  vault: string;
  /** Move mail from trusted senders by itself. */
  autoSort: boolean;
}

export const splitList = (s: string): string[] =>
  s
    .split(/[\n,;]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
