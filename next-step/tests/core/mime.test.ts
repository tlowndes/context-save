import { describe, expect, it } from "vitest";
import { bodyText, htmlToText, newestText, readableEmail } from "../../src/core/mime";

const crlf = (s: string) => s.replace(/\n/g, "\r\n");

describe("bodyText", () => {
  it("reads a plain email", () => {
    const raw = crlf("From: Sam <sam@x.com>\nSubject: Sat\nContent-Type: text/plain; charset=utf-8\n\nHey, Saturday at Rob's.\nAre you in or out?\n");
    expect(bodyText(raw)).toBe("Hey, Saturday at Rob's.\nAre you in or out?");
  });

  it("prefers text/plain in multipart/alternative and decodes quoted-printable", () => {
    const raw = crlf(
      [
        'Content-Type: multipart/alternative; boundary="b1"',
        "",
        "--b1",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Caf=C3=A9 at 3? It's =C2=A35 a hea=",
        "d.",
        "--b1",
        "Content-Type: text/html",
        "",
        "<p>ignored</p>",
        "--b1--",
      ].join("\n"),
    );
    expect(bodyText(raw)).toBe("Café at 3? It's £5 a head.");
  });

  it("falls back to HTML and handles base64 inside nested multipart", () => {
    const html = btoa("<html><style>p{}</style><p>Which day suits&nbsp;you?</p><br>Thanks</html>");
    const raw = crlf(
      [
        'Content-Type: multipart/mixed; boundary="outer"',
        "",
        "--outer",
        'Content-Type: multipart/alternative; boundary="inner"',
        "",
        "--inner",
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        html,
        "--inner--",
        "--outer",
        "Content-Type: application/pdf",
        "Content-Disposition: attachment; filename=a.pdf",
        "",
        "JVBERi0=",
        "--outer--",
      ].join("\n"),
    );
    expect(bodyText(raw)).toBe("Which day suits you?\n\nThanks");
  });

  it("skips text attachments and caps the length", () => {
    const raw = crlf(['Content-Type: multipart/mixed; boundary="m"', "", "--m", "Content-Type: text/plain", "", "x".repeat(2000), "--m", "Content-Type: text/plain", "Content-Disposition: attachment", "", "secret", "--m--"].join("\n"));
    const out = bodyText(raw, 100);
    expect(out).toHaveLength(101);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("newestText", () => {
  it("stops at quoted replies and signatures", () => {
    expect(newestText("Yes please!\n\nOn Mon, 16 Nov 2026 at 09:12, Tom <t@p.me> wrote:\n> old stuff")).toBe("Yes please!");
    expect(newestText("Thanks\n-- \nSam Patel\nDesigner")).toBe("Thanks");
    expect(newestText("Hi\n> quoted\nStill here\nSent from my iPhone")).toBe("Hi\nStill here");
  });
});

describe("htmlToText", () => {
  it("drops quoted blocks", () => {
    expect(htmlToText("<div>New</div><blockquote>Old</blockquote>").trim()).toBe("New");
  });
});

describe("readableEmail", () => {
  it("reads sender, subject, date and the whole body, quotes included", () => {
    const raw = crlf(
      [
        "From: =?utf-8?Q?Caf=C3=A9_Rob?= <ROB@x.com>",
        "Subject: =?utf-8?Q?Saturday_=E2=80=93_in_or_out?=",
        "Date: Fri, 20 Nov 2026 09:00:00 +0000",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Are you in?",
        "",
        "",
        "",
        "On Thu, Sam wrote:",
        "> Maybe",
        "-- ",
        "Rob",
      ].join("\n"),
    );
    const e = readableEmail(raw);
    expect(e.fromName).toBe("Café Rob");
    expect(e.fromAddress).toBe("rob@x.com");
    expect(e.subject).toBe("Saturday – in or out");
    expect(e.date?.toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(e.body).toBe("Are you in?\n\nOn Thu, Sam wrote:\n> Maybe\n--\nRob");
    expect(e.cut).toBe(false);
  });

  it("falls back to HTML, and copes with missing headers", () => {
    const e = readableEmail(crlf("Content-Type: text/html\n\n<p>Which day suits?</p><p>Thanks</p>"));
    expect(e).toMatchObject({ fromName: "Unknown sender", fromAddress: "", subject: "(no subject)", date: null });
    expect(e.body).toBe("Which day suits?\nThanks");
  });

  it("cuts very long emails and says so", () => {
    const e = readableEmail(crlf(`From: a@b.com\n\n${"word ".repeat(100)}`), 50);
    expect(e.cut).toBe(true);
    expect(e.body.endsWith("…")).toBe(true);
    expect(e.body.length).toBeLessThanOrEqual(51);
  });
});
