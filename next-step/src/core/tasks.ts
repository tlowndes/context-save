/**
 * Steps you accept become Tasks-plugin lines in `00 - Inbox/Next steps.md`,
 * e.g. `- [ ] Reply yes or no to Sam #mail 🆔 em014 📅 2026-11-21`.
 * Flight Deck's Ticket Rail morning run picks up today's 🆔 tasks.
 * Only the step goes in the vault: never who emailed or what they said.
 */

export const TASKS_NOTE = "00 - Inbox/Next steps.md";

const HEADER = "# Next steps\n\nTiny steps for emails you were putting off. Added by Next Step; a reply in Sent ticks them.\n\n";

/** Local date as YYYY-MM-DD. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ID = /🆔\s*em(\d+)\b/g;

/** The next free id, e.g. "em015". Counts every em id in the note, ticked or not. */
export function nextId(note: string | null): string {
  let max = 0;
  for (const m of (note ?? "").matchAll(ID)) max = Math.max(max, Number(m[1]));
  return `em${String(max + 1).padStart(3, "0")}`;
}

/** Ticket code for an id: em014 → EM-014. */
export const ticketCode = (id: string): string => id.replace(/^em/i, "EM-");

/** Tags and emoji in a step would break the Tasks fields, so they're taken out. */
function clean(text: string): string {
  return text
    .replace(/[#\n\r]/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{23F3}\u{231B}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function taskLine(stepText: string, id: string, due: Date): string {
  return `- [ ] ${clean(stepText)} #mail 🆔 ${id} 📅 ${ymd(due)}`;
}

/** Adds the line at the end, creating the note's header the first time. */
export function appendTask(note: string | null, line: string): string {
  const base = note && note.trim() ? note.replace(/\s*$/, "\n") : HEADER;
  return `${base}${line}\n`;
}

function lineIndex(lines: string[], id: string): number {
  const re = new RegExp(`🆔\\s*${id}(?!\\d)`);
  return lines.findIndex((l) => /^\s*- \[.\]/.test(l) && re.test(l));
}

export function taskState(note: string | null, id: string): "open" | "done" | "missing" {
  const lines = (note ?? "").split("\n");
  const i = lineIndex(lines, id);
  if (i < 0) return "missing";
  return /^\s*- \[ \]/.test(lines[i]) ? "open" : "done";
}

/** Ticks an open task, Tasks-plugin style (`✅ date`). Unchanged if it's missing or already done. */
export function tickTask(note: string, id: string, on: Date): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, id);
  if (i < 0 || !/^\s*- \[ \]/.test(lines[i])) return note;
  lines[i] = `${lines[i].replace("- [ ]", "- [x]").replace(/\s+$/, "")} ✅ ${ymd(on)}`;
  return lines.join("\n");
}

/** Undo for a tick. */
export function untickTask(note: string, id: string): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, id);
  if (i < 0 || /^\s*- \[ \]/.test(lines[i])) return note;
  lines[i] = lines[i].replace(/- \[.\]/, "- [ ]").replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/, "");
  return lines.join("\n");
}

/** Undo for adding: takes the line out again. */
export function removeTask(note: string, id: string): string {
  const lines = note.split("\n");
  const i = lineIndex(lines, id);
  if (i < 0) return note;
  lines.splice(i, 1);
  return lines.join("\n");
}
