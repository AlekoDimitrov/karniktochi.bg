import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from './d1';
import { addProduct, order, variantIds } from './catalog-fixtures';
import { parseProductForm, type ProductForm } from '../src/lib/admin-input';
import {
  ADMIN_PAGE_SIZE,
  archiveAllDemos,
  createAdminProduct,
  deleteDraftProduct,
  getAdminProduct,
  listAdminProducts,
  quickEditVariant,
  restoreVariant,
  saveAdminProduct,
  searchForms,
  variantsWithOrders,
} from '../src/lib/admin-products';
import { purgeAll, purgerFrom } from '../src/lib/cache-purge';
import { getProductPage, type Product } from '../src/lib/catalog';
import { changeStatus, insertOrder } from '../src/lib/orders';

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, dispose } = await freshDb());
  // Start without the six demo products from migration 0002, except where a test wants them.
  await db.batch([db.prepare('DELETE FROM stock'), db.prepare('DELETE FROM variants'), db.prepare('DELETE FROM products')]);
});
afterEach(() => dispose());

type Row = { id?: string; option?: string; sku?: string; price?: string; stock?: string; stock_was?: string; remove?: string };

/** Builds the posted form for `fields` and size `rows` and parses it; fails the test if it is invalid. */
function formFor(fields: Record<string, string>, rows: Row[], existing: string[] = []): ProductForm {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: 'Гюто', category: 'gotvarski', status: 'draft', ...fields })) fd.set(k, v);
  rows.forEach((row, i) => {
    for (const [k, v] of Object.entries(row)) fd.set(`v.${i}.${k}`, v);
  });
  const r = parseProductForm(fd, new Set(existing));
  if (!r.ok) throw new Error(`invalid form: ${JSON.stringify(r.errors)}`);
  return r.value;
}

/** The posted form that re-saves `p` unchanged, with `change` applied to the fields and `rows` for sizes. */
function editForm(p: Product, fields: Record<string, string> = {}, rows?: Row[]): ProductForm {
  const active = p.variants.filter((v) => v.status === 'active');
  return formFor(
    {
      name: p.name,
      brand: p.brand,
      category: p.category,
      status: p.status,
      option_name: p.optionName,
      option_label: p.optionLabel,
      updated_at: p.updatedAt,
      ...fields,
    },
    rows ??
      active.map((v) => ({
        id: v.id,
        option: v.optionValue,
        sku: v.sku ?? '',
        price: String(v.priceCents / 100),
        stock: String(v.stock),
        stock_was: String(v.stock),
      })),
    p.variants.map((v) => v.id),
  );
}

const sizes = (values: string[], price = 10000, stock = 2) =>
  values.map((optionValue) => ({ optionValue, sku: null, priceCents: price, stock }));

async function load(id: string) {
  const r = await getAdminProduct(db, id);
  if (!r) throw new Error(`no product ${id}`);
  return r.product;
}

const stockOf = async (variantId: string) =>
  db.prepare('SELECT quantity FROM stock WHERE variant_id = ?').bind(variantId).first<number>('quantity');

