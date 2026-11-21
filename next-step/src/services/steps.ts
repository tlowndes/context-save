/**
 * Writes the tiny step for an email you said you're avoiding.
 * Order of preference: Claude (only when asked), the built-in model, a template.
 */
import { snoozeUntil, type Mark } from "../core/marks";
import { bodyText } from "../core/mime";
import { chatPrompt, parseStep, smallerTemplate, STEP_SYSTEM, stepUserMessage, templateStep, type EmailForStep, type Step } from "../core/steps";
import { loadMarks, saveMarks } from "./inbox";
import type { Ports } from "./ports";
import { setTaskDone } from "./tasks";

export type StepMode = "first" | "smaller" | "claude";

export interface StepView {
  messageId: string;
  email: EmailForStep;
  step: Step;
  /** Why a better source wasn't used, when it matters to you. */
  note: string | null;
  /** 🆔 of its task in the vault, once added. */
  taskId: string | null;
}

async function email(ports: Ports, messageId: string, from: string, subject: string): Promise<EmailForStep> {
  const raw = await ports.mail.message(messageId).catch(() => null);
  return { fromName: from, subject, body: raw ? bodyText(raw) : "" };
}

async function fromModel(ports: Ports, e: EmailForStep, smaller?: Step): Promise<Step | null> {
  const status = await ports.model.status().catch(() => null);
  if (status?.state !== "ready") return null;
  const out = await ports.model.generate(chatPrompt(STEP_SYSTEM, stepUserMessage(e, smaller)), 40).catch(() => "");
  return parseStep(out, "model");
}

export async function makeStep(ports: Ports, messageId: string, mode: StepMode): Promise<StepView> {
  const marks = await loadMarks(ports);
  const mark = marks[messageId];
  if (!mark || mark.kind !== "avoiding") throw new Error("That email isn't on your list any more.");
  const e = await email(ports, messageId, mark.from, mark.subject);
  let note: string | null = null;
  let step: Step | null = null;

  if (mode === "first" && mark.step) {
    step = mark.step;
  } else if (mode === "claude") {
    try {
      step = parseStep(await ports.claude.ask(STEP_SYSTEM, stepUserMessage(e, mark.step)), "claude");
      if (!step) note = "Claude's answer didn't fit, so here's the built-in one.";
    } catch (err) {
      note = err instanceof Error ? err.message : String(err);
    }
  }
  const smaller = mode === "smaller" ? mark.step : undefined;
  step ??= await fromModel(ports, e, smaller);
  if (!step) {
    step = smaller ? smallerTemplate(e, smaller) : templateStep(e);
    const status = await ports.model.status().catch(() => null);
    if (status?.state === "missing" && !note) note = "Using a simple template. Download the built-in model in Settings for better steps.";
  }
  // Never hand back the same step for "smaller".
  if (smaller && step.text === smaller.text) step = smallerTemplate(e, smaller);

  marks[messageId] = { ...mark, step };
  await saveMarks(ports, marks);
  return { messageId, email: e, step, note, taskId: mark.taskId ?? null };
}

/**
 * "Done": takes it off your list and ticks its task, if it has one. If it's still unanswered it comes back to
 * the "avoiding any of these?" list tomorrow morning. Returns what to restore on Undo.
 */
export async function finishStep(ports: Ports, messageId: string): Promise<Mark | undefined> {
  const marks = await loadMarks(ports);
  const before = marks[messageId];
  if (before?.kind === "avoiding" && before.taskId) await setTaskDone(ports, before.taskId, true).catch(() => undefined);
  marks[messageId] = { kind: "snoozed", until: snoozeUntil(ports.clock.now()).toISOString() };
  await saveMarks(ports, marks);
  return before;
}

export async function restoreMark(ports: Ports, messageId: string, mark: Mark | undefined): Promise<void> {
  if (mark?.kind === "avoiding" && mark.taskId) await setTaskDone(ports, mark.taskId, false).catch(() => undefined);
  const marks = await loadMarks(ports);
  if (mark) marks[messageId] = mark;
  else delete marks[messageId];
  await saveMarks(ports, marks);
}
