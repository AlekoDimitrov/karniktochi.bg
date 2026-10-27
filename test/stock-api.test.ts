import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from './d1';
import { changeStatus, insertOrder, setStock, type NewOrder } from '../src/lib/orders';
import { stockResponse } from '../src/lib/stock-api';

const fileStock = { gyuto: 3, petty: 1, nakiri: 0 };

const order = (productId: string, quantity: number): NewOrder => ({
  customerName: 'Иван Иванов',
  phone: '+359888123456',
  email: null,
  city: 'София',
  deliveryMethod: 'office',
  deliveryDetails: 'Еконт, офис Лозенец',
  customerNote: '',
  paymentMethod: 'cod',
  items: [{ productId, name: productId, unitPriceCents: 10000, quantity }],
});

let db: D1Database;
let dispose: () => Promise<void>;
beforeEach(async () => ({ db, dispose } = await freshDb()));
afterEach(() => dispose());

const body = async (res: Response) => (await res.json()) as Record<string, number>;

describe('GET /api/stock', () => {
  it('returns product-file stock for products never ordered, cacheable for 20 seconds', async () => {
    const res = await stockResponse(db, fileStock);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=20');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await body(res)).toEqual({ gyuto: 3, petty: 1, nakiri: 0 });
  });

  it('reflects reservations and releases', async () => {
    const { id } = await insertOrder(db, order('gyuto', 2), fileStock);
    await insertOrder(db, order('petty', 1), fileStock);
    expect(await body(await stockResponse(db, fileStock))).toEqual({ gyuto: 1, petty: 0, nakiri: 0 });

    await changeStatus(db, id, 'new', 'cancelled');
    expect((await body(await stockResponse(db, fileStock))).gyuto).toBe(3);
  });

  it('uses stock set in admin over the product file', async () => {
    await setStock(db, 'nakiri', 7);
    expect((await body(await stockResponse(db, fileStock))).nakiri).toBe(7);
  });

  it('leaves out products that are no longer in the product files', async () => {
    await setStock(db, 'discontinued', 4);
    expect(await body(await stockResponse(db, fileStock))).not.toHaveProperty('discontinued');
  });

  it('answers 503 and is not cached when D1 fails', async () => {
    const broken = { prepare: () => { throw new Error('D1 down'); } } as unknown as D1Database;
    const res = await stockResponse(broken, fileStock);
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
