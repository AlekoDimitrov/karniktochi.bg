// Products and variants in Cloudflare D1. No Astro imports here, so tests can run it against a plain D1.
//
// Visibility: only published products with at least one active variant are public, and demo products
// only while `includeDemo` is on (it is off when the site is built with LAUNCH=1). Drafts, archived
// products and archived variants are never shown and can't be ordered.

export const CATEGORIES = ['gotvarski', 'malki', 'kamani', 'poddrazhka'] as const;
export type Category = (typeof CATEGORIES)[number];
export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const VARIANT_STATUSES = ['active', 'archived'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export type Variant = {
  id: string;
  productId: string;
  position: number;
  optionValue: string;
  optionKey: string;
  sku: string | null;
  priceCents: number;
  status: VariantStatus;
  stock: number;
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  type: string;
  steel: string;
  bladeLengthMm: number | null;
  handle: string;
  weightG: number | null;
  summary: string;
  description: string;
  series: string;
  status: ProductStatus;
  isDemo: boolean;
  optionName: string;
  optionLabel: string;
  nameEn: string | null;
  summaryEn: string | null;
  descriptionEn: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ordered by position. Public reads include active variants only. */
  variants: Variant[];
};

export type Visibility = { includeDemo: boolean };

// ---- Slugs ----------------------------------------------------------------------------------------

// Official Bulgarian transliteration (Закон за транслитерацията, 2009): ъ → a, щ → sht, "ия" at the end
// of a word → "ia", and the law's one exception: България → Bulgaria.
const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .replace(/българия/g, 'bulgaria')
    .replace(/ия(?![а-яё])/g, 'ia')
    .replace(/[а-яё]/g, (c) => LATIN[c] ?? '');
}

/** Lowercase Latin letters, digits and single dashes, from any Bulgarian or Latin text. */
export function slugify(text: string, max = 80): string {
  const s = transliterate(text.normalize('NFKD').replace(/[̀-ͯ]/g, ''))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/, '');
}

/** A slug for a new product that no product (in any status) uses yet: gyuto, gyuto-2, gyuto-3… */
export async function uniqueSlug(db: D1Database, name: string): Promise<string> {
  const base = slugify(name) || 'produkt';
  const rows = await db
    .prepare(`SELECT id FROM products WHERE id = ? OR id LIKE ? ESCAPE '\\'`)
    .bind(base, `${base.replace(/[\\%_]/g, '\\$&')}-%`)
    .all<{ id: string }>();
  const taken = new Set(rows.results.map((r) => r.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ---- Reading --------------------------------------------------------------------------------------

type ProductRow = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  type: string;
  steel: string;
  blade_length_mm: number | null;
  handle: string;
  weight_g: number | null;
  summary: string;
  description: string;
  series: string;
  status: ProductStatus;
  is_demo: number;
  option_name: string;
  option_label: string;
  name_en: string | null;
  summary_en: string | null;
  description_en: string | null;
  created_at: string;
  updated_at: string;
};

type VariantRow = {
  id: string;
  product_id: string;
  position: number;
  option_value: string;
  option_key: string;
  sku: string | null;
  price_cents: number;
  status: VariantStatus;
  stock: number;
};

const toVariant = (r: VariantRow): Variant => ({
  id: r.id,
  productId: r.product_id,
  position: r.position,
  optionValue: r.option_value,
  optionKey: r.option_key,
  sku: r.sku,
  priceCents: r.price_cents,
  status: r.status,
  stock: r.stock,
});

const toProduct = (r: ProductRow, variants: Variant[]): Product => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  category: r.category,
  type: r.type,
  steel: r.steel,
  bladeLengthMm: r.blade_length_mm,
  handle: r.handle,
  weightG: r.weight_g,
  summary: r.summary,
  description: r.description,
  series: r.series,
  status: r.status,
  isDemo: r.is_demo === 1,
  optionName: r.option_name,
  optionLabel: r.option_label,
  nameEn: r.name_en,
  summaryEn: r.summary_en,
  descriptionEn: r.description_en,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  variants,
});

