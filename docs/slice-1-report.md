# Slice 1: products in D1 — report

Branch `products-in-d1`. Nothing was deployed and nothing was applied with `--remote`.

## 1. CPU per server-rendered page under `wrangler dev`

### How it was measured

- The production build (`npm run build`) run with `wrangler dev -c dist/server/wrangler.json` (wrangler 4.153.0, local workerd), on a throwaway local D1 with 71 products (60 published with 1–4 variants, 6 demo, 5 drafts), 168 variants and one order.
- CPU comes from V8 CPU profiles taken through the Worker's inspector (100 µs sampling) while 50 requests were sent one after another to the same URL. Numbers are per request, from two separate runs (run 1 / run 2).
- **JS+GC** is time in JavaScript (Astro and our code, including V8 builtins) and garbage collection. **All busy** adds V8's `(program)` time: native work on the thread that isn't attributed to JS. Locally this includes the D1 simulator and HTML encoding; on Cloudflare D1 runs outside the Worker. So the real figure for a page is most likely between the two columns.
- "Miss" requests add a unique query string so the page cache misses every time; "hit" requests repeat the same URL.

### Results (ms per request, run 1 / run 2)

| Page | Size | JS+GC | All busy | Wall (median) |
|---|---|---|---|---|
| `/` miss | 17.6 KB | 10.9 / 8.1 | 15.2 / 12.9 | 18.6 / 17.6 |
| `/` hit | | 6.3 / 7.7 | 6.8 / 8.7 | 8.6 / 9.0 |
| `/produkti/` miss | 34.5 KB | 11.8 / 12.5 | 15.6 / 17.2 | 18.5 / 19.6 |
| `/produkti/` hit | | 5.3 / 6.3 | 6.1 / 7.6 | 8.5 / 8.6 |
| `/produkti/<slug>/` 4 variants, miss | 13.1 KB | 10.2 / 9.2 | 15.4 / 13.3 | 16.6 / 16.5 |
| `/produkti/<slug>/` 1 variant, miss | 12.2 KB | 10.3 / 9.5 | 14.7 / 13.6 | 17.0 / 16.5 |
| `/produkti/<slug>/` hit | | 6.3 / 5.1 | 7.5 / 5.9 | 8.1 / 8.1 |
| `/kategoriya/gotvarski/` miss | 13.2 KB | 9.9 / 9.1 | 13.9 / 13.8 | 17.0 / 17.9 |
| `/kategoriya/gotvarski/` hit | | 5.7 / 6.4 | 6.3 / 6.9 | 8.0 / 7.8 |
| `/kolichka/` miss | 41.9 KB | 10.8 / 11.6 | 14.9 / 15.6 | 17.8 / 17.8 |
| `/kolichka/` hit | | 6.2 / 6.6 | 7.1 / 7.2 | 8.8 / 8.8 |
| `/porachka/` (not cached) | 29.6 KB | 8.9 / 7.6 | 12.8 / 11.3 | 14.0 / 13.0 |
| `/porachka/blagodarim/?id=…` (not cached) | 6.1 KB | 7.8 / 7.9 | 8.6 / 9.1 | 10.3 / 10.0 |
| `/api/stock` (not cached) | 2.2 KB | 6.5 / 6.5 | 7.4 / 7.3 | 8.3 / 8.3 |
| `/produkti/<unknown>/` 404, miss | | 7.2 / 6.9 | 11.7 / 10.9 | 13.1 / 12.3 |
| Unknown path 404 (baseline) | 4.2 KB | 5.9 / 4.7 | 6.2 / 5.5 | 7.0 / 7.0 |

First request after start (module load, compile and first render of `/`): **91.8 ms** all busy, one request, measured once.

`/admin/` and `/admin/stock/` were not measured: the built Worker answers 403 without Cloudflare Access in front of it.

### What this means

- **A fixed cost of about 5–6 ms per request** is Astro's request pipeline (routing, `createLocals`, render setup), measured on a 404 for an unknown path. The profile puts it in `dist/server/entry.mjs`, not in wrangler's dev wrapper.
- **Cache hits still cost 5–8 ms**, because the page cache is Astro middleware: Astro has already routed the request and set up the render context before `cachedPage()` runs. A hit saves roughly half the CPU of a miss, not all of it.
- **Misses cost about 8–12.5 ms of JS**, plus up to ~4–5 ms of native time. Catalog size matters: the product page loads every public product (for related items and other models), and `/produkti/` and `/kolichka/` render or embed the whole catalog.
- Against the Workers **Free plan limit of 10 ms CPU per request**, misses are at or above the limit and hits are below it. On the Paid plan (default limit 30 s) none of this is a concern. These are local numbers: Cloudflare's machines and the absence of the profiler will shift them, so treat them as indicative, not exact.

## 2. Cache API on workers.dev