describe('the admin product list', () => {
  it('pages 50 at a time, newest first, with the total', async () => {
    // One batch: 55 products with one size each, created a minute apart.
    await db.batch(
      Array.from({ length: 55 }, (_, i) => [
        db
          .prepare(`INSERT INTO products (id, name, category, status, created_at) VALUES (?, ?, 'gotvarski', 'published', ?)`)
          .bind(`noz-${i}`, `Нож ${i}`, `2026-10-01T00:${String(i).padStart(2, '0')}:00Z`),
        db.prepare(`INSERT INTO variants (id, product_id, price_cents) VALUES (?, ?, 100)`).bind(`v-${i}`, `noz-${i}`),
      ]).flat(),
    );
    const first = await listAdminProducts(db, {});
    expect(first).toMatchObject({ total: 55, page: 1, pages: 2 });
    expect(first.products).toHaveLength(ADMIN_PAGE_SIZE);
    expect(first.products[0].name).toBe('Нож 54');
    const second = await listAdminProducts(db, { page: 2 });
    expect(second.products.map((p) => p.name)).toEqual(['Нож 4', 'Нож 3', 'Нож 2', 'Нож 1', 'Нож 0']);
    expect((await listAdminProducts(db, { page: 3 })).products).toEqual([]);
  });

  it('searches name, brand and SKU, ignoring case, also in Cyrillic', async () => {
    await addProduct(db, { name: 'Гюто Шибата', brand: 'Шибата' }, [{ optionValue: '', sku: 'SHI-210', priceCents: 100, stock: 1 }]);
    await addProduct(db, { name: 'Петти Такамура', brand: 'Такамура' });
    await addProduct(db, { name: 'Камък 1000', brand: 'Naniwa' });
    const names = async (q: string) => (await listAdminProducts(db, { q })).products.map((p) => p.name).sort();
    expect(await names('гюто')).toEqual(['Гюто Шибата']);
    expect(await names('ГЮТО')).toEqual(['Гюто Шибата']); // through the lower-case spelling
    expect(await names('такамура')).toEqual(['Петти Такамура']);
    expect(await names('naniwa')).toEqual(['Камък 1000']);
    expect(await names('shi-21')).toEqual(['Гюто Шибата']);
    expect(await names('%')).toEqual([]);
    expect(await names('  ')).toHaveLength(3);
  });

  it('tries the search as typed, in lower case and capitalised', () => {
    expect(searchForms('гюто шибата')).toEqual(['гюто шибата', 'Гюто Шибата']);
    expect(searchForms('Гюто')).toEqual(['Гюто', 'гюто']);
  });

  it('filters by category and status, and shows only active sizes with their stock', async () => {
    const a = await addProduct(db, { name: 'А', status: 'draft' }, sizes(['180 мм', '210 мм']));
    await addProduct(db, { name: 'Б', category: 'malki' });
    await addProduct(db, { name: 'В', status: 'archived' });
    const [v180] = await variantIds(db, a);
    await db.prepare(`UPDATE variants SET status = 'archived' WHERE id = ?`).bind(v180).run();
    expect((await listAdminProducts(db, { category: 'malki' })).products.map((p) => p.name)).toEqual(['Б']);
    const drafts = await listAdminProducts(db, { status: 'draft' });
    expect(drafts.products.map((p) => p.name)).toEqual(['А']);
    expect(drafts.products[0].variants.map((v) => [v.optionValue, v.stock])).toEqual([['210 мм', 2]]);
    expect((await listAdminProducts(db, { status: 'archived', category: 'malki' })).total).toBe(0);
  });
});

describe('creating a product', () => {
  it('makes the slug from the name, and -2 for the same name', async () => {
    const form = formFor({ name: 'Гюто Шибата' }, [{ price: '129,90', stock: '3' }]);
    expect(await createAdminProduct(db, form)).toEqual({ ok: true, id: 'gyuto-shibata', previousCategory: null });
    expect(await createAdminProduct(db, form)).toMatchObject({ ok: true, id: 'gyuto-shibata-2' });
    const p = await load('gyuto-shibata');
    expect(p).toMatchObject({ status: 'draft', isDemo: false });
    expect(p.variants.map((v) => [v.priceCents, v.stock])).toEqual([[12990, 3]]);
  });

  it('refuses a SKU another product uses, on that row', async () => {
    await addProduct(db, { name: 'Друг' }, [{ optionValue: '', sku: 'KT-1', priceCents: 100, stock: 1 }]);
    const r = await createAdminProduct(db, formFor({}, [{ price: '1', stock: '1', sku: 'KT-1' }]));
    expect(r).toEqual({ ok: false, reason: 'fields', errors: { 'v.0.sku': 'Another product or size already uses this SKU.' } });
  });
});

