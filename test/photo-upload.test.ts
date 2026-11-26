import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './d1';
import { addProduct } from './catalog-fixtures';
import { fakeJpeg, fakeWebp, renditionsOf, uploadOf } from './photo-fixtures';
import { checkUpload, handleJsonPhotoAction, handlePhotoAction, handleUpload } from '../src/lib/photo-upload';
import { addPhoto, listPhotos } from '../src/lib/photos';
import { productPurgeTags, type Purger } from '../src/lib/cache-purge';

let db: D1Database;
let bucket: R2Bucket;
let dispose: () => Promise<void>;
let purger: Purger & { purge: ReturnType<typeof vi.fn> };
beforeEach(async () => {
  ({ db, bucket, dispose } = await freshDb());
  await db.batch([db.prepare('DELETE FROM stock'), db.prepare('DELETE FROM variants'), db.prepare('DELETE FROM products')]);
  purger = { purge: vi.fn(async () => ({ success: true, errors: [] })) };
});
afterEach(() => dispose());

const KB = 1024;
const objects = async () => (await bucket.list()).objects.map((o) => o.key);

/** A form with these files as `rendition` (in the given order) and optional alt. */
function formOf(files: Uint8Array<ArrayBuffer>[], alt?: string): FormData {
  const fd = new FormData();
  files.forEach((bytes, i) => fd.append('rendition', new File([bytes], `r${i}.webp`, { type: 'image/webp' })));
  if (alt !== undefined) fd.set('alt', alt);
  return fd;
}

const requestOf = (fd: FormData, headers: Record<string, string> = {}) =>
  new Request('http://localhost/admin/products/x/photos/', { method: 'POST', body: fd, headers });

const webpSet = (width = 2400, height = 1200, seed = 0) => renditionsOf(width, height, seed).map((r) => r.bytes);
const jpegSet = (width = 2400, height = 1200, seed = 0) => renditionsOf(width, height, seed, 'jpeg').map((r) => r.bytes);

describe('checkUpload', () => {
  it('accepts 3 WebP renditions in any order, sorted smallest first, with sizes from their headers', async () => {
    const [a, b, c] = webpSet();
    const r = await checkUpload(formOf([c, a, b], '  Гюто  отблизо '));
    expect(r).toMatchObject({ ok: true, value: { format: 'webp', width: 1800, height: 900, alt: 'Гюто отблизо' } });
    if (r.ok) expect(r.value.renditions.map((x) => x.side)).toEqual([400, 900, 1800]);
  });

  it('accepts JPEG renditions (the Safari fallback) and a small photo with fewer renditions', async () => {
    expect(await checkUpload(formOf(jpegSet()))).toMatchObject({ ok: true, value: { format: 'jpeg' } });
    expect(await checkUpload(formOf(webpSet(600, 450)))).toMatchObject({ ok: true, value: { width: 600, height: 450 } });
    expect(await checkUpload(formOf(webpSet(400, 400)))).toMatchObject({ ok: true, value: { width: 400 } });
  });

  it('refuses 0 or 4 files, a PNG, mixed formats and a JPEG with EXIF', async () => {
    expect(await checkUpload(formOf([]))).toEqual({ ok: false, error: 'Send 1 to 3 renditions of one photo.' });
    expect(await checkUpload(formOf([...webpSet(), fakeWebp(400, 200)]))).toMatchObject({ ok: false });
    const png = new Uint8Array(readFileSync('test/fixtures/png-20x10.png'));
    expect(await checkUpload(formOf([png]))).toEqual({ ok: false, error: 'Only WebP and JPEG files can be uploaded.' });
    const [w400, w900] = webpSet();
    const [, , j1800] = jpegSet();
    expect(await checkUpload(formOf([w400, w900, j1800]))).toEqual({ ok: false, error: 'All renditions of a photo must have the same format.' });
    const exif = fakeJpeg(400, 300);
    const app1 = [0xff, 0xe1, 0, 8, ...[...'Exif\0\0'].map((c) => c.charCodeAt(0))];
    const withExif = new Uint8Array([0xff, 0xd8, ...app1, ...exif.subarray(2)]);
    expect(await checkUpload(formOf([withExif]))).toMatchObject({ ok: false, error: expect.stringContaining('EXIF') });
  });

  it('refuses photos under 400 px, missing or extra sizes, and different proportions', async () => {
    expect(await checkUpload(formOf([fakeWebp(399, 300)]))).toEqual({ ok: false, error: 'Photo too small (at least 400 px on the long side).' });
    const [a, , c] = webpSet();
    expect(await checkUpload(formOf([a, c]))).toEqual({ ok: false, error: 'Expected renditions with long sides 400, 900, 1800 px; got 400, 1800 px.' });
    expect(await checkUpload(formOf([fakeWebp(500, 250), fakeWebp(900, 450), fakeWebp(1800, 900)]))).toMatchObject({ ok: false });
    // Right long sides, but the 900 rendition is 3:2 while the others are 2:1.
    expect(await checkUpload(formOf([fakeWebp(400, 200), fakeWebp(900, 600), fakeWebp(1800, 900)]))).toEqual({
      ok: false,
      error: 'The renditions don’t have the same proportions.',
    });
  });

  it('refuses a rendition over its file cap (200 KB / 600 KB / 1.5 MB) and an upload over 3 MB', async () => {
    const big400 = fakeWebp(400, 200, 200 * KB + 2);
    expect(await checkUpload(formOf([big400, fakeWebp(900, 450), fakeWebp(1800, 900)]))).toEqual({
      ok: false,
      error: 'The 400 px rendition is 200 KB; the most is 200 KB.',
    });
    expect(await checkUpload(formOf([fakeWebp(400, 200, 200 * KB), fakeWebp(900, 450, 600 * KB), fakeWebp(1800, 900, 1536 * KB)]))).toMatchObject({ ok: true });
    expect(await checkUpload(formOf([fakeWebp(1800, 900, 1536 * KB + 2)]))).toMatchObject({ ok: false });
    expect(await checkUpload(formOf([fakeWebp(1800, 900, 3 * 1024 * KB + 2)]))).toMatchObject({ ok: false, error: expect.stringContaining('the most is 3072 KB') });
  });

  it('refuses alt text over 200 characters', async () => {
    expect(await checkUpload(formOf(webpSet(), 'я'.repeat(201)))).toEqual({ ok: false, error: 'Alt text can be at most 200 characters.' });
  });
});

