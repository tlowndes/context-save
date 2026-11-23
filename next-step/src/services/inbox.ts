/**
 * The panel's one job: fetch, spot and remember what you said.
 */
import { parseMessage } from "../core/headers";
import { parseMarks, prune, snoozeUntil, type Marks } from "../core/marks";
import { DEFAULT_RULES, spot, who, type Candidate } from "../core/spot";
import type { Step } from "../core/steps";
import { railId } from "../core/tasks";
import { clearAnswered } from "./tasks";
import { splitList, type AppSettings, type Ports } from "./ports";

export const MARKS_FILE = "marks.json";

export interface Avoiding {
  messageId: string;
  from: string;
  subject: string;
  at: Date;
  step: Step | null;
  /** Its task line in the vault (without the checkbox), once added. */
  task: string | null;
  /** When the email arrived (null for marks made before this was kept). */
  sent: Date | null;
  /** Its rail id, once Flight Deck has printed its ticket. */
  railId: string | null;
}

export interface InboxView {
  candidates: Candidate[];
  avoiding: Avoiding[];
  checkedAt: Date;
}

export async function loadMarks(ports: Ports): Promise<Marks> {
  return parseMarks(await ports.store.read(MARKS_FILE));
}

export async function saveMarks(ports: Ports, marks: Marks): Promise<void> {
  await ports.store.write(MARKS_FILE, JSON.stringify(prune(marks, ports.clock.now()), null, 2));
}

export function avoidingList(marks: Marks, note: string | null = null): Avoiding[] {
  return Object.entries(marks)
    .flatMap(([messageId, m]) =>
      m.kind === "avoiding"
        ? [{ messageId, from: m.from, subject: m.subject, at: new Date(m.at), sent: m.sent ? new Date(m.sent) : null, step: m.step ?? null, task: m.task ?? null, railId: m.task ? railId(note, m.task) : null }]
        : [],
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function check(ports: Ports, settings: AppSettings): Promise<InboxView> {
  const now = ports.clock.now();
  const maxDays = DEFAULT_RULES.maxDays;
  // A few extra days of Sent, in case you replied from another thread.
  const batch = await ports.mail.fetch(maxDays + 1);
  const inbox = batch.inbox.map((r) => parseMessage(r, "inbox"));
  const sent = batch.sent.map((r) => parseMessage(r, "sent"));
  // Replied to something you were avoiding? Tick its task and let it go.
  const { marks, cleared } = await clearAnswered(ports, inbox, sent, await loadMarks(ports));
  if (cleared > 0) await saveMarks(ports, marks);
  const rules = {
    ...DEFAULT_RULES,
    me: [settings.bridgeUser, ...splitList(settings.aliases)],
    skip: splitList(settings.skip),
    minDays: settings.minDays || DEFAULT_RULES.minDays,
  };
  const note = await ports.vault.read().catch(() => null);
  return { candidates: spot(inbox, sent, rules, marks, now), avoiding: avoidingList(marks, note), checkedAt: now };
}

/** "Yes, I'm avoiding it". */
export async function markAvoiding(ports: Ports, c: Candidate): Promise<void> {
  const marks = await loadMarks(ports);
  marks[c.messageId] = { kind: "avoiding", at: ports.clock.now().toISOString(), sent: c.date.toISOString(), from: who(c.from), subject: c.subject };
  await saveMarks(ports, marks);
}

/** "Not now": asks again tomorrow morning. */
export async function snooze(ports: Ports, ids: string[]): Promise<void> {
  const marks = await loadMarks(ports);
  const until = snoozeUntil(ports.clock.now()).toISOString();
  for (const id of ids) marks[id] = { kind: "snoozed", until };
  await saveMarks(ports, marks);
}

/** Undo for any of the above: forget what was said about these emails. */
export async function unmark(ports: Ports, ids: string[]): Promise<void> {
  const marks = await loadMarks(ports);
  for (const id of ids) delete marks[id];
  await saveMarks(ports, marks);
}
