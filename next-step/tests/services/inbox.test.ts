import { describe, expect, it } from "vitest";
import { parseMarks, snoozeUntil } from "../../src/core/marks";
import { check, markAvoiding, MARKS_FILE, snooze, unmark } from "../../src/services/inbox";
import { daysAgo, fakePorts, fromSam, ME, raw, settings } from "../fakes";

const batch = () => ({
  inbox: [fromSam(6), raw({ From: "Studio North <jobs@studionorth.co>", To: ME, Subject: "Portfolio review", "Message-ID": "<sn@x>" }, daysAgo(4))],
  sent: [],
});

describe("inbox service", () => {
  it("checks mail and lists candidates", async () => {
    const view = await check(fakePorts(batch()), settings());
    expect(view.candidates.map((c) => c.from.address)).toEqual(["sam@example.com", "jobs@studionorth.co"]);
    expect(view.avoiding).toEqual([]);
  });

  it("moves an email to the avoiding list, and undo brings it back", async () => {
    const ports = fakePorts(batch());
    const [sam] = (await check(ports, settings())).candidates;
    await markAvoiding(ports, sam);
    let view = await check(ports, settings());
    expect(view.candidates).toHaveLength(1);
    expect(view.avoiding).toMatchObject([{ from: "Sam Patel", subject: "Saturday, are you in or out?" }]);
    await unmark(ports, [sam.messageId]);
    view = await check(ports, settings());
    expect(view.candidates).toHaveLength(2);
  });

  it("snoozes until 9am tomorrow, then asks again", async () => {
    const ports = fakePorts(batch());
    const ids = (await check(ports, settings())).candidates.map((c) => c.messageId);
    await snooze(ports, ids);
    expect((await check(ports, settings())).candidates).toEqual([]);
    const marks = parseMarks(ports.files.get(MARKS_FILE) ?? null);
    expect(Object.values(marks)[0]).toEqual({ kind: "snoozed", until: snoozeUntil(ports.clock.now()).toISOString() });
    (ports.clock as unknown as { set(d: Date): void }).set(daysAgo(-1.5));
    expect((await check(ports, settings())).candidates).toHaveLength(2);
  });

  it("uses aliases and the skip list from settings", async () => {
    const view = await check(fakePorts(batch()), settings({ skip: "studionorth.co" }));
    expect(view.candidates).toHaveLength(1);
  });

  it("survives a broken marks file", async () => {
    const ports = fakePorts(batch());
    ports.files.set(MARKS_FILE, "{not json");
    expect((await check(ports, settings())).candidates).toHaveLength(2);
  });
});
