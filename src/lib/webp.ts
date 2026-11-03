// WebP files are checked by their bytes, never by their name or the type the browser claims. The width and
// height come from the file's own header (https://developers.google.com/speed/webp/docs/riff_container).

export type WebpInfo = { width: number; height: number };

const ascii = (b: Uint8Array, at: number, text: string) => [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u32 = (b: Uint8Array, at: number) => (u24(b, at) | (b[at + 3] << 24)) >>> 0;

/**
 * The dimensions of a WebP file, or null if it isn't one: `RIFF` at 0 with the file's length, `WEBP` at 8,
 * and a `VP8 ` (lossy), `VP8L` (lossless) or `VP8X` (extended) chunk at 12 with a valid header.
 */
export function webpInfo(bytes: Uint8Array): WebpInfo | null {
  if (bytes.length < 30 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return null;
  // The RIFF size counts everything after its own 8 bytes; a truncated (or padded) file doesn't match.
  if (u32(bytes, 4) + 8 !== bytes.length) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (u32(bytes, 16) + 20 > bytes.length) return null;
  let info: WebpInfo;
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), then the key frame start code 9d 01 2a and two 14-bit dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    info = { width: u16(bytes, 26) & 0x3fff, height: u16(bytes, 28) & 0x3fff };
  } else if (chunk === 'VP8L') {
    // Signature 0x2f, then width - 1 and height - 1 in 14 bits each.
    if (bytes[20] !== 0x2f) return null;
    const bits = u32(bytes, 21);
    info = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  } else if (chunk === 'VP8X') {
    // Flags (4 bytes), then canvas width - 1 and height - 1 in 24 bits each.
    info = { width: u24(bytes, 24) + 1, height: u24(bytes, 27) + 1 };
  } else {
    return null;
  }
  return info.width > 0 && info.height > 0 ? info : null;
}
