import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { addProduct, order, variantIds } from './catalog-fixtures';
import {
  getPublicProduct,
  listPublicProducts,
  optionKeys,
  orderableVariants,
  setProductStatus,
  setVariantStatus,
  slugify,
  transliterate,
  uniqueSlug,
} from '../src/lib/catalog';
import { changeStatus, getOrder, getStockLevels, insertOrder, OutOfStockError } from '../src/lib/orders';

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

const demos = { includeDemo: true };
const live = { includeDemo: false };
const level = async (id: string) => (await getStockLevels(db, {}))[id];

describe('slugs', () => {
  it.each([
    ['Гюто', 'gyuto'],
    ['Сантоку Шибата 180 мм', 'santoku-shibata-180-mm'],
    ['Щипка', 'shtipka'],
    ['Ъгъл', 'agal'],
    ['Юзу и ябълка', 'yuzu-i-yabalka'],
    ['Жиц Цар Чаша Шило', 'zhits-tsar-chasha-shilo'],
    ['Колекция България', 'kolektsia-bulgaria'],
    ['Ияша', 'iyasha'],
    ['Petty  №1 (Aogami #2)!', 'petty-no1-aogami-2'],
    ['Nakiri – Kurouchi', 'nakiri-kurouchi'],
  ])('%s → %s', (name, slug) => expect(slugify(name)).toBe(slug));

  it('follows the official rules for ь and ия at the end of a word', () => {
    expect(transliterate('Тетрадь')).toBe('tetrady');
    expect(transliterate('историята')).toBe('istoriyata');
    expect(transliterate('история')).toBe('istoria');
  });

  it('makes product slugs unique across every status, including archived products', async () => {
    expect(await addProduct(db, { name: 'Гюто' })).toBe('gyuto');
    expect(await addProduct(db, { name: 'гюто', status: 'archived' })).toBe('gyuto-2');
    expect(await addProduct(db, { name: 'ГЮТО', status: 'draft' })).toBe('gyuto-3');
    expect(await uniqueSlug(db, 'Гюто')).toBe('gyuto-4');
    // A name that only starts like a taken slug is not affected.
    expect(await addProduct(db, { name: 'Гюто-хамон' })).toBe('gyuto-hamon');
    expect(await uniqueSlug(db, '!!!')).toBe('produkt');
  });

  it('gives option values URL keys that are unique within the product', () => {
    expect(optionKeys(['210 мм', '240 мм', '210 мм', ''])).toEqual(['210-mm', '240-mm', '210-mm-2', '4']);
  });
});

describe('visibility', () => {
  it('shows only published products, newest first, and hides demos when told to', async () => {
    const pub = await addProduct(db, { name: 'Публикуван' });
    const draft = await addProduct(db, { name: 'Чернова', status: 'draft' });
    const arch = await addProduct(db, { name: 'Архивиран', status: 'archived' });

    const shown = (await listPublicProducts(db, live)).map((p) => p.id);
    expect(shown).toEqual([pub]);
    expect((await listPublicProducts(db, demos)).map((p) => p.id)).toEqual([pub, 'demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5', 'demo-6']);
    expect(await getPublicProduct(db, draft, demos)).toBeNull();
    expect(await getPublicProduct(db, arch, demos)).toBeNull();
    expect(await getPublicProduct(db, 'demo-1', live)).toBeNull();
    expect((await getPublicProduct(db, 'demo-1', demos))?.variants[0]).toMatchObject({ id: 'demo-1', priceCents: 12900, stock: 5 });
  });

  it('hides archived variants and products with no active variant left', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, [
      { optionValue: '210 мм', sku: null, priceCents: 10000, stock: 1 },
      { optionValue: '240 мм', sku: null, priceCents: 12000, stock: 1 },
    ]);
    const [v210, v240] = await variantIds(db, id);
    await setVariantStatus(db, v210, 'archived');
    expect((await getPublicProduct(db, id, live))?.variants.map((v) => v.id)).toEqual([v240]);
    await setVariantStatus(db, v240, 'archived');
    expect(await getPublicProduct(db, id, live)).toBeNull();
    expect(await listPublicProducts(db, live)).toEqual([]);
  });

  it('only lets public variants be ordered', async () => {
    const [pub] = await variantIds(db, await addProduct(db, { name: 'А' }));
    const [draft] = await variantIds(db, await addProduct(db, { name: 'Б', status: 'draft' }));
    const [arch] = await variantIds(db, await addProduct(db, { name: 'В', status: 'archived' }));
    const ok = await orderableVariants(db, [pub, draft, arch, 'demo-1', 'nope'], live);
    expect([...ok.keys()]).toEqual([pub]);
    expect(ok.get(pub)).toMatchObject({ name: 'Тест А', optionLabel: '', priceCents: 10000 });
    expect([...(await orderableVariants(db, ['demo-1'], demos)).keys()]).toEqual(['demo-1']);
  });
});

