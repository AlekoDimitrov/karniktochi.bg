// Purging Workers Cache after an admin change, by Cache-Tag (see cache-policy.ts). Purges are global.
// Callers pass `cache` from 'cloudflare:workers'; tests pass a fake.
import { tags } from './cache-policy';

type PurgeResult = { success: boolean; errors: { code: number; message: string }[] };
export type Purger = { purge(options: { tags: string[] } | { purgeEverything: true }): Promise<PurgeResult> };

/**
 * The Workers Cache purger from the 'cloudflare:workers' module, or undefined where it has no purge()
 * (local wrangler dev and astro dev): saving then just skips purging.
 */
export function purgerFrom(workers: { cache?: unknown }): Purger | undefined {
  const cache = workers.cache as { purge?: unknown } | undefined;
  return typeof cache?.purge === 'function' ? (cache as Purger) : undefined;
}

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
  return runPurge(purger, { tags: values });
}

/** Purges everything in Workers Cache with one call, for bulk actions. Logs and never throws, like purgeTags. */
export async function purgeAll(purger: Purger | undefined): Promise<boolean> {
  return runPurge(purger, { purgeEverything: true });
}

async function runPurge(purger: Purger | undefined, options: { tags: string[] } | { purgeEverything: true }) {
  if (!purger) return false;
  try {
    const result = await purger.purge(options);
    if (!result.success) console.error('Cache purge rejected:', options, result.errors);
    return result.success;
  } catch (e) {
    console.error('Cache purge failed:', options, e);
    return false;
  }
}
