/**
 * The shapes everything else agrees on. Pure data, no I/O.
 * Coordinates are physical pixels on the Windows virtual desktop.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ShowState = "normal" | "maximised" | "minimised";

/** A display as Windows reports it. `id` is the device name, e.g. `\\.\DISPLAY1`. */
export interface Monitor {
  id: string;
  /** Whole screen. */
  bounds: Rect;
  /** Screen minus the taskbar: where windows are placed. */
  work: Rect;
  primary: boolean;
}

/** A top-level window that is open right now. */
export interface LiveWindow {
  /** Window handle, only meaningful on the PC and session it came from. */
  hwnd: number;
  pid: number;
  title: string;
  /** Full path of the program, e.g. `C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE`. */
  exe: string;
  /** Normal (restored) position, even when the window is maximised or minimised. */
  rect: Rect;
  state: ShowState;
  /** Device name of the monitor the window is mostly on. */
  monitor: string;
}

/** A window as it is stored in a save: everything needed to bring it back, nothing session-specific. */
export interface SavedWindow {
  title: string;
  exe: string;
  /** Friendly app name, e.g. "Word". */
  app: string;
  rect: Rect;
  state: ShowState;
  monitor: string;
  /** A file or folder to reopen, when one could be worked out. */
  open?: string;
}

export interface SaveFile {
  /** Format version of the machine block. */
  v: 1;
  created: string; // ISO 8601, local time with offset
  pc: string;
  setup: string | null;
  note: string;
  monitors: Monitor[];
  windows: SavedWindow[];
}

/** A save as listed in the restore panel. */
export interface SaveEntry {
  path: string;
  save: SaveFile;
}