describe('handleUpload', () => {
  it('stores the photo and purges the product’s pages', async () => {
    const id = await addProduct(db, { name: 'Гюто', category: 'gotvarski' });
    const r = await handleUpload(db, bucket, purger, id, requestOf(formOf(webpSet(), 'Гюто')));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ok: true, photo: { position: 0, alt: 'Гюто', sizes: [400, 900, 1800] } });
    expect(await objects()).toHaveLength(3);
    expect(purger.purge).toHaveBeenCalledWith({ tags: productPurgeTags({ id, category: 'gotvarski' }) });
  });

  it('answers 404 for a missing product and 413 for a body over 3 MB, before reading it', async () => {
    expect((await handleUpload(db, bucket, purger, 'nyama', requestOf(formOf(webpSet())))).status).toBe(404);
    const id = await addProduct(db, { name: 'Гюто' });
    const big = await handleUpload(db, bucket, purger, id, requestOf(formOf(webpSet()), { 'Content-Length': String(4 * 1024 * KB) }));
    expect(big.status).toBe(413);
    expect(purger.purge).not.toHaveBeenCalled();
  });

  it('answers 422 for a bad file and 409 for the 13th photo, storing and purging nothing', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    expect((await handleUpload(db, bucket, purger, id, requestOf(formOf([fakeWebp(300, 200)])))).status).toBe(422);
    for (let i = 0; i < 12; i++) await addPhoto(db, bucket, await uploadOf(id, { seed: i }));
    const before = await objects();
    const r = await handleUpload(db, bucket, purger, id, requestOf(formOf(webpSet(2400, 1200, 99))));
    expect(r).toMatchObject({ status: 409, body: { ok: false } });
    expect(await objects()).toEqual(before);
    expect(purger.purge).not.toHaveBeenCalled();
  });
});

describe('photo actions on the edit page', () => {
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it('move, alt and remove each purge the product’s pages', async () => {
    const id = await addProduct(db, { name: 'Гюто', category: 'malki' });
    const product = { id, category: 'malki' };
    const a = await addPhoto(db, bucket, await uploadOf(id, { seed: 0 }));
    const b = await addPhoto(db, bucket, await uploadOf(id, { seed: 1 }));
    if (!a.ok || !b.ok) throw new Error('setup');
    const tags = { tags: productPurgeTags(product) };

    expect(await handlePhotoAction(db, bucket, purger, product, 'photo-move', fd({ photo: b.photo.id, direction: 'up' }))).toEqual({ ok: true });
    expect((await listPhotos(db, id)).map((p) => p.id)).toEqual([b.photo.id, a.photo.id]);
    expect(await handlePhotoAction(db, bucket, purger, product, 'photo-alt', fd({ photo: a.photo.id, alt: 'Острие' }))).toEqual({ ok: true });
    expect(await handlePhotoAction(db, bucket, purger, product, 'photo-remove', fd({ photo: b.photo.id }))).toEqual({ ok: true });
    expect(purger.purge.mock.calls).toEqual([[tags], [tags], [tags]]);
    expect(await listPhotos(db, id)).toMatchObject([{ id: a.photo.id, position: 0, alt: 'Острие' }]);
  });

  it('a refused action changes and purges nothing', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const product = { id, category: 'gotvarski' };
    expect(await handlePhotoAction(db, bucket, purger, product, 'photo-remove', fd({ photo: 'ph_missing' }))).toMatchObject({ ok: false });
    expect(await handlePhotoAction(db, bucket, purger, product, 'photo-move', fd({ photo: 'ph_missing', direction: 'sideways' }))).toEqual({
      ok: false,
      error: 'Invalid request. Nothing was changed.',
    });
    expect(purger.purge).not.toHaveBeenCalled();
  });
});

