// Orders and live stock in Cloudflare D1. No Astro imports here, so tests can run it against a plain D1.
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
  items: { productId: string; name: string; unitPriceCents: number; quantity: number }[];
};

export type OrderItem = { productId: string; name: string; unitPriceCents: number; quantity: number };

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

/** Thrown when there isn't enough stock. `productIds` lists the items that are short. */
export class OutOfStockError extends Error {
  constructor(public productIds: string[]) {
    super(`Not enough stock for: ${productIds.join(', ')}`);
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
 * `initialStock` gives the product-file stock for products that have no stock row yet.
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
        .prepare('INSERT INTO stock (product_id, quantity) VALUES (?, ?) ON CONFLICT (product_id) DO NOTHING')
        .bind(item.productId, initialStock[item.productId] ?? 0),
      db.prepare('UPDATE stock SET quantity = quantity - ? WHERE product_id = ?').bind(item.quantity, item.productId),
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
          `INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity)
           VALUES ((SELECT id FROM orders WHERE public_id = ?), ?, ?, ?, ?)`,
        )
        .bind(publicId, item.productId, item.name, item.unitPriceCents, item.quantity),
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

async function shortItems(db: D1Database, items: { productId: string; quantity: number }[], initialStock: Record<string, number>) {
  const levels = await getStockLevels(db, initialStock);
  return items.filter((i) => (levels[i.productId] ?? 0) < i.quantity).map((i) => i.productId);
}

/**
 * Changes an order's status and moves stock if the order starts or stops holding it.
 * `expected` is the status the caller saw; if it changed meanwhile, nothing happens and StatusConflictError is thrown.
 */
export async function changeStatus(db: D1Database, id: number, expected: OrderStatus, next: OrderStatus) {
  if (expected === next) return;
  const items = await db
    .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
    .bind(id)
    .all<{ product_id: string; quantity: number }>();

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
        db.prepare('UPDATE stock SET quantity = quantity + ? WHERE product_id = ?').bind(delta * item.quantity, item.product_id),
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
        await shortItems(db, items.results.map((i) => ({ productId: i.product_id, quantity: i.quantity })), {}),
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

type ItemRow = { order_id: number; product_id: string; name: string; unit_price_cents: number; quantity: number };

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
    .map((i) => ({ productId: i.product_id, name: i.name, unitPriceCents: i.unit_price_cents, quantity: i.quantity })),
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

/** Live stock per product: the stock row if there is one, else the product-file stock in `initialStock`. */
export async function getStockLevels(db: D1Database, initialStock: Record<string, number>) {
  const rows = await db.prepare('SELECT product_id, quantity FROM stock').all<{ product_id: string; quantity: number }>();
  const levels = { ...initialStock };
  for (const r of rows.results) levels[r.product_id] = r.quantity;
  return levels;
}

export async function setStock(db: D1Database, productId: string, quantity: number) {
  await db
    .prepare('INSERT INTO stock (product_id, quantity) VALUES (?, ?) ON CONFLICT (product_id) DO UPDATE SET quantity = excluded.quantity')
    .bind(productId, quantity)
    .run();
}
