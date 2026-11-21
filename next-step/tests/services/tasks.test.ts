import { describe, expect, it } from "vitest";
import { check, markAvoiding } from "../../src/services/inbox";
import { finishStep, makeStep, restoreMark } from "../../src/services/steps";
import { addTask, removeAddedTask } from "../../src/services/tasks";
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
    ports.note.text = "# Next steps\n\n- [x] Old 🆔 em007 ✅ 2026-11-01\n";
    expect(await addTask(ports, id)).toBe("em008");
    expect(await addTask(ports, id)).toBe("em008");
    expect(ports.note.text).toBe("# Next steps\n\n- [x] Old 🆔 em007 ✅ 2026-11-01\n- [ ] Reply yes or no to Sam #mail 🆔 em008 📅 2026-11-20\n");
    expect((await check(ports, settings())).avoiding[0].taskId).toBe("em008");
    // Nothing about the email itself goes in the vault.
    expect(ports.note.text).not.toContain("sam@example.com");
    expect(ports.note.text).not.toContain("in or out");
  });

  it("Undo takes the line back out", async () => {
    const { ports, id } = await setup();
    await addTask(ports, id);
    await removeAddedTask(ports, id);
    expect(ports.note.text).not.toContain("em001");
    expect((await check(ports, settings())).avoiding[0].taskId).toBeNull();
  });

  it("a reply in Sent ticks the task and clears the email", async () => {
    const { ports, batch, id } = await setup();
    await addTask(ports, id);
    batch.sent.push(raw({ From: ME, To: "sam@example.com", Subject: "Re: Saturday", "In-Reply-To": id, "Message-ID": "<r1@p.me>" }, NOW));
    const v = await check(ports, settings());
    expect(v.avoiding).toHaveLength(0);
    expect(v.candidates).toHaveLength(0);
    expect(ports.note.text).toContain("- [x] Reply yes or no to Sam #mail 🆔 em001 📅 2026-11-20 ✅ 2026-11-20");
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
    expect(ports.note.text).toContain("- [x] Reply yes or no to Sam");
    await restoreMark(ports, id, before);
    expect(ports.note.text).toContain("- [ ] Reply yes or no to Sam #mail 🆔 em001 📅 2026-11-20\n");
  });
});
