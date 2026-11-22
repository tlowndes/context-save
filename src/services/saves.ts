/**
 * Saving a context to the vault and listing saves for the restore panel.
 */
import { buildSave, documentsToLookUp } from "../core/capture";
import { lnkTarget } from "../core/lnk";
import { noteFileName, parseNote, renderNote, uniqueName } from "../core/note";
import type { LiveWindow, Monitor, SaveEntry, SaveFile } from "../core/types";
import { joinPath, savesDir, type Ports, type Settings } from "./ports";

/** What was on screen the moment the shortcut was pressed. */
export interface Snapshot {
  live: LiveWindow[];
  monitors: Monitor[];
  at: Date;
}

export async function takeSnapshot(ports: Ports): Promise<Snapshot> {
  const [live, monitors] = await Promise.all([ports.desktop.listWindows(), ports.desktop.listMonitors()]);
  return { live, monitors, at: ports.clock.now() };
}

/** Finds full paths for Office-style titles through Windows' recent files. Missing ones are left out. */
async function resolveDocuments(ports: Ports, live: LiveWindow[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of documentsToLookUp(live)) {
    try {
      const bytes = await ports.desktop.recentShortcut(name);
      const target = bytes ? lnkTarget(bytes) : null;
      if (target) out[name] = target;
    } catch {
      // A missing or odd shortcut only means the app reopens without that file.
    }
  }
  return out;
}

export interface Saved {
  path: string;
  save: SaveFile;
}

export async function saveContext(ports: Ports, settings: Settings, snap: Snapshot, note: string, setup: string | null = null): Promise<Saved> {
  const resolved = await resolveDocuments(ports, snap.live);
  const save = buildSave({ live: snap.live, monitors: snap.monitors, note, pc: settings.pc, setup, now: snap.at, resolved });
  const dir = savesDir(settings.vault);
  const existing = await ports.vault.list(dir).catch(() => [] as string[]);
  const path = joinPath(dir, uniqueName(noteFileName(snap.at, setup), existing));
  await ports.vault.writeText(path, renderNote(save));
  return { path, save };
}

/** Undo for a save: the note goes, nothing else was touched. */
export const deleteSave = (ports: Ports, path: string) => ports.vault.remove(path);

/** Saves newest first. Notes that aren't saves, or are damaged, are skipped. */
export async function listSaves(ports: Ports, settings: Settings, limit = 30): Promise<SaveEntry[]> {
  const dir = savesDir(settings.vault);
  const names = (await ports.vault.list(dir).catch(() => [] as string[]))
    .filter((n) => n.toLowerCase().endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, limit);
  const entries: SaveEntry[] = [];
  for (const name of names) {
    const path = joinPath(dir, name);
    try {
      const save = parseNote(await ports.vault.readText(path));
      if (save) entries.push({ path, save });
    } catch {
      // Unreadable (mid-sync, locked): leave it out this time.
    }
  }
  return entries.sort((a, b) => Date.parse(b.save.created) - Date.parse(a.save.created));
}
