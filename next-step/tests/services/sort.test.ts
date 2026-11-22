import { describe, expect, it } from "vitest";
import type { RawMessage } from "../../src/core/headers";
import type { Ports } from "../../src/services/ports";
import { checkSort, guessFolders, leaveSender, moveGroup, undoMove } from "../../src/services/sort";
import { daysAgo, fakePorts, fromSam, ME, raw, settings } from "../fakes";

const news = (n: number, days = 1) =>
  raw({ From: "Design Weekly <hello@designweekly.com>", To: ME, Subject: `Issue ${n}`, "Message-ID": `<dw${n}@x>`, "List-Unsubscribe": "<mailto:u@x>" }, daysAgo(days));
const figma = () => raw({ From: "Figma <updates@figma.com>", To: ME, Subject: "Config", "Message-ID": "<fig@x>" }, daysAgo(1));

/** Fake Bridge with real folders that moves actually change. */
function setup(inbox: RawMessage[], filed: Record<string, RawMessage[]> = {}, opts: { generate?: string } = {}) {
  const boxes: Record<string, RawMessage[]> = { INBOX: inbox, "Folders/Newsletters": [], Archive: [], ...filed };
  const idOf = (r: RawMessage) => /Message-ID: (.*)/.exec(r.headers)?.[1]?.trim() ?? "";
  const ports = fakePorts({ inbox: [], sent: [] });
  const calls: string[] = [];
  ports.mail = {
    fetch: async () => ({ inbox: [...boxes.INBOX], sent: [] }),
    message: async () => null,
    folders: async () => ["INBOX", "Sent", "Trash", ...Object.keys(boxes).filter((b) => b !== "INBOX"), "Labels/Work"],
    fetchFolder: async (f) => [...(boxes[f] ?? [])],
    move: async (ids, from, to) => {
      calls.push(`${from}→${to}:${ids.length}`);
      let n = 0;
      for (const id of ids) {
        const i = boxes[from].findIndex((r) => idOf(r) === id);
        if (i >= 0) (boxes[to].push(...boxes[from].splice(i, 1)), n++);
      }
      return n;
    },
  };
  ports.model = { status: async () => ({ state: "ready" }), download: async () => undefined, generate: async () => (calls.push("model"), opts.generate ?? "none") };
  return { ports: ports as Ports, boxes, calls };
}

describe("checkSort", () => {
  it("suggests from where you've filed them before, and never offers people waiting on you", async () => {
    const { ports } = setup([news(3), news(4), fromSam(2), figma()], { "Folders/Newsletters": [news(1, 20)] });
    const v = await checkSort(ports, settings());
    expect(v.folders).toEqual(["Folders/Newsletters", "Archive"]);
    expect(v.groups.map((g) => g.sender)).toEqual(["hello@designweekly.com", "updates@figma.com"]);
    expect(v.groups[0].suggestion).toMatchObject({ folder: "Folders/Newsletters", reason: "sender" });
  });

  it("does nothing when there are no folders to sort into", async () => {
    const { ports } = setup([news(3)]);
    ports.mail.folders = async () => ["INBOX", "Sent"];
    expect((await checkSort(ports, settings())).groups).toEqual([]);
  });

  it("leaves out Never show senders", async () => {
    const { ports } = setup([news(3), figma()]);
    expect((await checkSort(ports, settings({ skip: "figma.com" }))).groups.map((g) => g.sender)).toEqual(["hello@designweekly.com"]);
  });
});

describe("moving", () => {
  it("moves with one tap, undoes, and moves by itself after 3 in a row", async () => {
    const { ports, boxes } = setup([news(1)]);
    const go = async (n: number) => {
      boxes.INBOX.push(news(n));
      const v = await checkSort(ports, settings());
      return v;
    };
    let v = await checkSort(ports, settings());
    const m = await moveGroup(ports, v.groups[0], "Folders/Newsletters");
    expect(boxes["Folders/Newsletters"]).toHaveLength(1);

    await undoMove(ports, m);
    expect(boxes.INBOX).toHaveLength(1);
    expect((await checkSort(ports, settings())).moved).toHaveLength(0);

    for (const n of [2, 3, 4]) {
      v = await go(n);
      expect(v.autoMoved).toBe(0);
      await moveGroup(ports, v.groups[0], "Folders/Newsletters");
    }
    v = await go(5);
    expect(v.autoMoved).toBe(1);
    expect(v.groups).toHaveLength(0);
    expect(v.moved[0]).toMatchObject({ sender: "hello@designweekly.com", to: "Folders/Newsletters", auto: true });
    expect(boxes.INBOX).toHaveLength(0);

    // Not when auto-move is off.
    boxes.INBOX.push(news(6));
    expect((await checkSort(ports, settings({ autoSort: false }))).groups).toHaveLength(1);
  });

  it("Leave in inbox hides a sender", async () => {
    const { ports } = setup([news(1), figma()]);
    await leaveSender(ports, "updates@figma.com");
    expect((await checkSort(ports, settings())).groups.map((g) => g.sender)).toEqual(["hello@designweekly.com"]);
  });
});

describe("guessFolders", () => {
  it("asks the built-in model once per sender with no history", async () => {
    const { ports, calls } = setup([figma()], {}, { generate: "Newsletters" });
    let v = await guessFolders(ports, await checkSort(ports, settings()));
    expect(v.groups[0].suggestion).toMatchObject({ folder: "Folders/Newsletters", reason: "model" });
    v = await guessFolders(ports, await checkSort(ports, settings()));
    expect(v.groups[0].suggestion?.reason).toBe("model");
    expect(calls.filter((c) => c === "model")).toHaveLength(1);
  });
});
