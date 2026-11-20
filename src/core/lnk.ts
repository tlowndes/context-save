/**
 * Reads the target path out of a Windows shortcut (.lnk) file.
 *
 * Office only shows a file's name in its title bar, not where it lives. Windows
 * keeps a shortcut to every recently opened file in `%APPDATA%\Microsoft\Windows\Recent`,
 * named after the file, so "Brief.docx - Word" can be traced back to
 * `Recent\Brief.docx.lnk` and from there to the real path.
 *
 * Format: [MS-SHLLINK]. Only the parts needed for a local or network path are read.
 */

const HEADER_SIZE = 0x4c;
const HAS_ID_LIST = 0x1;
const HAS_LINK_INFO = 0x2;
const VOLUME_AND_LOCAL_PATH = 0x1;
const NETWORK_AND_PATH_SUFFIX = 0x2;

function cString(bytes: Uint8Array, at: number): string {
  let end = at;
  while (end < bytes.length && bytes[end] !== 0) end++;
  // Windows code page text: ASCII-safe is all we rely on for paths here.
  return new TextDecoder("latin1").decode(bytes.subarray(at, end));
}

function wString(bytes: Uint8Array, at: number): string {
  let end = at;
  while (end + 1 < bytes.length && (bytes[end] !== 0 || bytes[end + 1] !== 0)) end += 2;
  return new TextDecoder("utf-16le").decode(bytes.subarray(at, end));
}

const join = (base: string, suffix: string) =>
  !suffix ? base : base.endsWith("\\") ? base + suffix : `${base}\\${suffix}`;

/** The target path of a shortcut, or null if it has none (e.g. a shortcut to Control Panel). */
export function lnkTarget(bytes: Uint8Array): string | null {
  if (bytes.length < HEADER_SIZE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== HEADER_SIZE) return null;
  const flags = view.getUint32(0x14, true);
  let at = HEADER_SIZE;
  if (flags & HAS_ID_LIST) {
    if (at + 2 > bytes.length) return null;
    at += 2 + view.getUint16(at, true);
  }
  if (!(flags & HAS_LINK_INFO) || at + 28 > bytes.length) return null;

  const info = at;
  const headerSize = view.getUint32(info + 4, true);
  const infoFlags = view.getUint32(info + 8, true);
  const localOffset = view.getUint32(info + 16, true);
  const networkOffset = view.getUint32(info + 20, true);
  const suffixOffset = view.getUint32(info + 24, true);
  const unicode = headerSize >= 0x24 && info + 36 <= bytes.length;
  const localOffsetW = unicode ? view.getUint32(info + 28, true) : 0;
  const suffixOffsetW = unicode ? view.getUint32(info + 32, true) : 0;

  const suffix = suffixOffsetW ? wString(bytes, info + suffixOffsetW) : suffixOffset ? cString(bytes, info + suffixOffset) : "";

  if (infoFlags & VOLUME_AND_LOCAL_PATH) {
    const base = localOffsetW ? wString(bytes, info + localOffsetW) : cString(bytes, info + localOffset);
    return base ? join(base, suffix) : null;
  }
  if (infoFlags & NETWORK_AND_PATH_SUFFIX && networkOffset) {
    // CommonNetworkRelativeLink: size, flags, NetNameOffset, DeviceNameOffset, provider type, then names.
    const net = info + networkOffset;
    const netNameOffset = view.getUint32(net + 8, true);
    const netNameOffsetW = netNameOffset > 0x14 ? view.getUint32(net + 20, true) : 0;
    const share = netNameOffsetW ? wString(bytes, net + netNameOffsetW) : cString(bytes, net + netNameOffset);
    return share ? join(share, suffix) : null;
  }
  return null;
}