// Stock is the stock row's count; a variant without one has none.
const VARIANT_COLUMNS = 'v.*, COALESCE(s.quantity, 0) AS stock';
const PUBLIC_PRODUCT = `p.status = 'published' AND (?1 = 1 OR p.is_demo = 0)`;

/** Published products with their active variants, newest first. */
export async function listPublicProducts(db: D1Database, vis: Visibility): Promise<Product[]> {
  const [products, variants] = await db.batch([
    db.prepare(`SELECT p.* FROM products p WHERE ${PUBLIC_PRODUCT} ORDER BY p.created_at DESC, p.id`).bind(vis.includeDemo ? 1 : 0),
    db
      .prepare(
        `SELECT ${VARIANT_COLUMNS} FROM variants v JOIN products p ON p.id = v.product_id
         LEFT JOIN stock s ON s.variant_id = v.id
         WHERE v.status = 'active' AND ${PUBLIC_PRODUCT} ORDER BY v.position, v.id`,
      )
      .bind(vis.includeDemo ? 1 : 0),
  ]);
  return assemble(products.results as ProductRow[], variants.results as VariantRow[]).filter((p) => p.variants.length > 0);
}

/** One published product with its active variants, or null if it isn't public. */
export async function getPublicProduct(db: D1Database, id: string, vis: Visibility): Promise<Product | null> {
  const [products, variants] = await db.batch([
    db.prepare(`SELECT p.* FROM products p WHERE p.id = ?2 AND ${PUBLIC_PRODUCT}`).bind(vis.includeDemo ? 1 : 0, id),
    db
      .prepare(
        `SELECT ${VARIANT_COLUMNS} FROM variants v LEFT JOIN stock s ON s.variant_id = v.id
         WHERE v.product_id = ? AND v.status = 'active' ORDER BY v.position, v.id`,
      )
      .bind(id),
  ]);
  const [product] = assemble(products.results as ProductRow[], variants.results as VariantRow[]);
  return product && product.variants.length > 0 ? product : null;
}

/** Every product in any status with all its variants, for the admin. Newest first. */
export async function listAllProducts(db: D1Database): Promise<Product[]> {
  const [products, variants] = await db.batch([
    db.prepare('SELECT p.* FROM products p ORDER BY p.created_at DESC, p.id'),
    db.prepare(`SELECT ${VARIANT_COLUMNS} FROM variants v LEFT JOIN stock s ON s.variant_id = v.id ORDER BY v.position, v.id`),
  ]);
  return assemble(products.results as ProductRow[], variants.results as VariantRow[]);
}

function assemble(products: ProductRow[], variants: VariantRow[]): Product[] {
  const byProduct = new Map<string, Variant[]>();
  for (const v of variants) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(toVariant(v));
    byProduct.set(v.product_id, list);
  }
  return products.map((p) => toProduct(p, byProduct.get(p.id) ?? []));
}

