import { describe, expect, it } from "vitest";
import { markShown, nudgeDue, parseTime, pickNudge, snoozeNudge } from "../../src/core/nudge";
import type { Candidate } from "../../src/core/spot";

const at = (h: number, m = 0, day = 23) => new Date(2026, 10, day, h, m);
const cand = (name: string, days: number, id = `<${name}@x>`): Candidate => ({
  messageId: id, uid: 1, from: { name, address: `${name.toLowerCase()}@example.com` }, subject: "Hi", date: at(9, 0, 23 - days), days,
});

describe("when the nudge comes", () => {
  it("reads the time, and off is off", () => {
    expect(parseTime("10:30")).toBe(630);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(nudgeDue(at(11), "", {})).toBe(false);
  });

  it("comes once a day from the nudge time, even if the PC was off at 10:30", () => {
    expect(nudgeDue(at(10, 29), "10:30", {})).toBe(false);
    expect(nudgeDue(at(10, 30), "10:30", {})).toBe(true);
    expect(nudgeDue(at(15, 0), "10:30", {})).toBe(true);
    expect(nudgeDue(at(15, 0), "10:30", markShown(at(10, 30)))).toBe(false);
    expect(nudgeDue(at(10, 30, 24), "10:30", markShown(at(10, 30)))).toBe(true);
  });

  it("never in the evening", () => {
    expect(nudgeDue(at(19, 0), "10:30", {})).toBe(false);
  });

  it("Later today brings it back in 3 hours, or tomorrow if that's the evening", () => {
    const s = snoozeNudge(at(10, 30));
    expect(nudgeDue(at(13, 29), "10:30", s)).toBe(false);
    expect(nudgeDue(at(13, 30), "10:30", s)).toBe(true);
    const late = snoozeNudge(at(16, 30));
    expect(late.snoozedUntil).toBeUndefined();
    expect(nudgeDue(at(18, 0), "10:30", late)).toBe(false);
    expect(nudgeDue(at(10, 30, 24), "10:30", late)).toBe(true);
  });
});

describe("what the nudge says", () => {
  const step = { text: "Reply yes or no to Sam", minutes: 2, source: "model" as const };

  it("leads with an email you said was heavy, and its step", () => {
    const n = pickNudge(
      { avoiding: [{ messageId: "<sam>", from: "Sam Patel", at: at(9, 0, 22), sent: at(9, 0, 17), step }], candidates: [cand("Rob", 9)] },
      at(10, 30),
      "10:30",
    )!;
    expect(n).toMatchObject({ messageId: "<sam>", kind: "avoiding", label: "NEXT STEP · 10:30", title: "Sam's been waiting 6 days", body: "Tiny step ready: reply yes or no to Sam.", more: 1 });
  });

  it("picks the oldest, and copes with no step yet", () => {
    const n = pickNudge(
      {
        avoiding: [
          { messageId: "<a>", from: "Amy", at: at(9), sent: at(9, 0, 21), step },
          { messageId: "<b>", from: "Ben", at: at(9), sent: at(9, 0, 19), step: null },
        ],
        candidates: [],
      },
      at(10, 30),
      "10:30",
    )!;
    expect(n.messageId).toBe("<b>");
    expect(n.body).toBe("Tap Show me for a tiny step.");
  });

  it("otherwise asks about the longest-waiting email, and stays quiet when nothing's waiting", () => {
    const n = pickNudge({ avoiding: [], candidates: [cand("Rob", 4), cand("Landlord", 1)] }, at(10, 30), "10:30")!;
    expect(n).toMatchObject({ kind: "candidate", title: "Rob's been waiting 4 days", more: 1 });
    expect(pickNudge({ avoiding: [], candidates: [cand("Landlord", 1)] }, at(10, 30), "10:30")!.title).toBe("Landlord's been waiting a day");
    expect(pickNudge({ avoiding: [], candidates: [] }, at(10, 30), "10:30")).toBeNull();
  });
});
