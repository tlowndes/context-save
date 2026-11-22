import { describe, expect, it } from "vitest";
import { clampInto, fitWindow } from "../../src/core/fit";
import { LAPTOP, MAIN, SIDE } from "../fakes";

describe("fitWindow", () => {
  it("puts a window exactly back on the same screen", () => {
    const rect = { x: 1280, y: 0, w: 1280, h: 1392 };
    expect(fitWindow(rect, MAIN.id, [MAIN, SIDE], [MAIN, SIDE])).toEqual({ rect, monitor: MAIN.id, adjusted: false });
  });

  it("keeps the right half on the right half of a smaller screen", () => {
    const fit = fitWindow({ x: 1280, y: 0, w: 1280, h: 1392 }, MAIN.id, [MAIN], [LAPTOP]);
    expect(fit.rect).toEqual({ x: 960, y: 0, w: 960, h: 1152 });
    expect(fit.adjusted).toBe(true);
  });

  it("moves a window from an unplugged second screen onto the remaining one", () => {
    const fit = fitWindow({ x: 2660, y: 100, w: 800, h: 600 }, SIDE.id, [MAIN, SIDE], [LAPTOP]);
    expect(fit.monitor).toBe(LAPTOP.id);
    expect(fit.rect.x).toBeGreaterThanOrEqual(0);
    expect(fit.rect.x + fit.rect.w).toBeLessThanOrEqual(1920);
    expect(fit.adjusted).toBe(true);
  });

  it("pulls a window back on screen if it hung off the edge", () => {
    const fit = fitWindow({ x: 2400, y: 1300, w: 800, h: 600 }, MAIN.id, [MAIN], [MAIN]);
    expect(fit.rect).toEqual({ x: 1760, y: 792, w: 800, h: 600 });
    expect(fit.adjusted).toBe(true);
  });
});

describe("clampInto", () => {
  it("shrinks what is too big", () => {
    expect(clampInto({ x: -50, y: -50, w: 5000, h: 5000 }, { x: 0, y: 0, w: 100, h: 80 })).toEqual({ x: 0, y: 0, w: 100, h: 80 });
  });
});
