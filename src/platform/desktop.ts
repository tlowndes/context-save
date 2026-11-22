/**
 * The desktop ports, via Tauri commands. In a plain browser (`npm run dev:web`)
 * the mock in ./mock.ts stands in, so the UI can be worked on anywhere.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LiveWindow, Monitor } from "../core/types";
import type { Ports } from "../services/ports";

export const isDesktop = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export interface AppSettings {
  vault: string;
  pc: string;
  saveShortcut: string;
  restoreShortcut: string;
}

export interface HotkeyFailure {
  action: string;
  accelerator: string;
  reason: string;
}

export interface Shell {
  ports: Ports;
  getSettings(): Promise<AppSettings>;
  setSettings(next: AppSettings): Promise<HotkeyFailure[]>;
  pickFolder(): Promise<string | null>;
  hide(which: "save" | "restore" | "settings"): Promise<void>;
  show(which: "save" | "restore" | "settings"): Promise<void>;
  /** Called each time the window is opened from a shortcut or the tray. */
  onOpen(event: "save-open" | "restore-open" | "settings-open", fn: () => void): Promise<() => void>;
}

export function desktopShell(): Shell {
  const ports: Ports = {
    desktop: {
      listWindows: () => invoke<LiveWindow[]>("list_windows"),
      listMonitors: () => invoke<Monitor[]>("list_monitors"),
      placeWindow: (hwnd, rect, state) => invoke("place_window", { hwnd, rect, state }),
      minimiseWindows: (hwnds) => invoke("minimise_windows", { hwnds }),
      launch: (exe, args) => invoke("launch", { exe, args }),
      fileExists: (path) => invoke<boolean>("file_exists", { path }),
      recentShortcut: async (name) => {
        const bytes = await invoke<number[] | null>("recent_shortcut", { name });
        return bytes ? new Uint8Array(bytes) : null;
      },
    },
    vault: {
      list: (path) => invoke<string[]>("vault_list", { path }),
      readText: (path) => invoke<string>("vault_read", { path }),
      writeText: (path, text) => invoke("vault_write", { path, text }),
      remove: (path) => invoke("vault_remove", { path }),
    },
    clock: {
      now: () => new Date(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    },
  };
  return {
    ports,
    getSettings: () => invoke<AppSettings>("get_settings"),
    setSettings: (next) => invoke<HotkeyFailure[]>("set_settings", { next }),
    pickFolder: async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, title: "Choose your Obsidian vault" });
      return typeof picked === "string" ? picked : null;
    },
    hide: (which) => invoke("hide_window", { which }),
    show: (which) => invoke("show_window", { which }),
    onOpen: (event, fn) => listen(event, () => fn()),
  };
}
