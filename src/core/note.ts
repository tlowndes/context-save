/**
 * A save as an Obsidian note: readable at the top, machine data in one fenced
 * block at the end. Editing the "Where I was" text in Obsidian changes the note
 * the restore panel shows; the block is only ever written by Context Save.
 */
import type { SaveFile, SavedWindow } from "./types";

const FENCE = "context-save";
const NO_NOTE = "_No note._";

/** Local time as ISO 8601 with its offset, e.g. `2026-11-20T14:47:00+00:00`. */
export function localIso(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

/** One line per window, the way a person would jot it down. */
export function describeWindow(w: SavedWindow): string {
  const title = w.title.length > 80 ? `${w.title.slice(0, 77)}…` : w.title;
  const where = w.open ? ` (\`${w.open}\`)` : "";
  return `- ${w.app} · ${title}${where}`;
}

const yamlString = (s: string) => JSON.stringify(s);

export function renderNote(save: SaveFile): string {
  const lines = [
    "---",
    "type: context-save",
    `created: ${save.created}`,
    `pc: ${yamlString(save.pc)}`,
    ...(save.setup ? [`setup: ${yamlString(save.setup)}`] : []),
    `apps: ${new Set(save.windows.map((w) => w.app)).size}`,
    "---",
    "# Where I was",
    "",
    save.note.trim() || NO_NOTE,
    "",
    "## Apps",
    "",
    ...(save.windows.length ? save.windows.map(describeWindow) : ["_Nothing was open._"]),
    "",
    "```" + FENCE,
    JSON.stringify(save, null, 1),
    "```",
    "",
  ];
  return lines.join("\n");
}

function isSaveFile(x: unknown): x is SaveFile {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<SaveFile>;
  return (
    s.v === 1 &&
    typeof s.created === "string" &&
    typeof s.pc === "string" &&
    typeof s.note === "string" &&
    Array.isArray(s.windows) &&
    Array.isArray(s.monitors) &&
    s.windows.every((w) => w && typeof w.exe === "string" && typeof w.title === "string" && w.rect && typeof w.rect.x === "number")
  );
}

/** The note text under "# Where I was", as the person may have edited it. */
function humanNote(md: string): string | null {
  const m = md.match(/^# Where I was[^\n]*\n([\s\S]*?)(?=^##? |^```|$(?![\s\S]))/m);
  if (!m) return null;
  const text = m[1].trim();
  return text === NO_NOTE ? "" : text;
}

/** Reads a save note. Returns null for any note that isn't one, or whose data block is damaged. */
export function parseNote(md: string): SaveFile | null {
  const text = md.replace(/\r\n/g, "\n");
  const m = text.match(new RegExp("^```" + FENCE + "\\n([\\s\\S]*?)\\n```", "m"));
  if (!m) return null;
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!isSaveFile(data)) return null;
  const edited = humanNote(text);
  return edited === null ? data : { ...data, note: edited };
}

/** `2026-11-20 1447 Work.md`: sorts by time in any file list. */
export function noteFileName(created: Date, setup: string | null): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())} ${pad(created.getHours())}${pad(created.getMinutes())}`;
  const label = (setup ?? "").replace(/[<>:"/\\|?*#^[\]\u0000-\u001f]/g, "").trim();
  return `${stamp}${label ? ` ${label}` : ""}.md`;
}

/** Adds " 2", " 3"… when a name is already used. */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const stem = name.replace(/\.md$/i, "");
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}.md`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Short summary for chips and toasts: "6 apps". */
export function summarise(windows: SavedWindow[]): { apps: string[]; count: number } {
  const apps = [...new Set(windows.map((w) => w.app))];
  return { apps, count: apps.length };
}
