import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb, runSqlFile } from './d1';
import { changeStatus, listOrdersPage } from '../src/lib/orders';

// scripts/seed-orders.sql and scripts/unseed-orders.sql (npm run seed:orders / unseed:orders).
let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

const stockRows = async () => (await db.prepare('SELECT variant_id, quantity FROM stock ORDER BY variant_id').all()).results;

describe('seed:orders', () => {
  it('adds 120 test orders, each with one item, over three admin pages; a second run adds nothing', async () => {
    await runSqlFile(db, 'scripts/seed-orders.sql');
    await runSqlFile(db, 'scripts/seed-orders.sql');
    const page = await listOrdersPage(db, {});
    expect(page).toMatchObject({ total: 120, pages: 3 });
    expect(page.orders.every((o) => o.items.length === 1 && o.customerName.startsWith('Тестова поръчка'))).toBe(true);
    const statuses = new Set(page.orders.map((o) => o.status));
    expect(statuses.size).toBe(6);
  });

  it('never changes real stock when a test order changes status', async () => {
    await runSqlFile(db, 'scripts/seed-orders.sql');
    const before = await stockRows();
    const { orders } = await listOrdersPage(db, { status: 'new' });
    await changeStatus(db, orders[0].id, 'new', 'cancelled');
    await changeStatus(db, orders[0].id, 'cancelled', 'confirmed');
    expect(await stockRows()).toEqual(before);
  });

  it('unseed:orders removes only the test orders and their items', async () => {
    await db
      .prepare(
        `INSERT INTO orders (public_id, customer_name, phone, city, delivery_method, delivery_details, payment_method, total_cents)
         VALUES ('realorder', 'Истински', '+359888123456', 'Варна', 'office', 'Спиди', 'cod', 100)`,
      )
      .run();
    await runSqlFile(db, 'scripts/seed-orders.sql');
    await runSqlFile(db, 'scripts/unseed-orders.sql');
    const left = await db.prepare('SELECT public_id FROM orders').all<{ public_id: string }>();
    expect(left.results.map((r) => r.public_id)).toEqual(['realorder']);
    const items = await db.prepare(`SELECT COUNT(*) AS n FROM order_items WHERE variant_id = 'seed-test-item'`).first<number>('n');
    expect(items).toBe(0);
  });
});