describe('editing a product', () => {
  it('saves every field, and the slug stays when the name changes', async () => {
    const id = await addProduct(db, { name: 'Гюто', status: 'draft' });
    const p = await load(id);
    const r = await saveAdminProduct(db, id, editForm(p, { name: 'Гюто Шибата 210', category: 'malki', status: 'published', series: 's1' }));
    expect(r).toEqual({ ok: true, id, previousCategory: 'gotvarski' });
    const after = await load(id);
    expect(after).toMatchObject({ id: 'gyuto', name: 'Гюто Шибата 210', category: 'malki', status: 'published', series: 's1' });
    expect(after.updatedAt).not.toBe(p.updatedAt);
  });

  it('adds, reorders and edits sizes; a new size gets a key no other size of the product holds', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм', '240 мм']));
    const [v210, v240] = await variantIds(db, id);
    // Archive 240 (it was ordered), then add a new size also called "240 мм".
    await insertOrder(db, order([[v240, 1]]), {});
    let p = await load(id);
    expect(
      await saveAdminProduct(
        db,
        id,
        editForm(p, {}, [{ id: v210, option: '210 мм', price: '100', stock: '2', stock_was: '2' }, { id: v240, remove: '1', stock_was: '1', price: '1', stock: '1' }]),
      ),
    ).toMatchObject({ ok: true });
    p = await load(id);
    const r = await saveAdminProduct(
      db,
      id,
      editForm(p, {}, [
        { option: '240 мм', price: '150', stock: '5' },
        { id: v210, option: '21 см', price: '110,50', stock: '2', stock_was: '2' },
      ]),
    );
    expect(r).toMatchObject({ ok: true });
    p = await load(id);
    const active = p.variants.filter((v) => v.status === 'active');
    expect(active.map((v) => [v.optionValue, v.position, v.priceCents, v.stock])).toEqual([
      ['240 мм', 0, 15000, 5],
      ['21 см', 1, 11050, 2],
    ]);
    // Renaming 210 мм kept its key; the new 240 мм didn't take the archived size's key.
    expect(p.variants.find((v) => v.id === v210)!.optionKey).toBe('210-mm');
    expect(p.variants.find((v) => v.id === v240)).toMatchObject({ status: 'archived', optionKey: '240-mm' });
    expect(active[0].optionKey).toBe('240-mm-2');
  });

  it('deletes a removed size that was never ordered, with its stock row; archives one that was', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['180 мм', '210 мм', '240 мм']));
    const [v180, v210, v240] = await variantIds(db, id);
    const { orderId } = await insertOrder(db, order([[v210, 1]]), {}).then((o) => ({ orderId: o.id }));
    await changeStatus(db, orderId, 'new', 'cancelled'); // still ordered, even if cancelled
    const p = await load(id);
    const r = await saveAdminProduct(
      db,
      id,
      editForm(p, {}, [
        { id: v180, remove: '1', price: '1', stock: '2', stock_was: '2' },
        { id: v210, remove: '1', price: '1', stock: '2', stock_was: '2' },
        { id: v240, option: '240 мм', price: '100', stock: '2', stock_was: '2' },
      ]),
    );
    expect(r).toMatchObject({ ok: true });
    expect((await variantIds(db, id)).sort()).toEqual([v210, v240].sort());
    expect(await stockOf(v180)).toBeNull();
    const after = await load(id);
    expect(after.variants.find((v) => v.id === v210)!.status).toBe('archived');
    expect(after.variants.find((v) => v.id === v180)).toBeUndefined();
    // The order's item still points at the archived size.
    const item = await db.prepare('SELECT variant_id FROM order_items WHERE order_id = ?').bind(orderId).first<string>('variant_id');
    expect(item).toBe(v210);
    expect(await variantsWithOrders(db, [v180, v210, v240])).toEqual(new Set([v210]));
  });

  it('refuses a save when the product changed since the form was opened', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const p = await load(id);
    const stale = editForm(p, { name: 'Първа промяна' });
    expect(await saveAdminProduct(db, id, editForm(p, { name: 'Друг раздел' }))).toMatchObject({ ok: true });
    expect(await saveAdminProduct(db, id, stale)).toEqual({ ok: false, reason: 'conflict' });
    expect((await load(id)).name).toBe('Друг раздел');
  });

  it('refuses a stock change when an order changed the stock meanwhile, and saves nothing', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм'], 10000, 5));
    const [v] = await variantIds(db, id);
    const p = await load(id);
    await insertOrder(db, order([[v, 1]]), {}); // 5 → 4 while the form is open
    const r = await saveAdminProduct(db, id, editForm(p, { name: 'Ново име' }, [{ id: v, option: '210 мм', price: '100', stock: '10', stock_was: '5' }]));
    expect(r).toEqual({ ok: false, reason: 'stock', changes: [{ variantId: v, shown: 5, now: 4 }] });
    expect(await stockOf(v)).toBe(4);
    expect((await load(id)).name).toBe('Гюто');
  });

  it('keeps stock an order changed meanwhile when the admin did not change that field', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм'], 10000, 5));
    const [v] = await variantIds(db, id);
    const p = await load(id);
    await insertOrder(db, order([[v, 1]]), {});
    expect(await saveAdminProduct(db, id, editForm(p, { name: 'Ново' }))).toMatchObject({ ok: true });
    expect(await stockOf(v)).toBe(4);
  });

  it('turns a SKU used by another product into an error on that row; a deleted size’s SKU can be reused', async () => {
    await addProduct(db, { name: 'Друг' }, [{ optionValue: '', sku: 'TAKEN', priceCents: 100, stock: 1 }]);
    const id = await addProduct(db, { name: 'Гюто', optionName: 'Length', optionLabel: 'Дължина' }, [
      { optionValue: '210 мм', sku: 'OWN-1', priceCents: 100, stock: 1 },
      { optionValue: '240 мм', sku: null, priceCents: 100, stock: 1 },
    ]);
    const [a, b] = await variantIds(db, id);
    const p = await load(id);
    const taken = await saveAdminProduct(
      db,
      id,
      editForm(p, {}, [
        { id: a, option: '210 мм', sku: 'OWN-1', price: '1', stock: '1', stock_was: '1' },
        { id: b, option: '240 мм', sku: 'TAKEN', price: '1', stock: '1', stock_was: '1' },
      ]),
    );
    expect(taken).toEqual({ ok: false, reason: 'fields', errors: { 'v.1.sku': 'Another product or size already uses this SKU.' } });
    const reused = await saveAdminProduct(
      db,
      id,
      editForm(p, {}, [
        { id: a, remove: '1', price: '1', stock: '1', stock_was: '1' },
        { id: b, option: '240 мм', sku: 'OWN-1', price: '1', stock: '1', stock_was: '1' },
      ]),
    );
    expect(reused).toMatchObject({ ok: true });
  });

  it('restores an archived size, unless an active size has the same value', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм', '240 мм']));
    const [v210, v240] = await variantIds(db, id);
    await db.prepare(`UPDATE variants SET status = 'archived' WHERE id = ?`).bind(v240).run();
    expect(await restoreVariant(db, id, v240)).toEqual({ ok: true, productId: id, category: 'gotvarski' });
    // It goes after the last active size (210 мм at position 0).
    expect((await load(id)).variants.find((v) => v.id === v240)).toMatchObject({ status: 'active', position: 1 });
    await db.prepare(`UPDATE variants SET status = 'archived' WHERE id = ?`).bind(v210).run();
    await db.prepare(`UPDATE variants SET option_value = '210 мм' WHERE id = ?`).bind(v240).run();
    expect(await restoreVariant(db, id, v210)).toMatchObject({ ok: false });
    expect(await restoreVariant(db, id, 'v_nope')).toMatchObject({ ok: false });
  });

  it('reports a missing product', async () => {
    const id = await addProduct(db, { name: 'Гюто' });
    const form = editForm(await load(id));
    await db.batch([db.prepare('DELETE FROM stock'), db.prepare('DELETE FROM variants'), db.prepare('DELETE FROM products')]);
    expect(await saveAdminProduct(db, id, form)).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('deleting and archiving', () => {
  it('deletes a draft that was never ordered, with its sizes and stock', async () => {
    const id = await addProduct(db, { name: 'Чернова', status: 'draft' }, sizes(['1', '2']));
    const ids = await variantIds(db, id);
    expect(await deleteDraftProduct(db, id)).toEqual({ ok: true, productId: id, category: 'gotvarski' });
    expect(await getAdminProduct(db, id)).toBeNull();
    expect(await stockOf(ids[0])).toBeNull();
  });

  it('refuses to delete a published product or a draft with orders', async () => {
    const live = await addProduct(db, { name: 'Публикуван' });
    expect(await deleteDraftProduct(db, live)).toMatchObject({ ok: false });
    const ordered = await addProduct(db, { name: 'Поръчван' });
    const [v] = await variantIds(db, ordered);
    await insertOrder(db, order([[v, 1]]), {});
    await db.prepare(`UPDATE products SET status = 'draft' WHERE id = ?`).bind(ordered).run();
    expect(await deleteDraftProduct(db, ordered)).toEqual({
      ok: false,
      error: 'This product has orders, so it can’t be deleted. Archive it instead.',
    });
    expect(await getAdminProduct(db, ordered)).not.toBeNull();
  });

  it('archives all demo products at once, and only those', async () => {
    const demo = await addProduct(db, { name: 'Демо 1', isDemo: true });
    await addProduct(db, { name: 'Демо 2', isDemo: true, status: 'archived' });
    const real = await addProduct(db, { name: 'Истински' });
    expect(await archiveAllDemos(db)).toBe(1);
    expect((await load(demo)).status).toBe('archived');
    expect((await load(real)).status).toBe('published');
    expect(await getProductPage(db, demo, { includeDemo: true })).toBeNull();
    expect(await archiveAllDemos(db)).toBe(0);
  });
});

describe('quick edit from the list', () => {
  it('saves price and stock and marks the product updated', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм'], 10000, 5));
    const [v] = await variantIds(db, id);
    const before = (await load(id)).updatedAt;
    expect(await quickEditVariant(db, v, { priceCents: 12990, stock: 7, stockWas: 5 })).toEqual({
      ok: true,
      productId: id,
      category: 'gotvarski',
      priceChanged: true,
      stockChanged: true,
    });
    const after = await load(id);
    expect(after.variants[0]).toMatchObject({ priceCents: 12990, stock: 7 });
    expect(after.updatedAt).not.toBe(before);
  });

  it('refuses a stock change if an order changed it meanwhile, and saves nothing', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм'], 10000, 5));
    const [v] = await variantIds(db, id);
    await insertOrder(db, order([[v, 2]]), {});
    expect(await quickEditVariant(db, v, { priceCents: 20000, stock: 9, stockWas: 5 })).toEqual({ ok: false, reason: 'stock', now: 3 });
    expect((await load(id)).variants[0]).toMatchObject({ priceCents: 10000, stock: 3 });
  });

  it('does nothing when nothing changed, and refuses unknown or archived sizes', async () => {
    const id = await addProduct(db, { name: 'Гюто' }, sizes(['210 мм'], 10000, 5));
    const [v] = await variantIds(db, id);
    expect(await quickEditVariant(db, v, { priceCents: 10000, stock: 5, stockWas: 5 })).toMatchObject({ ok: true, priceChanged: false, stockChanged: false });
    expect(await quickEditVariant(db, 'v_nope', { priceCents: 1, stock: 1, stockWas: 1 })).toEqual({ ok: false, reason: 'missing' });
    await db.prepare(`UPDATE variants SET status = 'archived' WHERE id = ?`).bind(v).run();
    expect(await quickEditVariant(db, v, { priceCents: 1, stock: 1, stockWas: 5 })).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('purging everything', () => {
  it('calls purgeEverything once, and skips without a purger', async () => {
    const purger = { purge: vi.fn(async () => ({ success: true, errors: [] })) };
    expect(await purgeAll(purger)).toBe(true);
    expect(purger.purge).toHaveBeenCalledWith({ purgeEverything: true });
    expect(await purgeAll(undefined)).toBe(false);
  });

  it('finds the purger only where cache.purge() exists', () => {
    const cache = { purge: async () => ({ success: true, errors: [] }) };
    expect(purgerFrom({ cache })).toBe(cache);
    expect(purgerFrom({ cache: {} })).toBeUndefined();
    expect(purgerFrom({})).toBeUndefined();
  });
});
