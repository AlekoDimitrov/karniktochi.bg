// Product photos: rows in D1 (product_photos, migrations/0003) and files in R2 (binding MEDIA). No Astro
// imports here, so tests can run it against a plain D1 and R2.
//
// Rules (docs/slice-3-plan.md):
// - A photo's renditions are R2 objects {key}-{side}.webp (or .jpg); keys never change, so the objects are
//   immutable.
// - The product id is in the key, so the same picture on two products is two separate sets of objects.
// - Positions are 0..n-1 without gaps; 0 is the main photo. At most MAX_PHOTOS per product.
// - Photo changes don't touch the product's updated_at, so they never trip the edit form's conflict check.
// - Objects are put before the row is inserted and deleted after the row is gone (best-effort: a failed R2
//   delete never fails the request; the leftover keys are logged). Orphans are harmless: nothing links to them.

import { ALT_MAX, FORMAT_EXTENSION, FORMAT_MIME, MAX_PHOTOS, scaledSize, type PhotoFormat } from './photo-sizes';

export type Photo = {
  id: string;
  productId: string;
  position: number;
  key: string;
  format: PhotoFormat;
  /** Long sides of the stored renditions, smallest first. */
  sizes: number[];
  alt: string;
  /** Of the largest rendition. */
  width: number;
  height: number;
};

export type PhotoRow = {
  id: string;
  product_id: string;
  position: number;
  key: string;
  format: PhotoFormat;
  sizes: string;
  alt: string;
  width: number;
  height: number;
};

export const toPhoto = (r: PhotoRow): Photo => ({
  id: r.id,
  productId: r.product_id,
  position: r.position,
  key: r.key,
  format: r.format,
  sizes: r.sizes.split(',').map(Number),
  alt: r.alt,
  width: r.width,
  height: r.height,
});

export const PHOTO_COLUMNS = 'ph.id, ph.product_id, ph.position, ph.key, ph.format, ph.sizes, ph.alt, ph.width, ph.height';

/** Rendition objects are stored for a year and never change. */
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The R2 key of one rendition. */
export const renditionKey = (key: string, side: number, format: PhotoFormat) => `${key}-${side}.${FORMAT_EXTENSION[format]}`;

/** The R2 key prefix of a photo: products/{productId}/{hash}. */
export const photoKey = (productId: string, hash: string) => `products/${productId}/${hash}`;

/** The first 16 hex characters of the SHA-256 of `bytes`. */
export async function photoHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- URLs ---------------------------------------------------------------------------------------

/** The URL of one rendition: MEDIA_BASE_URL + '/' + its key. */
export const photoUrl = (base: string, photo: Pick<Photo, 'key' | 'format'>, side: number) =>
  `${base.replace(/\/+$/, '')}/${renditionKey(photo.key, side, photo.format)}`;

/** `srcset` for the photo's stored renditions, at most `maxSide` (each with its real width). */
export function photoSrcset(base: string, photo: Photo, maxSide = Infinity): string {
  const sides = photo.sizes.filter((s) => s <= maxSide);
  return (sides.length ? sides : photo.sizes.slice(0, 1))
    .map((side) => `${photoUrl(base, photo, side)} ${scaledSize(photo.width, photo.height, side).width}w`)
    .join(', ');
}

/** The largest stored rendition that is at most `maxSide` (the smallest one if none is). */
export function photoSide(photo: Photo, maxSide: number): number {
  return [...photo.sizes].reverse().find((s) => s <= maxSide) ?? photo.sizes[0];
}

/** Width and height of one rendition. */
export const renditionSize = (photo: Photo, side: number) => scaledSize(photo.width, photo.height, side);

/**
 * og:image for a product page: its largest rendition (at most 1800), or undefined without a photo or when
 * `base` isn't an absolute http(s) URL (local dev's /dev-media), since social sites need a full address.
 */
export function ogImage(base: string, photo: Photo | undefined): { url: string; width: number; height: number } | undefined {
  if (!photo || !/^https?:\/\//.test(base)) return undefined;
  const side = photoSide(photo, 1800);
  return { url: photoUrl(base, photo, side), ...renditionSize(photo, side) };
}

// ---- Reading ------------------------------------------------------------------------------------

/** A product's photos in position order. */
export async function listPhotos(db: D1Database, productId: string): Promise<Photo[]> {
  const rows = await db
    .prepare(`SELECT ${PHOTO_COLUMNS} FROM product_photos ph WHERE ph.product_id = ? ORDER BY ph.position, ph.id`)
    .bind(productId)
    .all<PhotoRow>();
  return rows.results.map(toPhoto);
}

/** Groups photo rows by product, keeping their order. */
export function photosByProduct(rows: PhotoRow[]): Map<string, Photo[]> {
  const out = new Map<string, Photo[]>();
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    list.push(toPhoto(r));
    out.set(r.product_id, list);
  }
  return out;
}