describe('variant stock reservation', () => {
  let v210: string, v240: string, petty: string;
  beforeEach(async () => {
    const gyuto = await addProduct(db, { name: 'Гюто' }, [
      { optionValue: '210 мм', sku: 'G-210', priceCents: 10000, stock: 1 },
      { optionValue: '240 мм', sku: 'G-240', priceCents: 12000, stock: 2 },
    ]);
    [v210, v240] = await variantIds(db, gyuto);
    [petty] = await variantIds(db, await addProduct(db, { name: 'Петти' }));
  });

  it('labels the option in the order snapshot', async () => {
    const v = (await orderableVariants(db, [v240], live)).get(v240)!;
    expect(v).toMatchObject({ optionLabel: 'Дължина: 240 мм', priceCents: 12000 });
  });

  it('sells the last unit of one variant without touching the other', async () => {
    await insertOrder(db, order([[v210, 1]]), {});
    expect(await level(v210)).toBe(0);
    expect(await level(v240)).toBe(2);
    await expect(insertOrder(db, order([[v210, 1]]), {})).rejects.toMatchObject({ variantIds: [v210] });
  });

  it('places only one order on a double click for the last unit', async () => {
    const results = await Promise.allSettled([insertOrder(db, order([[v210, 1]]), {}), insertOrder(db, order([[v210, 1]]), {})]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(OutOfStockError);
    expect(await level(v210)).toBe(0);
  });

  it('reserves a mixed cart all or nothing', async () => {
    await insertOrder(db, order([[v210, 1], [v240, 2], [petty, 1]]), {});
    expect([await level(v210), await level(v240), await level(petty)]).toEqual([0, 0, 0]);

    await changeStatus(db, 1, 'new', 'cancelled');
    await insertOrder(db, order([[petty, 1]]), {});
    // 210 and 240 are free again, petty is not: nothing in this cart may be taken.
    await expect(insertOrder(db, order([[v210, 1], [v240, 1], [petty, 1]]), {})).rejects.toMatchObject({ variantIds: [petty] });
    expect([await level(v210), await level(v240), await level(petty)]).toEqual([1, 2, 0]);
  });
});

describe('orders that reference archived variants', () => {
  it('keep their snapshot and still release and reserve stock', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, [
      { optionValue: '210 мм', sku: null, priceCents: 10000, stock: 2 },
      { optionValue: '240 мм', sku: null, priceCents: 12000, stock: 2 },
    ]);
    const [v210] = await variantIds(db, id);
    const snap = (await orderableVariants(db, [v210], live)).get(v210)!;
    const placed = await insertOrder(
      db,
      { ...order([]), items: [{ ...snap, unitPriceCents: snap.priceCents, quantity: 1 }] },
      {},
    );
    await setVariantStatus(db, v210, 'archived');
    await setProductStatus(db, id, 'archived');

    const saved = await getOrder(db, placed.id);
    expect(saved?.items).toEqual([
      { variantId: v210, productId: id, name: 'Тест Гюто', optionLabel: 'Дължина: 210 мм', unitPriceCents: 10000, quantity: 1 },
    ]);
    await changeStatus(db, placed.id, 'new', 'cancelled');
    expect(await level(v210)).toBe(2);
    await changeStatus(db, placed.id, 'cancelled', 'confirmed');
    expect(await level(v210)).toBe(1);
    // But it can't be ordered again.
    expect((await orderableVariants(db, [v210], live)).size).toBe(0);
  });

  it('keeps orders placed before the migration readable under the old product id', async () => {
    await insertOrder(db, order([['demo-1', 2]]), {});
    const saved = await getOrder(db, 1);
    expect(saved?.items[0]).toMatchObject({ variantId: 'demo-1', quantity: 2 });
    expect(await level('demo-1')).toBe(3);
  });
});
