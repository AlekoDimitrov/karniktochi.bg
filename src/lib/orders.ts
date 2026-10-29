// Orders and live stock in Cloudflare D1. No Astro imports here, so tests can run it against a plain D1.
// Stock and order items are keyed by variant id (see migrations/0002_products.sql).
//
// Stock rule: an order holds its items while its status is in HOLDING_STATUSES. Moving it to
// cancelled/refused puts the items back; moving it out of those again takes them again.
// Overselling is impossible: the stock table has CHECK (quantity >= 0), so a batch that would go
// below zero fails and D1 rolls back the whole batch.

export const ORDER_STATUSES = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refused'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const RELEASED_STATUSES: readonly OrderStatus[] = ['cancelled', 'refused'];
export const holdsStock = (s: OrderStatus) => !RELEASED_STATUSES.includes(s);

export type DeliveryMethod = 'office' | 'address';
export type PaymentMethod = 'cod' | 'bank_transfer';

export type NewOrder = {
  customerName: string;
  phone: string;
  email: string | null;
  city: string;
  deliveryMethod: DeliveryMethod;
  deliveryDetails: string;
  customerNote: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
};

/** `name` and `optionLabel` are snapshots taken when the order was placed (e.g. "Дължина: 210 мм", or ''). */
export type OrderItem = {
  variantId: string;
  productId: string;
  name: string;
  optionLabel: string;
  unitPriceCents: number;
  quantity: number;
};

/** How an item is named in emails, the admin and the thank-you page. */
export const itemTitle = (i: Pick<OrderItem, 'name' | 'optionLabel'>) => (i.optionLabel ? `${i.name} (${i.optionLabel})` : i.name);

export type Order = Omit<NewOrder, 'items'> & {
  id: number;
  publicId: string;
  reference: string;
  status: OrderStatus;
  totalCents: number;
  internalNote: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

/** Thrown when there isn't enough stock. `variantIds` lists the items that are short. */
export class OutOfStockError extends Error {
  constructor(public variantIds: string[]) {
    super(`Not enough stock for: ${variantIds.join(', ')}`);
  }
}

/** Thrown when the order changed status in the meantime (e.g. two admin tabs). */
export class StatusConflictError extends Error {}

/** Human-readable order number, used on the phone, in emails and as the bank transfer reference. */
export const orderReference = (id: number) => `KT-${String(id).padStart(5, '0')}`;

const isConstraint = (e: unknown, name: string) => String((e as Error)?.message ?? e).includes(name);

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Inserts the order and reserves its stock in one transaction.
 * `initialStock` gives the starting stock for variants that have no stock row yet (variants created
 * through the catalog always have one).
 */
export async function insertOrder(
  db: D1Database,
  order: NewOrder,
  initialStock: Record<string, number>,
): Promise<{ id: number; publicId: string; reference: string; totalCents: number }> {
  const publicId = randomId();
  const totalCents = order.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  const stmts: D1PreparedStatement[] = [];
  for (const item of order.items) {
    stmts.push(
      db
        .prepare('INSERT INTO stock (variant_id, quantity) VALUES (?, ?) ON CONFLICT (variant_id) DO NOTHING')
        .bind(item.variantId, initialStock[item.variantId] ?? 0),
      db.prepare('UPDATE stock SET quantity = quantity - ? WHERE variant_id = ?').bind(item.quantity, item.variantId),
    );
  }
  const insertOrderStmt = db
    .prepare(
      `INSERT INTO orders (public_id, customer_name, phone, email, city, delivery_method, delivery_details,
         customer_note, payment_method, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      publicId,
      order.customerName,
      order.phone,
      order.email,
      order.city,
      order.deliveryMethod,
      order.deliveryDetails,
      order.customerNote,
      order.paymentMethod,
      totalCents,
    );
  stmts.push(insertOrderStmt);
  for (const item of order.items) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, product_id, name, option_label, unit_price_cents, quantity)
           VALUES ((SELECT id FROM orders WHERE public_id = ?), ?, ?, ?, ?, ?, ?)`,
        )
        .bind(publicId, item.variantId, item.productId, item.name, item.optionLabel, item.unitPriceCents, item.quantity),
    );
  }

  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (e) {
    if (isConstraint(e, 'stock_nonnegative')) throw new OutOfStockError(await shortItems(db, order.items, initialStock));
    throw e;
  }
  const id = (results[order.items.length * 2] as D1Result<{ id: number }>).results[0].id;
  return { id, publicId, reference: orderReference(id), totalCents };
}

async function shortItems(db: D1Database, items: { variantId: string; quantity: number }[], initialStock: Record<string, number>) {
  const levels = await getStockLevels(db, initialStock);
  return items.filter((i) => (levels[i.variantId] ?? 0) < i.quantity).map((i) => i.variantId);
}

