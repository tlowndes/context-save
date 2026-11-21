import { describe, expect, it } from "vitest";
import { bodyText, htmlToText, newestText } from "../../src/core/mime";

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
