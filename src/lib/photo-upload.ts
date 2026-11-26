// The admin photo upload (POST /admin/products/{slug}/photos/) and the photo actions posted to the edit page
// (move, remove, alt). No Astro imports, so tests run them against Miniflare D1 and R2 and a fake purger.
// See docs/slice-3-plan.md, "The upload request (server)".

import { productPurgeTags, purgeTags, type Purger } from './cache-purge';
import { imageInfo, type ImageInfo } from './image-info';
import { MAX_PHOTOS, UPLOAD_MAX_BYTES, renditionMaxBytes, renditionSides, scaledSize, type PhotoFormat } from './photo-sizes';
import {
  addPhoto,
  cleanAlt,
  deleteObjects,
  movePhoto,
  photoHash,
  removePhoto,
  removePhotoRows,
  reorderPhotos,
  setPhotoAlt,
  type Photo,
  type PhotoActionResult,
} from './photos';

/** A checked upload: its renditions, smallest first, all of one format. */
export type CheckedUpload = {
  format: PhotoFormat;
  /** Of the largest rendition. */
  width: number;
  height: number;
  alt: string;
  renditions: { side: number; bytes: Uint8Array<ArrayBuffer> }[];
};

export type UploadCheck = { ok: true; value: CheckedUpload } | { ok: false; error: string };

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/**
 * Checks the posted renditions (form field `rendition`, 1–3 files) and alt text. Formats and sizes come from
 * the files' bytes, never from their names or the types the browser claims.
 */
export async function checkUpload(form: FormData): Promise<UploadCheck> {
  const files = form.getAll('rendition').filter((f): f is File => typeof f !== 'string');
  if (files.length < 1 || files.length > 3) return { ok: false, error: 'Send 1 to 3 renditions of one photo.' };
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > UPLOAD_MAX_BYTES) return { ok: false, error: `The upload is ${kb(total)}; the most is ${kb(UPLOAD_MAX_BYTES)}.` };

  const alt = cleanAlt(String(form.get('alt') ?? ''));
  if (alt === null) return { ok: false, error: 'Alt text can be at most 200 characters.' };

  const read: { bytes: Uint8Array<ArrayBuffer>; info: ImageInfo }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = imageInfo(bytes);
    if (!info) return { ok: false, error: 'Only WebP and JPEG files can be uploaded.' };
    if (info.exif) return { ok: false, error: 'This file still has camera data (EXIF) in it. Upload it through the Photos section.' };
    read.push({ bytes, info });
  }
  const format = read[0].info.format;
  if (read.some((r) => r.info.format !== format)) return { ok: false, error: 'All renditions of a photo must have the same format.' };

  const longSide = (r: (typeof read)[number]) => Math.max(r.info.width, r.info.height);
  read.sort((a, b) => longSide(a) - longSide(b));
  const largest = read[read.length - 1].info;
  const expected = renditionSides(longSide(read[read.length - 1]));
  if (!expected) return { ok: false, error: 'Photo too small (at least 400 px on the long side).' };
  if (expected.length !== read.length || read.some((r, i) => longSide(r) !== expected[i])) {
    return { ok: false, error: `Expected renditions with long sides ${expected.join(', ')} px; got ${read.map(longSide).join(', ')} px.` };
  }
  for (const r of read) {
    const side = longSide(r);
    // Same aspect ratio as the largest: its dimensions scaled to this side, give or take a pixel of rounding.
    const want = scaledSize(largest.width, largest.height, side);
    if (Math.abs(want.width - r.info.width) > 1 || Math.abs(want.height - r.info.height) > 1) {
      return { ok: false, error: 'The renditions don’t have the same proportions.' };
    }
    const cap = renditionMaxBytes(side);
    if (r.bytes.length > cap) return { ok: false, error: `The ${side} px rendition is ${kb(r.bytes.length)}; the most is ${kb(cap)}.` };
  }
  return {
    ok: true,
    value: {
      format,
      width: largest.width,
      height: largest.height,
      alt,
      renditions: read.map((r) => ({ side: longSide(r), bytes: r.bytes })),
    },
  };
}

export type UploadResponse = { status: number; body: { ok: true; photo: Photo } | { ok: false; error: string } };

type ProductRef = { id: string; category: string };

/** Reads a product's id and category, or null if it doesn't exist. */
export const productRef = (db: D1Database, id: string) =>
  db.prepare('SELECT id, category FROM products WHERE id = ?').bind(id).first<ProductRef>();

/**
 * Handles an upload: the product exists, the request is at most 3 MB (by Content-Length, before reading it),
 * the renditions pass checkUpload, then addPhoto (cap and duplicate checks, R2 then D1). Purges the product's
 * pages after a successful upload.
 */