- `src/lib/page-cache.ts` said the Cache API "only works on a custom domain" and does nothing on `*.workers.dev`. **Cloudflare's docs don't say that.** The [Cache API reference](https://developers.cloudflare.com/workers/runtime-apis/cache/) says it works on custom domains, has no effect in the dashboard editor and Playground previews, and is not available for Workers fronted by Cloudflare Access. Its only mention of `*.workers.dev` is about query strings in cache keys.
- The no-op on workers.dev comes from community reports and GitHub issues (for example [this community thread](https://community.cloudflare.com/t/cloudflare-worker-cache-does-not-work/298125)), not from Cloudflare. It can only be confirmed by deploying to workers.dev, which wasn't done.
- **The code is fine either way:** it skips the Cache API on workers.dev and renders every request. If the API does work there, the only loss is caching before launch. I kept the behavior and corrected the comment.
- **Cloudflare Access:** the docs say the Cache API is not available for Workers fronted by Access. Only `/admin` should be behind Access. If the Access application ever covers the whole hostname, the page cache stops working.
- **Newer alternative — Workers Caching** ([announcement, July 2026](https://blog.cloudflare.com/workers-cache), [limitations](https://developers.cloudflare.com/workers/cache/limitations/)): a cache in front of the Worker, turned on with `"cache": { "enabled": true }` in `wrangler.jsonc`. It works on workers.dev and on preview URLs, follows `Cache-Control`, and on a hit **the Worker doesn't run and no CPU is billed**. Cloudflare recommends it over the Cache API for new Workers. It would remove the 5–8 ms cost of hits measured above. It wasn't adopted in this slice; that is a decision for you (see "Open decisions").

## 3. Migrating existing orders and stock to variant ids

`migrations/0002_products.sql` renames `stock.product_id` and `order_items.product_id` to `variant_id`, adds `order_items.product_id` and `option_label`, and creates the six demo products, each with one default variant whose id is the old product id. Starting stock is inserted only where no stock row exists.

Tested against a database that already has orders, two ways:

1. **With wrangler, as it would run for real.** In a throwaway project (local, `--persist-to` a scratch folder): applied `0001` with `wrangler d1 migrations apply --local`, inserted orders and stock the way `main`'s code writes them, then applied `0002` the same way. The data before migrating:
   - 4 orders: new, cancelled, shipped, refused.
   - 5 order items, one of them for a product whose file was deleted.
   - Stock rows only for products that had been ordered or set in `/admin`: demo-1 at 3, and demo-4 restocked to 2 although its file said 0.
2. **In the test suite**, `test/migration.test.ts`: the same data through Miniflare D1, then checked with the app's own functions.

Results:

- Live stock is kept: demo-1 stays at 3, and demo-4 stays at its admin-set 2 instead of being reset to 0. demo-5 and demo-6, never ordered, get their starting stock of 4 and 10.
- Every order and item survives with its name and price snapshot. Old items get the old product id as both `variant_id` and `product_id`, with an empty `option_label`.
- Old orders still move stock when their status changes: cancel, reopen after refusal or cancellation, and cancel the order for the deleted product.
- The storefront lists the six demos with their live stock. The deleted product's leftover stock row is kept but never shown or orderable.
- Carts saved before the migration (old product ids) still check out, and order ids carry on after the old ones.
- The `stock_nonnegative` CHECK and both primary keys survive the column renames, and `PRAGMA foreign_key_check` is clean.
- Git history only ever had `demo-1`…`demo-6` as product files, so no existing order can reference a product without a variant, apart from deleted ones like the test's, which stay readable from their snapshot.

## 4. New tests

`npm test`: 7 files, 75 tests, all passing (62 before this step).

- `test/migration.test.ts` (5 tests): the migration on a database with orders, as above.
- `test/page-cache.test.ts` (8 tests):
  - a miss, then a hit, and the page renders once;
  - the edge copy's TTL, with `no-cache` for browsers;
  - separate cache entries per query string;
  - the cache is skipped on workers.dev and in `astro dev`;
  - errors, responses that set cookies, and non-GET requests are not stored;
  - purge;
  - which paths are cacheable.
- `test/d1.ts`: `freshDb(upTo)` and `migrate(db, { after, upTo })` so a test can stop between migrations.
- `test/catalog.test.ts`: renamed the test that claimed to cover orders placed before the migration (it places them after); the migration test now covers that.

## Open decisions

- **Free or Paid plan:** this decides whether the miss numbers above need action before launch.
- **Workers Caching instead of the hand-written Cache API cache:** fewer moving parts, works on workers.dev, and no CPU on hits. The trade-off is that stock on cached pages is still corrected from `/api/stock` either way, and purging moves to `ctx.cache.purge()`.
- **Applying `0002` to the remote database** is still to do, after the branch is merged, with `npx wrangler d1 migrations apply karniktochi --remote`.