/**
 * Changes an order's status and moves stock if the order starts or stops holding it.
 * `expected` is the status the caller saw; if it changed meanwhile, nothing happens and StatusConflictError is thrown.
 */
export async function changeStatus(db: D1Database, id: number, expected: OrderStatus, next: OrderStatus) {
  if (expected === next) return;
  const items = await db
    .prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?')
    .bind(id)
    .all<{ variant_id: string; quantity: number }>();

  // If the status is no longer `expected`, this writes an invalid status, which fails the valid_status
  // CHECK and rolls back the whole batch, including the stock changes after it.
  const stmts = [
    db
      .prepare(
        `UPDATE orders SET status = CASE WHEN status = ? THEN ? ELSE 'conflict' END,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ?`,
      )
      .bind(expected, next, id),
  ];
  const delta = holdsStock(expected) === holdsStock(next) ? 0 : holdsStock(next) ? -1 : 1;
  if (delta !== 0) {
    for (const item of items.results) {
      stmts.push(
        db.prepare('UPDATE stock SET quantity = quantity + ? WHERE variant_id = ?').bind(delta * item.quantity, item.variant_id),
      );
    }
  }

  let results: D1Result[];
  try {
    results = await db.batch(stmts);
  } catch (e) {
    if (isConstraint(e, 'valid_status')) throw new StatusConflictError(`Order ${id} is no longer "${expected}"`);
    if (isConstraint(e, 'stock_nonnegative')) {
      throw new OutOfStockError(
        await shortItems(db, items.results.map((i) => ({ variantId: i.variant_id, quantity: i.quantity })), {}),
      );
    }
    throw e;
  }
  if (results[0].meta.changes === 0) throw new Error(`Order ${id} not found`);
}

export async function setInternalNote(db: D1Database, id: number, note: string) {
  await db
    .prepare(`UPDATE orders SET internal_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
    .bind(note, id)
    .run();
}

type OrderRow = {
  id: number;
  public_id: string;
  status: OrderStatus;
  customer_name: string;
  phone: string;
  email: string | null;
  city: string;
  delivery_method: DeliveryMethod;
  delivery_details: string;
  customer_note: string;
  payment_method: PaymentMethod;
  total_cents: number;
  internal_note: string;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  order_id: number;
  variant_id: string;
  product_id: string | null;
  name: string;
  option_label: string;
  unit_price_cents: number;
  quantity: number;
};

const toOrder = (r: OrderRow, items: ItemRow[]): Order => ({
  id: r.id,
  publicId: r.public_id,
  reference: orderReference(r.id),
  status: r.status,
  customerName: r.customer_name,
  phone: r.phone,
  email: r.email,
  city: r.city,
  deliveryMethod: r.delivery_method,
  deliveryDetails: r.delivery_details,
  customerNote: r.customer_note,
  paymentMethod: r.payment_method,
  totalCents: r.total_cents,
  internalNote: r.internal_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  items: items
    .filter((i) => i.order_id === r.id)
    .map((i) => ({
      variantId: i.variant_id,
      productId: i.product_id ?? i.variant_id,
      name: i.name,
      optionLabel: i.option_label,
      unitPriceCents: i.unit_price_cents,
      quantity: i.quantity,
    })),
});

/** Newest first. Pass a status to filter. */
export async function listOrders(db: D1Database, status?: OrderStatus, limit = 200): Promise<Order[]> {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status, limit] : [limit];
  const orders = await db
    .prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ?`)
    .bind(...params)
    .all<OrderRow>();
  if (!orders.results.length) return [];
  const ids = orders.results.map((o) => o.id);
  const items = await db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<ItemRow>();
  return orders.results.map((o) => toOrder(o, items.results));
}

async function getOrderWhere(db: D1Database, column: 'id' | 'public_id', value: number | string) {
  const row = await db.prepare(`SELECT * FROM orders WHERE ${column} = ?`).bind(value).first<OrderRow>();
  if (!row) return null;
  const items = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(row.id).all<ItemRow>();
  return toOrder(row, items.results);
}

export const getOrder = (db: D1Database, id: number) => getOrderWhere(db, 'id', id);
export const getOrderByPublicId = (db: D1Database, publicId: string) => getOrderWhere(db, 'public_id', publicId);

/** Live stock per variant: the stock row if there is one, else the starting stock in `initialStock`. */
export async function getStockLevels(db: D1Database, initialStock: Record<string, number>) {
  const rows = await db.prepare('SELECT variant_id, quantity FROM stock').all<{ variant_id: string; quantity: number }>();
  const levels = { ...initialStock };
  for (const r of rows.results) levels[r.variant_id] = r.quantity;
  return levels;
}

export async function setStock(db: D1Database, variantId: string, quantity: number) {
  await db
    .prepare('INSERT INTO stock (variant_id, quantity) VALUES (?, ?) ON CONFLICT (variant_id) DO UPDATE SET quantity = excluded.quantity')
    .bind(variantId, quantity)
    .run();
}
