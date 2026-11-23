/**
 * Steps you accept become Tasks-plugin lines in `00 - Inbox/Next steps.md`,
 * e.g. `- [ ] #task Reply yes or no to Sam #mail 📅 2026-11-21`.
 *
 * They start with `#task` (the vault's Tasks global filter), so Obsidian Tasks and
 * Flight Deck both see them. Next Step never writes a `🆔`: Flight Deck gives the
 * line its rail id (`🆔 mai004`) when it prints the ticket, from Print now or the
 * morning run. So a task is found by its text, not an id.
 *
 * Only the step goes in the vault: never who emailed or what they said.
 */

export const TASKS_NOTE = "00 - Inbox/Next steps.md";

const HEADER = "# Next steps\n\nTiny steps for emails you were putting off. Added by Next Step; a reply in Sent ticks them.\n\n";

/** Local date as YYYY-MM-DD. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Tags and emoji in a step would break the Tasks fields, so they're taken out. */
function clean(text: string): string {
  return text
    .replace(/[#\n\r]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F3}\u{231B}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** What identifies the task: the line without its checkbox, e.g. `#task Reply yes or no to Sam #mail 📅 2026-11-21`. */
export function taskBody(stepText: string, due: Date): string {
  return `#task ${clean(stepText)} #mail 📅 ${ymd(due)}`;
}

export const taskLine = (body: string): string => `- [ ] ${body}`;

/** Adds the line at the end, creating the note's header the first time. */
export function appendTask(note: string | null, line: string): string {
  const base = note && note.trim() ? note.replace(/\s*$/, "\n") : HEADER;
  return `${base}${line}\n`;
}

const BOX = /^\s*- \[(.)\]\s*/;
const RAIL_ID = /🆔\s*([a-z]{3}\d{3})(?![\w-])/i;

/**
 * The line's body with what others add taken out (Flight Deck's `🆔`, the `✅` date when
 * it's ticked) and spaces evened out, so a moved or re-saved line still matches.
 */
function core(line: string): string {
  return line
    .replace(BOX, "")
    .replace(/\s*🆔\s*[\w-]+/g, "")
    .replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineIndex(lines: string[], body: string): number {
  const want = core(body);
  return lines.findIndex((l) => BOX.test(l) && core(l) === want);
}

export function taskState(note: string | null, body: string): "open" | "done" | "missing" {
  const lines = (note ?? "").split("\n");
  const i = lineIndex(lines, body);
  if (i < 0) return "missing";
  return /^\s*- \[ \]/.test(lines[i]) ? "open" : "done";
}

/** The rail id Flight Deck put on the line when it printed, e.g. "mai004". Null until then. */
export function railId(note: string | null, body: string): string | null {
  const lines = (note ?? "").split("\n");
  const i = lineIndex(lines, body);
  return i < 0 ? null : (RAIL_ID.exec(lines[i])?.[1].toLowerCase() ?? null);
}

/** How a rail id reads on the ticket: mai004 → "MAI 004". */
export const railCode = (id: string): string => `${id.slice(0, 3).toUpperCase()} ${id.slice(3)}`;

/** The link Flight Deck on the PC opens to print this task's ticket now. */
export function printLink(body: string): string {
  return `flightdeck://print?note=${encodeURIComponent(TASKS_NOTE)}&task=${encodeURIComponent(body)}`;
}

/** Ticks an open task, Tasks-plugin style (`✅ date`). Unchanged if it's missing or already done. */
export function tickTask(note: string, body: string, on: Date): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, body);
  if (i < 0 || !/^\s*- \[ \]/.test(lines[i])) return note;
  const cr = lines[i].endsWith("\r") ? "\r" : "";
  lines[i] = `${lines[i].replace("- [ ]", "- [x]").replace(/\s+$/, "")} ✅ ${ymd(on)}${cr}`;
  return lines.join("\n");
}

/** Undo for a tick. */
export function untickTask(note: string, body: string): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, body);
  if (i < 0 || /^\s*- \[ \]/.test(lines[i])) return note;
  lines[i] = lines[i].replace(/- \[.\]/, "- [ ]").replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "");
  return lines.join("\n");
}

/** Undo for adding: takes the line out again. */
export function removeTask(note: string, body: string): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, body);
  if (i < 0) return note;
  lines.splice(i, 1);
  return lines.join("\n");
}
