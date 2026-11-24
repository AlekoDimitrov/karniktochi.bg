// JPEG files are checked by their bytes, never by their name or the type the browser claims. The width and
// height come from the frame header (SOF). Only the segments before the image data are read.

export type JpegInfo = { width: number; height: number; /** Has an APP1 Exif segment (camera data, GPS). */ exif: boolean };

const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];

// Frame headers that carry the dimensions: every SOFn except DHT (C4), JPG (C8) and DAC (CC).
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/**
 * The dimensions of a JPEG file, or null if it isn't one: `FF D8 FF` at 0, segments with valid lengths up to
 * a frame header, and `FF D9` (end of image) as the last two bytes, so a truncated upload is refused.
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  const n = bytes.length;
  if (n < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  if (bytes[n - 2] !== 0xff || bytes[n - 1] !== 0xd9) return null;
  let exif = false;
  let at = 2;
  while (at + 4 <= n) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    // Markers without a length: TEM and RST0–7. SOI again, EOI or SOS before a frame header: not a usable file.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) return null;
    const length = u16(bytes, at + 2);
    if (length < 2 || at + 2 + length > n) return null;
    if (marker === 0xe1 && length >= 8 && String.fromCharCode(...bytes.subarray(at + 4, at + 10)) === 'Exif\0\0') exif = true;
    if (isSof(marker)) {
      if (length < 7) return null;
      const height = u16(bytes, at + 5);
      const width = u16(bytes, at + 7);
      return width > 0 && height > 0 ? { width, height, exif } : null;
    }
    at += 2 + length;
  }
  return null;
}
