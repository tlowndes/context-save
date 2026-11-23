/**
 * What you've said about each email, kept on this PC (never in the vault, as
 * it mentions who emailed you). Keyed by Message-ID.
 *
 * - avoiding: you said yes, it feels heavy. It gets a tiny step, and the task's
 *   text once that step is added to your vault. Cleared when you reply.
 * - snoozed: "Not now". Asks again once `until` has passed.
 */
import type { Step } from "./steps";

export type Mark =
  | { kind: "avoiding"; at: string; from: string; subject: string; step?: Step; task?: string }
  | { kind: "snoozed"; until: string };

export type Marks = Record<string, Mark>;

/** True when a mark still hides the email from the "avoiding any of these?" list. */
export function isActive(marks: Marks, id: string, now: Date): boolean {
  const m = marks[id];
  if (!m) return false;
  if (m.kind === "snoozed") return new Date(m.until).getTime() > now.getTime();
  return true;
}

/** "Not now": ask again at 9am the next day, local time. */
export function snoozeUntil(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Drops expired snoozes and anything older than `keepDays`, so the file stays small. */
export function prune(marks: Marks, now: Date, keepDays = 60): Marks {
  const cutoff = now.getTime() - keepDays * 86_400_000;
  const out: Marks = {};
  for (const [id, m] of Object.entries(marks)) {
    const t = new Date(m.kind === "snoozed" ? m.until : m.at).getTime();
    if (m.kind === "snoozed" ? t > now.getTime() : t > cutoff) out[id] = m;
  }
  return out;
}

export function parseMarks(text: string | null): Marks {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Marks) : {};
  } catch {
    return {};
  }
}
