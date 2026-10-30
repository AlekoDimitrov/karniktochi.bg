// Server-side checks for the admin product form and quick edit. Pure functions, no database: the data
// layer (admin-products.ts) checks what needs the database, such as SKUs used by other products.
//
// The form posts product fields by column-like names (name, blade_length_mm, …) and one group of fields
// per size row: v.<n>.id, v.<n>.option, v.<n>.sku, v.<n>.price, v.<n>.stock, v.<n>.stock_was, v.<n>.pos
// and v.<n>.remove. <n> is the row's index in the form; v.<n>.pos (if valid) sets the order.

import { CATEGORIES, PRODUCT_STATUSES, type Category, type ProductStatus } from './catalog';
import { parseStockQuantity } from './orders';

// ---- Prices ---------------------------------------------------------------------------------------

/** Highest price the admin accepts, in cents (€100,000.00). */
export const MAX_PRICE_CENTS = 10_000_000;

export const PRICE_ERRORS = {
  empty: 'Enter a price.',
  format: 'Enter a price in euros, for example 129,90 or 129.90.',
  dotThousands: 'Don’t use a dot between thousands. Write 1299,90 or 1 299,90.',
  decimals: 'Use at most 2 decimals, for example 129,90.',
  zero: 'The price must be more than 0.',
  tooHigh: 'The price can be at most 100 000,00 €.',
} as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A price typed in euros to exact integer cents. Accepts a dot or comma before the cents, at most 2
 * decimals, spaces between thousands (1 299,90) and a € sign. Rejects dots between thousands (1.299,90
 * and 1.299 are ambiguous). Parsed digit by digit, never through floating point.
 */
export function parsePriceToCents(value: unknown): Parsed<number> {
  const s = String(value ?? '')
    .replace(/[  ]/g, ' ')
    .trim()
    .replace(/^€\s*/, '')
    .replace(/\s*€$/, '')
    .trim();
  if (!s) return { ok: false, error: PRICE_ERRORS.empty };
  if (/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(s)) return { ok: false, error: PRICE_ERRORS.dotThousands };
  const m = /^(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d+))?$/.exec(s);
  if (!m) return { ok: false, error: PRICE_ERRORS.format };
  const [, whole, decimals = ''] = m;
  if (decimals.length > 2) return { ok: false, error: PRICE_ERRORS.decimals };
  const euros = whole.replace(/ /g, '');
  if (euros.length > 6) return { ok: false, error: PRICE_ERRORS.tooHigh };
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  if (cents === 0) return { ok: false, error: PRICE_ERRORS.zero };
  if (cents > MAX_PRICE_CENTS) return { ok: false, error: PRICE_ERRORS.tooHigh };
  return { ok: true, value: cents };
}

