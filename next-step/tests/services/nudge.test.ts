import { describe, expect, it } from "vitest";
import { check, markAvoiding } from "../../src/services/inbox";
import { currentNudge, nudgeLater, nudgeTick } from "../../src/services/nudge";
import { fakePorts, fromSam, NOW, settings } from "../fakes";

describe("the daily nudge", () => {
  it("nudges once a day about who's waiting, and Later today brings it back", async () => {
    const ports = fakePorts({ inbox: [fromSam(6)], sent: [] });
    const s = settings({ nudgeAt: "00:00" });
    const n = await nudgeTick(ports, s);
    expect(n?.title).toMatch(/^Sam's been waiting \d+ days$/);
    expect(await currentNudge(ports)).toEqual(n);
    expect(await nudgeTick(ports, s)).toBeNull();
    await nudgeLater(ports);
    expect(await nudgeTick(ports, s)).toBeNull();
    (ports.clock as unknown as { set(d: Date): void }).set(new Date(NOW.getTime() + 3 * 3_600_000));
    // Back three hours later, unless that's the evening.
    const back = await nudgeTick(ports, s);
    if (new Date(NOW.getTime() + 3 * 3_600_000).getHours() < 19) expect(back?.messageId).toBe(n?.messageId);
  });

  it("says an avoided email's step", async () => {
    const ports = fakePorts({ inbox: [fromSam(6)], sent: [] });
    const [sam] = (await check(ports, settings())).candidates;
    await markAvoiding(ports, sam);
    const n = await nudgeTick(ports, settings({ nudgeAt: "00:00" }));
    expect(n?.kind).toBe("avoiding");
  });

  it("is silent when off, not set up, or nothing's waiting", async () => {
    expect(await nudgeTick(fakePorts({ inbox: [fromSam(6)], sent: [] }), settings({ nudgeAt: "" }))).toBeNull();
    expect(await nudgeTick(fakePorts({ inbox: [fromSam(6)], sent: [] }), settings({ nudgeAt: "00:00", hasPassword: false }))).toBeNull();
    expect(await nudgeTick(fakePorts({ inbox: [], sent: [] }), settings({ nudgeAt: "00:00" }))).toBeNull();
  });
});
