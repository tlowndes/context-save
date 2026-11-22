/**
 * An in-memory Windows desktop and vault for service tests.
 * Launching a program opens a new window for it after a short, fake delay.
 */
import { exeName } from "../src/core/apps";
import type { LiveWindow, Monitor, Rect, ShowState } from "../src/core/types";
import type { Ports } from "../src/services/ports";

export const MAIN: Monitor = { id: "\\\\.\\DISPLAY1", bounds: { x: 0, y: 0, w: 2560, h: 1440 }, work: { x: 0, y: 0, w: 2560, h: 1392 }, primary: true };
export const SIDE: Monitor = { id: "\\\\.\\DISPLAY2", bounds: { x: 2560, y: 0, w: 1920, h: 1080 }, work: { x: 2560, y: 0, w: 1920, h: 1032 }, primary: false };
export const LAPTOP: Monitor = { id: "\\\\.\\DISPLAY1", bounds: { x: 0, y: 0, w: 1920, h: 1200 }, work: { x: 0, y: 0, w: 1920, h: 1152 }, primary: true };

let nextHwnd = 1000;
export function win(exe: string, title: string, rect: Rect = { x: 100, y: 100, w: 800, h: 600 }, extra: Partial<LiveWindow> = {}): LiveWindow {
  return { hwnd: nextHwnd++, pid: 1, title, exe, rect, state: "normal", monitor: MAIN.id, ...extra };
}

export interface FakeDesktop {
  windows: LiveWindow[];
  monitors: Monitor[];
  installed: Set<string>;
  launches: { exe: string; args: string[] }[];
  placed: { hwnd: number; rect: Rect; state: ShowState }[];
  minimised: number[];
  /** What a launch opens: by default one window titled after the file, or the app. */
  onLaunch: (exe: string, args: string[]) => LiveWindow[];
  /** Fake ms before a launched window shows. */
  launchDelay: number;
  shortcuts: Record<string, Uint8Array>;
  files: Map<string, string>;
}

export function fakePorts(init: Partial<FakeDesktop> = {}): { ports: Ports; state: FakeDesktop } {
  const state: FakeDesktop = {
    windows: [],
    monitors: [MAIN],
    installed: new Set(),
    launches: [],
    placed: [],
    minimised: [],
    onLaunch: (exe, args) => [win(exe, args[0] ? `${args[0].split("\\").pop()} - App` : exeName(exe))],
    launchDelay: 600,
    shortcuts: {},
    files: new Map(),
    ...init,
  };
  let t = Date.parse("2026-11-20T14:47:00Z");
  const pending: { at: number; windows: LiveWindow[] }[] = [];
  const settle = () => {
    for (const p of [...pending]) {
      if (p.at <= t) {
        state.windows.unshift(...p.windows);
        pending.splice(pending.indexOf(p), 1);
      }
    }
  };
  const ports: Ports = {
    desktop: {
      listWindows: async () => (settle(), state.windows.map((w) => ({ ...w }))),
      listMonitors: async () => state.monitors,
      placeWindow: async (hwnd, rect, s) => {
        const w = state.windows.find((x) => x.hwnd === hwnd);
        if (!w) throw new Error("gone");
        state.placed.push({ hwnd, rect, state: s });
        w.rect = rect;
        w.state = s;
      },
      minimiseWindows: async (hwnds) => {
        state.minimised.push(...hwnds);
        for (const w of state.windows) if (hwnds.includes(w.hwnd)) w.state = "minimised";
      },
      launch: async (exe, args) => {
        state.launches.push({ exe, args });
        pending.push({ at: t + state.launchDelay, windows: state.onLaunch(exe, args) });
      },
      fileExists: async (p) => state.installed.has(p),
      recentShortcut: async (name) => state.shortcuts[name] ?? null,
    },
    vault: {
      list: async (dir) =>
        [...state.files.keys()].filter((k) => k.startsWith(dir + "/") || k.startsWith(dir + "\\")).map((k) => k.slice(dir.length + 1)).filter((k) => !/[\\/]/.test(k)),
      readText: async (p) => {
        const v = state.files.get(p);
        if (v === undefined) throw new Error("not found");
        return v;
      },
      writeText: async (p, text) => void state.files.set(p, text),
      remove: async (p) => void state.files.delete(p),
    },
    clock: {
      now: () => new Date(t),
      sleep: async (ms) => {
        t += ms;
      },
    },
  };
  return { ports, state };
}
