/**
 * The daily nudge: once a day, at the time you pick (10:30 by default), a
 * small card by the clock names the person who's waited longest and the tiny
 * step for them. "Later today" brings it back in 3 hours. Nothing waiting,
 * no nudge. Never in the evening.
 */
import type { Step } from "./steps";
import type { Candidate } from "./spot";
import { who } from "./spot";

export const DEFAULT_NUDGE_AT = "10:30";
/** Hours "Later today" puts it off for. */
export const SNOOZE_HOURS = 3;
/** No nudges from this hour on: a missed one waits for tomorrow. */
export const QUIET_FROM = 19;

export interface NudgeState {
  /** Local date (YYYY-MM-DD) of the last nudge, shown or skipped for want of anything waiting. */
  shownOn?: string;
  /** "Later today": nudge again from this time. */
  snoozedUntil?: string;
}

export interface Nudge {
  messageId: string;
  /** "avoiding": you've said it's heavy, so Show me opens its step. "candidate": not asked yet. */
  kind: "avoiding" | "candidate";
  /** "NEXT STEP · 10:30" */
  label: string;
  /** "Sam's been waiting 6 days" */
  title: string;
  /** "Tiny step ready: reply yes or no." */
  body: string;
  /** How many others are waiting too. */
  more: number;
}

/** What the nudge can pick from: the panel's lists. */
export interface NudgeInput {
  avoiding: { messageId: string; from: string; at: Date; sent: Date | null; step: Step | null }[];
  candidates: Candidate[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "10:30" → minutes after midnight, or null when off or not a time. */
export function parseTime(at: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function parseNudgeState(text: string | null): NudgeState {
  try {
    const v = JSON.parse(text ?? "{}");
    return v && typeof v === "object" ? (v as NudgeState) : {};
  } catch {
    return {};
  }
}

/** Is a nudge due now? `at` is the nudge time, "" for off. */
export function nudgeDue(now: Date, at: string, state: NudgeState): boolean {
  const mins = parseTime(at);
  if (mins === null || now.getHours() >= QUIET_FROM) return false;
  if (state.snoozedUntil) return now.getTime() >= new Date(state.snoozedUntil).getTime();
  if (state.shownOn === ymd(now)) return false;
  return now.getHours() * 60 + now.getMinutes() >= mins;
}

/** After a nudge (or a check that found nothing): done for today. */
export const markShown = (now: Date): NudgeState => ({ shownOn: ymd(now) });

/** "Later today": back in 3 hours, or tomorrow if that runs into the evening. */
export function snoozeNudge(now: Date): NudgeState {
  const back = new Date(now.getTime() + SNOOZE_HOURS * 3_600_000);
  if (ymd(back) !== ymd(now) || back.getHours() >= QUIET_FROM) return markShown(now);
  return { shownOn: ymd(now), snoozedUntil: back.toISOString() };
}

const firstName = (name: string) => name.split(/[\s,]+/)[0] || name;
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const waited = (days: number) => (days <= 0 ? "since today" : days === 1 ? "a day" : `${days} days`);

/**
 * The one to nudge about: emails you've said are heavy come first (they have a
 * step waiting), oldest first; then the longest-waiting email not yet asked about.
 */
export function pickNudge(input: NudgeInput, now: Date, at: string): Nudge | null {
  const label = `NEXT STEP · ${at}`;
  const total = input.avoiding.length + input.candidates.length;
  // Oldest email first (when it arrived; for older marks, when you said it was heavy).
  const since = (x: NudgeInput["avoiding"][number]) => (x.sent ?? x.at).getTime();
  const a = [...input.avoiding].sort((x, y) => since(x) - since(y))[0];
  if (a) {
    const name = firstName(a.from);
    const days = Math.floor((now.getTime() - since(a)) / 86_400_000);
    return {
      messageId: a.messageId,
      kind: "avoiding",
      label,
      title: days > 0 ? `${name}'s been waiting ${waited(days)}` : `${name} is still waiting`,
      body: a.step ? `Tiny step ready: ${lowerFirst(a.step.text.replace(/\.$/, ""))}.` : "Tap Show me for a tiny step.",
      more: total - 1,
    };
  }
  const c = [...input.candidates].sort((x, y) => y.days - x.days)[0];
  if (!c) return null;
  return {
    messageId: c.messageId,
    kind: "candidate",
    label,
    title: `${firstName(who(c.from))}'s been waiting ${waited(c.days)}`,
    body: "Feeling heavy? One tap and you'll get a tiny step.",
    more: total - 1,
  };
}
