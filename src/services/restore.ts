/**
 * Putting a save back. Never closes anything: windows already open are moved,
 * missing apps are started, and everything it changed can be undone.
 */
import { exeName, isSingleWindow, restoresItself } from "../core/apps";
import { userWindows } from "../core/capture";
import { fitWindow } from "../core/fit";
import { newWindowsFor, pairWindows } from "../core/matching";
import type { LiveWindow, Rect, SaveFile, SavedWindow, ShowState } from "../core/types";
import type { Ports } from "./ports";

export interface RestoreOptions {
  /** Minimise open windows that aren't part of the save first. */
  tidy?: boolean;
  /** How long to wait for a started app's window, in ms. */
  launchTimeout?: number;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface Problem {
  app: string;
  title: string;
  reason: string;
}

/** What to put back on Undo. */
export interface UndoRecord {
  moved: { hwnd: number; rect: Rect; state: ShowState }[];
  launched: number[];
}

export interface RestoreReport {
  /** Windows that were already open and were put back in place. */
  placed: number;
  /** Apps that were started and placed. */
  opened: number;
  /** Windows whose place had to change to fit this PC's screens. */
  adjusted: number;
  problems: Problem[];
  undo: UndoRecord;
}

const POLL_MS = 300;

function problem(w: SavedWindow, reason: string): Problem {
  return { app: w.app, title: w.title, reason };
}

export async function restoreSave(ports: Ports, save: SaveFile, opts: RestoreOptions = {}): Promise<RestoreReport> {
  const { desktop, clock } = ports;
  const timeout = opts.launchTimeout ?? 15_000;
  const total = save.windows.length;
  let done = 0;
  const step = (label: string) => opts.onProgress?.(++done, total, label);

  const [startLive, monitors] = await Promise.all([desktop.listWindows(), desktop.listMonitors()]);
  const live = userWindows(startLive);
  const report: RestoreReport = { placed: 0, opened: 0, adjusted: 0, problems: [], undo: { moved: [], launched: [] } };
  const known = new Set(startLive.map((w) => w.hwnd));

  const pairs = pairWindows(save.windows, live);

  if (opts.tidy) {
    const keep = new Set(pairs.flatMap((p) => (p.live ? [p.live.hwnd] : [])));
    const others = live.filter((w) => !keep.has(w.hwnd) && w.state !== "minimised");
    for (const w of others) report.undo.moved.push({ hwnd: w.hwnd, rect: w.rect, state: w.state });
    if (others.length) await desktop.minimiseWindows(others.map((w) => w.hwnd));
  }

  // Each saved window ends up with a live window to place, or a problem.
  const targets = new Map<SavedWindow, LiveWindow>();
  for (const p of pairs) if (p.live) targets.set(p.saved, p.live);

  // Start what's missing, one launch per program for apps that reopen their own session.
  const missing = pairs.filter((p) => !p.live).map((p) => p.saved);
  const groups = new Map<string, SavedWindow[]>();
  for (const w of missing) groups.set(exeName(w.exe), [...(groups.get(exeName(w.exe)) ?? []), w]);

  for (const group of groups.values()) {
    const exe = group[0].exe;
    if (!(await desktop.fileExists(exe))) {
      for (const w of group) {
        report.problems.push(problem(w, `${w.app} isn't installed on this PC`));
        step(w.app);
      }
      continue;
    }
    const alreadyRunning = live.some((l) => exeName(l.exe) === exeName(exe));
    const launches: string[][] = [];
    const withFiles = group.filter((w) => w.open);
    for (const w of withFiles) launches.push([w.open!]);
    const bare = group.length - withFiles.length;
    if (bare > 0 && !(alreadyRunning && isSingleWindow(exe))) {
      const times = restoresItself(exe) || isSingleWindow(exe) ? 1 : bare;
      for (let i = 0; i < times; i++) launches.push([]);
    }
    try {
      for (const args of launches) await desktop.launch(exe, args);
    } catch (e) {
      for (const w of group) {
        report.problems.push(problem(w, `${w.app} wouldn't start: ${e instanceof Error ? e.message : String(e)}`));
        step(w.app);
      }
      continue;
    }

    // Wait for the new windows to appear, then give each saved window its best match.
    const deadline = clock.now().getTime() + timeout;
    let fresh: LiveWindow[] = [];
    while (clock.now().getTime() < deadline) {
      await clock.sleep(POLL_MS);
      fresh = newWindowsFor(exe, known, userWindows(await desktop.listWindows()));
      if (fresh.length >= group.length) break;
    }
    for (const w of fresh) known.add(w.hwnd);
    const matched = pairWindows(group, fresh);
    for (const m of matched) {
      if (m.live) {
        targets.set(m.saved, m.live);
        report.undo.launched.push(m.live.hwnd);
      } else {
        report.problems.push(problem(m.saved, `${m.saved.app} opened, but its window didn't show up in time to be placed`));
        step(m.saved.app);
      }
    }
  }

  // Place back to front, so the window that was in front ends up in front.
  const launchedSet = new Set(report.undo.launched);
  for (const saved of [...save.windows].reverse()) {
    const target = targets.get(saved);
    if (!target) continue;
    const fit = fitWindow(saved.rect, saved.monitor, save.monitors, monitors);
    try {
      if (!launchedSet.has(target.hwnd)) report.undo.moved.push({ hwnd: target.hwnd, rect: target.rect, state: target.state });
      await desktop.placeWindow(target.hwnd, fit.rect, saved.state);
      if (launchedSet.has(target.hwnd)) report.opened++;
      else report.placed++;
      if (fit.adjusted) report.adjusted++;
    } catch {
      report.problems.push(problem(saved, `${saved.app} opened, but Windows wouldn't let it be moved`));
    }
    step(saved.app);
  }
  return report;
}

/** Puts moved windows back where they were and minimises the ones restore started. Closes nothing. */
export async function undoRestore(ports: Ports, undo: UndoRecord): Promise<void> {
  for (const m of [...undo.moved].reverse()) {
    try {
      await ports.desktop.placeWindow(m.hwnd, m.rect, m.state);
    } catch {
      // The window may have been closed since; nothing to put back.
    }
  }
  if (undo.launched.length) await ports.desktop.minimiseWindows(undo.launched).catch(() => undefined);
}

/** One line for the summary toast. */
export function reportLine(r: RestoreReport): string {
  const back = r.placed + r.opened;
  const parts = [`${back} ${back === 1 ? "window" : "windows"} back`];
  if (r.adjusted) parts.push(`${r.adjusted} fitted to this screen`);
  if (r.problems.length) parts.push(`${r.problems.length} need a hand`);
  return parts.join(", ");
}

