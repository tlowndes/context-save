import { describe, expect, it } from "vitest";
import { lnkTarget } from "../../src/core/lnk";

/** Builds a minimal shortcut: header, optional ID list, then LinkInfo with a local path. */
function shortcut(path: string, opts: { unicode?: boolean; idList?: boolean; suffix?: string } = {}): Uint8Array {
  const bytes: number[] = [];
  const u32 = (n: number) => bytes.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
  const u16 = (n: number) => bytes.push(n & 255, (n >> 8) & 255);
  // Header: size, CLSID (16), flags, then padding to 0x4C.
  u32(0x4c);
  for (let i = 0; i < 16; i++) bytes.push(0);
  u32((opts.idList ? 1 : 0) | 2);
  while (bytes.length < 0x4c) bytes.push(0);
  if (opts.idList) {
    u16(4);
    bytes.push(9, 9, 9, 9);
  }
  const start = bytes.length;
  const headerSize = opts.unicode ? 0x24 : 0x1c;
  const volume = [16, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0];
  const ascii = [...path].map((c) => c.charCodeAt(0)).concat(0);
  const suffixA = [...(opts.suffix ?? "")].map((c) => c.charCodeAt(0)).concat(0);
  const wide = [...path].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]).concat(0, 0);
  const suffixW = [...(opts.suffix ?? "")].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]).concat(0, 0);
  const volumeOffset = headerSize;
  const localOffset = volumeOffset + volume.length;
  const suffixOffset = localOffset + ascii.length;
  const localW = suffixOffset + suffixA.length;
  const suffixWOffset = localW + wide.length;
  const total = opts.unicode ? suffixWOffset + suffixW.length : suffixOffset + suffixA.length;
  u32(total);
  u32(headerSize);
  u32(1);
  u32(volumeOffset);
  u32(localOffset);
  u32(0);
  u32(suffixOffset);
  if (opts.unicode) {
    u32(localW);
    u32(suffixWOffset);
  }
  bytes.push(...volume, ...ascii, ...suffixA);
  if (opts.unicode) bytes.push(...wide, ...suffixW);
  expect(bytes.length - start).toBe(total);
  return new Uint8Array(bytes);
}

describe("lnkTarget", () => {
  it("reads a local path", () => {
    expect(lnkTarget(shortcut("C:\\Users\\tom\\Documents\\Brief.docx"))).toBe("C:\\Users\\tom\\Documents\\Brief.docx");
  });
  it("skips the ID list", () => {
    expect(lnkTarget(shortcut("D:\\Work\\Deck.pptx", { idList: true }))).toBe("D:\\Work\\Deck.pptx");
  });
  it("prefers the Unicode path when there is one", () => {
    expect(lnkTarget(shortcut("C:\\Users\\tom\\Café notes.docx", { unicode: true }))).toBe("C:\\Users\\tom\\Café notes.docx");
  });
  it("adds the path suffix", () => {
    expect(lnkTarget(shortcut("C:\\", { suffix: "Budget.xlsx" }))).toBe("C:\\Budget.xlsx");
  });
  it("returns null for junk", () => {
    expect(lnkTarget(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(lnkTarget(new Uint8Array(0x60))).toBeNull();
  });
});