/** Live stock for every public variant, as { [variantId]: count }. */
export async function publicStock(db: D1Database, vis: Visibility): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT v.id, COALESCE(s.quantity, 0) AS stock FROM variants v JOIN products p ON p.id = v.product_id
       LEFT JOIN stock s ON s.variant_id = v.id WHERE v.status = 'active' AND ${PUBLIC_PRODUCT}`,
    )
    .bind(vis.includeDemo ? 1 : 0)
    .all<{ id: string; stock: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, r.stock]));
}

/** A variant that can be ordered right now, with what the order needs to snapshot. */
export type OrderableVariant = {
  variantId: string;
  productId: string;
  /** Brand and name, as shown in orders and emails. */
  name: string;
  /** e.g. "Дължина: 210 мм"; empty for products without choices. */
  optionLabel: string;
  priceCents: number;
};

/** The variants among `ids` that are public and active (others are left out). */
export async function orderableVariants(db: D1Database, ids: string[], vis: Visibility): Promise<Map<string, OrderableVariant>> {
  if (!ids.length) return new Map();
  const rows = await db
    .prepare(
      `SELECT v.id, v.product_id, v.option_value, v.price_cents, p.name, p.brand, p.option_label
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id IN (${ids.map((_, i) => `?${i + 2}`).join(',')}) AND v.status = 'active' AND ${PUBLIC_PRODUCT}`,
    )
    .bind(vis.includeDemo ? 1 : 0, ...ids)
    .all<{ id: string; product_id: string; option_value: string; price_cents: number; name: string; brand: string; option_label: string }>();
  return new Map(
    rows.results.map((r) => [
      r.id,
      {
        variantId: r.id,
        productId: r.product_id,
        name: [r.brand, r.name].filter(Boolean).join(' '),
        optionLabel: optionText(r.option_label, r.option_value),
        priceCents: r.price_cents,
      },
    ]),
  );
}

/** "Дължина: 210 мм", or just the value if there is no label, or '' for the default variant. */
export const optionText = (label: string, value: string) => (value ? (label ? `${label}: ${value}` : value) : '');

// ---- Helpers for pages ----------------------------------------------------------------------------

export const priceRange = (p: Product) => {
  const prices = p.variants.map((v) => v.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
};
export const totalStock = (p: Product) => p.variants.reduce((n, v) => n + Math.max(0, v.stock), 0);
export const hasChoices = (p: Product) => p.variants.length > 1;

// ---- Writing --------------------------------------------------------------------------------------

export type VariantInput = {
  optionValue: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  status?: VariantStatus;
};

export type ProductInput = {
  name: string;
  brand: string;
  category: Category;
  type: string;
  steel: string;
  bladeLengthMm: number | null;
  handle: string;
  weightG: number | null;
  summary: string;
  description: string;
  series: string;
  status: ProductStatus;
  isDemo?: boolean;
  optionName: string;
  optionLabel: string;
  nameEn?: string | null;
  summaryEn?: string | null;
  descriptionEn?: string | null;
  variants: VariantInput[];
};

const randomId = (bytes = 6) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

export const newVariantId = () => `v_${randomId()}`;

/** URL keys for option values, unique within the product: 210-mm, 240-mm, … */
export function optionKeys(values: string[]): string[] {
  const used = new Set<string>();
  return values.map((value, i) => {
    const base = slugify(value, 40) || String(i + 1);
    let key = base;
    for (let n = 2; used.has(key); n++) key = `${base}-${n}`;
    used.add(key);
    return key;
  });
}

/** Creates a product with its variants and their stock in one batch. Returns the new slug. */
export async function createProduct(db: D1Database, input: ProductInput): Promise<string> {
  const id = await uniqueSlug(db, input.name);
  const keys = optionKeys(input.variants.map((v) => v.optionValue));
  const stmts = [
    db
      .prepare(
        `INSERT INTO products (id, name, brand, category, type, steel, blade_length_mm, handle, weight_g, summary,
           description, series, status, is_demo, option_name, option_label, name_en, summary_en, description_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, input.name, input.brand, input.category, input.type, input.steel, input.bladeLengthMm, input.handle,
        input.weightG, input.summary, input.description, input.series, input.status, input.isDemo ? 1 : 0,
        input.optionName, input.optionLabel, input.nameEn ?? null, input.summaryEn ?? null, input.descriptionEn ?? null,
      ),
  ];
  input.variants.forEach((v, i) => {
    const vid = newVariantId();
    stmts.push(
      db
        .prepare(
          `INSERT INTO variants (id, product_id, position, option_value, option_key, sku, price_cents, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(vid, id, i, v.optionValue, keys[i], v.sku, v.priceCents, v.status ?? 'active'),
      db.prepare('INSERT INTO stock (variant_id, quantity) VALUES (?, ?)').bind(vid, v.stock),
    );
  });
  await db.batch(stmts);
  return id;
}

export async function setProductStatus(db: D1Database, id: string, status: ProductStatus) {
  await db
    .prepare(`UPDATE products SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
    .bind(status, id)
    .run();
}

export async function setVariantStatus(db: D1Database, id: string, status: VariantStatus) {
  await db.prepare('UPDATE variants SET status = ? WHERE id = ?').bind(status, id).run();
}
