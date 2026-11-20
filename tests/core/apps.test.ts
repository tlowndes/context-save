import { describe, expect, it } from "vitest";
import { appName, documentFromTitle, isUserWindow } from "../../src/core/apps";

const word = "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE";

describe("appName", () => {
  it("knows common apps", () => {
    expect(appName(word)).toBe("Word");
    expect(appName("C:\\Users\\tom\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe")).toBe("VS Code");
  });
  it("tidies unknown ones", () => {
    expect(appName("C:\\Tools\\blender.exe")).toBe("Blender");
  });
});

describe("documentFromTitle", () => {
  it("reads Office titles", () => {
    expect(documentFromTitle(word, "Brief.docx - Word")).toBe("Brief.docx");
    expect(documentFromTitle(word, "Brief.docx  -  Compatibility Mode - Word")).toBe("Brief.docx");
    expect(documentFromTitle("C:\\x\\EXCEL.EXE", "Budget 2026.xlsx - Saved - Excel")).toBe("Budget 2026.xlsx");
  });
  it("ignores titles without a file", () => {
    expect(documentFromTitle(word, "Word")).toBeNull();
    expect(documentFromTitle(word, "Document1 - Word")).toBeNull();
  });
  it("only trusts Explorer when it shows a full path", () => {
    expect(documentFromTitle("C:\\Windows\\explorer.exe", "C:\\Users\\tom\\Downloads")).toBe("C:\\Users\\tom\\Downloads");
    expect(documentFromTitle("C:\\Windows\\explorer.exe", "Downloads")).toBeNull();
  });
  it("reads Notepad, skipping unsaved marks", () => {
    expect(documentFromTitle("C:\\Windows\\notepad.exe", "*todo.txt - Notepad")).toBe("todo.txt");
    expect(documentFromTitle("C:\\Windows\\notepad.exe", "Untitled - Notepad")).toBeNull();
  });
});

describe("isUserWindow", () => {
  const r = { w: 800, h: 600 };
  it("leaves out Windows' own windows", () => {
    expect(isUserWindow({ title: "Settings", exe: "C:\\Windows\\ImmersiveControlPanel\\SystemSettings.exe", rect: r })).toBe(false);
    expect(isUserWindow({ title: "Program Manager", exe: "C:\\Windows\\explorer.exe", rect: r })).toBe(false);
  });
  it("leaves out tiny and untitled windows", () => {
    expect(isUserWindow({ title: "", exe: word, rect: r })).toBe(false);
    expect(isUserWindow({ title: "x", exe: word, rect: { w: 20, h: 20 } })).toBe(false);
  });
  it("keeps real work", () => {
    expect(isUserWindow({ title: "Brief.docx - Word", exe: word, rect: r })).toBe(true);
  });
});
