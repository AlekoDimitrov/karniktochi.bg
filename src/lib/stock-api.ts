import { getStockLevels } from './orders';

/**
 * Body of GET /api/stock: live stock for every product in the product files, as { [productId]: number }.
 * Product pages are prerendered with build-time stock; the browser uses this to correct them.
 * The count only informs the page. Checkout re-checks stock in D1 and has the final say.
 */
export async function stockResponse(db: D1Database, fileStock: Record<string, number>): Promise<Response> {
  try {
    const levels = await getStockLevels(db, fileStock);
    // Only products that still exist; D1 may hold rows for products that were removed since.
    const body = Object.fromEntries(Object.keys(fileStock).map((id) => [id, levels[id]]));
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=20' } });
  } catch (e) {
    // The pages keep their build-time stock if this fails.
    console.error('Reading stock failed:', e);
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
