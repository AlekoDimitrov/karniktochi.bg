import { afterEach, describe, expect, it } from 'vitest';
import { freshDb, migrate } from './d1';
import { listPublicProducts } from '../src/lib/catalog';
import { addPhoto, listPhotos } from '../src/lib/photos';
import { uploadOf } from './photo-fixtures';

// 0003_product_photos.sql only adds a table and its indexes: it must work on a fresh database (the remote is
// reset at launch) and on top of 0002 with products in it.

let dispose: () => Promise<void> = async () => {};
afterEach(() => dispose());

const insertPhoto = (db: D1Database, productId: string, format: string, key = 'products/x/1') =>
  db
    .prepare(`INSERT INTO product_photos (id, product_id, position, key, format, sizes, width, height) VALUES (?, ?, 0, ?, ?, '400', 400, 300)`)
    .bind(`ph_${format}_${key}`, productId, key, format)
    .run();

describe('migration 0003', () => {
  it('works on a fresh database', async () => {
    const env = await freshDb();
    dispose = env.dispose;
    const { db, bucket } = env;
    const [product] = await listPublicProducts(db, { includeDemo: true });
    expect(await addPhoto(db, bucket, await uploadOf(product.id))).toMatchObject({ ok: true });
    expect(await listPhotos(db, product.id)).toHaveLength(1);
  });

  it('works on top of 0002 with products, and keeps them', async () => {
    const env = await freshDb('0002_products.sql');
    dispose = env.dispose;
    const { db } = env;
    const before = await listPublicProducts(db, { includeDemo: true });
    await migrate(db, { after: '0002_products.sql', upTo: '0003_product_photos.sql' });
    expect(await listPublicProducts(db, { includeDemo: true })).toEqual(before);
    const id = before[0].id;
    await insertPhoto(db, id, 'webp');
    expect(await listPhotos(db, id)).toHaveLength(1);
  });

  it('refuses unknown formats, photos of missing products and the same key twice on a product', async () => {
    const env = await freshDb();
    dispose = env.dispose;
    const { db } = env;
    const [product] = await listPublicProducts(db, { includeDemo: true });
    await expect(insertPhoto(db, product.id, 'png')).rejects.toThrow(/CHECK constraint failed/);
    await db.prepare('PRAGMA foreign_keys = ON').run();
    await expect(insertPhoto(db, 'nyama', 'webp')).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await insertPhoto(db, product.id, 'webp', 'products/x/same');
    await expect(insertPhoto(db, product.id, 'jpeg', 'products/x/same')).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
