import { describe, expect, it } from "vitest";
import { buildSave } from "../../src/core/capture";
import { noteFileName, parseNote, renderNote, uniqueName } from "../../src/core/note";
import { MAIN, win } from "../fakes";

const WORD = "C:\\Office\\WINWORD.EXE";
const save = buildSave({
  live: [win(WORD, "Brief.docx - Word"), win("C:\\Code\\Code.exe", "card.tsx - ObsidianCapture - Visual Studio Code"), win("C:\\Windows\\explorer.exe", "Program Manager")],
  monitors: [MAIN],
  note: "Halfway through the Hangar onboarding. Next: card 3 spacing.",
  pc: "STUDIO-PC",
  setup: "Work",
  now: new Date(2026, 10, 20, 14, 47),
  resolved: { "Brief.docx": "C:\\Users\\tom\\Documents\\Brief.docx" },
});

describe("buildSave", () => {
  it("keeps user windows and fills in file paths", () => {
    expect(save.windows.map((w) => w.app)).toEqual(["Word", "VS Code"]);
    expect(save.windows[0].open).toBe("C:\\Users\\tom\\Documents\\Brief.docx");
    expect(save.windows[1].open).toBeUndefined();
  });
});

describe("note round trip", () => {
  const md = renderNote(save);

  it("reads like a note", () => {
    expect(md).toContain("# Where I was\n\nHalfway through the Hangar onboarding.");
    expect(md).toContain("- Word · Brief.docx - Word (`C:\\Users\\tom\\Documents\\Brief.docx`)");
    expect(md).toContain('setup: "Work"');
  });

  it("parses back to the same save", () => {
    expect(parseNote(md)).toEqual(save);
  });

  it("survives Windows line endings from sync", () => {
    expect(parseNote(md.replace(/\n/g, "\r\n"))).toEqual(save);
  });

  it("uses the note as edited in Obsidian", () => {
    const edited = md.replace("Halfway through the Hangar onboarding. Next: card 3 spacing.", "Done card 3. Start card 4.");
    expect(parseNote(edited)?.note).toBe("Done card 3. Start card 4.");
  });

  it("treats an empty note as empty", () => {
    const blank = renderNote({ ...save, note: "" });
    expect(blank).toContain("_No note._");
    expect(parseNote(blank)?.note).toBe("");
  });

  it("ignores other notes and damaged blocks", () => {
    expect(parseNote("# Shopping\n- milk")).toBeNull();
    expect(parseNote(md.replace('"v": 1', '"v": 1,,'))).toBeNull();
  });
});

describe("file names", () => {
  it("sort by time and carry the setup", () => {
    expect(noteFileName(new Date(2026, 10, 20, 9, 5), "Work")).toBe("2026-11-20 0905 Work.md");
    expect(noteFileName(new Date(2026, 10, 20, 9, 5), null)).toBe("2026-11-20 0905.md");
    expect(noteFileName(new Date(2026, 10, 20, 9, 5), "Play/Games?")).toBe("2026-11-20 0905 PlayGames.md");
  });
  it("never overwrite", () => {
    expect(uniqueName("a.md", ["A.md", "a 2.md"])).toBe("a 3.md");
  });
});
