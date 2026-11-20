/**
 * The desktop ports, via Tauri commands. In a plain browser (`npm run dev:web`)
 * the mock in ./mock.ts stands in, so the UI can be worked on anywhere.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppSettings, MailBatch, Ports } from "../services/ports";

export const isDesktop = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export type View = "panel" | "settings";

export interface Shell {
  ports: Ports;
  getSettings(): Promise<AppSettings>;
  /** Saves settings. A non-empty password replaces the one in Credential Manager. */
  setSettings(next: AppSettings, password: string): Promise<void>;
  /** Logs in to Bridge and opens the inbox read-only. Resolves to a short status line. */
  testBridge(): Promise<string>;
  /** Shows the number waiting on the tray icon's tooltip. */
  setWaiting(n: number): Promise<void>;
  hide(which: View): Promise<void>;
  show(which: View): Promise<void>;
  /** Called each time the window is opened from the tray. */
  onOpen(event: "panel-open" | "settings-open", fn: () => void): Promise<() => void>;
}

export function desktopShell(): Shell {
  const ports: Ports = {
    mail: { fetch: (days) => invoke<MailBatch>("fetch_mail", { days }) },
    store: {
      read: (name) => invoke<string | null>("store_read", { name }),
      write: (name, text) => invoke("store_write", { name, text }),
    },
    clock: { now: () => new Date() },
  };
  return {
    ports,
    getSettings: () => invoke<AppSettings>("get_settings"),
    setSettings: (next, password) => invoke("set_settings", { next, password }),
    testBridge: () => invoke<string>("test_bridge"),
    setWaiting: (n) => invoke("set_waiting", { n }),
    hide: (which) => invoke("hide_window", { which }),
    show: (which) => invoke("show_window", { which }),
    onOpen: (event, fn) => listen(event, () => fn()),
  };
}
