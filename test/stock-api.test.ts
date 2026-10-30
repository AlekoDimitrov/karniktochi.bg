import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freshDb, setStock } from './d1';
import { addProduct, order, variantIds } from './catalog-fixtures';
import { setProductStatus } from '../src/lib/catalog';
import { changeStatus, insertOrder } from '../src/lib/orders';
import { stockResponse } from '../src/lib/stock-api';

let db: D1Database;
let dispose: () => Promise<void>;
let gyuto: string, petty: string;
beforeEach(async () => {
  ({ db, dispose } = await freshDb());
  [gyuto] = await variantIds(db, await addProduct(db, { name: 'Гюто' }, [{ optionValue: '210 мм', sku: null, priceCents: 10000, stock: 3 }]));
  [petty] = await variantIds(db, await addProduct(db, { name: 'Петти' }, [{ optionValue: '', sku: null, priceCents: 10000, stock: 1 }]));
});
afterEach(() => dispose());

const live = { includeDemo: false };
const body = async (res: Response) => (await res.json()) as Record<string, number>;

describe('GET /api/stock', () => {
  it('returns stock per public variant, cacheable for 15 seconds and tagged for purging', async () => {
    const res = await stockResponse(db, live);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    expect(res.headers.get('Cache-Tag')).toBe('stock');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await body(res)).toEqual({ [gyuto]: 3, [petty]: 1 });
  });

  it('includes the demo products only while demos are shown', async () => {
    expect(await body(await stockResponse(db, { includeDemo: true }))).toMatchObject({ 'demo-1': 5, 'demo-4': 0 });
    expect(await body(await stockResponse(db, live))).not.toHaveProperty('demo-1');
  });

  it('reflects reservations and releases', async () => {
    const { id } = await insertOrder(db, order([[gyuto, 2]]), {});
    await insertOrder(db, order([[petty, 1]]), {});
    expect(await body(await stockResponse(db, live))).toEqual({ [gyuto]: 1, [petty]: 0 });
    await changeStatus(db, id, 'new', 'cancelled');
    expect((await body(await stockResponse(db, live)))[gyuto]).toBe(3);
  });

  it('uses stock set in admin', async () => {
    await setStock(db, petty, 7);
    expect((await body(await stockResponse(db, live)))[petty]).toBe(7);
  });

  it('leaves out drafts, archived products and stock rows of variants that no longer exist', async () => {
    await setStock(db, 'discontinued', 4);
    await setProductStatus(db, (await db.prepare('SELECT product_id FROM variants WHERE id = ?').bind(petty).first<{ product_id: string }>())!.product_id, 'archived');
    expect(await body(await stockResponse(db, live))).toEqual({ [gyuto]: 3 });
  });

  it('answers 503 and is not cached when D1 fails', async () => {
    const broken = { prepare: () => { throw new Error('D1 down'); } } as unknown as D1Database;
    const res = await stockResponse(broken, live);
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
