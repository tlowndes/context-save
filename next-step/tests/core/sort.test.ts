import { describe, expect, it } from "vitest";
import { parseMessage } from "../../src/core/headers";
import {
  buildHistory,
  destinations,
  emptyState,
  groupInbox,
  isTrusted,
  parseFolder,
  recordAccept,
  recordLeave,
  recordUndo,
  suggestFromHistory,
  tidy,
} from "../../src/core/sort";
import { isMachine } from "../../src/core/spot";
import { daysAgo, ME, NOW, raw } from "../fakes";

const msg = (from: string, subject: string, id: string, days = 1) => parseMessage(raw({ From: from, To: ME, Subject: subject, "Message-ID": id }, daysAgo(days)), "inbox");
const FOLDERS = ["Folders/Newsletters", "Folders/Receipts", "Archive"];

describe("destinations", () => {
  it("keeps Archive and your folders, drops system folders and labels", () => {
    expect(destinations(["INBOX", "Sent", "Spam", "Trash", "All Mail", "Archive", "Folders/Receipts", "Folders/Job hunt", "Labels/Work", "Folders/"])).toEqual(["Folders/Job hunt", "Folders/Receipts", "Archive"]);
  });
});

describe("suggestFromHistory", () => {
  const h = buildHistory({
    "Folders/Newsletters": [msg("hello@designweekly.com", "Issue 1", "<a>"), msg("hello@designweekly.com", "Issue 2", "<b>"), msg("tips@figma.com", "Tips", "<c>")],
    "Folders/Receipts": [msg("auto-confirm@amazon.co.uk", "Order", "<d>"), msg("ship@amazon.co.uk", "Shipped", "<e>"), msg("pal@gmail.com", "Lunch", "<f>")],
    Archive: [msg("hello@designweekly.com", "Issue 0", "<g>")],
  });

  it("uses the sender's usual folder when it's a clear majority", () => {
    expect(suggestFromHistory("hello@designweekly.com", h)).toEqual({ folder: "Folders/Newsletters", seen: 2, reason: "sender" });
  });

  it("falls back to the domain, but not for shared ones like gmail", () => {
    expect(suggestFromHistory("returns@amazon.co.uk", h)).toEqual({ folder: "Folders/Receipts", seen: 2, reason: "domain" });
    expect(suggestFromHistory("updates@figma.com", h)).toBeNull(); // one email isn't enough for a whole domain
    expect(suggestFromHistory("someone@gmail.com", h)).toBeNull();
  });
});

describe("groupInbox", () => {
  const inbox = [
    msg("Design Weekly <hello@designweekly.com>", "Issue 3", "<i3>", 3),
    msg("Design Weekly <hello@designweekly.com>", "Issue 4", "<i4>", 1),
    msg("Sam <sam@example.com>", "Saturday?", "<sam>", 2),
    msg(`Me <${ME}>`, "Note to self", "<me>", 1),
    msg("Figma <updates@figma.com>", "Config", "<fig>", 1),
  ];
  const h = buildHistory({ "Folders/Newsletters": [msg("hello@designweekly.com", "Issue 1", "<a>")] });

  it("groups by sender, biggest first, and leaves out protected mail and your own", () => {
    const gs = groupInbox(inbox, new Set(["<sam>"]), [ME], emptyState(), h, FOLDERS, NOW);
    expect(gs.map((g) => [g.sender, g.messageIds.length])).toEqual([["hello@designweekly.com", 2], ["updates@figma.com", 1]]);
    expect(gs[0].suggestion?.folder).toBe("Folders/Newsletters");
    expect(gs[1].suggestion).toBeNull();
  });

  it("prefers what you chose last time, then a model guess, and hides senders you left", () => {
    let s = recordAccept(emptyState(), "hello@designweekly.com", "Archive");
    s = { ...s, guessed: { "updates@figma.com": "Folders/Newsletters" } };
    let gs = groupInbox(inbox, new Set(), [ME], s, h, FOLDERS, NOW);
    expect(gs[0].suggestion).toMatchObject({ folder: "Archive", reason: "sender" });
    expect(gs[0].streak).toBe(1);
    expect(gs.find((g) => g.sender === "updates@figma.com")?.suggestion).toMatchObject({ folder: "Folders/Newsletters", reason: "model" });

    s = recordLeave(s, "updates@figma.com", NOW);
    gs = groupInbox(inbox, new Set(), [ME], s, h, FOLDERS, NOW);
    expect(gs.some((g) => g.sender === "updates@figma.com")).toBe(false);
    expect(groupInbox(inbox, new Set(), [ME], s, h, FOLDERS, daysAgo(-15)).some((g) => g.sender === "updates@figma.com")).toBe(true);
  });

  it("ignores folders that no longer exist", () => {
    const s = recordAccept(emptyState(), "hello@designweekly.com", "Folders/Gone");
    expect(groupInbox(inbox, new Set(), [ME], s, h, FOLDERS, NOW)[0].suggestion?.folder).toBe("Folders/Newsletters");
  });
});

describe("trust", () => {
  it("trusts after 3 accepts in a row to the same folder; a new folder or an undo starts again", () => {
    let s = emptyState();
    s = recordAccept(s, "a@x.com", "Archive");
    s = recordAccept(s, "a@x.com", "Archive");
    expect(isTrusted(s, "a@x.com")).toBeNull();
    s = recordAccept(s, "a@x.com", "Archive");
    expect(isTrusted(s, "a@x.com")).toBe("Archive");
    expect(isTrusted(recordAccept(s, "a@x.com", "Folders/Receipts"), "a@x.com")).toBeNull();
    expect(isTrusted(recordUndo(s, "a@x.com"), "a@x.com")).toBeNull();
  });

  it("keeps only today's moves", () => {
    const m = (at: Date) => ({ messageIds: ["<a>"], sender: "a@x.com", name: "A", from: "INBOX", to: "Archive", at: at.toISOString(), auto: false });
    expect(tidy({ ...emptyState(), moved: [m(NOW), m(daysAgo(1))] }, NOW).moved).toHaveLength(1);
  });
});

describe("parseFolder", () => {
  it("matches a model answer to a folder", () => {
    expect(parseFolder("Newsletters<|im_end|>", FOLDERS)).toBe("Folders/Newsletters");
    expect(parseFolder('Folder: "receipts".', FOLDERS)).toBe("Folders/Receipts");
    expect(parseFolder("none", FOLDERS)).toBeNull();
    expect(parseFolder("Holidays", FOLDERS)).toBeNull();
  });
});

describe("isMachine", () => {
  it("knows order, receipt and statement senders aren't people", () => {
    for (const a of ["auto-confirm@amazon.co.uk", "orders@shop.com", "statements@bank.co.uk", "updates@figma.com"]) expect(isMachine(a), a).toBe(true);
    for (const a of ["sam@example.com", "jobs@studionorth.co"]) expect(isMachine(a), a).toBe(false);
  });
});
