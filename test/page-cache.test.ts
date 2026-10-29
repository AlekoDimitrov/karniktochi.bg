import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedPage, isCacheablePath, PAGE_TTL, purgePages } from '../src/lib/page-cache';

// caches.default stand-in: stores responses by URL, like the Workers Cache API.
class MemoryCache {
  store = new Map<string, Response>();
  calls = 0;
  async match(req: Request) {
    this.calls++;
    return this.store.get(req.url)?.clone();
  }
  async put(req: Request, res: Response) {
    this.calls++;
    this.store.set(req.url, res);
  }
  async delete(req: Request) {
    this.calls++;
    return this.store.delete(req.url);
  }
}

let cache: MemoryCache;
let pending: Promise<unknown>[];
beforeEach(() => {
  cache = new MemoryCache();
  pending = [];
  vi.stubGlobal('caches', { default: cache });
  // The cache is off in `astro dev`.
  vi.stubEnv('DEV', false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const page = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' }, ...init });

async function get(href: string, render: () => Promise<Response>, method = 'GET') {
  const url = new URL(href);
  const res = await cachedPage(new Request(url, { method }), url, (p) => pending.push(p), render);
  await Promise.all(pending);
  return res;
}

describe('page cache', () => {
  it('renders once and serves the next request from the cache', async () => {
    const render = vi.fn(async () => page('<h1>Начало</h1>'));
    const first = await get('https://karniktochi.com/', render);
    expect(first.headers.get('X-Page-Cache')).toBe('miss');
    const second = await get('https://karniktochi.com/', render);
    expect(second.headers.get('X-Page-Cache')).toBe('hit');
    expect(await second.text()).toBe('<h1>Начало</h1>');
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps the copy at the edge for PAGE_TTL seconds and tells browsers to revalidate', async () => {
    const res = await get('https://karniktochi.com/produkti/', async () => page('x'));
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const stored = cache.store.get('https://karniktochi.com/produkti/')!;
    expect(stored.headers.get('Cache-Control')).toBe(`public, max-age=${PAGE_TTL}`);
  });

  it('caches each query string separately', async () => {
    const render = vi.fn(async () => page('x'));
    await get('https://karniktochi.com/produkti/gyuto/?v=210-mm', render);
    await get('https://karniktochi.com/produkti/gyuto/?v=240-mm', render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('does not use the Cache API on workers.dev', async () => {
    const render = vi.fn(async () => page('x'));
    const res = await get('https://karniktochi.someone.workers.dev/', render);
    await get('https://karniktochi.someone.workers.dev/', render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.calls).toBe(0);
    expect(res.headers.has('X-Page-Cache')).toBe(false);
  });

  it('does not use the Cache API in astro dev', async () => {
    vi.stubEnv('DEV', true);
    const render = vi.fn(async () => page('x'));
    await get('http://localhost:4321/', render);
    await get('http://localhost:4321/', render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.calls).toBe(0);
  });

  it('does not store errors, responses that set cookies, or anything but GET', async () => {
    await get('https://karniktochi.com/produkti/nyama/', async () => page('Няма', { status: 404 }));
    await get('https://karniktochi.com/kolichka/', async () => page('x', { headers: { 'Set-Cookie': 'a=1' } }));
    const render = vi.fn(async () => page('x'));
    await get('https://karniktochi.com/', render, 'HEAD');
    expect(cache.store.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('purges pages from this data center', async () => {
    await get('https://karniktochi.com/produkti/gyuto/', async () => page('стара цена'));
    await purgePages('https://karniktochi.com', ['/produkti/gyuto/']);
    expect(cache.store.size).toBe(0);
  });

  it('caches only the public storefront pages', () => {
    for (const path of ['/', '/produkti/', '/produkti/gyuto/', '/kategoriya/malki/', '/kolichka/']) expect(isCacheablePath(path)).toBe(true);
    for (const path of ['/porachka/', '/porachka/blagodarim/', '/api/stock', '/api/orders', '/admin/', '/ne-sashtestvuva/'])
      expect(isCacheablePath(path)).toBe(false);
  });
});
