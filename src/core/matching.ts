/**
 * Pairs saved windows with windows that are already open, so restore moves
 * what is there instead of opening a second copy.
 */
import { exeName } from "./apps";
import type { LiveWindow, SavedWindow } from "./types";

/** How well a live window stands in for a saved one. 0 = not at all. */
export function matchScore(saved: SavedWindow, live: LiveWindow): number {
  if (exeName(saved.exe) !== exeName(live.exe)) return 0;
  if (saved.title === live.title) return 3;
  if (saved.open) {
    const name = saved.open.split(/[\\/]/).pop() ?? saved.open;
    if (live.title.includes(name)) return 2;
  }
  return 1;
}

export interface Pairing {
  saved: SavedWindow;
  live: LiveWindow | null;
}

/**
 * Best match for each saved window, each live window used once.
 * Exact title matches are claimed first, so two Word documents each find their own window.
 */
export function pairWindows(saved: SavedWindow[], live: LiveWindow[]): Pairing[] {
  const taken = new Set<number>();
  const result: (LiveWindow | null)[] = saved.map(() => null);
  for (const level of [3, 2, 1]) {
    saved.forEach((s, i) => {
      if (result[i]) return;
      const hit = live.find((l) => !taken.has(l.hwnd) && matchScore(s, l) === level);
      if (hit) {
        result[i] = hit;
        taken.add(hit.hwnd);
      }
    });
  }
  return saved.map((s, i) => ({ saved: s, live: result[i] }));
}

/** Windows that appeared since `before`, for the given program. Newest handles first is not guaranteed, so order is Windows' z-order. */
export function newWindowsFor(exe: string, before: Set<number>, now: LiveWindow[]): LiveWindow[] {
  const name = exeName(exe);
  return now.filter((w) => !before.has(w.hwnd) && exeName(w.exe) === name);
}
