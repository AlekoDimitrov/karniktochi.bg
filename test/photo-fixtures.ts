import type { PhotoUpload } from '../src/lib/photos';
import { photoHash } from '../src/lib/photos';
import { renditionSides, scaledSize, type PhotoFormat } from '../src/lib/photo-sizes';

/**
 * A lossless WebP file of `width` × `height` with a valid header, padded to `bytes` (at least 30). Only the
 * header is real; nothing here decodes the pixels. `seed` changes the padding, so the hash differs.
 */
export function fakeWebp(width: number, height: number, bytes = 64, seed = 0): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(30, bytes + (bytes % 2)));
  const view = new DataView(out.buffer);
  out.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  view.setUint32(4, out.length - 8, true);
  out.set([...'WEBPVP8L'].map((c) => c.charCodeAt(0)), 8);
  view.setUint32(16, out.length - 20, true);
  out[20] = 0x2f;
  view.setUint32(21, ((width - 1) | ((height - 1) << 14)) >>> 0, true);
  for (let i = 25; i < out.length; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

/**
 * A JPEG file of `width` × `height` with valid segments (JFIF APP0, a baseline frame header) and an end marker,
 * padded to about `bytes`. Only the headers are real. `seed` changes the padding, so the hash differs.
 */
export function fakeJpeg(width: number, height: number, bytes = 64, seed = 0): Uint8Array<ArrayBuffer> {
  const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xff, 0xc0, 0, 11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0];
  const pad = Math.max(0, bytes - 2 - app0.length - sof.length - 4 - 2);
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0];
  const data = Array.from({ length: pad }, (_, i) => ((i * 31 + seed) & 0xff) === 0xff ? 0 : (i * 31 + seed) & 0xff);
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...sos, ...data, 0xff, 0xd9]);
}

/** The renditions the browser would make of a `width` × `height` photo, as fake WebP files. */
export function renditionsOf(width: number, height: number, seed = 0, format: PhotoFormat = 'webp') {
  const sides = renditionSides(Math.max(width, height));
  if (!sides) throw new Error('too small');
  return sides.map((side) => {
    const size = scaledSize(width, height, side);
    return { side, ...size, bytes: (format === 'webp' ? fakeWebp : fakeJpeg)(size.width, size.height, 64, seed) };
  });
}

/** A valid upload for `productId` of a `width` × `height` photo. */
export async function uploadOf(
  productId: string,
  { width = 2400, height = 1200, seed = 0, alt = '', format = 'webp' as PhotoFormat } = {},
): Promise<PhotoUpload> {
  const renditions = renditionsOf(width, height, seed, format);
  const largest = renditions[renditions.length - 1];
  return {
    productId,
    hash: await photoHash(largest.bytes),
    format,
    width: largest.width,
    height: largest.height,
    alt,
    renditions: renditions.map((r) => ({ side: r.side, bytes: r.bytes })),
  };
}