export async function handleUpload(
  db: D1Database,
  bucket: R2Bucket,
  purger: Purger | undefined,
  productId: string,
  request: Request,
): Promise<UploadResponse> {
  const product = await productRef(db, productId);
  if (!product) return { status: 404, body: { ok: false, error: 'This product no longer exists.' } };
  // Multipart adds a little around the files; the files themselves are checked against the exact cap below.
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > UPLOAD_MAX_BYTES + 64 * 1024) return { status: 413, body: { ok: false, error: `The upload is larger than ${kb(UPLOAD_MAX_BYTES)}.` } };
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { status: 400, body: { ok: false, error: 'Invalid upload.' } };
  }
  const checked = await checkUpload(form);
  if (!checked.ok) return { status: 422, body: checked };
  const { value } = checked;
  const result = await addPhoto(db, bucket, {
    productId,
    hash: await photoHash(value.renditions[value.renditions.length - 1].bytes),
    format: value.format,
    width: value.width,
    height: value.height,
    alt: value.alt,
    renditions: value.renditions,
  });
  if (!result.ok) return { status: 409, body: result };
  await purgeTags(purger, productPurgeTags(product));
  return { status: 201, body: result };
}

export type PhotoAction = 'photo-move' | 'photo-remove' | 'photo-alt';
export const isPhotoAction = (action: unknown): action is PhotoAction =>
  action === 'photo-move' || action === 'photo-remove' || action === 'photo-alt';

/**
 * Applies a photo action posted to the edit page (fields `photo`, and `direction` up|down or `alt`). Purges
 * the product's pages when something changed.
 */
export async function handlePhotoAction(
  db: D1Database,
  bucket: R2Bucket,
  purger: Purger | undefined,
  product: ProductRef,
  action: PhotoAction,
  form: FormData,
): Promise<PhotoActionResult> {
  const photoId = String(form.get('photo') ?? '');
  let result: PhotoActionResult;
  if (action === 'photo-move') {
    const direction = form.get('direction');
    if (direction !== 'up' && direction !== 'down') return { ok: false, error: 'Invalid request. Nothing was changed.' };
    result = await movePhoto(db, product.id, photoId, direction === 'up' ? -1 : 1);
  } else if (action === 'photo-remove') {
    result = await removePhoto(db, bucket, product.id, photoId);
  } else {
    result = await setPhotoAlt(db, product.id, photoId, String(form.get('alt') ?? ''));
  }
  if (result.ok) await purgeTags(purger, productPurgeTags(product));
  return result;
}


// ---- JSON photo actions (the Photos section with JavaScript; no page reload) -------------------------------
// POST /admin/products/{slug}/photos/{remove|order|alt}/ with a small JSON body. The middleware has already
// checked Cloudflare Access and the Origin. See docs/slice-4-plan.md, items 2 and 3.

export type JsonPhotoAction = 'remove' | 'order' | 'alt';
export const isJsonPhotoAction = (action: unknown): action is JsonPhotoAction =>
  action === 'remove' || action === 'order' || action === 'alt';

export type JsonActionResponse = { status: number; body: { ok: true; removed?: string[] } | { ok: false; error: string } };

/** Largest JSON body accepted: 12 photo ids or 200 characters of alt text fit many times over. */
const JSON_MAX_BYTES = 8 * 1024;
const INVALID = 'Invalid request. Nothing was changed.';
const bad = (error = INVALID): JsonActionResponse => ({ status: 400, body: { ok: false, error } });

const isPhotoId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const photoIdList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length >= 1 && v.length <= MAX_PHOTOS && v.every(isPhotoId) ? v : null;

/**
 * Handles a JSON photo action. `waitUntil` keeps work going after the answer is sent (or the browser has gone):
 * after a remove, the R2 delete and the purge run there, so a dropped connection after D1 has changed still
 * deletes the files.
 * - remove `{ photos: [ids] }`: D1 first (rows and position gap in one batch), then R2 best-effort. Ids already
 *   gone count as removed, so the same request can safely arrive twice.
 * - order `{ photos: [ids] }`: exactly the product's photos in the new order, or nothing changes (409).
 * - alt `{ photo, alt }`.
 */
export async function handleJsonPhotoAction(
  db: D1Database,
  bucket: R2Bucket,
  purger: Purger | undefined,
  productId: string,
  action: JsonPhotoAction,
  request: Request,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<JsonActionResponse> {
  if (Number(request.headers.get('Content-Length') ?? 0) > JSON_MAX_BYTES) return bad();
  const product = await productRef(db, productId);
  if (!product) return { status: 404, body: { ok: false, error: 'This product no longer exists.' } };
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > JSON_MAX_BYTES) return bad();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad();
    body = parsed as Record<string, unknown>;
  } catch {
    return bad();
  }

  if (action === 'remove') {
    const ids = photoIdList(body.photos);
    if (!ids) return bad();
    const { removed, objectKeys } = await removePhotoRows(db, product.id, ids);
    if (removed.length) waitUntil(Promise.all([deleteObjects(bucket, objectKeys), purgeTags(purger, productPurgeTags(product))]));
    return { status: 200, body: { ok: true, removed } };
  }

  let result: PhotoActionResult;
  if (action === 'order') {
    const ids = photoIdList(body.photos);
    if (!ids) return bad();
    result = await reorderPhotos(db, product.id, ids);
  } else {
    if (!isPhotoId(body.photo) || typeof body.alt !== 'string') return bad();
    result = await setPhotoAlt(db, product.id, body.photo, body.alt);
    if (!result.ok && result.error.startsWith('Alt text')) return { status: 422, body: result };
  }
  if (!result.ok) return { status: 409, body: result };
  await purgeTags(purger, productPurgeTags(product));
  return { status: 200, body: { ok: true } };
}
