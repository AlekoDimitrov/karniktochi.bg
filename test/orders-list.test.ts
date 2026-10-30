import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { listOrders, listOrdersPage, ORDERS_PAGE_SIZE } from '../src/lib/orders';

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

describe('paging orders in the admin', () => {
  it('shows 50 per page, newest first, with the page count', async () => {
    await addOrders(120);
    const first = await listOrdersPage(db, {});
    expect(first).toMatchObject({ total: 120, page: 1, pages: 3 });
    expect(first.orders.map((o) => o.id)).toEqual(range(120, 71));
    const last = await listOrdersPage(db, { page: 3 });
    expect(last.orders.map((o) => o.id)).toEqual(range(20, 1));
  });

  it('gives each order on a page its own items, across page boundaries', async () => {
    await addOrders(120);
    // A second item on the orders either side of the page 1 / page 2 boundary.
    for (const id of [71, 70])
      await db
        .prepare(`INSERT INTO order_items (order_id, variant_id, product_id, name, unit_price_cents, quantity) VALUES (?, 'demo-2', 'demo-2', 'Друг', 9800, 1)`)
        .bind(id)
        .run();
    const page1 = await listOrdersPage(db, { page: 1 });
    const page2 = await listOrdersPage(db, { page: 2 });
    expect(page1.orders.at(-1)).toMatchObject({ id: 71 });
    expect(page1.orders.at(-1)!.items).toHaveLength(2);
    expect(page2.orders[0]).toMatchObject({ id: 70 });
    expect(page2.orders[0].items).toHaveLength(2);
    expect([...page1.orders, ...page2.orders].every((o) => o.items.every((i) => i.variantId.startsWith('demo-')))).toBe(true);
    expect(page1.orders.flatMap((o) => o.items)).toHaveLength(51);
  });

  it('pages within a status filter', async () => {
    await addOrders(150); // 50 cancelled: 150, 147, …, 3
    const cancelled = await listOrdersPage(db, { status: 'cancelled' });
    expect(cancelled).toMatchObject({ total: 50, pages: 1 });
    expect(cancelled.orders.every((o) => o.status === 'cancelled')).toBe(true);
    const fresh = await listOrdersPage(db, { status: 'new', page: 2 });
    expect(fresh).toMatchObject({ total: 100, page: 2, pages: 2 });
    expect(fresh.orders).toHaveLength(50);
    expect(fresh.orders.every((o) => o.status === 'new')).toBe(true);
  });

  it('returns an empty page past the last one, and one page when there are no orders', async () => {
    await addOrders(10);
    expect(await listOrdersPage(db, { page: 2 })).toMatchObject({ orders: [], total: 10, pages: 1 });
    expect(await listOrdersPage(db, { status: 'shipped' })).toMatchObject({ orders: [], total: 0, pages: 1 });
  });

  it('uses a page size of 50', () => {
    expect(ORDERS_PAGE_SIZE).toBe(50);
  });
});

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_, i) => from - i);
