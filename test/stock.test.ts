import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb, setStock } from './d1';
import {
  changeStatus,
  getOrder,
  getStockLevels,
  insertOrder,
  OutOfStockError,
  StatusConflictError,
  type NewOrder,
} from '../src/lib/orders';

const fileStock = { gyuto: 3, petty: 1 };

const order = (items: [string, number][]): NewOrder => ({
  customerName: 'Иван Иванов',
  phone: '+359888123456',
  email: null,
  city: 'София',
  deliveryMethod: 'office',
  deliveryDetails: 'Еконт, офис Лозенец',
  customerNote: '',
  paymentMethod: 'cod',
  items: items.map(([variantId, quantity]) => ({
    variantId,
    productId: variantId,
    name: variantId,
    optionLabel: '',
    unitPriceCents: 10000,
    quantity,
  })),
});

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

const stock = async () => {
  const levels = await getStockLevels(db, fileStock);
  return { gyuto: levels.gyuto, petty: levels.petty };
};
const count = async (table: string) =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe('placing an order', () => {
  it('reserves stock, starting from the product-file stock', async () => {
    const placed = await insertOrder(db, order([['gyuto', 2], ['petty', 1]]), fileStock);
    expect(await stock()).toEqual({ gyuto: 1, petty: 0 });
    expect(placed.totalCents).toBe(30000);
    expect(placed.reference).toBe('KT-00001');
    const saved = await getOrder(db, placed.id);
    expect(saved?.status).toBe('new');
    expect(saved?.items).toHaveLength(2);
  });

  it('rejects an order that needs more than is left, and changes nothing', async () => {
    await insertOrder(db, order([['gyuto', 2]]), fileStock);
    const attempt = insertOrder(db, order([['petty', 1], ['gyuto', 2]]), fileStock);
    await expect(attempt).rejects.toBeInstanceOf(OutOfStockError);
    await expect(attempt).rejects.toMatchObject({ variantIds: ['gyuto'] });
    expect(await stock()).toEqual({ gyuto: 1, petty: 1 });
    expect(await count('orders')).toBe(1);
    expect(await count('order_items')).toBe(1);
  });

  it('never oversells when orders race for the last item', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => insertOrder(db, order([['petty', 1]]), fileStock)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await stock()).petty).toBe(0);
  });

  it('uses the stock set in admin over the product file', async () => {
    await setStock(db, 'petty', 4);
    await insertOrder(db, order([['petty', 3]]), fileStock);
    expect((await stock()).petty).toBe(1);
  });
});

describe('changing status', () => {
  it.each(['cancelled', 'refused'] as const)('releases stock when %s', async (status) => {
    const { id } = await insertOrder(db, order([['gyuto', 2], ['petty', 1]]), fileStock);
    await changeStatus(db, id, 'new', 'confirmed');
    await changeStatus(db, id, 'confirmed', 'shipped');
    expect(await stock()).toEqual({ gyuto: 1, petty: 0 });
    await changeStatus(db, id, 'shipped', status);
    expect(await stock()).toEqual({ gyuto: 3, petty: 1 });
    expect((await getOrder(db, id))?.status).toBe(status);
  });

  it('does not move stock between holding statuses', async () => {
    const { id } = await insertOrder(db, order([['gyuto', 1]]), fileStock);
    for (const [from, to] of [['new', 'confirmed'], ['confirmed', 'shipped'], ['shipped', 'delivered']] as const) {
      await changeStatus(db, id, from, to);
      expect((await stock()).gyuto).toBe(2);
    }
  });

  it('does not release twice when moving between cancelled and refused', async () => {
    const { id } = await insertOrder(db, order([['gyuto', 1]]), fileStock);
    await changeStatus(db, id, 'new', 'cancelled');
    await changeStatus(db, id, 'cancelled', 'refused');
    expect((await stock()).gyuto).toBe(3);
  });

  it('reserves again when a cancelled order is reopened', async () => {
    const { id } = await insertOrder(db, order([['gyuto', 2]]), fileStock);
    await changeStatus(db, id, 'new', 'cancelled');
    await changeStatus(db, id, 'cancelled', 'new');
    expect((await stock()).gyuto).toBe(1);
  });

  it('refuses to reopen a cancelled order if its stock was sold meanwhile', async () => {
    const { id } = await insertOrder(db, order([['petty', 1]]), fileStock);
    await changeStatus(db, id, 'new', 'cancelled');
    await insertOrder(db, order([['petty', 1]]), fileStock);
    await expect(changeStatus(db, id, 'cancelled', 'confirmed')).rejects.toBeInstanceOf(OutOfStockError);
    expect((await getOrder(db, id))?.status).toBe('cancelled');
    expect((await stock()).petty).toBe(0);
  });

  it('releases only once when the same cancel is sent twice at the same time', async () => {
    const { id } = await insertOrder(db, order([['gyuto', 2]]), fileStock);
    const results = await Promise.allSettled([
      changeStatus(db, id, 'new', 'cancelled'),
      changeStatus(db, id, 'new', 'cancelled'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(
      StatusConflictError,
    );
    expect((await stock()).gyuto).toBe(3);
  });

  it('rejects a change based on a stale status', async () => {
    const { id } = await insertOrder(db, order([['gyuto', 1]]), fileStock);
    await changeStatus(db, id, 'new', 'cancelled');
    await expect(changeStatus(db, id, 'new', 'refused')).rejects.toBeInstanceOf(StatusConflictError);
    expect((await stock()).gyuto).toBe(3);
  });
});
