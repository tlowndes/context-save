import { describe, expect, it } from "vitest";
import { pairWindows } from "../../src/core/matching";
import type { SavedWindow } from "../../src/core/types";
import { win } from "../fakes";

const WORD = "C:\\Office\\WINWORD.EXE";
const saved = (title: string, open?: string): SavedWindow => ({ title, exe: WORD, app: "Word", rect: { x: 0, y: 0, w: 10, h: 10 }, state: "normal", monitor: "", ...(open ? { open } : {}) });

describe("pairWindows", () => {
  it("gives each saved window its own live window, exact titles first", () => {
    const a = win(WORD, "A.docx - Word");
    const b = win(WORD, "B.docx - Word");
    const pairs = pairWindows([saved("B.docx - Word"), saved("A.docx - Word")], [a, b]);
    expect(pairs.map((p) => p.live?.hwnd)).toEqual([b.hwnd, a.hwnd]);
  });

  it("matches by file name when the title changed", () => {
    const a = win(WORD, "A.docx - Saved - Word");
    const pairs = pairWindows([saved("A.docx - Word", "C:\\Docs\\A.docx")], [a]);
    expect(pairs[0].live?.hwnd).toBe(a.hwnd);
  });

  it("never uses a different program", () => {
    const pairs = pairWindows([saved("A.docx - Word")], [win("C:\\x\\notepad.exe", "A.docx - Word")]);
    expect(pairs[0].live).toBeNull();
  });

  it("leaves extras unmatched rather than doubling up", () => {
    const a = win(WORD, "A.docx - Word");
    const pairs = pairWindows([saved("A.docx - Word"), saved("C.docx - Word")], [a]);
    expect(pairs[0].live?.hwnd).toBe(a.hwnd);
    expect(pairs[1].live).toBeNull();
  });
});