describe('JSON photo actions (slice 4)', () => {
  const post = (body: unknown) =>
    new Request('http://localhost/admin/products/x/photos/a/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

  async function setup() {
    const id = await addProduct(db, { name: 'Гюто', category: 'malki' });
    const photos = [];
    for (const seed of [0, 1, 2]) {
      const r = await addPhoto(db, bucket, await uploadOf(id, { seed }));
      if (!r.ok) throw new Error('setup');
      photos.push(r.photo);
    }
    const later: Promise<unknown>[] = [];
    return { id, photos, later, waitUntil: (p: Promise<unknown>) => void later.push(p), tags: { tags: productPurgeTags({ id, category: 'malki' }) } };
  }

  it('remove: D1 at once; the R2 delete and the purge run in waitUntil; a repeat is ok', async () => {
    const { id, photos, later, waitUntil, tags } = await setup();
    const res = await handleJsonPhotoAction(db, bucket, purger, id, 'remove', post({ photos: [photos[0].id, photos[2].id] }), waitUntil);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect((await listPhotos(db, id)).map((p) => [p.id, p.position])).toEqual([[photos[1].id, 0]]);
    await Promise.all(later);
    expect((await objects()).every((k) => k.startsWith(photos[1].key))).toBe(true);
    expect(purger.purge.mock.calls).toEqual([[tags]]);

    const again = await handleJsonPhotoAction(db, bucket, purger, id, 'remove', post({ photos: [photos[0].id] }), waitUntil);
    expect(again).toEqual({ status: 200, body: { ok: true, removed: [] } });
    expect(later).toHaveLength(1); // nothing removed, nothing to delete or purge
  });

  it('order: saves and purges; a stale list is 409 with nothing changed or purged', async () => {
    const { id, photos, waitUntil, tags } = await setup();
    const [a, b, c] = photos.map((p) => p.id);
    expect((await handleJsonPhotoAction(db, bucket, purger, id, 'order', post({ photos: [b, c, a] }), waitUntil)).status).toBe(200);
    expect((await listPhotos(db, id)).map((p) => p.id)).toEqual([b, c, a]);
    expect(purger.purge.mock.calls).toEqual([[tags]]);
    const stale = await handleJsonPhotoAction(db, bucket, purger, id, 'order', post({ photos: [a, b] }), waitUntil);
    expect(stale.status).toBe(409);
    expect((await listPhotos(db, id)).map((p) => p.id)).toEqual([b, c, a]);
    expect(purger.purge).toHaveBeenCalledTimes(1);
  });

  it('alt: saves and purges; too long is 422; a missing photo 409', async () => {
    const { id, photos, waitUntil } = await setup();
    expect((await handleJsonPhotoAction(db, bucket, purger, id, 'alt', post({ photo: photos[1].id, alt: '  Острие  ' }), waitUntil)).status).toBe(200);
    expect((await listPhotos(db, id))[1].alt).toBe('Острие');
    expect((await handleJsonPhotoAction(db, bucket, purger, id, 'alt', post({ photo: photos[1].id, alt: 'я'.repeat(201) }), waitUntil)).status).toBe(422);
    expect((await handleJsonPhotoAction(db, bucket, purger, id, 'alt', post({ photo: 'ph_missing', alt: '' }), waitUntil)).status).toBe(409);
    expect(purger.purge).toHaveBeenCalledTimes(1);
  });

  it('refuses bad bodies and a missing product, changing and purging nothing', async () => {
    const { id, photos, later, waitUntil } = await setup();
    for (const body of ['not json', '[]', 'null', { photos: 'x' }, { photos: [] }, { photos: [1] }, { photos: Array(13).fill('ph_a') }]) {
      expect((await handleJsonPhotoAction(db, bucket, purger, id, 'remove', post(body), waitUntil)).status).toBe(400);
    }
    expect((await handleJsonPhotoAction(db, bucket, purger, id, 'alt', post({ photo: photos[0].id }), waitUntil)).status).toBe(400);
    expect((await handleJsonPhotoAction(db, bucket, purger, 'nope', 'remove', post({ photos: [photos[0].id] }), waitUntil)).status).toBe(404);
    expect(await listPhotos(db, id)).toHaveLength(3);
    expect(later).toHaveLength(0);
    expect(purger.purge).not.toHaveBeenCalled();
  });
});
