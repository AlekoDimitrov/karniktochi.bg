import type { PhotoUpload } from '../src/lib/photos';
import { photoHash } from '../src/lib/photos';
import { renditionSides, scaledSize } from '../src/lib/photo-sizes';

/**
 * A lossless WebP file of `width` × `height` with a valid header, padded to `bytes` (at least 30). Only the
 * header is real; nothing here decodes the pixels. `seed` changes the padding, so the hash differs.
 */
export function fakeWebp(width: number, height: number, bytes = 64, seed = 0): Uint8Array {
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

/** The renditions the browser would make of a `width` × `height` photo, as fake WebP files. */
export function renditionsOf(width: number, height: number, seed = 0) {
  const sides = renditionSides(Math.max(width, height));
  if (!sides) throw new Error('too small');
  return sides.map((side) => {
    const size = scaledSize(width, height, side);
    return { side, ...size, bytes: fakeWebp(size.width, size.height, 64, seed) };
  });
}

/** A valid upload for `productId` of a `width` × `height` photo. */
export async function uploadOf(productId: string, { width = 2400, height = 1200, seed = 0, alt = '' } = {}): Promise<PhotoUpload> {
  const renditions = renditionsOf(width, height, seed);
  const largest = renditions[renditions.length - 1];
  return {
    productId,
    hash: await photoHash(largest.bytes),
    width: largest.width,
    height: largest.height,
    alt,
    renditions: renditions.map((r) => ({ side: r.side, bytes: r.bytes })),
  };
}
