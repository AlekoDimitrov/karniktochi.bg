import { publicStock, type Visibility } from './catalog';
import { NO_STORE, STOCK_CACHE, tags } from './cache-policy';

/**
 * Body of GET /api/stock: live stock for every public variant, as { [variantId]: number }.
 * Pages may be served from Workers Cache; the browser uses this to correct the stock they show.
 * The count only informs the page. Checkout re-checks stock in D1 and has the final say.
 */
export async function stockResponse(db: D1Database, vis: Visibility): Promise<Response> {
  try {
    const body = await publicStock(db, vis);
    return Response.json(body, { headers: { 'Cache-Control': STOCK_CACHE, 'Cache-Tag': tags.stock } });
  } catch (e) {
    // The pages keep the stock they were rendered with if this fails.
    console.error('Reading stock failed:', e);
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': NO_STORE } });
  }
}
