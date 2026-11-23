/**
 * The hand-off to Obsidian: accepted steps become tasks in your vault, and a
 * reply in Sent ticks them. Flight Deck's Ticket Rail takes it from there:
 * Print now hands the task to Flight Deck on this PC, which prints its ticket
 * and gives the line its rail id.
 */
import type { Message } from "../core/headers";
import type { Marks } from "../core/marks";
import { answered } from "../core/spot";
import { appendTask, printLink, railId, removeTask, taskBody, taskLine, taskState, tickTask, untickTask } from "../core/tasks";
import { loadMarks, saveMarks } from "./inbox";
import type { Ports } from "./ports";

/** Adds the email's current step as a task due today. Returns its body (the same one if it's already there). */
export async function addTask(ports: Ports, messageId: string): Promise<string> {
  const marks = await loadMarks(ports);
  const mark = marks[messageId];
  if (!mark || mark.kind !== "avoiding" || !mark.step) throw new Error("That email doesn't have a step yet.");
  const note = await ports.vault.read();
  if (mark.task && taskState(note, mark.task) === "open") return mark.task;
  const body = taskBody(mark.step.text, ports.clock.now());
  if (taskState(note, body) !== "open") await ports.vault.write(appendTask(note, taskLine(body)));
  marks[messageId] = { ...mark, task: body };
  await saveMarks(ports, marks);
  return body;
}

/** Undo for addTask: takes the line back out. */
export async function removeAddedTask(ports: Ports, messageId: string): Promise<void> {
  const marks = await loadMarks(ports);
  const mark = marks[messageId];
  if (!mark || mark.kind !== "avoiding" || !mark.task) return;
  const note = await ports.vault.read();
  if (note !== null) await ports.vault.write(removeTask(note, mark.task));
  const { task: _gone, ...rest } = mark;
  marks[messageId] = rest;
  await saveMarks(ports, marks);
}

/** Ticks (or, for Undo, unticks) a task. Quietly does nothing without a vault. */
export async function setTaskDone(ports: Ports, body: string, done: boolean): Promise<void> {
  const note = await ports.vault.read();
  if (note === null) return;
  const next = done ? tickTask(note, body, ports.clock.now()) : untickTask(note, body);
  if (next !== note) await ports.vault.write(next);
}

/** The rail id Flight Deck gave the task when it printed, or null. Null without a vault too. */
export async function railIdOf(ports: Ports, body: string): Promise<string | null> {
  return railId(await ports.vault.read().catch(() => null), body);
}

/** Print now: asks Flight Deck on this PC to print the task's ticket. It finds the line by its text. */
export async function printNow(ports: Ports, body: string): Promise<void> {
  await ports.flightDeck.open(printLink(body));
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
    if (mark.task) {
      try {
        await setTaskDone(ports, mark.task, true);
      } catch {
        continue;
      }
    }
    delete next[id];
    cleared++;
  }
  return { marks: next, cleared };
}
