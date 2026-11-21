/**
 * Spots emails you might be avoiding: from a real person, sent to you
 * directly, a few days old, and with no reply from you since.
 */
import type { Address, Message } from "./headers";
import { isActive, type Marks } from "./marks";

export interface SpotRules {
  /** Your addresses, Bridge login first, then any aliases. Lower case. */
  me: string[];
  /** Waiting at least this many days. */
  minDays: number;
  /** Older than this is left alone: it has probably stopped mattering. */
  maxDays: number;
  /** Addresses (`sam@x.com`) or whole domains (`@bank.co.uk`, `bank.co.uk`) to never show. */
  skip: string[];
}

export const DEFAULT_RULES: Omit<SpotRules, "me"> = { minDays: 3, maxDays: 30, skip: [] };

export interface Candidate {
  messageId: string;
  uid: number;
  from: Address;
  subject: string;
  date: Date;
  /** Whole days since it arrived. */
  days: number;
}

const DAY = 86_400_000;

/** Local parts that are never a person you owe a reply. */
const MACHINE =
  /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|news|marketing|alerts?|automated|system|auto-?confirm|confirmations?|orders?|order-?updates?|receipts?|billing|invoices?|statements?|updates?|digest|security|shipping|delivery|tracking)([+._-].*)?$/i;

export function isMachine(address: string): boolean {
  return MACHINE.test(address.split("@")[0] ?? "");
}

function skipped(address: string, skip: string[]): boolean {
  const domain = address.split("@")[1] ?? "";
  return skip.some((raw) => {
    const s = raw.trim().toLowerCase();
    if (!s) return false;
    if (s.includes("@") && !s.startsWith("@")) return s === address;
    const d = s.replace(/^@/, "");
    return domain === d || domain.endsWith(`.${d}`);
  });
}

/** One key per conversation: the first message it started from. */
export function threadKey(m: Message): string {
  return m.references[0] ?? m.inReplyTo ?? m.messageId;
}

/** True when you sent something into this conversation after it arrived. */
export function answered(m: Message, sent: Message[]): boolean {
  const key = threadKey(m);
  return sent.some(
    (s) => s.date.getTime() >= m.date.getTime() && (s.inReplyTo === m.messageId || s.references.includes(m.messageId) || threadKey(s) === key),
  );
}

export function spot(inbox: Message[], sent: Message[], rules: SpotRules, marks: Marks, now: Date): Candidate[] {
  const me = new Set(rules.me.map((a) => a.trim().toLowerCase()).filter(Boolean));
  const latest = new Map<string, Candidate>();
  for (const m of inbox) {
    const from = m.from;
    if (!from || m.bulk || me.has(from.address) || isMachine(from.address) || skipped(from.address, rules.skip)) continue;
    // Sent to you directly, not just copied in.
    if (!m.to.some((a) => me.has(a.address))) continue;
    const days = Math.floor((now.getTime() - m.date.getTime()) / DAY);
    if (days < rules.minDays || days > rules.maxDays) continue;
    if (answered(m, sent)) continue;
    if (isActive(marks, m.messageId, now)) continue;
    // Several unanswered messages in one conversation show once, as the newest.
    const key = threadKey(m);
    const seen = latest.get(key);
    if (seen && seen.date >= m.date) continue;
    latest.set(key, { messageId: m.messageId, uid: m.uid, from, subject: m.subject || "(no subject)", date: m.date, days });
  }
  // Longest waiting first.
  return [...latest.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Display name, falling back to the address. */
export const who = (a: Address): string => a.name || a.address;
