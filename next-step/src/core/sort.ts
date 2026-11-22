/**
 * Sorting the rest of the inbox into your own Proton folders.
 *
 * Suggestions come from where you've already filed mail from the same sender
 * (or domain). Accepting the same folder for a sender 3 times in a row makes
 * them "trusted", and their mail moves by itself from then on, always with
 * Undo. Emails from real people you haven't answered are never sorted.
 */
import type { Message } from "./headers";

/** Accepts in a row before a sender's mail moves by itself. */
export const TRUST_AFTER = 3;
/** How long "Leave in inbox" hides a sender. */
export const LEAVE_DAYS = 14;

export type Reason = "sender" | "domain" | "model" | "trusted";

export interface Suggestion {
  /** Full IMAP name, e.g. "Folders/Receipts" or "Archive". */
  folder: string;
  reason: Reason;
  /** How many of their emails are already in that folder (sender/domain only). */
  seen: number;
}

export interface SortGroup {
  sender: string;
  name: string;
  messageIds: string[];
  subjects: string[];
  newest: Date;
  suggestion: Suggestion | null;
  /** Accepts in a row for the suggested folder, out of TRUST_AFTER. */
  streak: number;
}

export interface Moved {
  messageIds: string[];
  sender: string;
  name: string;
  from: string;
  to: string;
  at: string;
  auto: boolean;
}

/** Kept in sorting.json on this PC. */
export interface SortState {
  senders: Record<string, { folder: string; streak: number }>;
  /** Sender → when to show them again. */
  left: Record<string, string>;
  /** What the built-in model said for senders with no history (null: no idea). */
  guessed: Record<string, string | null>;
  moved: Moved[];
}

export const emptyState = (): SortState => ({ senders: {}, left: {}, guessed: {}, moved: [] });

export function parseState(text: string | null): SortState {
  if (!text) return emptyState();
  try {
    const v = JSON.parse(text) as Partial<SortState>;
    return {
      senders: v.senders && typeof v.senders === "object" ? v.senders : {},
      left: v.left && typeof v.left === "object" ? v.left : {},
      guessed: v.guessed && typeof v.guessed === "object" ? v.guessed : {},
      moved: Array.isArray(v.moved) ? v.moved : [],
    };
  } catch {
    return emptyState();
  }
}

/** Where mail can be moved to: Archive and your own folders. Labels copy rather than move, so they're left out. */
export function destinations(folders: string[]): string[] {
  const out = folders.filter((f) => f === "Archive" || (f.startsWith("Folders/") && f.length > "Folders/".length));
  return out.sort((a, b) => (a === "Archive" ? 1 : b === "Archive" ? -1 : label(a).localeCompare(label(b), "en-GB")));
}

/** "Folders/Receipts" → "Receipts". */
export const label = (folder: string): string => (folder.startsWith("Folders/") ? folder.slice("Folders/".length) : folder);

export const domainOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1).toLowerCase();

export type History = Map<string, Map<string, number>>;

/** Counts, per sender address and per "@domain", which folder their mail is filed in. */
export function buildHistory(byFolder: Record<string, Message[]>): History {
  const h: History = new Map();
  const add = (key: string, folder: string) => {
    const m = h.get(key) ?? new Map<string, number>();
    m.set(folder, (m.get(folder) ?? 0) + 1);
    h.set(key, m);
  };
  for (const [folder, msgs] of Object.entries(byFolder)) {
    for (const msg of msgs) {
      const a = msg.from?.address.toLowerCase();
      if (!a) continue;
      add(a, folder);
      add(`@${domainOf(a)}`, folder);
    }
  }
  return h;
}

/** The folder most of them went to, if it's a clear majority. */
function dominant(counts: Map<string, number> | undefined, min: number): { folder: string; seen: number } | null {
  if (!counts) return null;
  let total = 0;
  let best: { folder: string; seen: number } | null = null;
  for (const [folder, n] of counts) {
    total += n;
    if (!best || n > best.seen) best = { folder, seen: n };
  }
  return best && best.seen >= min && best.seen / total >= 0.6 ? best : null;
}

/** Sender first, then their domain (unless it's a shared one like gmail.com). */
export function suggestFromHistory(address: string, history: History): Suggestion | null {
  const a = address.toLowerCase();
  const bySender = dominant(history.get(a), 1);
  if (bySender) return { ...bySender, reason: "sender" };
  const domain = domainOf(a);
  if (SHARED_DOMAINS.has(domain)) return null;
  const byDomain = dominant(history.get(`@${domain}`), 2);
  return byDomain ? { ...byDomain, reason: "domain" } : null;
}

/** Domains where one person tells you nothing about the next. */
const SHARED_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "yahoo.com", "yahoo.co.uk",
  "icloud.com", "me.com", "proton.me", "protonmail.com", "pm.me", "aol.com", "btinternet.com", "sky.com",
]);

