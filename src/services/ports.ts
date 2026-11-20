/**
 * Everything the services need from the outside world. The desktop app
 * implements these with Tauri commands (src/platform/desktop.ts); tests use
 * an in-memory fake, so save and restore logic runs without Windows.
 */
import type { LiveWindow, Monitor, Rect, ShowState } from "../core/types";

export interface Desktop {
  /** Top-level windows, front first. Excludes Context Save's own windows. */
  listWindows(): Promise<LiveWindow[]>;
  listMonitors(): Promise<Monitor[]>;
  /** Moves and sizes a window and brings it to the front. */
  placeWindow(hwnd: number, rect: Rect, state: ShowState): Promise<void>;
  minimiseWindows(hwnds: number[]): Promise<void>;
  /** Starts a program. Resolves once it has started, not once its window is up. */
  launch(exe: string, args: string[]): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  /** Bytes of `%APPDATA%\Microsoft\Windows\Recent\<name>.lnk`, or null if there is none. */
  recentShortcut(name: string): Promise<Uint8Array | null>;
}

/** Reads and writes inside the vault's Context Save folder only. */
export interface Vault {
  list(dir: string): Promise<string[]>;
  readText(path: string): Promise<string>;
  /** Writes a temp file beside the target, swaps it in and reads it back. */
  writeText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export interface Ports {
  desktop: Desktop;
  vault: Vault;
  clock: Clock;
}

export interface Settings {
  /** Vault root: the folder that contains `.obsidian`. */
  vault: string;
  /** This PC's name, shown on saves. */
  pc: string;
}

/** Where saves live inside the vault. */
export const SAVES_DIR = ["99 - Meta", "Context Save", "Saves"];

export function savesDir(vault: string): string {
  const sep = vault.includes("\\") ? "\\" : "/";
  return [vault.replace(/[\\/]+$/, ""), ...SAVES_DIR].join(sep);
}

export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${sep}${name}`;
}
