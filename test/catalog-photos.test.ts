import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { addProduct, variantIds } from './catalog-fixtures';
import { uploadOf } from './photo-fixtures';
import { cartLines, getProductPage, latestPublicProducts, listPublicPage, type Category } from '../src/lib/catalog';
import { addPhoto, movePhoto, type Photo } from '../src/lib/photos';

// Photos in the storefront reads: cards get the main photo, the product page all photos in order, the cart the
// main photo's small rendition. Products without photos get none.

let db: D1Database;
let bucket: R2Bucket;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, bucket, dispose } = await freshDb());
  await db.batch([db.prepare('DELETE FROM stock'), db.prepare('DELETE FROM variants'), db.prepare('DELETE FROM products')]);
});
afterEach(() => dispose());

const live = { includeDemo: false };

async function photo(productId: string, seed: number, size: { width?: number; height?: number } = {}): Promise<Photo> {
  const r = await addPhoto(db, bucket, await uploadOf(productId, { seed, ...size }));
  if (!r.ok) throw new Error(r.error);
  return r.photo;
}

async function addAt(name: string, minute: number, over: { category?: Category; series?: string } = {}) {
  const id = await addProduct(db, { name, ...over });
  await db.prepare('UPDATE products SET created_at = ? WHERE id = ?').bind(`2026-10-01T00:${String(minute).padStart(2, '0')}:00Z`, id).run();
  return id;
}

const ids = (photos: Photo[]) => photos.map((p) => p.id);

describe('photos in the catalog', () => {
  it('gives listing, category and home cards only the main photo, and none to a product without photos', async () => {
    const a = await addAt('А', 1, { category: 'malki' });
    const b = await addAt('Б', 2, { category: 'malki' });
    const [a1, a2] = [await photo(a, 1), await photo(a, 2)];
    await movePhoto(db, a, a2.id, -1);

    for (const page of [
      (await listPublicPage(db, live, { page: 1 })).products,
      (await listPublicPage(db, live, { page: 1, category: 'malki' })).products,
      await latestPublicProducts(db, live, 4),
    ]) {
      const byId = Object.fromEntries(page.map((p) => [p.id, p]));
      expect(ids(byId[a].photos)).toEqual([a2.id]);
      expect(byId[b].photos).toEqual([]);
    }
    expect(a1.id).not.toBe(a2.id);
  });

  it('gives the product page every photo in order, and other models and related products their main photo', async () => {
    const self = await addAt('Гюто 210', 1, { series: 'shibata' });
    const other = await addAt('Гюто 240', 2, { series: 'shibata' });
    const related = await addAt('Сантоку', 3);
    const s = [await photo(self, 1), await photo(self, 2), await photo(self, 3)];
    await movePhoto(db, self, s[2].id, -1);
    const o = [await photo(other, 4), await photo(other, 5)];
    const r = await photo(related, 6);

    const data = await getProductPage(db, self, live);
    expect(ids(data!.product.photos)).toEqual([s[0].id, s[2].id, s[1].id]);
    expect(data!.product.photos.map((p) => p.position)).toEqual([0, 1, 2]);
    expect(ids(data!.otherModels[0].photos)).toEqual([o[0].id]);
    expect(ids(data!.related[0].photos)).toEqual([r.id]);
  });

  it('gives the admin preview of a draft its photos too', async () => {
    const draft = await addProduct(db, { name: 'Чернова', status: 'draft' });
    const p = await photo(draft, 1);
    expect(await getProductPage(db, draft, live)).toBeNull();
    expect(ids((await getProductPage(db, draft, live, { anyStatus: true }))!.product.photos)).toEqual([p.id]);
  });

  it('gives a cart line the URL of its main photo’s rendition of at most 400 px, or null', async () => {
    const withPhotos = await addProduct(db, { name: 'Гюто' });
    const without = await addProduct(db, { name: 'Петти' });
    const main = await photo(withPhotos, 1);
    await photo(withPhotos, 2);
    const [v] = await variantIds(db, withPhotos);
    const [w] = await variantIds(db, without);
    const lines = await cartLines(db, [v, w], live, 'https://media.example/');
    expect(lines[v]).toMatchObject({ id: v, productId: withPhotos, photo: `https://media.example/${main.key}-400.webp` });
    expect(lines[w]).toMatchObject({ id: w, productId: without, photo: null });
  });

  it('gives a small photo’s cart line its only rendition', async () => {
    const id = await addProduct(db, { name: 'Малък' });
    const p = await photo(id, 1, { width: 500, height: 300 });
    expect(p.sizes).toEqual([400, 500]);
    const [v] = await variantIds(db, id);
    expect((await cartLines(db, [v], live, '/dev-media'))[v].photo).toBe(`/dev-media/${p.key}-400.webp`);
  });
});
