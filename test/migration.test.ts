import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb, migrate } from './d1';
import { listPublicProducts, orderableVariants, publicStock } from '../src/lib/catalog';
import { changeStatus, getOrder, getStockLevels, insertOrder, type NewOrder } from '../src/lib/orders';

// 0002_products.sql run against a database that already has orders and stock from the product-file catalog
// (main before slice 1). The rows below are written the way that code wrote them: stock rows exist only
// for products that were ordered or set in /admin, and order items are keyed by product id.

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => {
  ({ db, dispose } = await freshDb('0001_orders.sql'));
  const orders: [number, string, string, number][] = [
    [1, '11111111111111111111111111111111', 'new', 32200],
    [2, '22222222222222222222222222222222', 'cancelled', 9800],
    [3, '33333333333333333333333333333333', 'shipped', 15000],
    [4, '44444444444444444444444444444444', 'refused', 12900],
  ];
  const items: [number, string, string, number, number][] = [
    [1, 'demo-1', 'ДЕМО марка ДЕМО продукт 1', 12900, 2],
    [1, 'demo-3', 'ДЕМО марка ДЕМО продукт 3', 6400, 1],
    [2, 'demo-2', 'ДЕМО марка ДЕМО продукт 2', 9800, 1],
    // A product whose file was deleted since.
    [3, 'stari-nozh', 'Стара марка Стар нож', 15000, 1],
    [4, 'demo-1', 'ДЕМО марка ДЕМО продукт 1', 12900, 1],
  ];
  // demo-1: file 5, order 1 holds 2, order 4 was refused -> 3. demo-2 was ordered and cancelled -> 3.
  // demo-3: 8 - 1 = 7. demo-4: file stock 0, restocked to 2 in /admin. stari-nozh: last one shipped -> 0.
  const stock: [string, number][] = [['demo-1', 3], ['demo-2', 3], ['demo-3', 7], ['demo-4', 2], ['stari-nozh', 0]];
  await db.batch([
    ...orders.map(([id, publicId, status, total]) =>
      db
        .prepare(
          `INSERT INTO orders (id, public_id, status, customer_name, phone, city, delivery_method, delivery_details,
             payment_method, total_cents) VALUES (?, ?, ?, 'Иван', '+359888123456', 'София', 'office', 'Еконт', 'cod', ?)`,
        )
        .bind(id, publicId, status, total),
    ),
    ...items.map((i) =>
      db.prepare('INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?)').bind(...i),
    ),
    ...stock.map((s) => db.prepare('INSERT INTO stock (product_id, quantity) VALUES (?, ?)').bind(...s)),
  ]);
  await migrate(db, { after: '0001_orders.sql' });
});
afterEach(() => dispose());

const demos = { includeDemo: true };
const levels = () => getStockLevels(db, {});

describe('migrating a database that already has orders', () => {
  it('keeps live stock, and gives products that were never ordered their starting stock', async () => {
    expect(await levels()).toEqual({
      'demo-1': 3,
      'demo-2': 3,
      'demo-3': 7,
      // Restocked in /admin: not reset to the product file's 0.
      'demo-4': 2,
      'demo-5': 4,
      'demo-6': 10,
      'stari-nozh': 0,
    });
  });

  it('keeps every order and its snapshot, with the old product id as the variant id', async () => {
    const first = await getOrder(db, 1);
    expect(first).toMatchObject({ status: 'new', totalCents: 32200 });
    expect(first?.items).toEqual([
      { variantId: 'demo-1', productId: 'demo-1', name: 'ДЕМО марка ДЕМО продукт 1', optionLabel: '', unitPriceCents: 12900, quantity: 2 },
      { variantId: 'demo-3', productId: 'demo-3', name: 'ДЕМО марка ДЕМО продукт 3', optionLabel: '', unitPriceCents: 6400, quantity: 1 },
    ]);
    // An item whose product no longer exists stays readable from its snapshot.
    expect((await getOrder(db, 3))?.items).toEqual([
      { variantId: 'stari-nozh', productId: 'stari-nozh', name: 'Стара марка Стар нож', optionLabel: '', unitPriceCents: 15000, quantity: 1 },
    ]);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM order_items').first<{ n: number }>())!.n).toBe(5);
  });

  it('moves stock for old orders by variant id when their status changes', async () => {
    await changeStatus(db, 1, 'new', 'cancelled');
    expect(await levels()).toMatchObject({ 'demo-1': 5, 'demo-3': 8 });
    // A refused and a cancelled order reopened take their items again.
    await changeStatus(db, 4, 'refused', 'confirmed');
    await changeStatus(db, 2, 'cancelled', 'new');
    expect(await levels()).toMatchObject({ 'demo-1': 4, 'demo-2': 2 });
    // Cancelling the order of the deleted product puts its unit back on the orphaned stock row.
    await changeStatus(db, 3, 'shipped', 'cancelled');
    expect((await levels())['stari-nozh']).toBe(1);
  });

  it('shows the demo products with their live stock and leaves out the deleted product', async () => {
    const shown = await listPublicProducts(db, demos);
    expect(shown.map((p) => [p.id, p.variants.map((v) => [v.id, v.stock])])).toEqual([
      ['demo-1', [['demo-1', 3]]],
      ['demo-2', [['demo-2', 3]]],
      ['demo-3', [['demo-3', 7]]],
      ['demo-4', [['demo-4', 2]]],
      ['demo-5', [['demo-5', 4]]],
      ['demo-6', [['demo-6', 10]]],
    ]);
    expect(await publicStock(db, demos)).not.toHaveProperty('stari-nozh');
  });

  it('takes a new order from a cart saved before the migration', async () => {
    // Saved carts hold old product ids, which are now the demo variant ids.
    const ok = await orderableVariants(db, ['demo-1', 'stari-nozh'], demos);
    expect([...ok.keys()]).toEqual(['demo-1']);
    const v = ok.get('demo-1')!;
    const newOrder: NewOrder = {
      customerName: 'Иван Иванов',
      phone: '+359888123456',
      email: null,
      city: 'Варна',
      deliveryMethod: 'office',
      deliveryDetails: 'Еконт',
      customerNote: '',
      paymentMethod: 'cod',
      items: [{ ...v, unitPriceCents: v.priceCents, quantity: 3 }],
    };
    const placed = await insertOrder(db, newOrder, {});
    // AUTOINCREMENT carries on after the old orders.
    expect(placed.id).toBe(5);
    expect(placed.totalCents).toBe(3 * 12900);
    expect((await levels())['demo-1']).toBe(0);
  });
});
