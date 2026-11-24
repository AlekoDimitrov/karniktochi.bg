import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './d1';
import { addProduct, order, variantIds } from './catalog-fixtures';
import { uploadOf } from './photo-fixtures';
import { deleteDraftProduct } from '../src/lib/admin-products';
import { insertOrder } from '../src/lib/orders';
import {
  PHOTO_CACHE_CONTROL,
  addPhoto,
  listPhotos,
  movePhoto,
  objectKeysOf,
  photoSide,
  photoSrcset,
  photoUrl,
  removePhoto,
  setPhotoAlt,
  type Photo,
} from '../src/lib/photos';

let db: D1Database;
let bucket: R2Bucket;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, bucket, dispose } = await freshDb());
  await db.batch([db.prepare('DELETE FROM stock'), db.prepare('DELETE FROM variants'), db.prepare('DELETE FROM products')]);
});
afterEach(() => {
  vi.restoreAllMocks();
  return dispose();
});

/** Every object key in the bucket, sorted. */
const objects = async () => (await bucket.list()).objects.map((o) => o.key).sort();

/** Adds a photo and fails the test if it is refused. */
async function add(productId: string, opts: Parameters<typeof uploadOf>[1] = {}): Promise<Photo> {
  const r = await addPhoto(db, bucket, await uploadOf(productId, opts));
  if (!r.ok) throw new Error(r.error);
  return r.photo;
}

const positions = async (productId: string) => (await listPhotos(db, productId)).map((p) => [p.id, p.position]);

/**
 * A bucket whose delete() throws after recording which photo rows of `productId` still existed when it was
 * called, so a test can check that D1 was changed first.
 */
function failingDeleteBucket(productId: string) {
  const rowsAtDelete: number[] = [];
  const failing = new Proxy(bucket, {
    get(target, prop) {
      if (prop === 'delete') {
        return async () => {
          const n = await db.prepare('SELECT COUNT(*) AS n FROM product_photos WHERE product_id = ?').bind(productId).first<number>('n');
          rowsAtDelete.push(n ?? -1);
          throw new Error('R2 is down');
        };
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { failing: failing as R2Bucket, rowsAtDelete };
}

describe('adding photos', () => {
  it('adds the row at the end and puts its renditions with immutable Cache-Control', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const first = await add(id);
    const second = await add(id, { width: 1200, height: 600, seed: 1, alt: 'Гюто отблизо' });
    expect([first.position, second.position]).toEqual([0, 1]);
    expect(first.sizes).toEqual([400, 900, 1800]);
    expect(second).toMatchObject({ sizes: [400, 900, 1200], width: 1200, height: 600, alt: 'Гюто отблизо', format: 'webp' });
    expect(await objects()).toEqual(objectKeysOf([first, second]).sort());
    const head = await bucket.head(objectKeysOf([first])[0]);
    expect(head?.httpMetadata).toMatchObject({ contentType: 'image/webp', cacheControl: PHOTO_CACHE_CONTROL });
    expect(await listPhotos(db, id)).toEqual([first, second]);
  });

  it('stores a JPEG photo as .jpg objects with image/jpeg', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const photo = await add(id, { format: 'jpeg' });
    expect(photo.format).toBe('jpeg');
    const keys = objectKeysOf([photo]);
    expect(keys.every((k) => k.endsWith('.jpg'))).toBe(true);
    expect((await bucket.head(keys[2]))?.httpMetadata?.contentType).toBe('image/jpeg');
    expect((await listPhotos(db, id))[0].format).toBe('jpeg');
  });

  it('refuses the 13th photo and leaves no objects for it', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    for (let i = 0; i < 12; i++) await add(id, { seed: i });
    const before = await objects();
    const r = await addPhoto(db, bucket, await uploadOf(id, { seed: 99 }));
    expect(r).toEqual({ ok: false, error: 'This product already has 12 photos, the most it can have. Remove one first.' });
    expect(await objects()).toEqual(before);
  });

  it('refuses a missing product, with nothing left in R2', async () => {
    expect(await addPhoto(db, bucket, await uploadOf('nyama-takav'))).toEqual({ ok: false, error: 'This product no longer exists.' });
    expect(await objects()).toEqual([]);
  });

  it('refuses the same photo twice on one product, and keeps the first one’s objects', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const first = await add(id);
    expect(await addPhoto(db, bucket, await uploadOf(id))).toEqual({ ok: false, error: 'This photo is already on this product.' });
    expect(await objects()).toEqual(objectKeysOf([first]).sort());
  });

  it('gives the same photo on two products separate objects', async () => {
    const a = await addProduct(db, { name: 'Гюто' });
    const b = await addProduct(db, { name: 'Сантоку' });
    const pa = await add(a);
    const pb = await add(b);
    expect(pa.key).not.toBe(pb.key);
    await removePhoto(db, bucket, a, pa.id);
    expect(await objects()).toEqual(objectKeysOf([pb]).sort());
  });
});

