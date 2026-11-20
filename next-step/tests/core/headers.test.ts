import { describe, expect, it } from "vitest";
import { decodeWords, headerMap, parseAddresses, parseMessage } from "../../src/core/headers";

describe("headerMap", () => {
  it("unfolds continuation lines and lower-cases names", () => {
    const h = headerMap("Subject: Portfolio review:\r\n any times\r\n\tnext week?\r\nFROM: a@b.com\r\n");
    expect(h.get("subject")).toBe("Portfolio review: any times next week?");
    expect(h.get("from")).toBe("a@b.com");
  });

  it("keeps the first of a repeated header", () => {
    expect(headerMap("To: a@b.com\nTo: c@d.com").get("to")).toBe("a@b.com");
  });
});

describe("decodeWords", () => {
  it("decodes Q and B encoded words", () => {
    expect(decodeWords("=?utf-8?Q?Caf=C3=A9_tonight?=")).toBe("Café tonight");
    expect(decodeWords("=?UTF-8?B?Qm9pbGVyIHNlcnZpY2U=?=")).toBe("Boiler service");
  });

  it("joins adjacent encoded words and handles Latin-1", () => {
    expect(decodeWords("=?utf-8?Q?Re:_?= =?utf-8?Q?Saturday?=")).toBe("Re: Saturday");
    expect(decodeWords("=?iso-8859-1?Q?=A3200_deposit?=")).toBe("£200 deposit");
  });

  it("leaves plain text alone", () => {
    expect(decodeWords("Just text")).toBe("Just text");
  });
});

describe("parseAddresses", () => {
  it("handles names, quotes with commas and bare addresses", () => {
    expect(parseAddresses('"Patel, Sam" <Sam@Example.com>, bob@y.org')).toEqual([
      { name: "Patel, Sam", address: "sam@example.com" },
      { name: "", address: "bob@y.org" },
    ]);
  });

  it("decodes encoded names and skips junk", () => {
    expect(parseAddresses("=?utf-8?Q?Ren=C3=A9e?= <renee@x.fr>, undisclosed-recipients:;")).toEqual([{ name: "Renée", address: "renee@x.fr" }]);
  });
});

describe("parseMessage", () => {
  const base = (extra: string) => ({
    uid: 7,
    headers: `From: Sam <sam@x.com>\r\nTo: tom@proton.me\r\nSubject: Hi\r\nDate: Mon, 16 Nov 2026 09:12:00 +0000\r\nMessage-ID: <A1@x.com>\r\n${extra}`,
    internalDate: "2026-11-16T09:12:05Z",
  });

  it("reads ids, dates and addresses", () => {
    const m = parseMessage(base("References: <root@x.com> <a0@x.com>\r\nIn-Reply-To: <a0@x.com>\r\n"), "inbox");
    expect(m.messageId).toBe("<a1@x.com>");
    expect(m.references).toEqual(["<root@x.com>", "<a0@x.com>"]);
    expect(m.inReplyTo).toBe("<a0@x.com>");
    expect(m.date.toISOString()).toBe("2026-11-16T09:12:00.000Z");
    expect(m.from).toEqual({ name: "Sam", address: "sam@x.com" });
    expect(m.bulk).toBe(false);
  });

  it("flags newsletters and auto-replies as bulk", () => {
    expect(parseMessage(base("List-Unsubscribe: <mailto:u@x.com>\r\n"), "inbox").bulk).toBe(true);
    expect(parseMessage(base("Precedence: bulk\r\n"), "inbox").bulk).toBe(true);
    expect(parseMessage(base("Auto-Submitted: auto-replied\r\n"), "inbox").bulk).toBe(true);
    expect(parseMessage(base("Auto-Submitted: no\r\n"), "inbox").bulk).toBe(false);
  });

  it("falls back to the IMAP date and a uid key", () => {
    const m = parseMessage({ uid: 3, headers: "From: a@b.com\r\nDate: not a date\r\n", internalDate: "2026-11-10T08:00:00Z" }, "inbox");
    expect(m.date.toISOString()).toBe("2026-11-10T08:00:00.000Z");
    expect(m.messageId).toBe("<uid-inbox-3>");
  });
});
