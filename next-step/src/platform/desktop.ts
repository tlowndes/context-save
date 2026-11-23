/**
 * The desktop ports, via Tauri commands. In a plain browser (`npm run dev:web`)
 * the mock in ./mock.ts stands in, so the UI can be worked on anywhere.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RawMessage } from "../core/headers";
import type { AppSettings, MailBatch, ModelStatus, Ports } from "../services/ports";

export const isDesktop = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export type View = "panel" | "settings" | "nudge";

export interface Shell {
  ports: Ports;
  getSettings(): Promise<AppSettings>;
  /**
   * Saves settings. A non-empty password replaces the one in Credential Manager.
   * claudeKey: undefined leaves it alone, "" removes it, anything else replaces it.
   */
  setSettings(next: AppSettings, password: string, claudeKey?: string): Promise<void>;
  /** Logs in to Bridge and opens the inbox read-only. Resolves to a short status line. */
  testBridge(): Promise<string>;
  /** Folder picker for the vault. Null when cancelled. */
  pickFolder(): Promise<string | null>;
  /** Shows the number waiting on the tray icon's tooltip. */
  setWaiting(n: number): Promise<void>;
  hide(which: View): Promise<void>;
  show(which: View): Promise<void>;
  /** Shows the daily nudge card by the clock, without taking focus. */
  showNudge(): Promise<void>;
  /** Opens the panel on one email (its step, if you've said it's heavy). */
  openEmail(messageId: string): Promise<void>;
  /** Called each time the window is opened. The panel gets a Message-ID when opened for one email. */
  onOpen(event: "panel-open" | "settings-open" | "nudge-open", fn: (messageId: string | null) => void): Promise<() => void>;
}

export function desktopShell(): Shell {
  const ports: Ports = {
    mail: {
      fetch: (days) => invoke<MailBatch>("fetch_mail", { days }),
      message: (messageId) => invoke<string | null>("fetch_message", { messageId }),
      folders: () => invoke<string[]>("list_folders"),
      fetchFolder: (folder, days) => invoke<RawMessage[]>("fetch_folder", { folder, days }),
      move: (messageIds, from, to) => invoke<number>("move_messages", { messageIds, from, to }),
    },
    model: {
      status: () => invoke<ModelStatus>("model_status"),
      download: () => invoke("model_download"),
      generate: (prompt, maxTokens) => invoke<string>("model_generate", { prompt, maxTokens }),
    },
    vault: {
      read: () => invoke<string | null>("tasks_read"),
      write: (text) => invoke("tasks_write", { text }),
    },
    flightDeck: { open: (link) => invoke("open_flightdeck", { link }) },
    claude: { ask: (system, user) => invoke<string>("ask_claude", { system, user }) },
    store: {
      read: (name) => invoke<string | null>("store_read", { name }),
      write: (name, text) => invoke("store_write", { name, text }),
    },
    clock: { now: () => new Date() },
  };
  return {
    ports,
    getSettings: () => invoke<AppSettings>("get_settings"),
    setSettings: (next, password, claudeKey) => invoke("set_settings", { next, password, claudeKey: claudeKey ?? null }),
    testBridge: () => invoke<string>("test_bridge"),
    pickFolder: async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, title: "Choose your Obsidian vault" });
      return typeof picked === "string" ? picked : null;
    },
    setWaiting: (n) => invoke("set_waiting", { n }),
    hide: (which) => invoke("hide_window", { which }),
    show: (which) => invoke("show_window", { which }),
    showNudge: () => invoke("show_nudge"),
    openEmail: (messageId) => invoke("open_email", { messageId }),
    onOpen: (event, fn) => listen<string | null>(event, (e) => fn(typeof e.payload === "string" ? e.payload : null)),
  };
}
