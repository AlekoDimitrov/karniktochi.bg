// Details for the cart's variants from GET /api/cart-lines. The cart and checkout pages don't embed the
// catalog; they ask for just the variants in the cart, CART_LINES_MAX ids per request.
import { CART_LINES_MAX, type CartLineInfo } from '../lib/catalog';

export type CartLines = Record<string, CartLineInfo>;

/** Details per variant id; ids missing from the result can't be ordered. Null if a request failed. */
export async function fetchCartLines(ids: string[]): Promise<CartLines | null> {
  // An id that isn't a variant id at all (old or edited localStorage) is simply unavailable.
  const valid = [...new Set(ids)].filter((id) => /^[a-z0-9_-]{1,64}$/.test(id));
  const chunks: string[][] = [];
  for (let i = 0; i < valid.length; i += CART_LINES_MAX) chunks.push(valid.slice(i, i + CART_LINES_MAX));
  try {
    const parts = await Promise.all(
      chunks.map(async (chunk) => {
        const res = await fetch(`/api/cart-lines?ids=${chunk.map(encodeURIComponent).join(',')}`);
        if (!res.ok) throw new Error(`cart-lines ${res.status}`);
        return (await res.json()) as CartLines;
      }),
    );
    return Object.assign({}, ...parts);
  } catch {
    return null;
  }
}
