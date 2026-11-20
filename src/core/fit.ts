/**
 * Where a saved window should go on the screens this PC has now.
 *
 * Same screen, same size: exactly where it was. A different screen layout
 * (a laptop instead of the desk, a monitor unplugged): the window keeps its
 * share of the screen, so a window on the right half stays on the right half.
 */
import type { Monitor, Rect } from "./types";

export interface Fit {
  rect: Rect;
  monitor: string;
  /** True when the window could not go exactly where it was. */
  adjusted: boolean;
}

const sameSize = (a: Rect, b: Rect) => a.w === b.w && a.h === b.h;
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const contains = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
const byLeft = (a: Monitor, b: Monitor) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y;

/** Keeps a rectangle inside an area, shrinking it if it is bigger. */
export function clampInto(r: Rect, area: Rect): Rect {
  const w = Math.min(r.w, area.w);
  const h = Math.min(r.h, area.h);
  const x = Math.min(Math.max(r.x, area.x), area.x + area.w - w);
  const y = Math.min(Math.max(r.y, area.y), area.y + area.h - h);
  return { x, y, w, h };
}

/** The saved monitor a window was on: by id, else the one under its centre, else the first. */
function sourceMonitor(rect: Rect, id: string, saved: Monitor[]): Monitor | null {
  return saved.find((m) => m.id === id) ?? saved.find((m) => contains(m.bounds, centre(rect))) ?? saved[0] ?? null;
}

/** The live monitor that stands in for a saved one. */
function targetMonitor(src: Monitor | null, saved: Monitor[], live: Monitor[]): Monitor {
  const primary = live.find((m) => m.primary) ?? live[0];
  if (!src) return primary;
  const same = live.find((m) => m.id === src.id && sameSize(m.bounds, src.bounds));
  if (same) return same;
  if (src.primary) return primary;
  // Keep left-to-right order: the second screen from the left maps to the second from the left.
  const index = [...saved].sort(byLeft).findIndex((m) => m.id === src.id);
  const ordered = [...live].sort(byLeft);
  return ordered[Math.min(Math.max(index, 0), ordered.length - 1)] ?? primary;
}

export function fitWindow(rect: Rect, monitorId: string, saved: Monitor[], live: Monitor[]): Fit {
  if (live.length === 0) return { rect, monitor: monitorId, adjusted: false };
  const src = sourceMonitor(rect, monitorId, saved);
  const dst = targetMonitor(src, saved, live);

  if (src && src.id === dst.id && sameSize(src.work, dst.work) && src.work.x === dst.work.x && src.work.y === dst.work.y) {
    const clamped = clampInto(rect, dst.work);
    const moved = clamped.x !== rect.x || clamped.y !== rect.y || clamped.w !== rect.w || clamped.h !== rect.h;
    return { rect: clamped, monitor: dst.id, adjusted: moved };
  }

  const from = src?.work ?? dst.work;
  const sx = dst.work.w / from.w;
  const sy = dst.work.h / from.h;
  const scaled: Rect = {
    x: Math.round(dst.work.x + (rect.x - from.x) * sx),
    y: Math.round(dst.work.y + (rect.y - from.y) * sy),
    w: Math.round(rect.w * sx),
    h: Math.round(rect.h * sy),
  };
  return { rect: clampInto(scaled, dst.work), monitor: dst.id, adjusted: true };
}