describe('removing, moving and alt text', () => {
  it('removes the row and its objects and closes the position gap', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const [p0, p1, p2] = [await add(id, { seed: 0 }), await add(id, { seed: 1 }), await add(id, { seed: 2 })];
    expect(await removePhoto(db, bucket, id, p1.id)).toEqual({ ok: true });
    expect(await positions(id)).toEqual([[p0.id, 0], [p2.id, 1]]);
    expect(await objects()).toEqual(objectKeysOf([p0, p2]).sort());
    expect(await removePhoto(db, bucket, id, p1.id)).toEqual({ ok: false, error: 'That photo is no longer on this product. Reload the page.' });
  });

  it('deletes the row before the objects, and a failed R2 delete still succeeds and logs the leftover keys', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const [p0, p1] = [await add(id, { seed: 0 }), await add(id, { seed: 1 })];
    const { failing, rowsAtDelete } = failingDeleteBucket(id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await removePhoto(db, failing, id, p0.id)).toEqual({ ok: true });
    // When R2 was asked to delete, the row was already gone (1 of 2 left).
    expect(rowsAtDelete).toEqual([1]);
    expect(await positions(id)).toEqual([[p1.id, 0]]);
    // The objects stay as orphans, and their keys are logged.
    expect(await objects()).toEqual(objectKeysOf([p0, p1]).sort());
    expect(log).toHaveBeenCalledWith(expect.stringContaining('R2 delete failed'), objectKeysOf([p0]), expect.any(Error));
  });

  it('moves a photo up and down, and does nothing at either end', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const [a, b, c] = [await add(id, { seed: 0 }), await add(id, { seed: 1 }), await add(id, { seed: 2 })];
    expect(await movePhoto(db, id, c.id, -1)).toEqual({ ok: true });
    expect(await positions(id)).toEqual([[a.id, 0], [c.id, 1], [b.id, 2]]);
    expect(await movePhoto(db, id, a.id, 1)).toEqual({ ok: true });
    expect(await positions(id)).toEqual([[c.id, 0], [a.id, 1], [b.id, 2]]);
    await movePhoto(db, id, c.id, -1);
    await movePhoto(db, id, b.id, 1);
    expect(await positions(id)).toEqual([[c.id, 0], [a.id, 1], [b.id, 2]]);
    expect(await movePhoto(db, id, 'ph_missing', 1)).toMatchObject({ ok: false });
  });

  it('sets alt text, cleaned, at most 200 characters', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const p = await add(id);
    expect(await setPhotoAlt(db, id, p.id, '  Гюто\n Шибата   210 мм ')).toEqual({ ok: true });
    expect((await listPhotos(db, id))[0].alt).toBe('Гюто Шибата 210 мм');
    expect(await setPhotoAlt(db, id, p.id, 'я'.repeat(200))).toEqual({ ok: true });
    expect(await setPhotoAlt(db, id, p.id, 'я'.repeat(201))).toEqual({ ok: false, error: 'Alt text can be at most 200 characters.' });
    expect((await listPhotos(db, id))[0].alt).toBe('я'.repeat(200));
  });

  it('doesn’t touch the product’s updated_at', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const at = () => db.prepare('SELECT updated_at FROM products WHERE id = ?').bind(id).first<string>('updated_at');
    const before = await at();
    const p = await add(id);
    await add(id, { seed: 1 });
    await movePhoto(db, id, p.id, 1);
    await setPhotoAlt(db, id, p.id, 'x');
    await removePhoto(db, bucket, id, p.id);
    expect(await at()).toBe(before);
  });
});

