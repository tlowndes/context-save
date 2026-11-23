/**
 * Runs the daily nudge from the panel's once-a-minute timer, and keeps what
 * the nudge card shows so its own window can read it.
 */
import { markShown, nudgeDue, parseNudgeState, pickNudge, snoozeNudge, type Nudge } from "../core/nudge";
import { check } from "./inbox";
import type { AppSettings, Ports } from "./ports";

export const NUDGE_FILE = "nudge.json";
/** The card on screen right now, for the nudge window. */
export const NUDGE_NOW = "nudge-now.json";

/**
 * When a nudge is due, checks mail and returns what to show (also saved for
 * the nudge window). Null when it isn't time, nothing's waiting, or mail
 * can't be reached (then it tries again next minute).
 */
export async function nudgeTick(ports: Ports, settings: AppSettings): Promise<Nudge | null> {
  const now = ports.clock.now();
  const state = parseNudgeState(await ports.store.read(NUDGE_FILE));
  if (!settings.bridgeUser || !settings.hasPassword || !nudgeDue(now, settings.nudgeAt, state)) return null;
  const view = await check(ports, settings).catch(() => null);
  if (!view) return null;
  const nudge = pickNudge(view, now, settings.nudgeAt);
  await ports.store.write(NUDGE_FILE, JSON.stringify(markShown(now)));
  if (nudge) await ports.store.write(NUDGE_NOW, JSON.stringify(nudge));
  return nudge;
}

export async function currentNudge(ports: Ports): Promise<Nudge | null> {
  try {
    return JSON.parse((await ports.store.read(NUDGE_NOW)) ?? "null") as Nudge | null;
  } catch {
    return null;
  }
}

/** "Later today". */
export async function nudgeLater(ports: Ports): Promise<void> {
  await ports.store.write(NUDGE_FILE, JSON.stringify(snoozeNudge(ports.clock.now())));
}