// ---- Writing ------------------------------------------------------------------------------------

export type PhotoUpload = {
  productId: string;
  /** photoHash() of the largest rendition. */
  hash: string;
  format: PhotoFormat;
  /** Of the largest rendition. */
  width: number;
  height: number;
  alt: string;
  /** Smallest first. */
  renditions: { side: number; bytes: Uint8Array<ArrayBuffer> }[];
};

export type PhotoResult = { ok: true; photo: Photo } | { ok: false; error: string };

const NO_PRODUCT = 'This product no longer exists.';
const FULL = `This product already has ${MAX_PHOTOS} photos, the most it can have. Remove one first.`;
const DUPLICATE = 'This photo is already on this product.';

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
export const newPhotoId = () => `ph_${randomId()}`;

/** Alt text as stored: trimmed, line breaks and runs of spaces as one space. Null if longer than ALT_MAX. */
export function cleanAlt(value: string): string | null {
  const alt = value.replace(/\s+/g, ' ').trim();
  return [...alt].length > ALT_MAX ? null : alt;
}

/**
 * Adds a photo at the end of the product's photos: puts its renditions in R2, then inserts the row. The
 * insert itself checks again that the product exists and has room, so two uploads at once can't pass the
 * cap; if it refuses, the objects just put are deleted (unless an existing photo of the product uses them).
 */
export async function addPhoto(db: D1Database, bucket: R2Bucket, upload: PhotoUpload): Promise<PhotoResult> {
  const key = photoKey(upload.productId, upload.hash);
  const [product, count, duplicate] = await db.batch([
    db.prepare('SELECT 1 AS yes FROM products WHERE id = ?').bind(upload.productId),
    db.prepare('SELECT COUNT(*) AS n FROM product_photos WHERE product_id = ?').bind(upload.productId),
    db.prepare('SELECT 1 AS yes FROM product_photos WHERE product_id = ? AND key = ?').bind(upload.productId, key),
  ]);
  if (!product.results.length) return { ok: false, error: NO_PRODUCT };
  if ((count.results[0] as { n: number }).n >= MAX_PHOTOS) return { ok: false, error: FULL };
  if (duplicate.results.length) return { ok: false, error: DUPLICATE };

  const objectKeys = upload.renditions.map((r) => renditionKey(key, r.side, upload.format));
  await Promise.all(
    upload.renditions.map((r, i) =>
      bucket.put(objectKeys[i], r.bytes, { httpMetadata: { contentType: FORMAT_MIME[upload.format], cacheControl: PHOTO_CACHE_CONTROL } }),
    ),
  );

  const id = newPhotoId();
  const sizes = upload.renditions.map((r) => r.side).join(',');
  let position: number | null = null;
  let error = FULL;
  try {
    const result = await db
      .prepare(
        `INSERT INTO product_photos (id, product_id, position, key, format, sizes, alt, width, height)
         SELECT ?1, p.id, (SELECT COUNT(*) FROM product_photos WHERE product_id = p.id), ?2, ?8, ?3, ?4, ?5, ?6
         FROM products p WHERE p.id = ?7 AND (SELECT COUNT(*) FROM product_photos WHERE product_id = p.id) < ${MAX_PHOTOS}
         RETURNING position`,
      )
      .bind(id, key, sizes, upload.alt, upload.width, upload.height, upload.productId, upload.format)
      .all<{ position: number }>();
    position = result.results[0]?.position ?? null;
  } catch (e) {
    if (!/UNIQUE constraint failed: product_photos\.product_id, product_photos\.key/.test(String((e as Error)?.message ?? e))) {
      await deleteObjectsUnlessUsed(db, bucket, upload.productId, key, objectKeys);
      throw e;
    }
    error = DUPLICATE;
  }
  if (position === null) {
    await deleteObjectsUnlessUsed(db, bucket, upload.productId, key, objectKeys);
    if (error !== DUPLICATE) {
      const exists = await db.prepare('SELECT 1 AS yes FROM products WHERE id = ?').bind(upload.productId).first('yes');
      if (!exists) error = NO_PRODUCT;
    }
    return { ok: false, error };
  }
  return {
    ok: true,
    photo: { id, productId: upload.productId, position, key, format: upload.format, sizes: upload.renditions.map((r) => r.side), alt: upload.alt, width: upload.width, height: upload.height },
  };
}