describe('deleting a draft', () => {
  it('removes its photo rows and objects', async () => {
    const id = await addProduct(db, { name: 'Чернова', status: 'draft' });
    const other = await addProduct(db, { name: 'Друг' });
    await add(id, { seed: 0 });
    await add(id, { seed: 1 });
    const kept = await add(other, { seed: 2 });
    expect(await deleteDraftProduct(db, bucket, id)).toMatchObject({ ok: true });
    expect(await listPhotos(db, id)).toEqual([]);
    expect(await objects()).toEqual(objectKeysOf([kept]).sort());
  });

  it('deletes the rows before the objects, and a failed R2 delete still deletes the draft and logs the keys', async () => {
    const id = await addProduct(db, { name: 'Чернова', status: 'draft' });
    const photos = [await add(id, { seed: 0 }), await add(id, { seed: 1 })];
    const { failing, rowsAtDelete } = failingDeleteBucket(id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await deleteDraftProduct(db, failing, id)).toMatchObject({ ok: true });
    expect(rowsAtDelete).toEqual([0]);
    expect(await db.prepare('SELECT 1 FROM products WHERE id = ?').bind(id).first()).toBeNull();
    expect(await objects()).toEqual(objectKeysOf(photos).sort());
    expect(log).toHaveBeenCalledWith(expect.stringContaining('R2 delete failed'), objectKeysOf(photos), expect.any(Error));
  });

  it('touches nothing in R2 when the delete is refused', async () => {
    const id = await addProduct(db, { name: 'Поръчван' });
    const p = await add(id);
    const [v] = await variantIds(db, id);
    await insertOrder(db, order([[v, 1]]), {});
    await db.prepare(`UPDATE products SET status = 'draft' WHERE id = ?`).bind(id).run();
    expect(await deleteDraftProduct(db, bucket, id)).toMatchObject({ ok: false });
    expect(await objects()).toEqual(objectKeysOf([p]).sort());
  });
});

describe('URLs and srcset', () => {
  const photo = (sizes: number[], width: number, height: number, format: Photo['format'] = 'webp'): Photo => ({
    id: 'ph_1',
    productId: 'guto',
    position: 0,
    key: 'products/guto/abc',
    format,
    sizes,
    alt: '',
    width,
    height,
  });

  it('builds URLs from the base, with or without a trailing slash, and the format’s extension', () => {
    expect(photoUrl('https://media.karniktochi.com/', photo([400], 400, 200), 400)).toBe('https://media.karniktochi.com/products/guto/abc-400.webp');
    expect(photoUrl('/dev-media', photo([400], 400, 200, 'jpeg'), 400)).toBe('/dev-media/products/guto/abc-400.jpg');
  });

  it('lists only the renditions that exist, each with its real width', () => {
    const tall = photo([400, 900, 1200], 960, 1200);
    expect(photoSrcset('/m', tall)).toBe('/m/products/guto/abc-400.webp 320w, /m/products/guto/abc-900.webp 720w, /m/products/guto/abc-1200.webp 960w');
    expect(photoSrcset('/m', tall, 900)).toBe('/m/products/guto/abc-400.webp 320w, /m/products/guto/abc-900.webp 720w');
    expect(photoSrcset('/m', photo([400], 400, 300), 900)).toBe('/m/products/guto/abc-400.webp 400w');
    expect(photoSide(tall, 1000)).toBe(900);
    expect(photoSide(photo([500], 500, 500), 400)).toBe(500);
  });
});
