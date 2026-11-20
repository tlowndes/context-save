import { describe, expect, it } from "vitest";
import { agoLabel, appsLine, whenLabel } from "../../src/core/time";

const now = new Date(2026, 10, 20, 17, 0);

describe("time labels", () => {
  it("names the day", () => {
    expect(whenLabel(new Date(2026, 10, 20, 14, 47), now)).toBe("Today 14:47");
    expect(whenLabel(new Date(2026, 10, 19, 21, 30), now)).toBe("Yesterday 21:30");
    expect(whenLabel(new Date(2026, 10, 16, 9, 5), now)).toBe("Mon 16 Nov 09:05");
  });
  it("says how long ago", () => {
    expect(agoLabel(new Date(2026, 10, 20, 16, 59, 40), now)).toBe("just now");
    expect(agoLabel(new Date(2026, 10, 20, 16, 48), now)).toBe("12 mins ago");
    expect(agoLabel(new Date(2026, 10, 20, 14, 47), now)).toBe("2 hrs ago");
    expect(agoLabel(new Date(2026, 10, 17, 17, 0), now)).toBe("3 days ago");
  });
  it("shortens long app lists", () => {
    expect(appsLine(["Figma", "VS Code", "Word", "Obsidian", "Firefox", "Spotify"])).toBe("Figma, VS Code, Word, Obsidian +2");
    expect(appsLine([])).toBe("Nothing open");
  });
});
