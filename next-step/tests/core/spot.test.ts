import { describe, expect, it } from "vitest";
import { parseMessage } from "../../src/core/headers";
import { isMachine, spot, type SpotRules } from "../../src/core/spot";
import { daysAgo, fromSam, ME, NOW, raw } from "../fakes";

const rules: SpotRules = { me: [ME, "tom@tomlowndes.co.uk"], minDays: 3, maxDays: 30, skip: [] };
const inbox = (...r: ReturnType<typeof raw>[]) => r.map((x) => parseMessage(x, "inbox"));
const sent = (...r: ReturnType<typeof raw>[]) => r.map((x) => parseMessage(x, "sent"));

describe("spot", () => {
  it("finds a real person's email waiting 3+ days", () => {
    const [c] = spot(inbox(fromSam(6)), [], rules, {}, NOW);
    expect(c.from.name).toBe("Sam Patel");
    expect(c.days).toBe(6);
  });

  it("ignores emails younger than the minimum or older than the maximum", () => {
    expect(spot(inbox(fromSam(2), fromSam(31)), [], rules, {}, NOW)).toEqual([]);
  });

  it("ignores newsletters, noreply senders, your own mail and skipped senders", () => {
    const list = inbox(
      fromSam(5, { "List-Unsubscribe": "<mailto:x@y>" }),
      raw({ From: "no-reply@shop.com", To: ME, "Message-ID": "<n@shop>" }, daysAgo(5)),
      raw({ From: ME, To: ME, "Message-ID": "<self@p>" }, daysAgo(5)),
      raw({ From: "GP <surgery@nhs.net>", To: ME, "Message-ID": "<gp@nhs>" }, daysAgo(5)),
    );
    expect(spot(list, [], { ...rules, skip: ["nhs.net"] }, {}, NOW)).toEqual([]);
  });

  it("only counts emails sent to you directly, including aliases", () => {
    const ccOnly = raw({ From: "Ann <ann@x.com>", To: "team@x.com", Cc: ME, "Message-ID": "<cc@x>" }, daysAgo(5));
    const alias = raw({ From: "Ann <ann@x.com>", To: "Tom <tom@tomlowndes.co.uk>", "Message-ID": "<al@x>" }, daysAgo(5));
    expect(spot(inbox(ccOnly, alias), [], rules, {}, NOW).map((c) => c.messageId)).toEqual(["<al@x>"]);
  });

  it("drops emails you've replied to, directly or later in the thread", () => {
    const direct = sent(raw({ From: ME, To: "sam@example.com", "In-Reply-To": "<sam-6@example.com>", "Message-ID": "<r1@p>" }, daysAgo(1)));
    expect(spot(inbox(fromSam(6)), direct, rules, {}, NOW)).toEqual([]);

    const later = sent(raw({ From: ME, To: "sam@example.com", References: "<root@example.com> <other@example.com>", "Message-ID": "<r2@p>" }, daysAgo(1)));
    const threaded = fromSam(6, { References: "<root@example.com>" });
    expect(spot(inbox(threaded), later, rules, {}, NOW)).toEqual([]);
  });

  it("does not count a reply sent before the email arrived", () => {
    const earlier = sent(raw({ From: ME, To: "sam@example.com", References: "<root@example.com>", "Message-ID": "<r0@p>" }, daysAgo(9)));
    expect(spot(inbox(fromSam(6, { References: "<root@example.com>" })), earlier, rules, {}, NOW)).toHaveLength(1);
  });

  it("shows one card per conversation, the newest message", () => {
    const a = fromSam(8, { References: "<root@example.com>" });
    const b = fromSam(4, { References: "<root@example.com> <sam-8@example.com>" });
    const out = spot(inbox(a, b), [], rules, {}, NOW);
    expect(out.map((c) => c.messageId)).toEqual(["<sam-4@example.com>"]);
  });

  it("hides marked emails until a snooze runs out, and sorts longest waiting first", () => {
    const list = inbox(fromSam(4), raw({ From: "Landlord <ll@x.com>", To: ME, "Message-ID": "<ll@x>" }, daysAgo(9)), fromSam(6));
    const marks = {
      "<sam-4@example.com>": { kind: "avoiding" as const, at: NOW.toISOString(), from: "Sam", subject: "x" },
      "<sam-6@example.com>": { kind: "snoozed" as const, until: daysAgo(-1).toISOString() },
    };
    expect(spot(list, [], rules, marks, NOW).map((c) => c.messageId)).toEqual(["<ll@x>"]);
    const expired = { ...marks, "<sam-6@example.com>": { kind: "snoozed" as const, until: daysAgo(1).toISOString() } };
    expect(spot(list, [], rules, expired, NOW).map((c) => c.messageId)).toEqual(["<ll@x>", "<sam-6@example.com>"]);
  });
});

describe("isMachine", () => {
  it("knows robots from people", () => {
    for (const a of ["noreply@x.com", "no-reply@x.com", "do-not-reply@x.com", "notifications@github.com", "mailer-daemon@x", "bounce+abc@x.com"]) expect(isMachine(a)).toBe(true);
    for (const a of ["sam@x.com", "newman@x.com", "support.sarah@x.com"]) expect(isMachine(a)).toBe(false);
  });
});
