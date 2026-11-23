/**
 * The Sort tab: suggest a folder for the rest of the inbox, move with one
 * tap, and move trusted senders by themselves. Every move can be undone.
 */
import { parseMessage, type Message } from "../core/headers";
import { isActive } from "../core/marks";
import { chatPrompt } from "../core/steps";
import {
  buildHistory,
  destinations,
  label,
  folderPrompt,
  groupInbox,
  isTrusted,
  parseFolder,
  parseState,
  recordAccept,
  recordLeave,
  recordUndo,
  tidy,
  type Moved,
  type SortGroup,
  type SortState,
} from "../core/sort";
import { answered, isMachine } from "../core/spot";
import { loadMarks } from "./inbox";
import { splitList, type AppSettings, type Ports } from "./ports";

export const SORT_FILE = "sorting.json";
/** How far back to look in your folders to learn where things go. */
export const HISTORY_DAYS = 180;
const INBOX = "INBOX";

export interface SortView {
  /** Where mail can go: Archive and your Proton folders. Empty when Bridge shows none. */
  folders: string[];
  groups: SortGroup[];
  /** Today's moves, newest first. */
  moved: Moved[];
  /** Moved by themselves on this check. */
  autoMoved: number;
}

export async function loadSort(ports: Ports): Promise<SortState> {
  return parseState(await ports.store.read(SORT_FILE));
}

async function saveSort(ports: Ports, state: SortState): Promise<void> {
  await ports.store.write(SORT_FILE, JSON.stringify(tidy(state, ports.clock.now()), null, 2));
}

/**
 * Never sorted, by hand or by itself: emails from real people you haven't
 * answered, emails you said you're avoiding, and anyone on "Never show".
 */
function protectedIds(inbox: Message[], sent: Message[], settings: AppSettings, marks: Awaited<ReturnType<typeof loadMarks>>, now: Date): Set<string> {
  const skip = splitList(settings.skip);
  const keep = new Set<string>();
  for (const m of inbox) {
    const a = m.from?.address ?? "";
    const realPerson = !m.bulk && !isMachine(a);
    const skipped = skip.some((s) => a === s || a.endsWith(s.startsWith("@") ? s : `@${s}`));
    if ((realPerson && !answered(m, sent)) || isActive(marks, m.messageId, now) || skipped) keep.add(m.messageId);
  }
  return keep;
}

export async function checkSort(ports: Ports, settings: AppSettings): Promise<SortView> {
  const now = ports.clock.now();
  let state = tidy(await loadSort(ports), now);
  const never = new Set(splitList(settings.skipFolders));
  const folders = destinations(await ports.mail.folders()).filter((f) => !never.has(f.toLowerCase()) && !never.has(label(f).toLowerCase()));
  if (folders.length === 0) return { folders, groups: [], moved: state.moved, autoMoved: 0 };

  const batch = await ports.mail.fetch(31);
  const inbox = batch.inbox.map((r) => parseMessage(r, "inbox"));
  const sent = batch.sent.map((r) => parseMessage(r, "sent"));
  const byFolder: Record<string, Message[]> = {};
  for (const f of folders) byFolder[f] = (await ports.mail.fetchFolder(f, HISTORY_DAYS).catch(() => [])).map((r) => parseMessage(r, "inbox"));

  const keep = protectedIds(inbox, sent, settings, await loadMarks(ports), now);
  const me = [settings.bridgeUser, ...splitList(settings.aliases)];
  let groups = groupInbox(inbox, keep, me, state, buildHistory(byFolder), folders, now);

  let autoMoved = 0;
  const movedSenders = new Set<string>();
  if (settings.autoSort) {
    for (const g of groups) {
      const to = isTrusted(state, g.sender);
      if (!to || !folders.includes(to)) continue;
      const n = await ports.mail.move(g.messageIds, INBOX, to).catch(() => 0);
      if (n === 0) continue;
      autoMoved += n;
      movedSenders.add(g.sender);
      state = { ...state, moved: [{ messageIds: g.messageIds, sender: g.sender, name: g.name, from: INBOX, to, at: now.toISOString(), auto: true }, ...state.moved] };
    }
    groups = groups.filter((g) => !movedSenders.has(g.sender));
  }
  await saveSort(ports, state);
  return { folders, groups, moved: state.moved, autoMoved };
}

/**
 * Asks the built-in model for senders with no filing history, a few at a
 * time. Each answer is remembered so it's only asked once per sender.
 */
export async function guessFolders(ports: Ports, view: SortView, limit = 4): Promise<SortView> {
  const status = await ports.model.status().catch(() => null);
  if (status?.state !== "ready" || view.folders.length === 0) return view;
  const state = await loadSort(ports);
  const todo = view.groups.filter((g) => !g.suggestion && !(g.sender in state.guessed)).slice(0, limit);
  if (todo.length === 0) return view;
  for (const g of todo) {
    const p = folderPrompt(view.folders, g);
    const out = await ports.model.generate(chatPrompt(p.system, p.user), 12).catch(() => "");
    state.guessed[g.sender] = parseFolder(out, view.folders);
  }
  await saveSort(ports, state);
  const groups = view.groups.map((g) => {
    const f = state.guessed[g.sender];
    return !g.suggestion && f ? { ...g, suggestion: { folder: f, reason: "model" as const, seen: 0 } } : g;
  });
  return { ...view, groups };
}

/** Moves a sender's inbox mail to `folder` and counts it towards trusting them. */
export async function moveGroup(ports: Ports, g: SortGroup, folder: string): Promise<Moved> {
  const n = await ports.mail.move(g.messageIds, INBOX, folder);
  if (n === 0) throw new Error("Nothing moved. It may have been moved already.");
  const moved: Moved = { messageIds: g.messageIds, sender: g.sender, name: g.name, from: INBOX, to: folder, at: ports.clock.now().toISOString(), auto: false };
  const state = recordAccept(await loadSort(ports), g.sender, folder);
  await saveSort(ports, { ...state, moved: [moved, ...state.moved] });
  return moved;
}

/** Puts them back in the inbox. The sender stops being trusted. */
export async function undoMove(ports: Ports, m: Moved): Promise<void> {
  await ports.mail.move(m.messageIds, m.to, m.from);
  const state = recordUndo(await loadSort(ports), m.sender);
  await saveSort(ports, { ...state, moved: state.moved.filter((x) => !(x.at === m.at && x.sender === m.sender)) });
}

/** "Leave in inbox": stops suggesting for this sender for a fortnight. */
export async function leaveSender(ports: Ports, sender: string): Promise<void> {
  await saveSort(ports, recordLeave(await loadSort(ports), sender, ports.clock.now()));
}

/** Undo for "Leave in inbox". */
export async function unleaveSender(ports: Ports, sender: string): Promise<void> {
  const state = await loadSort(ports);
  const left = { ...state.left };
  delete left[sender];
  await saveSort(ports, { ...state, left });
}
