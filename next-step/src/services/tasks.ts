/**
 * The hand-off to Obsidian: accepted steps become tasks in your vault, and a
 * reply in Sent ticks them. Flight Deck's Ticket Rail takes it from there.
 */
import type { Message } from "../core/headers";
import type { Marks } from "../core/marks";
import { answered } from "../core/spot";
import { appendTask, nextId, removeTask, taskLine, taskState, tickTask, untickTask } from "../core/tasks";
import { loadMarks, saveMarks } from "./inbox";
import type { Ports } from "./ports";

/** Adds the email's current step as a task due today. Returns its 🆔 (the same one if it's already there). */
export async function addTask(ports: Ports, messageId: string): Promise<string> {
  const marks = await loadMarks(ports);
  const mark = marks[messageId];
  if (!mark || mark.kind !== "avoiding" || !mark.step) throw new Error("That email doesn't have a step yet.");
  const note = await ports.vault.read();
  if (mark.taskId && taskState(note, mark.taskId) === "open") return mark.taskId;
  const id = nextId(note);
  await ports.vault.write(appendTask(note, taskLine(mark.step.text, id, ports.clock.now())));
  marks[messageId] = { ...mark, taskId: id };
  await saveMarks(ports, marks);
  return id;
}

/** Undo for addTask: takes the line back out. */
export async function removeAddedTask(ports: Ports, messageId: string): Promise<void> {
  const marks = await loadMarks(ports);
  const mark = marks[messageId];
  if (!mark || mark.kind !== "avoiding" || !mark.taskId) return;
  const note = await ports.vault.read();
  if (note !== null) await ports.vault.write(removeTask(note, mark.taskId));
  const { taskId: _gone, ...rest } = mark;
  marks[messageId] = rest;
  await saveMarks(ports, marks);
}

/** Ticks (or, for Undo, unticks) a task. Quietly does nothing without a vault. */
export async function setTaskDone(ports: Ports, taskId: string, done: boolean): Promise<void> {
  const note = await ports.vault.read();
  if (note === null) return;
  const next = done ? tickTask(note, taskId, ports.clock.now()) : untickTask(note, taskId);
  if (next !== note) await ports.vault.write(next);
}

/**
 * Emails you said you were avoiding and have now replied to: ticks their task
 * and forgets them. Returns the marks left. If the vault can't be written, the
 * mark stays so the next check tries again.
 */
export async function clearAnswered(ports: Ports, inbox: Message[], sent: Message[], marks: Marks): Promise<{ marks: Marks; cleared: number }> {
  const byId = new Map(inbox.map((m) => [m.messageId, m]));
  const next = { ...marks };
  let cleared = 0;
  for (const [id, mark] of Object.entries(marks)) {
    if (mark.kind !== "avoiding") continue;
    const msg = byId.get(id);
    if (!msg || !answered(msg, sent)) continue;
    if (mark.taskId) {
      try {
        await setTaskDone(ports, mark.taskId, true);
      } catch {
        continue;
      }
    }
    delete next[id];
    cleared++;
  }
  return { marks: next, cleared };
}
