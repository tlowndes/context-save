import { describe, expect, it } from "vitest";
import { check, markAvoiding } from "../../src/services/inbox";
import { finishStep, makeStep, restoreMark } from "../../src/services/steps";
import { addTask, printNow, railIdOf, removeAddedTask } from "../../src/services/tasks";
import { fakePorts, fromSam, ME, NOW, raw, settings } from "../fakes";

async function setup() {
  const batch = { inbox: [fromSam(6)], sent: [] as ReturnType<typeof raw>[] };
  const ports = fakePorts(batch);
  const [sam] = (await check(ports, settings())).candidates;
  await markAvoiding(ports, sam);
  await makeStep(ports, sam.messageId, "first");
  return { ports, batch, id: sam.messageId };
}

describe("tasks in the vault", () => {
  it("adds the step as a #mail task due today, once", async () => {
    const { ports, id } = await setup();
    ports.note.text = "# Next steps\n\n- [x] #task Old #mail 🆔 mai007 ✅ 2026-11-01\n";
    const body = "#task Reply yes or no to Sam #mail 📅 2026-11-20";
    expect(await addTask(ports, id)).toBe(body);
    expect(await addTask(ports, id)).toBe(body);
    expect(ports.note.text).toBe(`# Next steps\n\n- [x] #task Old #mail 🆔 mai007 ✅ 2026-11-01\n- [ ] ${body}\n`);
    expect((await check(ports, settings())).avoiding[0].task).toBe(body);
    // Nothing about the email itself goes in the vault.
    expect(ports.note.text).not.toContain("sam@example.com");
    expect(ports.note.text).not.toContain("in or out");
  });

  it("Undo takes the line back out", async () => {
    const { ports, id } = await setup();
    await addTask(ports, id);
    await removeAddedTask(ports, id);
    expect(ports.note.text).not.toContain("Reply yes or no");
    expect((await check(ports, settings())).avoiding[0].task).toBeNull();
  });

  it("a reply in Sent ticks the task and clears the email", async () => {
    const { ports, batch, id } = await setup();
    await addTask(ports, id);
    // Flight Deck printed it in the meantime.
    ports.note.text = ports.note.text!.replace("📅 2026-11-20", "📅 2026-11-20 🆔 mai004");
    batch.sent.push(raw({ From: ME, To: "sam@example.com", Subject: "Re: Saturday", "In-Reply-To": id, "Message-ID": "<r1@p.me>" }, NOW));
    const v = await check(ports, settings());
    expect(v.avoiding).toHaveLength(0);
    expect(v.candidates).toHaveLength(0);
    expect(ports.note.text).toContain("- [x] #task Reply yes or no to Sam #mail 📅 2026-11-20 🆔 mai004 ✅ 2026-11-20");
  });

  it("keeps the email if the vault can't be written, to try again next time", async () => {
    const { ports, batch, id } = await setup();
    await addTask(ports, id);
    ports.vault.write = async () => Promise.reject(new Error("Choose your Obsidian vault in Settings first."));
    batch.sent.push(raw({ From: ME, To: "sam@example.com", Subject: "Re: Saturday", "In-Reply-To": id, "Message-ID": "<r1@p.me>" }, NOW));
    expect((await check(ports, settings())).avoiding).toHaveLength(1);
  });

  it("Done ticks the task, and its Undo unticks it", async () => {
    const { ports, id } = await setup();
    await addTask(ports, id);
    const before = await finishStep(ports, id);
    expect(ports.note.text).toContain("- [x] #task Reply yes or no to Sam");
    await restoreMark(ports, id, before);
    expect(ports.note.text).toContain("- [ ] #task Reply yes or no to Sam #mail 📅 2026-11-20\n");
  });

  it("Print now hands the task to Flight Deck, then reads back its rail id", async () => {
    const { ports, id } = await setup();
    const body = await addTask(ports, id);
    await printNow(ports, body);
    expect(ports.opened).toHaveLength(1);
    expect(decodeURIComponent(ports.opened[0].split("task=")[1])).toBe(body);
    expect(await railIdOf(ports, body)).toBeNull();
    ports.note.text = ports.note.text!.replace(body, `${body} 🆔 mai004`);
    expect(await railIdOf(ports, body)).toBe("mai004");
  });
});
