// The admin's reads and writes for products and their sizes (variants). No Astro imports here, so tests can
// run it against a plain D1. The storefront's reads stay in catalog.ts.
//
// Rules (docs/slice-2-plan.md):
// - A product's id (slug) is set on create and never changes.
// - A size that appears in any order is archived, never deleted. A size's option_key (?v=) is set when the
//   size is created and never changes; a new size never reuses a key another size of the product holds.
// - Saves are refused if the product changed since the form was opened (updated_at), or if a stock count
//   the admin changed was changed by an order in the meantime (the stock shown is sent back and compared).
// Every multi-statement write is one D1 batch, which is a transaction.

import type { FieldErrors, ProductForm } from './admin-input';
import {
  assemble,
  createProduct,
  newVariantId,
  slugify,
  VARIANT_COLUMNS,
  type Category,
  type Product,
  type ProductRow,
  type ProductStatus,
  type VariantRow,
} from './catalog';

/** Products per page in the admin list. */
export const ADMIN_PAGE_SIZE = 50;
/** Longest search text used. */
export const SEARCH_MAX = 100;

// updated_at with milliseconds, so two saves in the same second still differ.
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/**
 * Spellings of the search text to match. SQLite's LIKE ignores case for ASCII only, so Cyrillic is also
 * tried in lower case and with each word capitalised ("гюто шибата" finds "Гюто Шибата").
 */
export function searchForms(q: string): string[] {
  const lower = q.toLocaleLowerCase('bg');
  const capitalised = lower.replace(/(^|\s)(\S)/g, (_, space: string, c: string) => space + c.toLocaleUpperCase('bg'));
  return [...new Set([q, lower, capitalised])];
}

export type AdminListFilter = { q?: string; category?: Category; status?: ProductStatus; page?: number };
export type AdminListPage = { products: Product[]; total: number; page: number; pages: number };

/**
 * One page of the admin product list, newest first, with each product's active sizes and their stock.
 * Search matches the name, the brand, the slug (the name in Latin letters) or any size's SKU. A page past
 * the last one comes back empty.
 */
