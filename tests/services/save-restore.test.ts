import { describe, expect, it } from "vitest";
import { savesDir } from "../../src/services/ports";
import { restoreSave, undoRestore } from "../../src/services/restore";
import { deleteSave, listSaves, saveContext, takeSnapshot } from "../../src/services/saves";
import { LAPTOP, MAIN, fakePorts, win } from "../fakes";

const WORD = "C:\\Office\\WINWORD.EXE";
const CODE = "C:\\Code\\Code.exe";
const FIGMA = "C:\\Figma\\Figma.exe";
const settings = { vault: "C:\\Vault", pc: "STUDIO-PC" };

async function savedSession() {
  const left = { x: 0, y: 0, w: 1280, h: 1392 };
  const right = { x: 1280, y: 0, w: 1280, h: 1392 };
  const { ports, state } = fakePorts({
    windows: [win(WORD, "Brief.docx - Word", left), win(CODE, "card.tsx - ObsidianCapture - Visual Studio Code", right), win(FIGMA, "Hangar – Figma", left, { state: "maximised" })],
  });
  const snap = await takeSnapshot(ports);
  const saved = await saveContext(ports, settings, snap, "Card 3 spacing");
  return { ports, state, saved };
}

describe("saving", () => {
  it("writes one note into the vault's saves folder", async () => {
    const { state, saved } = await savedSession();
    expect(saved.path).toBe(`${savesDir(settings.vault)}\\2026-11-20 1447.md`);
    expect(state.files.get(saved.path)).toContain("Card 3 spacing");
  });

  it("lists saves newest first and undo removes one", async () => {
    const { ports, saved } = await savedSession();
    await ports.clock.sleep(60_000);
    const second = await saveContext(ports, settings, await takeSnapshot(ports), "Later");
    const list = await listSaves(ports, settings);
    expect(list.map((e) => e.save.note)).toEqual(["Later", "Card 3 spacing"]);
    await deleteSave(ports, second.path);
    expect((await listSaves(ports, settings)).map((e) => e.path)).toEqual([saved.path]);
  });
});

describe("restoring", () => {
  it("puts open windows back without starting anything", async () => {
    const { ports, state, saved } = await savedSession();
    for (const w of state.windows) w.rect = { x: 5, y: 5, w: 300, h: 300 };
    const report = await restoreSave(ports, saved.save);
    expect(report).toMatchObject({ placed: 3, opened: 0, problems: [] });
    expect(state.launches).toEqual([]);
    expect(state.windows.find((w) => w.exe === FIGMA)?.state).toBe("maximised");
  });

  it("places the front window last, so it ends up in front", async () => {
    const { ports, state, saved } = await savedSession();
    await restoreSave(ports, saved.save);
    const word = state.windows.find((w) => w.exe === WORD)!;
    expect(state.placed.at(-1)?.hwnd).toBe(word.hwnd);
  });

  it("starts missing apps, reopening files where it knows them", async () => {
    const { ports, state, saved } = await savedSession();
    state.windows = [];
    state.installed = new Set([WORD, CODE, FIGMA]);
    const withFile = { ...saved.save, windows: saved.save.windows.map((w) => (w.exe === WORD ? { ...w, open: "C:\\Docs\\Brief.docx" } : w)) };
    const report = await restoreSave(ports, withFile);
    expect(state.launches).toEqual([
      { exe: WORD, args: ["C:\\Docs\\Brief.docx"] },
      { exe: CODE, args: [] },
      { exe: FIGMA, args: [] },
    ]);
    expect(report).toMatchObject({ opened: 3, placed: 0, problems: [] });
  });

  it("says when an app isn't installed", async () => {
    const { ports, state, saved } = await savedSession();
    state.windows = [];
    state.installed = new Set([WORD, CODE]);
    const report = await restoreSave(ports, saved.save);
    expect(report.problems).toEqual([expect.objectContaining({ app: "Figma", reason: "Figma isn't installed on this PC" })]);
  });

  it("says when a started app never shows a window", async () => {
    const { ports, state, saved } = await savedSession();
    state.windows = [];
    state.installed = new Set([WORD, CODE, FIGMA]);
    state.onLaunch = (exe) => (exe === CODE ? [] : [win(exe, "x")]);
    const report = await restoreSave(ports, saved.save, { launchTimeout: 3000 });
    expect(report.problems.map((p) => p.app)).toEqual(["VS Code"]);
    expect(report.opened).toBe(2);
  });

  it("launches a self-restoring app once for several saved windows", async () => {
    const { ports, state } = fakePorts({ installed: new Set([CODE]) });
    state.onLaunch = (exe) => [win(exe, "a - Visual Studio Code"), win(exe, "b - Visual Studio Code")];
    const save = {
      v: 1 as const, created: "2026-11-20T14:47:00+00:00", pc: "X", setup: null, note: "", monitors: [MAIN],
      windows: ["a", "b"].map((t) => ({ title: `${t} - Visual Studio Code`, exe: CODE, app: "VS Code", rect: { x: 0, y: 0, w: 500, h: 500 }, state: "normal" as const, monitor: MAIN.id })),
    };
    const report = await restoreSave(ports, save);
    expect(state.launches).toHaveLength(1);
    expect(report.opened).toBe(2);
  });

  it("fits windows to a smaller screen and says so", async () => {
    const { ports, state, saved } = await savedSession();
    state.monitors = [LAPTOP];
    const report = await restoreSave(ports, saved.save);
    expect(report.adjusted).toBe(3);
    const code = state.windows.find((w) => w.exe === CODE)!;
    expect(code.rect).toEqual({ x: 960, y: 0, w: 960, h: 1152 });
  });

  it("tidies other windows, and undo puts everything back without closing anything", async () => {
    const { ports, state, saved } = await savedSession();
    const stray = win("C:\\x\\spotify.exe", "Spotify");
    state.windows.push(stray);
    const before = state.windows.map((w) => ({ hwnd: w.hwnd, rect: { ...w.rect }, state: w.state }));
    for (const w of state.windows) if (w.exe === CODE) w.rect = { x: 1, y: 1, w: 400, h: 400 };
    const moved = state.windows.map((w) => ({ hwnd: w.hwnd, rect: { ...w.rect }, state: w.state }));

    const report = await restoreSave(ports, saved.save, { tidy: true });
    expect(state.minimised).toEqual([stray.hwnd]);

    await undoRestore(ports, report.undo);
    expect(state.windows.map((w) => ({ hwnd: w.hwnd, rect: w.rect, state: w.state }))).toEqual(moved);
    expect(state.windows).toHaveLength(before.length);
  });
});
