// Workers Cache ("cache": { "enabled": true } in wrangler.jsonc) sits in front of the Worker and stores what
// the response's Cache-Control allows. A response without Cache-Control can still be cached heuristically,
// so every Worker response gets an explicit header here: cacheable pages say how long, everything else
// says no-store. On a cache hit the Worker doesn't run at all.
//
// The cache key is the path and query string (not the host), so ?page=2 and ?v=210-mm are separate
// entries, and the Worker version: every deploy starts with an empty cache.
// Cache-Tag values let an admin save purge exactly the pages that show a product (see cache-purge.ts).

/**
 * Home, listing, category and product pages: Workers Cache keeps them for 60 s (s-maxage) and may serve them
 * stale for 600 s while it refreshes. Browsers get no fresh period (max-age=0), so after an admin save and
 * purge they see the change on their next visit; a browser that honours stale-while-revalidate (Chrome) may
 * still show its old copy once while it refetches.
 */
export const PAGE_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';
/** GET /api/stock. */
export const STOCK_CACHE = 'public, max-age=15';
export const NO_STORE = 'no-store';

/** Paths whose 200 responses may be cached as pages. /kolichka/ and /porachka/ never are. */
export function isCacheablePage(path: string): boolean {
  return (
    path === '/' ||
    path === '/produkti/' ||
    /^\/produkti\/[a-z0-9-]+\/$/.test(path) ||
    /^\/kategoriya\/[a-z0-9-]+\/$/.test(path)
  );
}

/** The Cache-Control header for a Worker response. Admin responses are handled in the middleware. */
export function cacheControlFor(method: string, path: string, res: { status: number; setsCookie: boolean }): string {
  if ((method !== 'GET' && method !== 'HEAD') || res.status !== 200 || res.setsCookie) return NO_STORE;
  if (path === '/api/stock') return STOCK_CACHE;
  return isCacheablePage(path) ? PAGE_CACHE : NO_STORE;
}

// Cache-Tag values. Tags are ASCII and product ids are slugs, so ids can go in as they are.
export const tags = {
  home: 'home',
  /** Every page of /produkti/. */
  listing: 'listing',
  /** Every page of one category. */
  category: (category: string) => `category-${category}`,
  /** Every product page that shows this product: its own page and the pages listing it as related or as another model. */
  product: (id: string) => `product-${id}`,
  stock: 'stock',
};

export const cacheTagHeader = (values: string[]) => [...new Set(values)].join(',');
