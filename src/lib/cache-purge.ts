// Purging Workers Cache after an admin change, by Cache-Tag (see cache-policy.ts). Purges are global.
// Callers pass `cache` from 'cloudflare:workers'; tests pass a fake.
import { tags } from './cache-policy';

type Purger = { purge(options: { tags: string[] }): Promise<{ success: boolean; errors: { code: number; message: string }[] }> };

/**
 * Tags to purge when a product is saved: its own page and every product page that shows it, the home page,
 * all /produkti/ pages (a new or re-sorted product shifts every page) and its category's pages. Pass the
 * category it had before the save if that changed, so the old category's pages drop it too.
 */
export function productPurgeTags(product: { id: string; category: string }, previousCategory?: string): string[] {
  const out = [tags.product(product.id), tags.home, tags.listing, tags.category(product.category)];
  if (previousCategory && previousCategory !== product.category) out.push(tags.category(previousCategory));
  return out;
}

/** Tags to purge when a variant's stock is set in the admin: /api/stock and the pages showing the product. */
export const stockPurgeTags = (productId: string) => [tags.stock, tags.product(productId)];

/**
 * Purges the tags. A failed purge is logged, never thrown: the change is already saved and the pages expire
 * on their own within max-age + stale-while-revalidate. Returns whether Cloudflare accepted the purge.
 */
export async function purgeTags(purger: Purger | undefined, values: string[]): Promise<boolean> {
  if (!purger) return false;
  try {
    const result = await purger.purge({ tags: values });
    if (!result.success) console.error('Cache purge rejected:', values, result.errors);
    return result.success;
  } catch (e) {
    console.error('Cache purge failed:', values, e);
    return false;
  }
}
