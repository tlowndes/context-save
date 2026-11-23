import { describe, expect, it } from "vitest";
import { readEmail } from "../../src/services/email";
import { fakePorts } from "../fakes";

const RAW = "From: \"Sam Patel\" <sam@example.com>\r\nSubject: Saturday?\r\nContent-Type: text/plain\r\n\r\nAre you in or out?\r\n";

describe("readEmail", () => {
  it("fetches the email fresh each time and saves nothing", async () => {
    const ports = fakePorts({ inbox: [], sent: [] });
    const asked: string[] = [];
    ports.mail.message = async (id) => (asked.push(id), RAW);
    ports.mail.move = async () => Promise.reject(new Error("must not move"));
    const first = await readEmail(ports, "<sam@example.com>");
    await readEmail(ports, "<sam@example.com>");
    expect(first).toMatchObject({ fromName: "Sam Patel", subject: "Saturday?", body: "Are you in or out?" });
    expect(asked).toEqual(["<sam@example.com>", "<sam@example.com>"]);
    expect(ports.files.size).toBe(0);
    expect(ports.note.text).toBeNull();
  });

  it("is null when the email has gone", async () => {
    const ports = fakePorts({ inbox: [], sent: [] });
    expect(await readEmail(ports, "<gone@x>")).toBeNull();
  });
});
