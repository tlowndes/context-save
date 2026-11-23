/**
 * Dev-only stand-in for the desktop, for `npm run dev:web` and screenshots.
 * A pretend PC with a few apps open and a couple of earlier saves.
 */
import { buildSave } from "../core/capture";
import { renderNote } from "../core/note";
import type { LiveWindow, Monitor } from "../core/types";
import { joinPath, savesDir, type Ports } from "../services/ports";
import type { AppSettings, Shell } from "./desktop";

const MAIN: Monitor = { id: "\\\\.\\DISPLAY1", bounds: { x: 0, y: 0, w: 2560, h: 1440 }, work: { x: 0, y: 0, w: 2560, h: 1392 }, primary: true };

const apps = (): LiveWindow[] => [
  { hwnd: 1, pid: 10, title: "Hangar onboarding – Figma", exe: "C:\\Users\\tom\\AppData\\Local\\Figma\\Figma.exe", rect: { x: 0, y: 0, w: 1280, h: 1392 }, state: "maximised", monitor: MAIN.id },
  { hwnd: 2, pid: 11, title: "HangarCard.kt - ObsidianCapture - Visual Studio Code", exe: "C:\\Users\\tom\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", rect: { x: 1280, y: 0, w: 1280, h: 1392 }, state: "normal", monitor: MAIN.id },
  { hwnd: 3, pid: 12, title: "Hangar spec.docx - Word", exe: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE", rect: { x: 200, y: 120, w: 1100, h: 900 }, state: "normal", monitor: MAIN.id },
  { hwnd: 4, pid: 13, title: "Build ideas - Obsidian", exe: "C:\\Users\\tom\\AppData\\Local\\Programs\\Obsidian\\Obsidian.exe", rect: { x: 300, y: 200, w: 1000, h: 800 }, state: "minimised", monitor: MAIN.id },
  { hwnd: 5, pid: 14, title: "Mozilla Firefox", exe: "C:\\Program Files\\Mozilla Firefox\\firefox.exe", rect: { x: 400, y: 100, w: 1400, h: 1000 }, state: "normal", monitor: MAIN.id },
];

export function mockShell(): Shell {
  let settings: AppSettings = { vault: "C:\\Users\\tom\\Vault", pc: "STUDIO-PC", saveShortcut: "Ctrl+Alt+S", restoreShortcut: "Ctrl+Alt+R" };
  const files = new Map<string, string>();
  const dir = savesDir(settings.vault);
  const seed = (note: string, at: Date, setup: string | null, take: number) => {
    const save = buildSave({ live: apps().slice(0, take), monitors: [MAIN], note, pc: setup === "Play" ? "LAPTOP" : "STUDIO-PC", setup, now: at });
    const stamp = at.toISOString().slice(0, 16).replace("T", " ").replace(":", "");
    files.set(joinPath(dir, `${stamp}${setup ? ` ${setup}` : ""}.md`), renderNote(save));
  };
  const now = Date.now();
  seed("Cover letter, rewriting the second paragraph", new Date(now - 5 * 3600_000), null, 3);
  seed("Picking the next vinyl for the Pi", new Date(now - 20 * 3600_000), "Play", 2);

  let windows = apps();
  const ports: Ports = {
    desktop: {
      listWindows: async () => windows.map((w) => ({ ...w })),
      listMonitors: async () => [MAIN],
      placeWindow: async (hwnd, rect, state) => {
        windows = windows.map((w) => (w.hwnd === hwnd ? { ...w, rect, state } : w));
      },
      minimiseWindows: async (hwnds) => {
        windows = windows.map((w) => (hwnds.includes(w.hwnd) ? { ...w, state: "minimised" } : w));
      },
      launch: async () => undefined,
      fileExists: async () => true,
      recentShortcut: async () => null,
    },
    vault: {
      list: async (d) => [...files.keys()].filter((k) => k.startsWith(d)).map((k) => k.slice(d.length + 1)),
      readText: async (p) => files.get(p) ?? Promise.reject(new Error("missing")),
      writeText: async (p, t) => void files.set(p, t),
      remove: async (p) => void files.delete(p),
    },
    clock: { now: () => new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50))) },
  };
  return {
    ports,
    getSettings: async () => settings,
    setSettings: async (next) => ((settings = next), []),
    pickFolder: async () => "C:\\Users\\tom\\Vault",
    hide: async () => undefined,
    minimise: async () => undefined,
    show: async () => undefined,
    onOpen: async () => () => undefined,
  };
}
