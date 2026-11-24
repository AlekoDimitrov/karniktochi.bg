// The format and dimensions of an uploaded rendition, read from its bytes (src/lib/webp.ts, src/lib/jpeg.ts).

import { jpegInfo } from './jpeg';
import type { PhotoFormat } from './photo-sizes';
import { webpHasExif, webpInfo } from './webp';

export type ImageInfo = { format: PhotoFormat; width: number; height: number; /** Carries EXIF data. */ exif: boolean };

/** WebP or JPEG by magic bytes, with dimensions from the file's header; null for anything else. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const webp = webpInfo(bytes);
  if (webp) return { format: 'webp', ...webp, exif: webpHasExif(bytes) };
  const jpeg = jpegInfo(bytes);
  if (jpeg) return { format: 'jpeg', ...jpeg };
  return null;
}
