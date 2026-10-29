import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { addProduct, variantIds } from './catalog-fixtures';
import {
  cartLines,
  CART_LINES_MAX,
  getProductPage,
  latestPublicProducts,
  listPublicPage,
  PAGE_SIZE,
  parseCartIds,
  parsePage,
  RELATED_LIMIT,
  setProductStatus,
  setVariantStatus,
  variantProductId,
  type Category,
} from '../src/lib/catalog';

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

const live = { includeDemo: false };

// Products created one after another get the same created_at second, so set it to keep "newest first" testable.
async function addAt(name: string, minute: number, over: { category?: Category; series?: string; status?: 'draft' | 'published' } = {}) {
  const id = await addProduct(db, { name, ...over });
  await db.prepare('UPDATE products SET created_at = ? WHERE id = ?').bind(`2026-10-01T00:${String(minute).padStart(2, '0')}:00Z`, id).run();
  return id;
}

describe('listing pages', () => {
  it(`pages ${PAGE_SIZE} products at a time, newest first, and counts only listed products`, async () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) ids.push(await addAt(`Нож ${i}`, i));
    await addAt('Чернова', 59, { status: 'draft' });
    const noVariant = await addAt('Без варианти', 58);
    await setVariantStatus(db, (await variantIds(db, noVariant))[0], 'archived');

    const first = await listPublicPage(db, live, { page: 1 });
    expect(first).toMatchObject({ total: 50, page: 1, pages: 3 });
    expect(first.products.map((p) => p.id)).toEqual(ids.slice().reverse().slice(0, 24));
    expect(first.products.every((p) => p.variants.length === 1)).toBe(true);
    const last = await listPublicPage(db, live, { page: 3 });
    expect(last.products.map((p) => p.id)).toEqual(ids.slice(0, 2).reverse());
    expect((await listPublicPage(db, live, { page: 4 })).products).toEqual([]);
  });

  it('filters by category', async () => {
    await addAt('Гюто', 1, { category: 'gotvarski' });
    const stone = await addAt('Камък', 2, { category: 'kamani' });
    const page = await listPublicPage(db, live, { page: 1, category: 'kamani' });
    expect(page.products.map((p) => p.id)).toEqual([stone]);
    expect(page).toMatchObject({ total: 1, pages: 1 });
    expect(await listPublicPage(db, live, { page: 1, category: 'malki' })).toMatchObject({ total: 0, pages: 1, products: [] });
  });

  it('gives the home page only the newest few', async () => {
    for (let i = 0; i < 10; i++) await addAt(`Нож ${i}`, i);
    expect((await latestPublicProducts(db, live, 4)).map((p) => p.name)).toEqual(['Нож 9', 'Нож 8', 'Нож 7', 'Нож 6']);
  });

  it.each([
    [null, 1],
    ['1', 1],
    ['2', 2],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['02', null],
    ['abc', null],
    ['', null],
    ['999999', null],
  ])('reads ?page=%s as %s', (value, page) => expect(parsePage(value)).toBe(page));
});

describe('product page', () => {
  it(`reads the product, the other models in its series and at most ${RELATED_LIMIT} related products from its category`, async () => {
    const self = await addAt('Гюто 210', 30, { category: 'gotvarski', series: 'shibata' });
    const sibling = await addAt('Гюто 240', 29, { category: 'gotvarski', series: 'shibata' });
    const otherCatSibling = await addAt('Петти', 28, { category: 'malki', series: 'shibata' });
    const sameCat: string[] = [];
    for (let i = 0; i < 6; i++) sameCat.push(await addAt(`Сантоку ${i}`, i, { category: 'gotvarski' }));
    await addAt('Камък', 40, { category: 'kamani' });
    await addAt('Чернова', 41, { category: 'gotvarski', status: 'draft' });

    const data = (await getProductPage(db, self, live))!;
    expect(data.product.id).toBe(self);
    expect(data.otherModels.map((p) => p.id)).toEqual([sibling, otherCatSibling]);
    // Newest of the same category, not the series, not drafts, not other categories.
    expect(data.related.map((p) => p.id)).toEqual(sameCat.slice().reverse().slice(0, RELATED_LIMIT));
    expect(data.related.every((p) => p.variants.length === 1)).toBe(true);
  });

  it('has no other models without a series, and is null for a product that is not public', async () => {
    const solo = await addAt('Нож', 1);
    await addAt('Друг', 2);
    expect((await getProductPage(db, solo, live))?.otherModels).toEqual([]);
    await setProductStatus(db, solo, 'draft');
    expect(await getProductPage(db, solo, live)).toBeNull();
    expect(await getProductPage(db, 'nyama-takav', live)).toBeNull();
  });
});

describe('cart lines', () => {
  it('describes each variant, naming the option only for products with choices', async () => {
    const gyuto = await addProduct(db, { name: 'Гюто' }, [
      { optionValue: '210 мм', sku: null, priceCents: 10000, stock: 2 },
      { optionValue: '240 мм', sku: null, priceCents: 12000, stock: 0 },
    ]);
    const [v210, v240] = await variantIds(db, gyuto);
    const petty = await addProduct(db, { name: 'Петти' });
    const [p] = await variantIds(db, petty);

    const lines = await cartLines(db, [v210, v240, p, 'nyama'], live);
    expect(Object.keys(lines).sort()).toEqual([v210, v240, p].sort());
    expect(lines[v240]).toEqual({
      id: v240,
      productId: gyuto,
      name: 'Гюто',
      brand: 'Тест',
      option: 'Дължина: 240 мм',
      url: `/produkti/${gyuto}/?v=240-mm`,
      priceCents: 12000,
      stock: 0,
      photo: null,
    });
    expect(lines[p]).toMatchObject({ option: '', url: `/produkti/${petty}/`, stock: 1 });
  });

  it('leaves out archived variants and products that are not public', async () => {
    const [a, b] = await variantIds(db, await addProduct(db, { name: 'Гюто' }, [
      { optionValue: '210 мм', sku: null, priceCents: 10000, stock: 1 },
      { optionValue: '240 мм', sku: null, priceCents: 12000, stock: 1 },
    ]));
    const [draft] = await variantIds(db, await addProduct(db, { name: 'Чернова', status: 'draft' }));
    await setVariantStatus(db, a, 'archived');
    const lines = await cartLines(db, [a, b, draft], live);
    expect(Object.keys(lines)).toEqual([b]);
    // With one active variant left, the option is no longer a choice.
    expect(lines[b].option).toBe('');
  });

  it(`accepts up to ${CART_LINES_MAX} well-formed ids`, () => {
    expect(parseCartIds('demo-1,v_0a1b2c,demo-1')).toEqual(['demo-1', 'v_0a1b2c']);
    expect(parseCartIds(Array.from({ length: CART_LINES_MAX }, (_, i) => `v_${i}`).join(','))).toHaveLength(CART_LINES_MAX);
    expect(parseCartIds(Array.from({ length: CART_LINES_MAX + 1 }, (_, i) => `v_${i}`).join(','))).toBeNull();
    for (const bad of [null, '', 'demo-1,', 'Demo-1', "x'--", 'a b', 'x'.repeat(65)]) expect(parseCartIds(bad)).toBeNull();
  });

  it('finds the product of a variant in any status', async () => {
    const id = await addProduct(db, { name: 'Гюто', status: 'archived' });
    const [v] = await variantIds(db, id);
    expect(await variantProductId(db, v)).toBe(id);
    expect(await variantProductId(db, 'nyama')).toBeNull();
  });
});
