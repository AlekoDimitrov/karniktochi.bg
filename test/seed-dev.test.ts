import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb, runSqlFile } from './d1';
import { getProductPage, listPublicPage } from '../src/lib/catalog';

// scripts/seed-dev.sql (npm run seed:dev) against a migrated database.
let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, dispose } = await freshDb());
  await runSqlFile(db, 'scripts/seed-dev.sql');
});
afterEach(() => dispose());

const all = { includeDemo: true };

describe('seed:dev', () => {
  it('leaves exactly 2 knives in three sizes and 20 single-variant products, and no demos', async () => {
    const { products, total } = await listPublicPage(db, all, { page: 1, perPage: 100 });
    expect(total).toBe(22);
    const sizes = products.map((p) => p.variants.length);
    expect(sizes.filter((n) => n === 3)).toHaveLength(2);
    expect(sizes.filter((n) => n === 1)).toHaveLength(20);
    expect(products.some((p) => p.isDemo)).toBe(false);
  });

  it('gives each knife with sizes different prices and stock, with one size sold out', async () => {
    for (const id of ['gyuto-shibata-kotetsu', 'petti-takamura-r2']) {
      const { product } = (await getProductPage(db, id, all))!;
      expect(product.optionLabel).toBe('Дължина');
      expect(new Set(product.variants.map((v) => v.priceCents)).size).toBe(3);
      expect(new Set(product.variants.map((v) => v.stock)).size).toBe(3);
      expect(product.variants.filter((v) => v.stock === 0)).toHaveLength(1);
    }
  });

  it('can be run again', async () => {
    await runSqlFile(db, 'scripts/seed-dev.sql');
    expect((await listPublicPage(db, all, { page: 1 })).total).toBe(22);
  });
});
