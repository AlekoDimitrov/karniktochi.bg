import type { APIRoute } from 'astro';
import { parseCartIds } from '../../lib/catalog';
import { getCartLines } from '../../lib/products';

export const prerender = false;

/**
 * GET /api/cart-lines?ids=a,b,c (at most CART_LINES_MAX ids): name, option, price, photo and live stock for
 * the cart's variants, as { [variantId]: CartLineInfo }. Ids that can't be ordered (gone, archived, draft)
 * are left out. Never cached (the middleware sends no-store): the cart and checkout need current data.
 */
export const GET: APIRoute = async ({ url }) => {
  const ids = parseCartIds(url.searchParams.get('ids'));
  if (!ids) return Response.json({ error: 'ids' }, { status: 400 });
  try {
    return Response.json(await getCartLines(ids));
  } catch (e) {
    console.error('Reading cart lines failed:', e);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
};
