import { describe, expect, it } from "vitest";
import { appendTask, printLink, railCode, railId, removeTask, taskBody, taskLine, taskState, tickTask, untickTask, ymd } from "../../src/core/tasks";

const DAY = new Date(2026, 10, 21, 9, 30);
const BODY = "#task Reply yes or no to Sam #mail 📅 2026-11-21";

describe("task lines", () => {
  it("writes a #task line with #mail and today's due date, and no id", () => {
    expect(taskBody("Reply yes or no to Sam", DAY)).toBe(BODY);
    expect(taskLine(BODY)).toBe(`- [ ] ${BODY}`);
    expect(taskBody("Send #2 a time 📅 now\n", DAY)).toBe("#task Send 2 a time now #mail 📅 2026-11-21");
    expect(ymd(DAY)).toBe("2026-11-21");
  });

  it("creates the note the first time and keeps what's already there", () => {
    const first = appendTask(null, "- [ ] #task A");
    expect(first.startsWith("# Next steps")).toBe(true);
    expect(first.endsWith("- [ ] #task A\n")).toBe(true);
    expect(appendTask("My own line\n\n\n", "- [ ] #task B")).toBe("My own line\n- [ ] #task B\n");
  });

  it("finds the line by its text, before and after Flight Deck gives it a rail id", () => {
    const before = `x\n- [ ] ${BODY}\n- [ ] #task Reply yes or no to Sam later #mail 📅 2026-11-21\n`;
    expect(taskState(before, BODY)).toBe("open");
    expect(railId(before, BODY)).toBeNull();
    const printed = before.replace(`${BODY}\n`, `${BODY} 🆔 mai004\n`);
    expect(railId(printed, BODY)).toBe("mai004");
    expect(railCode("mai004")).toBe("MAI 004");
    // Obsidian Tasks puts the id before the date when it re-saves a line.
    expect(railId("- [ ] #task Reply yes or no to Sam #mail 🆔 mai004 📅 2026-11-21", BODY)).toBe("mai004");
    expect(taskState("- [ ] #task Something else #mail 📅 2026-11-21", BODY)).toBe("missing");
  });

  it("ticks, unticks and removes by text without touching similar lines", () => {
    const note = `x\n- [ ] ${BODY} 🆔 mai004\n- [ ] #task Reply yes or no to Sam later #mail 📅 2026-11-21\n`;
    const ticked = tickTask(note, BODY, DAY);
    expect(ticked).toContain(`- [x] ${BODY} 🆔 mai004 ✅ 2026-11-21`);
    expect(ticked).toContain("- [ ] #task Reply yes or no to Sam later");
    expect(taskState(ticked, BODY)).toBe("done");
    expect(railId(ticked, BODY)).toBe("mai004");
    expect(tickTask(ticked, BODY, DAY)).toBe(ticked);
    expect(untickTask(ticked, BODY)).toBe(note);
    expect(removeTask(note, BODY)).toBe("x\n- [ ] #task Reply yes or no to Sam later #mail 📅 2026-11-21\n");
  });

  it("builds the Print now link Flight Deck opens", () => {
    const link = printLink(BODY);
    expect(link.startsWith("flightdeck://print?note=00%20-%20Inbox%2FNext%20steps.md&task=")).toBe(true);
    expect(decodeURIComponent(link.split("task=")[1])).toBe(BODY);
  });
});
