import { describe, expect, it, vi } from 'vitest';
import { cacheControlFor, cacheTagHeader, isCacheablePage, NO_STORE, PAGE_CACHE, STOCK_CACHE, tags } from '../src/lib/cache-policy';
import { productPurgeTags, purgeTags, stockPurgeTags } from '../src/lib/cache-purge';

const ok = { status: 200, setsCookie: false };

describe('Cache-Control for Workers Cache', () => {
  it('lets home, listing, category and product pages be cached for 60 s, stale for 600 s', () => {
    expect(PAGE_CACHE).toBe('public, max-age=60, stale-while-revalidate=600');
    for (const path of ['/', '/produkti/', '/produkti/gyuto-shibata/', '/kategoriya/gotvarski/']) {
      expect(cacheControlFor('GET', path, ok)).toBe(PAGE_CACHE);
      expect(cacheControlFor('HEAD', path, ok)).toBe(PAGE_CACHE);
    }
  });

  it('lets /api/stock be cached for 15 s', () => {
    expect(cacheControlFor('GET', '/api/stock', ok)).toBe(STOCK_CACHE);
    expect(STOCK_CACHE).toBe('public, max-age=15');
  });

  it('never caches the cart, checkout, thank-you page, other API routes or unknown paths', () => {
    for (const path of ['/kolichka/', '/porachka/', '/porachka/blagodarim/', '/api/cart-lines', '/api/orders', '/admin/', '/ne-sashtestvuva/', '/produkti/a/b/'])
      expect(cacheControlFor('GET', path, ok)).toBe(NO_STORE);
  });

  it('never caches non-GET requests, errors, redirects or responses that set a cookie', () => {
    expect(cacheControlFor('POST', '/', ok)).toBe(NO_STORE);
    expect(cacheControlFor('GET', '/produkti/nyama/', { status: 404, setsCookie: false })).toBe(NO_STORE);
    expect(cacheControlFor('GET', '/api/stock', { status: 503, setsCookie: false })).toBe(NO_STORE);
    expect(cacheControlFor('GET', '/produkti/', { status: 301, setsCookie: false })).toBe(NO_STORE);
    expect(cacheControlFor('GET', '/', { status: 200, setsCookie: true })).toBe(NO_STORE);
  });

  it('recognises only the cacheable page paths', () => {
    expect(isCacheablePage('/kategoriya/malki/')).toBe(true);
    expect(isCacheablePage('/kategoriya/')).toBe(false);
    expect(isCacheablePage('/produkti/gyuto')).toBe(false);
  });

  it('joins Cache-Tag values once each', () => {
    expect(cacheTagHeader([tags.product('a'), tags.product('b'), tags.product('a')])).toBe('product-a,product-b');
  });
});

describe('purging after an admin save', () => {
  it('purges a product, every page showing it, home, all listing pages and its categories', () => {
    expect(productPurgeTags({ id: 'gyuto', category: 'gotvarski' })).toEqual(['product-gyuto', 'home', 'listing', 'category-gotvarski']);
    expect(productPurgeTags({ id: 'gyuto', category: 'malki' }, 'gotvarski')).toEqual([
      'product-gyuto',
      'home',
      'listing',
      'category-malki',
      'category-gotvarski',
    ]);
    expect(productPurgeTags({ id: 'gyuto', category: 'malki' }, 'malki')).toHaveLength(4);
  });

  it('purges /api/stock and the product pages after a stock change', () => {
    expect(stockPurgeTags('gyuto')).toEqual(['stock', 'product-gyuto']);
  });

  it('reports whether the purge was accepted and never throws', async () => {
    const accepted = { purge: vi.fn(async () => ({ success: true, errors: [] })) };
    expect(await purgeTags(accepted, ['home'])).toBe(true);
    expect(accepted.purge).toHaveBeenCalledWith({ tags: ['home'] });

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const limited = { purge: async () => ({ success: false, errors: [{ code: 429, message: 'rate limited' }] }) };
    expect(await purgeTags(limited, ['home'])).toBe(false);
    const broken = { purge: async () => Promise.reject(new Error('network')) };
    expect(await purgeTags(broken, ['home'])).toBe(false);
    expect(await purgeTags(undefined, ['home'])).toBe(false);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
