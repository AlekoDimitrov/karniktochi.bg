// A short edge cache for public pages, using the Workers Cache API (caches.default).
// Cloudflare doesn't cache Worker responses because of their Cache-Control headers, so pages are put in
// the cache explicitly. The Cache API only works on a custom domain: on *.workers.dev (and in the
// dashboard preview) its calls do nothing, so there this skips it and renders every request.
// The cache is per data center; stock on cached pages is corrected in the browser from /api/stock.

/** Seconds a public page may be served from the cache. */
export const PAGE_TTL = 30;

/** Public, per-visitor-identical pages that may be cached. */
export const isCacheablePath = (path: string) =>
  path === '/' || path.startsWith('/produkti/') || path.startsWith('/kategoriya/') || path === '/kolichka/';

function edgeCache(url: URL): Cache | null {
  if (import.meta.env.DEV || url.hostname.endsWith('.workers.dev')) return null;
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

/** Serves GET requests for `url` from the cache, or renders and stores the page for PAGE_TTL seconds. */
export async function cachedPage(
  request: Request,
  url: URL,
  waitUntil: (p: Promise<unknown>) => void,
  render: () => Promise<Response>,
): Promise<Response> {
  const cache = request.method === 'GET' ? edgeCache(url) : null;
  if (!cache) return render();
  const key = new Request(url.toString());
  const hit = await cache.match(key);
  if (hit) return forBrowser(hit, 'hit');

  const res = await render();
  if (res.status === 200 && !res.headers.has('Set-Cookie')) {
    const stored = new Response(res.clone().body, res);
    stored.headers.set('Cache-Control', `public, max-age=${PAGE_TTL}`);
    waitUntil(cache.put(key, stored).catch((e) => console.error('Page cache put failed:', e)));
  }
  return forBrowser(res, 'miss');
}

// The cached copy's max-age is for the edge only; browsers revalidate every time.
function forBrowser(res: Response, state: 'hit' | 'miss') {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-cache');
  out.headers.set('X-Page-Cache', state);
  return out;
}

/** Drops pages from this data center's cache, e.g. after an admin edit. Other data centers expire within PAGE_TTL. */
export async function purgePages(origin: string, paths: string[]) {
  const cache = edgeCache(new URL(origin));
  if (!cache) return;
  await Promise.all(paths.map((p) => cache.delete(new Request(new URL(p, origin).toString()))));
}
