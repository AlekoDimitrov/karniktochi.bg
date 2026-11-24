// Photo sizes and limits, shared by the admin's upload script (in the browser) and the server's checks.
// No imports, so the browser bundle stays small. See docs/slice-3-plan.md.

/** Long sides, in pixels, of the renditions made from each photo. */
export const RENDITION_SIDES = [400, 900, 1800] as const;
/** Photos with a shorter long side are refused. */
export const MIN_LONG_SIDE = 400;
/** WebP quality used by the browser's encoder. */
export const WEBP_QUALITY = 0.82;
/** JPEG quality, used when the browser can't encode WebP (Safari). */
export const JPEG_QUALITY = 0.85;

/** Every rendition of one photo has the same format. */
export type PhotoFormat = 'webp' | 'jpeg';
export const PHOTO_FORMATS: readonly PhotoFormat[] = ['webp', 'jpeg'];
export const FORMAT_EXTENSION: Record<PhotoFormat, string> = { webp: 'webp', jpeg: 'jpg' };
export const FORMAT_MIME: Record<PhotoFormat, string> = { webp: 'image/webp', jpeg: 'image/jpeg' };
/** Most photos one product can have. */
export const MAX_PHOTOS = 12;
/** Longest alt text. */
export const ALT_MAX = 200;
/** Largest upload request (all renditions and the alt text). */
export const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

/** Largest file for a rendition with this long side: up to 400 → 200 KB, up to 900 → 600 KB, else 1.5 MB. */
export const renditionMaxBytes = (side: number) => (side <= 400 ? 200 : side <= 900 ? 600 : 1536) * 1024;

/**
 * The long sides to make for a photo whose long side is `longSide`, smallest first, never upscaling: every
 * standard side below it, then the photo's own side capped at 1800 (1,200 → 400, 900, 1,200). Null if the
 * photo is too small.
 */
export function renditionSides(longSide: number): number[] | null {
  if (longSide < MIN_LONG_SIDE) return null;
  const top = Math.min(longSide, RENDITION_SIDES[RENDITION_SIDES.length - 1]);
  return [...RENDITION_SIDES.filter((s) => s < top), top];
}

/** Width and height of a `width` × `height` photo scaled so its long side is `side`. */
export function scaledSize(width: number, height: number, side: number): { width: number; height: number } {
  const scale = side / Math.max(width, height);
  return width >= height
    ? { width: side, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: side };
}