// The same picture uploaded twice at once gives the same keys: the upload that lost must not delete the objects
// of the one that won.
async function deleteObjectsUnlessUsed(db: D1Database, bucket: R2Bucket, productId: string, key: string, objectKeys: string[]) {
  const used = await db.prepare('SELECT 1 AS yes FROM product_photos WHERE product_id = ? AND key = ?').bind(productId, key).first('yes');
  if (!used) await deleteObjects(bucket, objectKeys);
}

/** Deletes R2 objects. A failure is logged, never thrown: nothing links to them any more. */
export async function deleteObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await bucket.delete(keys);
  } catch (e) {
    console.error('R2 delete failed; these objects are left as orphans:', keys, e);
  }
}

/** The R2 keys of every rendition of these photos. */
export const objectKeysOf = (photos: Pick<Photo, 'key' | 'format' | 'sizes'>[]) =>
  photos.flatMap((p) => p.sizes.map((s) => renditionKey(p.key, s, p.format)));

// Renumbers a product's photos 0..n-1 in their current order (closes the gap a removed photo leaves).
const renumber = (db: D1Database, productId: string) =>
  db
    .prepare(
      `UPDATE product_photos SET position = (
         SELECT COUNT(*) FROM product_photos q WHERE q.product_id = product_photos.product_id
           AND (q.position < product_photos.position OR (q.position = product_photos.position AND q.id < product_photos.id)))
       WHERE product_id = ?`,
    )
    .bind(productId);

export type PhotoActionResult = { ok: true } | { ok: false; error: string };

const GONE = 'That photo is no longer on this product. Reload the page.';

async function getPhoto(db: D1Database, productId: string, photoId: string): Promise<Photo | null> {
  const row = await db
    .prepare(`SELECT ${PHOTO_COLUMNS} FROM product_photos ph WHERE ph.id = ? AND ph.product_id = ?`)
    .bind(photoId, productId)
    .first<PhotoRow>();
  return row ? toPhoto(row) : null;
}

/** Removes a photo: the row and the position gap in one batch, then its R2 objects. */
export async function removePhoto(db: D1Database, bucket: R2Bucket, productId: string, photoId: string): Promise<PhotoActionResult> {
  const photo = await getPhoto(db, productId, photoId);
  if (!photo) return { ok: false, error: GONE };
  await db.batch([db.prepare('DELETE FROM product_photos WHERE id = ? AND product_id = ?').bind(photoId, productId), renumber(db, productId)]);
  await deleteObjects(bucket, objectKeysOf([photo]));
  return { ok: true };
}

/** Swaps a photo with the one before it (-1) or after it (+1). At either end nothing changes. */
export async function movePhoto(db: D1Database, productId: string, photoId: string, direction: -1 | 1): Promise<PhotoActionResult> {
  const photos = await listPhotos(db, productId);
  const i = photos.findIndex((p) => p.id === photoId);
  if (i < 0) return { ok: false, error: GONE };
  const other = photos[i + direction];
  if (!other) return { ok: true };
  // Both rows change, or neither if either moved since they were read (the subquery runs once, before the update).
  await db
    .prepare(
      `UPDATE product_photos SET position = CASE id WHEN ?1 THEN ?4 ELSE ?3 END
       WHERE product_id = ?5 AND id IN (?1, ?2)
         AND (SELECT COUNT(*) FROM product_photos WHERE (id = ?1 AND position = ?3) OR (id = ?2 AND position = ?4)) = 2`,
    )
    .bind(photoId, other.id, photos[i].position, other.position, productId)
    .run();
  return { ok: true };
}

/** Sets a photo's alt text (see cleanAlt). */
export async function setPhotoAlt(db: D1Database, productId: string, photoId: string, value: string): Promise<PhotoActionResult> {
  const alt = cleanAlt(value);
  if (alt === null) return { ok: false, error: `Alt text can be at most ${ALT_MAX} characters.` };
  const result = await db.prepare('UPDATE product_photos SET alt = ? WHERE id = ? AND product_id = ?').bind(alt, photoId, productId).run();
  return result.meta.changes === 1 ? { ok: true } : { ok: false, error: GONE };
}