export function isLeft(state: SortState, sender: string, now: Date): boolean {
  const until = state.left[sender];
  return !!until && new Date(until).getTime() > now.getTime();
}

/**
 * Groups inbox mail by sender, leaving out anything in `keep` (people
 * waiting on you, emails you said you're avoiding) and senders you left.
 */
export function groupInbox(inbox: Message[], keep: Set<string>, me: string[], state: SortState, history: History, folders: string[], now: Date): SortGroup[] {
  const mine = new Set(me.map((m) => m.toLowerCase()));
  const allowed = new Set(folders);
  const groups = new Map<string, SortGroup>();
  for (const m of inbox) {
    const sender = m.from?.address.toLowerCase();
    if (!sender || mine.has(sender) || keep.has(m.messageId) || isLeft(state, sender, now)) continue;
    const g = groups.get(sender) ?? { sender, name: m.from!.name || sender, messageIds: [], subjects: [], newest: m.date, suggestion: null, streak: 0 };
    g.messageIds.push(m.messageId);
    if (g.subjects.length < 3 && m.subject && !g.subjects.includes(m.subject)) g.subjects.push(m.subject);
    if (m.date > g.newest) g.newest = m.date;
    groups.set(sender, g);
  }
  for (const g of groups.values()) {
    const t = state.senders[g.sender];
    const guess = state.guessed[g.sender];
    g.suggestion =
      (t && t.streak > 0 && allowed.has(t.folder) ? { folder: t.folder, reason: t.streak >= TRUST_AFTER ? "trusted" : "sender", seen: 0 } : null) ??
      suggestFromHistory(g.sender, history) ??
      (guess && allowed.has(guess) ? { folder: guess, reason: "model", seen: 0 } : null);
    if (g.suggestion && !allowed.has(g.suggestion.folder)) g.suggestion = null;
    g.streak = t && g.suggestion && t.folder === g.suggestion.folder ? Math.min(t.streak, TRUST_AFTER) : 0;
  }
  // Biggest piles first, then the most recent.
  return [...groups.values()].sort((a, b) => b.messageIds.length - a.messageIds.length || b.newest.getTime() - a.newest.getTime());
}

export const isTrusted = (state: SortState, sender: string): string | null => {
  const t = state.senders[sender];
  return t && t.streak >= TRUST_AFTER ? t.folder : null;
};

/** You moved a sender's mail to `folder`: same folder as last time builds trust, a new one starts again. */
export function recordAccept(state: SortState, sender: string, folder: string): SortState {
  const prev = state.senders[sender];
  const streak = prev && prev.folder === folder ? prev.streak + 1 : 1;
  return { ...state, senders: { ...state.senders, [sender]: { folder, streak } } };
}

/** Undo of a move: that sender isn't trusted any more. */
export function recordUndo(state: SortState, sender: string): SortState {
  const senders = { ...state.senders };
  if (senders[sender]) senders[sender] = { ...senders[sender], streak: 0 };
  return { ...state, senders };
}

export function recordLeave(state: SortState, sender: string, now: Date): SortState {
  const until = new Date(now.getTime() + LEAVE_DAYS * 86_400_000).toISOString();
  const senders = { ...state.senders };
  delete senders[sender];
  return { ...state, senders, left: { ...state.left, [sender]: until } };
}

/** Today's moves only, newest first, and old "leave" entries dropped. */
export function tidy(state: SortState, now: Date): SortState {
  const today = now.toDateString();
  const left = Object.fromEntries(Object.entries(state.left).filter(([, until]) => new Date(until).getTime() > now.getTime()));
  const moved = state.moved.filter((m) => new Date(m.at).toDateString() === today).slice(0, 50);
  return { ...state, left, moved };
}

export function folderPrompt(folders: string[], g: Pick<SortGroup, "name" | "sender" | "subjects">): { system: string; user: string } {
  return {
    system: "You file emails into folders. Answer with exactly one folder name from the list, or none if nothing fits. No other words.",
    user: [`Folders: ${folders.map(label).join(", ")}`, `From: ${g.name} <${g.sender}>`, ...g.subjects.map((s) => `Subject: ${s}`), "", "Folder:"].join("\n"),
  };
}

/** Matches a model's answer to one of the folders, or null. */
export function parseFolder(raw: string, folders: string[]): string | null {
  const answer = raw
    .replace(/<\|[^|]*\|>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean)
    ?.replace(/^(folder\s*:\s*)/i, "")
    .replace(/^["'“‘]+|["'”’.]+$/g, "")
    .trim()
    .toLowerCase();
  if (!answer || answer === "none") return null;
  return folders.find((f) => label(f).toLowerCase() === answer || f.toLowerCase() === answer) ?? null;
}
