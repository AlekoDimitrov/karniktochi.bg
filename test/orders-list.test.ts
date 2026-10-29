import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { listOrders } from '../src/lib/orders';

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

// 150 orders, more than D1's limit of 100 bound parameters per query; every third one cancelled.
async function addOrders(n: number) {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 1; i <= n; i++) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO orders (id, public_id, status, customer_name, phone, city, delivery_method, delivery_details,
             payment_method, total_cents) VALUES (?, ?, ?, 'Иван', '+359888123456', 'София', 'office', 'Еконт', 'cod', 10000)`,
        )
        .bind(i, i.toString(16).padStart(32, '0'), i % 3 === 0 ? 'cancelled' : 'new'),
      db
        .prepare(`INSERT INTO order_items (order_id, variant_id, product_id, name, unit_price_cents, quantity) VALUES (?, 'demo-1', 'demo-1', 'Нож', 10000, 1)`)
        .bind(i),
    );
  }
  await db.batch(stmts);
}

describe('listing orders in the admin', () => {
  it('lists more than 100 orders, newest first, each with its items', async () => {
    await addOrders(150);
    const orders = await listOrders(db);
    expect(orders).toHaveLength(150);
    expect(orders[0].id).toBe(150);
    expect(orders.every((o) => o.items.length === 1)).toBe(true);
  });

  it('filters by status and limits, still with the items of exactly those orders', async () => {
    await addOrders(150);
    const cancelled = await listOrders(db, 'cancelled', 30);
    expect(cancelled).toHaveLength(30);
    expect(cancelled.every((o) => o.status === 'cancelled' && o.items.length === 1)).toBe(true);
    expect(cancelled[0].id).toBe(150);
  });
});