/** Cents back to how the form shows them: 12990 → "129,90". */
export const centsToInput = (cents: number) => `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

export const STOCK_ERROR = 'Enter a whole number from 0 to 100 000.';

// ---- Product form ---------------------------------------------------------------------------------

/** Text fields: form name, longest allowed length, and whether it may be empty. */
export const TEXT_FIELDS = {
  name: { max: 120, required: true },
  brand: { max: 80 },
  type: { max: 80 },
  steel: { max: 80 },
  handle: { max: 120 },
  summary: { max: 300 },
  description: { max: 10_000 },
  series: { max: 80 },
  option_name: { max: 40 },
  option_label: { max: 40 },
  name_en: { max: 120 },
  summary_en: { max: 300 },
  description_en: { max: 10_000 },
} as const satisfies Record<string, { max: number; required?: boolean }>;

type TextField = keyof typeof TEXT_FIELDS;

/** Whole-number fields: empty means "not set". */
export const NUMBER_FIELDS = {
  blade_length_mm: { min: 1, max: 1000 },
  weight_g: { min: 1, max: 20_000 },
} as const;

type NumberField = keyof typeof NUMBER_FIELDS;

export const OPTION_VALUE_MAX = 40;
export const SKU_PATTERN = /^[A-Za-z0-9._-]{1,40}$/;
/** Most size rows one product form may send. */
export const MAX_VARIANT_ROWS = 50;

/** One size row as typed, for showing the form again. */
export type RawVariantRow = {
  id: string;
  option: string;
  sku: string;
  price: string;
  stock: string;
  stockWas: string;
  remove: boolean;
};

/** Everything as typed. On an error the form is shown again from this. */
export type RawProductForm = {
  fields: Record<string, string>;
  rows: RawVariantRow[];
  expectedUpdatedAt: string;
};

export type VariantForm = {
  /** null for a new size. */
  id: string | null;
  optionValue: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  /** The stock shown when the form was opened; null for a new size. Saved only if it is still this. */
  stockWas: number | null;
};

export type ProductFields = {
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
  optionName: string;
  optionLabel: string;
  nameEn: string | null;
  summaryEn: string | null;
  descriptionEn: string | null;
};

export type ProductForm = {
  fields: ProductFields;
  /** The sizes to keep, in their new order. */
  variants: VariantForm[];
  /** For each of `variants`, its row in the form (for errors found later, such as a SKU used elsewhere). */
  variantRows: number[];
  /** Ids of existing sizes marked for removal (archived if ordered, else deleted). */
  removed: string[];
  /** updated_at of the product when the form was opened; empty for a new product. */
  expectedUpdatedAt: string;
};

/** Error messages by field name (`name`, `v.2.price`, …); `variants` is about the sizes as a whole. */
export type FieldErrors = Record<string, string>;

export type ProductFormResult =
  | { ok: true; value: ProductForm; raw: RawProductForm }
  | { ok: false; errors: FieldErrors; raw: RawProductForm };

/** Normalises line endings and trims; Astro escapes everything on output, so no other cleaning is needed. */
const clean = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

/** Reads the posted form into plain strings, the size rows in their submitted order. */
export function readProductForm(form: FormData): RawProductForm {
  const fields: Record<string, string> = {};
  for (const key of [...Object.keys(TEXT_FIELDS), ...Object.keys(NUMBER_FIELDS), 'category', 'status']) {
    fields[key] = clean(form.get(key));
  }
  const indexes = new Set<number>();
  for (const key of form.keys()) {
    const m = /^v\.(\d{1,3})\./.exec(key);
    if (m) indexes.add(Number(m[1]));
  }
  const ordered = [...indexes]
    .sort((a, b) => a - b)
    .map((n, i) => {
      const pos = Number(clean(form.get(`v.${n}.pos`)));
      return { n, sortKey: Number.isInteger(pos) && clean(form.get(`v.${n}.pos`)) !== '' ? pos : i + 1, i };
    })
    .sort((a, b) => a.sortKey - b.sortKey || a.i - b.i);
  const rows = ordered.map(({ n }) => ({
    id: clean(form.get(`v.${n}.id`)),
    option: clean(form.get(`v.${n}.option`)),
    sku: clean(form.get(`v.${n}.sku`)),
    price: clean(form.get(`v.${n}.price`)),
    stock: clean(form.get(`v.${n}.stock`)),
    stockWas: clean(form.get(`v.${n}.stock_was`)),
    remove: clean(form.get(`v.${n}.remove`)) === '1',
  }));
  return { fields, rows, expectedUpdatedAt: clean(form.get('updated_at')) };
}

/** A new row the user left completely empty (the spare rows shown without JavaScript). */
const isBlankNewRow = (r: RawVariantRow) => !r.id && !r.option && !r.sku && !r.price && !r.stock;

/**
 * Checks the whole product form. Nothing may be saved unless `ok` is true. `existingIds` are the ids of
 * the product's sizes in the database (any status); a posted id that isn't one of them is an error.
 */
export function parseProductForm(form: FormData, existingIds: ReadonlySet<string> = new Set()): ProductFormResult {
  const raw = readProductForm(form);
  const errors: FieldErrors = {};
  const f = raw.fields;

  for (const [key, rule] of Object.entries(TEXT_FIELDS) as [TextField, { max: number; required?: boolean }][]) {
    if (rule.required && !f[key]) errors[key] = 'Required.';
    else if (f[key].length > rule.max) errors[key] = `At most ${rule.max} characters.`;
  }
  const numbers = {} as Record<NumberField, number | null>;
  for (const [key, rule] of Object.entries(NUMBER_FIELDS) as [NumberField, { min: number; max: number }][]) {
    if (!f[key]) numbers[key] = null;
    else if (/^\d{1,6}$/.test(f[key]) && Number(f[key]) >= rule.min && Number(f[key]) <= rule.max) numbers[key] = Number(f[key]);
    else {
      numbers[key] = null;
      errors[key] = `Leave empty or enter a whole number from ${rule.min} to ${rule.max}.`;
    }
  }
  if (!(CATEGORIES as readonly string[]).includes(f.category)) errors.category = 'Choose a category.';
  if (!(PRODUCT_STATUSES as readonly string[]).includes(f.status)) errors.status = 'Choose a status.';

  // ---- Sizes ----
  if (raw.rows.length > MAX_VARIANT_ROWS) errors.variants = `At most ${MAX_VARIANT_ROWS} sizes.`;
  const variants: VariantForm[] = [];
  // Which row of raw.rows each kept size came from, for the error keys (v.<row>.<field>).
  const rowOf = new Map<VariantForm, number>();
  const removed: string[] = [];
  const seenIds = new Set<string>();
  const indexed = raw.rows.map((row, index) => ({ row, index }));
  for (const { row, index } of indexed) {
    const at = (field: string) => `v.${index}.${field}`;
    if (row.id) {
      if (!existingIds.has(row.id) || seenIds.has(row.id)) {
        errors.variants = 'The sizes changed while you were editing. Reload the page.';
        continue;
      }
      seenIds.add(row.id);
      if (row.remove) {
        removed.push(row.id);
        continue;
      }
    } else if (row.remove || isBlankNewRow(row)) {
      continue;
    }
    if (row.option.length > OPTION_VALUE_MAX) errors[at('option')] = `At most ${OPTION_VALUE_MAX} characters.`;
    if (row.sku && !SKU_PATTERN.test(row.sku)) errors[at('sku')] = 'Letters, digits, dot, dash and underscore only; at most 40.';
    const price = parsePriceToCents(row.price);
    if (!price.ok) errors[at('price')] = price.error;
    const stock = parseStockQuantity(row.stock);
    if (stock === null) errors[at('stock')] = STOCK_ERROR;
    const stockWas = row.id ? parseStockQuantity(row.stockWas) : null;
    if (row.id && stockWas === null) errors.variants = 'The form is incomplete. Reload the page.';
    const variant: VariantForm = {
      id: row.id || null,
      optionValue: row.option,
      sku: row.sku || null,
      priceCents: price.ok ? price.value : 0,
      stock: stock ?? 0,
      stockWas,
    };
    variants.push(variant);
    rowOf.set(variant, index);
  }

  if (variants.length === 0 && !errors.variants) errors.variants = 'Add at least one size.';
  if (variants.length > 1) {
    if (!f.option_name) errors.option_name = 'Required when there is more than one size.';
    if (!f.option_label) errors.option_label = 'Required when there is more than one size.';
    const seen = new Map<string, number>();
    for (const v of variants) {
      const row = rowOf.get(v)!;
      if (!v.optionValue) errors[`v.${row}.option`] ??= 'Required when there is more than one size.';
      const key = v.optionValue.toLocaleLowerCase('bg');
      if (v.optionValue && seen.has(key)) errors[`v.${row}.option`] ??= 'Another size already has this value.';
      seen.set(key, row);
    }
  }
  const skus = new Map<string, number>();
  for (const v of variants) {
    if (!v.sku) continue;
    const row = rowOf.get(v)!;
    if (skus.has(v.sku.toUpperCase())) errors[`v.${row}.sku`] ??= 'Another size in this form has this SKU.';
    skus.set(v.sku.toUpperCase(), row);
  }
  if (f.status === 'published' && variants.length === 0) errors.status = 'A published product needs at least one size.';

  if (Object.keys(errors).length) return { ok: false, errors, raw };
  return {
    ok: true,
    raw,
    value: {
      fields: {
        name: f.name,
        brand: f.brand,
        category: f.category as Category,
        type: f.type,
        steel: f.steel,
        bladeLengthMm: numbers.blade_length_mm,
        handle: f.handle,
        weightG: numbers.weight_g,
        summary: f.summary,
        description: f.description,
        series: f.series,
        status: f.status as ProductStatus,
        optionName: f.option_name,
        optionLabel: f.option_label,
        nameEn: f.name_en || null,
        summaryEn: f.summary_en || null,
        descriptionEn: f.description_en || null,
      },
      variants,
      variantRows: variants.map((v) => rowOf.get(v)!),
      removed,
      expectedUpdatedAt: raw.expectedUpdatedAt,
    },
  };
}

// ---- Quick edit -----------------------------------------------------------------------------------

export type QuickEditForm = { variantId: string; priceCents: number; stock: number; stockWas: number };

/** Errors are keyed `price` or `stock`; `form` means the post itself is broken (reload the page). */
export type QuickEditFormResult =
  | { ok: true; value: QuickEditForm }
  | { ok: false; variantId: string; errors: { price?: string; stock?: string; form?: string } };

/** One size's price and stock from the quick edit form on the products list. */
export function parseQuickEdit(form: FormData): QuickEditFormResult {
  const variantId = clean(form.get('id'));
  const stockWas = parseStockQuantity(clean(form.get('stock_was')));
  if (!variantId || stockWas === null) return { ok: false, variantId, errors: { form: 'The form is incomplete. Reload the page.' } };
  const price = parsePriceToCents(form.get('price'));
  const stock = parseStockQuantity(clean(form.get('stock')));
  const errors: { price?: string; stock?: string } = {};
  if (!price.ok) errors.price = price.error;
  if (stock === null) errors.stock = STOCK_ERROR;
  if (!price.ok || stock === null) return { ok: false, variantId, errors };
  return { ok: true, value: { variantId, priceCents: price.value, stock, stockWas } };
}
