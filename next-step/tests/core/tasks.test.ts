import { describe, expect, it } from "vitest";
import { untickTask, appendTask, nextId, removeTask, taskLine, taskState, ticketCode, tickTask, ymd } from "../../src/core/tasks";

const DAY = new Date(2026, 10, 21, 9, 30);

describe("task lines", () => {
  it("writes a Tasks-plugin line with #mail, an id and today's due date", () => {
    expect(taskLine("Reply yes or no to Sam", "em014", DAY)).toBe("- [ ] Reply yes or no to Sam #mail 🆔 em014 📅 2026-11-21");
    expect(taskLine("Send #2 a time 📅 now\n", "em001", DAY)).toBe("- [ ] Send 2 a time now #mail 🆔 em001 📅 2026-11-21");
    expect(ticketCode("em014")).toBe("EM-014");
    expect(ymd(DAY)).toBe("2026-11-21");
  });

  it("numbers ids after the highest in the note", () => {
    expect(nextId(null)).toBe("em001");
    expect(nextId("- [x] a 🆔 em009 ✅ 2026-11-01\n- [ ] b 🆔 em012\n- [ ] c 🆔 abc123")).toBe("em013");
  });

  it("creates the note the first time and keeps what's already there", () => {
    const first = appendTask(null, "- [ ] A 🆔 em001");
    expect(first.startsWith("# Next steps")).toBe(true);
    expect(first.endsWith("- [ ] A 🆔 em001\n")).toBe(true);
    expect(appendTask("My own line\n\n\n", "- [ ] B 🆔 em002")).toBe("My own line\n- [ ] B 🆔 em002\n");
  });

  it("ticks, finds and removes by id without touching similar ids", () => {
    const note = "x\n- [ ] A 🆔 em001 📅 2026-11-21\n- [ ] B 🆔 em0010 📅 2026-11-21\n";
    const ticked = tickTask(note, "em001", DAY);
    expect(ticked).toContain("- [x] A 🆔 em001 📅 2026-11-21 ✅ 2026-11-21");
    expect(ticked).toContain("- [ ] B 🆔 em0010");
    expect(taskState(ticked, "em001")).toBe("done");
    expect(taskState(ticked, "em0010")).toBe("open");
    expect(taskState(ticked, "em002")).toBe("missing");
    expect(tickTask(ticked, "em001", DAY)).toBe(ticked);
    expect(untickTask(ticked, "em001")).toBe(note);
    expect(removeTask(note, "em001")).toBe("x\n- [ ] B 🆔 em0010 📅 2026-11-21\n");
  });
});