export async function listAdminProducts(db: D1Database, filter: AdminListFilter = {}): Promise<AdminListPage> {
  const page = filter.page ?? 1;
  const where: string[] = [];
  const params: unknown[] = [];
  const q = (filter.q ?? '').trim().slice(0, SEARCH_MAX);
  if (q) {
    const any = searchForms(q).map((form) => {
      const like = `%${escapeLike(form)}%`;
      params.push(like, like, like, like);
      // The slug is the name in Latin letters, so "takamura" finds "Петти Такамура".
      return `p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR p.id LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM variants sv WHERE sv.product_id = p.id AND sv.sku LIKE ? ESCAPE '\\')`;
    });
    where.push(`(${any.join(' OR ')})`);
  }
  if (filter.category) {
    where.push('p.category = ?');
    params.push(filter.category);
  }
  if (filter.status) {
    where.push('p.status = ?');
    params.push(filter.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pageSql = `SELECT p.id FROM products p ${whereSql} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`;
  const paging = [ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE];
  const [count, products, variants] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM products p ${whereSql}`).bind(...params),
    db.prepare(`SELECT p.* FROM products p WHERE p.id IN (${pageSql}) ORDER BY p.created_at DESC, p.id`).bind(...params, ...paging),
    db
      .prepare(
        `SELECT ${VARIANT_COLUMNS} FROM variants v LEFT JOIN stock s ON s.variant_id = v.id
         WHERE v.status = 'active' AND v.product_id IN (${pageSql}) ORDER BY v.position, v.id`,
      )
      .bind(...params, ...paging),
  ]);
  const total = (count.results[0] as { n: number }).n;
  return {
    products: assemble(products.results as ProductRow[], variants.results as VariantRow[]),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

export type AdminProduct = {
  /** With every size, active and archived, in position order. */
  product: Product;
  /** Sizes that appear in at least one order (these are archived instead of deleted). */
  orderedVariantIds: Set<string>;
};

/** One product in any status, with all its sizes, or null. */
export async function getAdminProduct(db: D1Database, id: string): Promise<AdminProduct | null> {
  const [product, variants, ordered] = await db.batch([
    db.prepare('SELECT * FROM products WHERE id = ?').bind(id),
    db
      .prepare(
        `SELECT ${VARIANT_COLUMNS} FROM variants v LEFT JOIN stock s ON s.variant_id = v.id
         WHERE v.product_id = ? ORDER BY v.status, v.position, v.id`,
      )
      .bind(id),
    db
      .prepare('SELECT DISTINCT variant_id FROM order_items WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)')
      .bind(id),
  ]);
  const [p] = assemble(product.results as ProductRow[], variants.results as VariantRow[]);
  if (!p) return null;
  return { product: p, orderedVariantIds: new Set((ordered.results as { variant_id: string }[]).map((r) => r.variant_id)) };
}

/** Which of these sizes appear in at least one order. */
export async function variantsWithOrders(db: D1Database, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  // Through a JSON array, so any number of ids is one bound parameter.
  const rows = await db
    .prepare('SELECT DISTINCT variant_id FROM order_items WHERE variant_id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(ids))
    .all<{ variant_id: string }>();
  return new Set(rows.results.map((r) => r.variant_id));
}

// ---- Saving --------------------------------------------------------------------------------------

export type StockChange = { variantId: string; shown: number; now: number };

export type SaveResult =
  | { ok: true; id: string; previousCategory: Category | null }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'stock'; changes: StockChange[] }
  | { ok: false; reason: 'fields'; errors: FieldErrors };

const SKU_TAKEN = 'Another product or size already uses this SKU.';

/**
 * Field errors for SKUs in the form that another size already uses, in any product and any status (archived
 * sizes keep theirs). `freed` are sizes this save deletes: their SKUs can be reused in the same save.
 */
async function skuErrors(db: D1Database, form: ProductForm, freed: ReadonlySet<string>): Promise<FieldErrors> {
  const skus = form.variants.map((v) => v.sku).filter((s): s is string => !!s);
  if (!skus.length) return {};
  const rows = await db
    .prepare('SELECT id, sku FROM variants WHERE sku IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(skus))
    .all<{ id: string; sku: string }>();
  const errors: FieldErrors = {};
  form.variants.forEach((v, i) => {
    if (rows.results.some((r) => r.sku === v.sku && r.id !== v.id && !freed.has(r.id))) {
      errors[`v.${form.variantRows[i]}.sku`] = SKU_TAKEN;
    }
  });
  return errors;
}

const isUniqueSku = (e: unknown) => /UNIQUE constraint failed: variants\.sku/.test(String((e as Error)?.message ?? e));
const isCheck = (e: unknown) => /CHECK constraint failed/.test(String((e as Error)?.message ?? e));

/** Creates a product from a valid form. Returns its new id (the slug from its name). */
export async function createAdminProduct(db: D1Database, form: ProductForm): Promise<SaveResult> {
  const errors = await skuErrors(db, form, new Set());
  if (Object.keys(errors).length) return { ok: false, reason: 'fields', errors };
  try {
    const id = await createProduct(db, {
      ...form.fields,
      isDemo: false,
      variants: form.variants.map((v) => ({ optionValue: v.optionValue, sku: v.sku, priceCents: v.priceCents, stock: v.stock })),
    });
    return { ok: true, id, previousCategory: null };
  } catch (e) {
    if (isUniqueSku(e)) return { ok: false, reason: 'fields', errors: { variants: SKU_TAKEN } };
    throw e;
  }
}

/**
 * Sets a size's stock to `next` only if it is still `shown`; otherwise writes -1, which fails the
 * stock_nonnegative CHECK and rolls back the batch. A size without a stock row has 0 (as everywhere).
 */
const guardedStockUpdate = (db: D1Database, variantId: string, shown: number, next: number) => [
  db.prepare('INSERT OR IGNORE INTO stock (variant_id, quantity) VALUES (?, 0)').bind(variantId),
  db.prepare('UPDATE stock SET quantity = CASE WHEN quantity = ? THEN ? ELSE -1 END WHERE variant_id = ?').bind(shown, next, variantId),
];

/** A URL key for a new size, unique among `taken` (every key the product's sizes hold, in any status). */
function newOptionKey(value: string, position: number, taken: Set<string>): string {
  const base = slugify(value, 40) || String(position + 1);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  taken.add(key);
  return key;
}

/**
 * Saves a valid form over an existing product: its fields, and its sizes (update, add, reorder, remove).
 * Removed sizes that were ordered are archived, the others deleted with their stock row. Refused with
 * 'conflict' if the product changed since `form.expectedUpdatedAt`, and with 'stock' if a stock count the
 * admin changed is no longer the count that was shown.
 */
export async function saveAdminProduct(
  db: D1Database,
  id: string,
  form: ProductForm,
  /** The product as the caller just read it with getAdminProduct, to save a second read. */
  loaded?: AdminProduct | null,
): Promise<SaveResult> {
  const current = loaded === undefined ? await getAdminProduct(db, id) : loaded;
  if (!current) return { ok: false, reason: 'missing' };
  const { product, orderedVariantIds } = current;
  if (product.updatedAt !== form.expectedUpdatedAt) return { ok: false, reason: 'conflict' };

  const deleted = new Set(form.removed.filter((v) => !orderedVariantIds.has(v)));
  const errors = await skuErrors(db, form, deleted);
  if (Object.keys(errors).length) return { ok: false, reason: 'fields', errors };

  const f = form.fields;
  // If updated_at is no longer the one the form was opened with, status becomes an invalid value: the CHECK
  // fails and the whole batch rolls back (the same guard as order status changes in orders.ts).
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE products SET name = ?, brand = ?, category = ?, type = ?, steel = ?, blade_length_mm = ?, handle = ?,
           weight_g = ?, summary = ?, description = ?, series = ?, option_name = ?, option_label = ?, name_en = ?,
           summary_en = ?, description_en = ?, status = CASE WHEN updated_at = ? THEN ? ELSE 'conflict' END,
           updated_at = ${NOW}
         WHERE id = ?`,
      )
      .bind(
        f.name, f.brand, f.category, f.type, f.steel, f.bladeLengthMm, f.handle, f.weightG, f.summary, f.description,
        f.series, f.optionName, f.optionLabel, f.nameEn, f.summaryEn, f.descriptionEn, form.expectedUpdatedAt, f.status, id,
      ),
  ];

  for (const removedId of form.removed) {
    if (!deleted.has(removedId)) {
      stmts.push(db.prepare(`UPDATE variants SET status = 'archived' WHERE id = ? AND product_id = ?`).bind(removedId, id));
    } else {
      stmts.push(
        db.prepare('DELETE FROM stock WHERE variant_id = ?').bind(removedId),
        db.prepare('DELETE FROM variants WHERE id = ? AND product_id = ?').bind(removedId, id),
      );
    }
  }

  const takenKeys = new Set(product.variants.map((v) => v.optionKey));
  const stockChecked: { variantId: string; shown: number }[] = [];
  form.variants.forEach((v, position) => {
    if (v.id) {
      stmts.push(
        db
          .prepare(`UPDATE variants SET option_value = ?, sku = ?, price_cents = ?, position = ?, status = 'active' WHERE id = ? AND product_id = ?`)
          .bind(v.optionValue, v.sku, v.priceCents, position, v.id, id),
      );
      if (v.stockWas !== null && v.stock !== v.stockWas) {
        stmts.push(...guardedStockUpdate(db, v.id, v.stockWas, v.stock));
        stockChecked.push({ variantId: v.id, shown: v.stockWas });
      }
    } else {
      const vid = newVariantId();
      stmts.push(
        db
          .prepare(
            `INSERT INTO variants (id, product_id, position, option_value, option_key, sku, price_cents, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          )
          .bind(vid, id, position, v.optionValue, newOptionKey(v.optionValue, position, takenKeys), v.sku, v.priceCents),
        db.prepare('INSERT INTO stock (variant_id, quantity) VALUES (?, ?)').bind(vid, v.stock),
      );
    }
  });

  try {
    await db.batch(stmts);
  } catch (e) {
    if (isUniqueSku(e)) return { ok: false, reason: 'fields', errors: { variants: SKU_TAKEN } };
    if (!isCheck(e)) throw e;
    // Something changed in the meantime. Find out what, for the message.
    const now = await getAdminProduct(db, id);
    if (!now || now.product.updatedAt !== form.expectedUpdatedAt) return { ok: false, reason: 'conflict' };
    const stockNow = new Map(now.product.variants.map((v) => [v.id, v.stock]));
    const changes = stockChecked
      .map(({ variantId, shown }) => ({ variantId, shown, now: stockNow.get(variantId) ?? 0 }))
      .filter((c) => c.now !== c.shown);
    if (changes.length) return { ok: false, reason: 'stock', changes };
    throw e;
  }
  return { ok: true, id, previousCategory: product.category };
}

// ---- Single actions ------------------------------------------------------------------------------

export type ActionResult = { ok: true; productId: string; category: Category } | { ok: false; error: string };

/**
 * Makes an archived size active again. Refused if an active size of the product already has the same option
 * value. Its URL key is still its own (new sizes never reuse an archived size's key).
 */
export async function restoreVariant(db: D1Database, productId: string, variantId: string): Promise<ActionResult> {
  const current = await getAdminProduct(db, productId);
  const variant = current?.product.variants.find((v) => v.id === variantId);
  if (!current || !variant || variant.status !== 'archived') return { ok: false, error: 'That size can’t be restored. Reload the page.' };
  const value = variant.optionValue.toLocaleLowerCase('bg');
  if (current.product.variants.some((v) => v.status === 'active' && v.optionValue.toLocaleLowerCase('bg') === value)) {
    return { ok: false, error: `An active size is already called “${variant.optionValue}”. Rename it first.` };
  }
  const position = Math.max(-1, ...current.product.variants.filter((v) => v.status === 'active').map((v) => v.position)) + 1;
  await db.batch([
    db.prepare(`UPDATE variants SET status = 'active', position = ? WHERE id = ? AND product_id = ?`).bind(position, variantId, productId),
    db.prepare(`UPDATE products SET updated_at = ${NOW} WHERE id = ?`).bind(productId),
  ]);
  return { ok: true, productId, category: current.product.category };
}

/** Whether any order contains a size of this product (or was placed for the product id itself). */
export async function productHasOrders(db: D1Database, productId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS yes FROM order_items
       WHERE product_id = ?1 OR variant_id IN (SELECT id FROM variants WHERE product_id = ?1) LIMIT 1`,
    )
    .bind(productId)
    .first<number>('yes');
  return row === 1;
}

/**
 * Deletes a draft that was never ordered, with its sizes and their stock. Anything else is refused: published
 * and archived products, and drafts with orders, can only be archived.
 */
export async function deleteDraftProduct(db: D1Database, productId: string): Promise<ActionResult> {
  const product = await db.prepare('SELECT status, category FROM products WHERE id = ?').bind(productId).first<{ status: ProductStatus; category: Category }>();
  if (!product) return { ok: false, error: 'This product no longer exists.' };
  if (product.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted. Archive this product instead.' };
  if (await productHasOrders(db, productId)) return { ok: false, error: 'This product has orders, so it can’t be deleted. Archive it instead.' };
  // Drafts aren't public, so no order can arrive between the check and the delete.
  await db.batch([
    db.prepare('DELETE FROM stock WHERE variant_id IN (SELECT id FROM variants WHERE product_id = ?)').bind(productId),
    db.prepare('DELETE FROM variants WHERE product_id = ?').bind(productId),
    db.prepare(`DELETE FROM products WHERE id = ? AND status = 'draft'`).bind(productId),
  ]);
  return { ok: true, productId, category: product.category };
}

/** How many demo products aren't archived yet (the products list offers to archive them). */
export async function countUnarchivedDemos(db: D1Database): Promise<number> {
  return (await db.prepare(`SELECT COUNT(*) AS n FROM products WHERE is_demo = 1 AND status <> 'archived'`).first<number>('n')) ?? 0;
}

/** Archives every demo product that isn't archived yet. Returns how many were archived. */
export async function archiveAllDemos(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`UPDATE products SET status = 'archived', updated_at = ${NOW} WHERE is_demo = 1 AND status <> 'archived'`)
    .run();
  return result.meta.changes;
}

// ---- Quick edit ----------------------------------------------------------------------------------

export type QuickEdit = { priceCents: number; stock: number; stockWas: number };

export type QuickEditResult =
  | { ok: true; productId: string; category: Category; priceChanged: boolean; stockChanged: boolean }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'stock'; now: number };

/**
 * Sets one active size's price and stock from the products list. The stock is saved only if it is still
 * `stockWas` (the count that was shown); if an order changed it, nothing is saved. Either change marks the
 * product as updated, so an edit form open in another tab won't overwrite it.
 */
export async function quickEditVariant(db: D1Database, variantId: string, edit: QuickEdit): Promise<QuickEditResult> {
  const row = await db
    .prepare(
      `SELECT v.product_id, v.price_cents, COALESCE(s.quantity, 0) AS stock, p.category
       FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN stock s ON s.variant_id = v.id
       WHERE v.id = ? AND v.status = 'active'`,
    )
    .bind(variantId)
    .first<{ product_id: string; price_cents: number; stock: number; category: Category }>();
  if (!row) return { ok: false, reason: 'missing' };
  const priceChanged = edit.priceCents !== row.price_cents;
  const stockChanged = edit.stock !== edit.stockWas;
  if (!priceChanged && !stockChanged) return { ok: true, productId: row.product_id, category: row.category, priceChanged, stockChanged };
  const stmts: D1PreparedStatement[] = [];
  if (priceChanged) stmts.push(db.prepare('UPDATE variants SET price_cents = ? WHERE id = ?').bind(edit.priceCents, variantId));
  if (stockChanged) stmts.push(...guardedStockUpdate(db, variantId, edit.stockWas, edit.stock));
  stmts.push(db.prepare(`UPDATE products SET updated_at = ${NOW} WHERE id = ?`).bind(row.product_id));
  try {
    await db.batch(stmts);
  } catch (e) {
    if (!isCheck(e)) throw e;
    const now = await db.prepare('SELECT COALESCE((SELECT quantity FROM stock WHERE variant_id = ?), 0) AS n').bind(variantId).first<number>('n');
    return { ok: false, reason: 'stock', now: now ?? 0 };
  }
  return { ok: true, productId: row.product_id, category: row.category, priceChanged, stockChanged };
}
