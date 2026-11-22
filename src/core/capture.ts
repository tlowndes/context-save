/**
 * Turns what is open right now into a save.
 */
import { appName, documentFromTitle, isAbsolutePath, isUserWindow } from "./apps";
import { localIso } from "./note";
import type { LiveWindow, Monitor, SaveFile, SavedWindow } from "./types";

/** Windows that belong in a save, in the order Windows stacks them (front first). */
export const userWindows = (live: LiveWindow[]): LiveWindow[] => live.filter(isUserWindow);

/** File names whose full path we still need to look up (Office shows names, not paths). */
export function documentsToLookUp(live: LiveWindow[]): string[] {
  const names = userWindows(live)
    .map((w) => documentFromTitle(w.exe, w.title))
    .filter((d): d is string => !!d && !isAbsolutePath(d));
  return [...new Set(names)];
}

export interface CaptureInput {
  live: LiveWindow[];
  monitors: Monitor[];
  note: string;
  pc: string;
  setup: string | null;
  now: Date;
  /** Full paths for bare document names, from Windows' recent files. */
  resolved?: Record<string, string>;
}

export function buildSave(input: CaptureInput): SaveFile {
  const windows: SavedWindow[] = userWindows(input.live).map((w) => {
    const doc = documentFromTitle(w.exe, w.title);
    const open = doc ? (isAbsolutePath(doc) ? doc : input.resolved?.[doc]) : undefined;
    return {
      title: w.title,
      exe: w.exe,
      app: appName(w.exe),
      rect: w.rect,
      state: w.state,
      monitor: w.monitor,
      ...(open ? { open } : {}),
    };
  });
  return {
    v: 1,
    created: localIso(input.now),
    pc: input.pc,
    setup: input.setup,
    note: input.note.trim(),
    monitors: input.monitors,
    windows,
  };
}
