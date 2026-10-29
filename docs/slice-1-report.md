# Slice 1: products in D1 — report

Branch `products-in-d1`. Nothing was deployed and nothing was applied with `--remote`.

## 1. CPU per server-rendered page under `wrangler dev`

### How it was measured

- The production build run with `wrangler dev -c dist/server/wrangler.json` (wrangler 4.153.0, local workerd) on a throwaway local D1 with **500 published products and 1,000 variants**: 300 products with one variant, 100 with two, 100 with five, and 200 of them in 40 series of five.
- CPU comes from V8 CPU profiles taken through the Worker's inspector (100 µs sampling) while 50 requests were sent one after another to the same URL. Numbers are per request, from two separate runs (run 1 / run 2).
  - **JS+GC** is time in JavaScript (Astro and our code, including V8 builtins) and garbage collection.
  - **All busy** adds V8's `(program)` time: native work on the thread that isn't attributed to JS. Locally this includes the D1 simulator and HTML encoding; on Cloudflare D1 runs outside the Worker. The real figure is most likely between the two columns.
- **Every number is a cache miss.** Local `wrangler dev` does not emulate Workers Cache: no `Cf-Cache-Status` header ever appears. On Cloudflare a cache hit doesn't run the Worker and uses no CPU (see section 2). Cacheable pages were also requested with a unique query string, so they would miss even where a cache exists.
- **Order creation and the admin stock change** were measured on a measurement-only build, made in a scratch worktree and never committed:
  - `sendEmail()` builds the Resend request (body and headers) but doesn't send it.
  - `verifyAccess()` checks a real RS256 Access token against a local key set instead of fetching the team's certificates. That is the same work as in production once the certificates are cached.
  - Everything else is the committed code.
  - The admin POST needs an `Origin` header: Astro's built-in `checkOrigin` rejects form POSTs without one. Browsers always send it.

### Results (ms per request, run 1 / run 2)

"Before" is the same database and method on the code before the scaling fix (`376e4c4`), where every storefront page loaded the whole catalog.

| Request | Size | JS+GC | All busy | Wall (median) | Before: JS+GC (size) |
|---|---|---|---|---|---|
| `/` | 17.6 KB | 7.9 / 8.3 | 10.0 / 9.5 | 12.5 / 12.0 | 21.4 / 23.1 |
| `/produkti/` | 17.5 KB | 8.7 / 7.6 | 12.6 / 11.9 | 15.5 / 13.4 | 41.5 / 35.8 (212.7 KB) |
| `/produkti/?page=10` | 16.9 KB | 6.9 / 7.9 | 11.6 / 11.6 | 13.1 / 13.7 | |
| `/kategoriya/gotvarski/` | 17.5 KB | 7.7 / 7.2 | 11.8 / 10.0 | 13.7 / 13.2 | 24.2 / 26.4 (57.8 KB) |
| `/kategoriya/gotvarski/?page=3` | 16.8 KB | 6.7 / 6.6 | 10.9 / 10.7 | 12.6 / 12.7 | |
| Product, 5 variants | 11.2 KB | 7.6 / 7.4 | 10.1 / 8.8 | 11.3 / 11.1 | 23.6 / 22.6 |
| Product, 2 variants | 10.7 KB | 6.7 / 6.4 | 9.1 / 8.6 | 11.4 / 10.7 | 21.4 / 22.2 |
| Product, 1 variant, series of 5 | 12.0 KB | 7.3 / 6.5 | 9.8 / 8.9 | 11.9 / 11.2 | 20.5 / 20.6 |
| `/kolichka/` (never cached) | 9.0 KB | 5.3 / 4.7 | 5.9 / 5.4 | 7.7 / 7.1 | 9.5 / 11.2, cache hit only (210.4 KB) |
| `/porachka/` (never cached) | 11.2 KB | 5.0 / 5.8 | 6.2 / 6.8 | 7.6 / 7.9 | 24.3 / 22.8 (125 KB) |
| `/porachka/blagodarim/?id=…` | 6.1 KB | 7.9 / 7.5 | 9.2 / 8.7 | 11.8 / 10.7 | |
| `/api/stock` (all 1,000 variants) | 12.6 KB | 10.5 / 8.7 | 11.3 / 9.9 | 12.3 / 11.6 | 9.2 / 8.7 |
| `/api/cart-lines`, 5 ids | 1.1 KB | 5.8 / 5.4 | 6.5 / 6.0 | 8.0 / 7.7 | |
| `/api/cart-lines`, 50 ids | 11.2 KB | 6.5 / 6.3 | 7.7 / 7.4 | 9.5 / 9.2 | |
| `POST /api/orders` (1 item, Resend mocked) | | 9.8 / 9.9 | 11.8 / 11.3 | 13.2 / 13.5 | |
| `POST /admin/stock/` (stock change) | | 7.3 / 7.1 | 8.2 / 8.1 | 10.2 / 9.8 | |
| `GET /admin/stock/` (all 1,000 variants) | 433 KB | 39.7 / 38.3 | 59.0 / 54.2 | 59.0 / 58.6 | |
| `GET /admin/` (103 orders) | 148.5 KB | 26.9 / 25.3 | 29.4 / 28.4 | 33.3 / 30.5 | |
| Product 404 | | 6.9 / 7.3 | 7.8 / 8.4 | 10.0 / 9.4 | |
| Unknown path 404 (baseline) | 4.2 KB | 5.0 / 4.9 | 5.4 / 5.5 | 7.5 / 6.6 | |

First request after start (module load, compile and first render of `/`): **51.7 ms** all busy (33.7 ms JS+GC), one request.

The earlier measurement on 60 products and the old code is superseded by this table.

### What this means

- **The scaling fix works.** Storefront pages now cost about **6.5–9 ms of JS** on a miss with 500 products, against 20–42 ms before, and page sizes no longer grow with the catalog.
  - `/produkti/` went from 213 KB to 17.5 KB.
  - The checkout page went from 125 KB to 11 KB.
  - The cart page from 210 KB to 9 KB.
- **A fixed cost of about 5 ms** per Worker request is Astro's request pipeline: routing, locals, render setup. It shows on the unknown-path 404.
- **Against the Free plan's 10 ms CPU per request:**
  - JS+GC is under 10 ms for every storefront page.
  - All-busy, the listing and category pages are 10–12.6 ms; the true figure is between the two columns.
  - Cache hits on Cloudflare use no CPU, so only misses and the never-cached pages count. Cloudflare tolerates occasional overruns and terminates only consistent ones (error 1102).
- **`/api/stock` is now the heaviest storefront endpoint per call** (about 9–10 ms JS at 1,000 variants). It returns every public variant and grows with the catalog. It is edge-cached for 15 s and every page view requests it, so most calls should be hits; still, it's the next candidate if the catalog grows.
- **Order creation** is about 10 ms JS, including building both Resend requests. **An admin stock change** is about 7 ms. The handler now reads only the posted variant instead of every variant.
- **The admin pages render everything**: all variants on the stock page (433 KB, ~40 ms) and up to 200 orders on the orders page (~26 ms with 103 orders). Both are well over the Free limit as they grow. They should be paginated, along with the admin product work in slice 2.
- **Bug found and fixed while measuring.** `/admin/` returned 500 once there were more than 100 orders. `listOrders()` bound every order id as a separate SQL parameter, and D1 allows at most 100 bound parameters per query. **`main` has the same bug.** Fixed on this branch in `0aed0fd`, with a test for 150 orders. The other id lists are capped at 50, so they stay under the limit.

## 2. Workers Cache

The hand-written Cache API cache (`page-cache.ts`) is gone. `"cache": { "enabled": true }` in `wrangler.jsonc` puts [Workers Cache](https://developers.cloudflare.com/workers/cache/) in front of the Worker; it needs Wrangler 4.69.0+ and this repo has 4.153.0. The setting also reaches the built `dist/server/wrangler.json`.

**What may be cached** is set per response with `Cache-Control` in `src/lib/cache-policy.ts`. The middleware applies it to every storefront response. Every response gets an explicit header, because a response without `Cache-Control` can still be cached heuristically ([configuration](https://developers.cloudflare.com/workers/cache/configuration/)).

| Response | `Cache-Control` |
|---|---|
| 200 on `/`, `/produkti/`, `/produkti/<slug>/`, `/kategoriya/<category>/`, GET or HEAD | `public, max-age=60, stale-while-revalidate=600` |
| 200 on `/api/stock`, GET or HEAD | `public, max-age=15` |
| `/kolichka/`, `/porachka/*`, every other `/api/*`, unknown paths, any non-GET, any non-200 (404s, redirects), any response with `Set-Cookie` | `no-store` |
| `/admin/*`, including the 403 | `private, no-store` |

Pages carry `Cache-Tag` values so admin saves can purge exactly what they affect:

| Page | Tags |
|---|---|
| Home | `home` |
| `/produkti/` | `listing` |
| Category pages | `category-<id>` |
| Product page | `product-<id>`, for itself and for every product it shows (related products and other models) |
| `/api/stock` | `stock` |

I checked the headers on every route under `wrangler dev`.

### (i) Static asset requests and the Free plan's 100,000 requests a day

- **What the docs say.** [Pricing](https://developers.cloudflare.com/workers/platform/pricing/): with Workers Caching enabled, requests served from the Worker's cache are billed at the same per-request rate as requests that invoke the Worker, **"This includes requests to static assets"**. Cache hits count as requests but use no CPU. Without caching, static asset requests are "free and unlimited".
- **What they don't say.** None of the pricing, [limits](https://developers.cloudflare.com/workers/platform/limits/) or [static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) pages states in so many words that these requests count toward the Free plan's 100,000 a day. Since they become billed requests, assume they do.
- **One page view, with caching on:** the HTML, about 10 assets, and `/api/stock` make about 12 counted requests. That's roughly 8,300 page views a day on the Free plan. The cart adds `/api/cart-lines`.
- **One page view, with caching off:** the HTML and `/api/stock` count, and the assets are free. That's about 2 requests, or roughly 50,000 page views a day, but every page view then runs the Worker.
- **Past the limit:** Cloudflare returns error 1027, or bypasses the Worker if the route is set to fail open.
- **Consequence:** on the Free plan, enabling the cache trades CPU for daily request budget. On the Paid plan (10 million requests a month included), it doesn't matter.

### (ii) Purging product, category and home pages after an admin save

- **How Cloudflare purges.** From [Purge and invalidate](https://developers.cloudflare.com/workers/cache/purge/):
  - Call `ctx.cache.purge({ tags })`, or `cache.purge(...)` imported from `cloudflare:workers` where there is no `ctx`. `pathPrefixes` and `purgeEverything` are the other options.
  - Purges go through Instant Purge and propagate globally.
  - They always use the Free tier's rate limits; a rate-limited purge returns `success: false`.
  - `invalidate()` marks entries stale instead of deleting them, but only helps if the Worker answers conditional requests with 304, which this one doesn't.
- **What I built.** `src/lib/cache-purge.ts`:
  - `productPurgeTags(product, previousCategory?)` returns the product's tag (its own page and every product page showing it), `home`, `listing` (every `/produkti/` page, since a new or re-sorted product shifts all pages) and its category's tag. If the category changed, it adds the old category's tag too.
  - `stockPurgeTags(productId)` returns `stock` and the product's tag.
  - `purgeTags(purger, tags)` calls `purge`. It logs a failure or rejection and never throws: the save has already happened, and pages expire on their own within max-age plus stale-while-revalidate.
- **Where it's used.** The admin stock save calls it today. The product editor in slice 2 should call `purgeTags(cache, productPurgeTags(product, oldCategory))` after a save.
- **Not verified on Cloudflare.** Local `wrangler dev` and `astro dev` export a `cache` object without `purge()`, so the admin code checks for `purge()` and skips purging locally. Purging is covered by unit tests with a fake.
- **Purging doesn't reach browsers.** `max-age=60, stale-while-revalidate=600` also lets a visitor's browser reuse a page for 60 s, then show it stale once while it refetches. If edits must show up immediately for visitors who already have the page, use `s-maxage=60, stale-while-revalidate=600` with `max-age=0` instead. Stock on cached pages is corrected from `/api/stock` either way.

### (iii) Cloudflare Access on `/admin` only

- **The docs are silent.** The Workers Cache docs say nothing about Access. The old Cache API was documented as unavailable for Workers fronted by Access; there is no such note for Workers Cache.
- **The design is safe either way:**
  - Admin responses, including the 403, are `private, no-store`, so they are never stored.
  - The middleware still verifies the Access token on every admin request.
  - The public paths aren't behind Access, so Access doesn't affect them.
  - Requests that carry an `Authorization` header and responses that set cookies bypass the cache automatically.
  - The cache key doesn't include the host (iv), so an admin page couldn't leak to another hostname either: nothing from `/admin` is ever stored.
- **What to confirm once deployed:** after attaching the Access application, `curl -I` a public page twice and look for `Cf-Cache-Status: HIT`, then check `/admin/` returns `BYPASS` or `MISS`.

### (iv) Query strings and the cache key

From [Cache keys](https://developers.cloudflare.com/workers/cache/cache-keys/):
- **What's in the key.** The path, the full query string and the Worker version. Not the host, so workers.dev and the custom domain share one cache.
- **Pagination.** `?page=2` and `/produkti/` are separate entries. The pagination links point page 1 at the bare URL, so it stays one entry; a hand-typed `?page=1` is a second entry for the same page.
- **Sizes.** `?v=210-mm` and `?v=240-mm` are separate entries of the same product page, each with that size preselected. That's one entry per size plus the bare URL.
- **Order and trailing slashes matter.** `?a=1&b=2` and `?b=2&a=1` are different keys. Trailing slashes matter too.
- **Tracking parameters miss the cache.** Any extra parameter (`utm_source`, `fbclid`) creates a separate entry, so a campaign link runs the Worker on its first hit in each location. Custom keys (`cf.cacheKey`) only apply to calls through a binding or `ctx.exports`, not to visitors' requests.
- **Deploys start with an empty cache.** The Worker version is part of the key, so no purge is needed after a deploy.

### History: the Cache API on workers.dev

The removed `page-cache.ts` used `caches.default`. Its comment said the Cache API does nothing on `*.workers.dev`; the [Cache API docs](https://developers.cloudflare.com/workers/runtime-apis/cache/) don't say that, only community reports do. Workers Cache is documented to work on workers.dev, so the question no longer matters.

## 3. Catalog scaling

No page loads the whole catalog any more:

- **Product page** (`getProductPage`): one D1 batch reads the product with its active variants, the other models in its series (capped at 24), and up to 4 related products from its category outside the series, each with its variants. If there are no related products, the section isn't shown. There are no product photos in the schema yet, so there are none to read; photos come with the admin product work.
- **`/produkti/` and category pages** (`listPublicPage`):
  - 24 products per page, newest first, with a count in the same batch.
  - Links use `?page=N`.
  - The value must be a plain positive integer; anything else, or a page past the last, is a 404.
- **Home** (`latestPublicProducts`): reads only the 4 products it shows.
- **Cart and checkout**:
  - Neither embeds the catalog any more. Both read variant ids and quantities from localStorage and call `/api/cart-lines?ids=…`.
  - The endpoint returns name, brand, option label, product URL, price, live stock and `photo` (null for now) for public, active variants. It accepts at most 50 well-formed ids, otherwise it answers 400.
  - The client splits larger carts into requests of 50 ids. Malformed ids are treated as unavailable.
  - If the request fails, the cart page shows an error and checkout sends the visitor back to the cart.
  - You asked for this on the cart page; I did checkout too, because it embedded the whole catalog as well.
- **`/api/stock`** is unchanged: it returns all public variants, as discussed in section 1.

## 4. `npm run seed:dev`

`scripts/seed-dev.sql`, run with `wrangler d1 execute karniktochi --local`, so it can never reach the remote database.

- **What it replaces:** every product, variant and stock row in the local database, including the demo products.
- **The two knives in three sizes:**

  | Knife | Size | Price | Stock |
  |---|---|---|---|
  | Гюто Шибата Котецу | 210 мм | €189 | 4 |
  | | 240 мм | €219 | 1 |
  | | 270 мм | €259 | sold out |
  | Петти Такамура R2 | 130 мм | €119 | 6 |
  | | 150 мм | €139 | sold out |
  | | 170 мм | €159 | 2 |

- **The 20 single-variant products:** knives, stones and accessories across all four categories. A few share series, so "other models" shows up, and one stone is sold out.
- **Orders are kept.** Their items are snapshots, so they stay readable.
- **Tests:** `test/seed-dev.test.ts` checks the counts, the prices and stock of the sized knives, and that the seed can be run again.

## 5. Browser walkthrough (`astro dev`, local database after `npm run seed:dev`)

1. **Size picker.** Opened `/produkti/gyuto-shibata-kotetsu/` with an empty cart.
   - 210 мм was selected at 189,00 € ("В наличност"), and 270 мм was struck through and disabled.
   - Clicking **240 мм** pressed it, changed the price to 219,00 € and the URL to `?v=240-mm`.
2. **Two sizes of one knife.** Clicked **Добави в количката** on 240 мм, clicked **210 мм** (price back to 189,00 €, URL `?v=210-mm`), and clicked **Добави в количката** again.
   - "Добавено в количката" appeared and the header showed "Количка (2)".
   - localStorage held the two variant ids.
3. **Cart.** Clicked **Към количката →**.
   - Two lines of "Гюто Шибата Котецу": "Дължина: 240 мм" at 219,00 € and "Дължина: 210 мм" at 189,00 €. Total 408,00 €.
   - The quantity fields were capped at the stock (1 and 4).
   - The page made one request, `/api/cart-lines?ids=v_5eed00000102,v_5eed00000101`, and embeds no catalog.
4. **Checkout.** Clicked **Към поръчката**.
   - The summary showed both sizes with their option labels and 408,00 €, from the same single `/api/cart-lines` request.
   - Filled in: name "Тест Тестов", phone 0888 123 456, city Варна, courier office "Еконт, офис Център", cash on delivery, no email.
   - Clicked **Поръчка със задължение за плащане**.
   - The thank-you page showed order **KT-00003** with both sizes, and the cart was empty.
   - No email was sent: the local `RESEND_API_KEY` is empty.
5. **Stock reserved.** Back on the product page, live stock was 210 мм: 3 and 240 мм: 0, and the 240 мм button was disabled.
6. **Cancelled order returns its stock.**
   - In `/admin/` (local dev skips Access), set KT-00003's status to **Анулирана** and clicked **Запази**. The page reloaded with `?msg=saved` and the order marked Анулирана.
   - Live stock went back to 210 мм: 4 and 240 мм: 1, and 240 мм was selectable again.
   - `/admin/stock/` showed 210 мм = 4, 240 мм = 1, 270 мм = 0.

## 6. Migrating existing orders and stock to variant ids

Unchanged from the previous report.

`migrations/0002_products.sql` does four things:
- renames `stock.product_id` and `order_items.product_id` to `variant_id`;
- adds `order_items.product_id` and `option_label`;
- creates the six demo products, each with one default variant whose id is the old product id;
- inserts starting stock only where no stock row exists.

I tested it against a database that already has orders, in two ways:
1. **With wrangler, as it would run for real.** In a throwaway project with `wrangler d1 migrations apply --local`: applied `0001`, inserted orders and stock the way `main`'s code writes them, then applied `0002`.
   - 4 orders: new, cancelled, shipped, refused.
   - 5 order items, one of them for a product whose file was deleted.
   - Stock rows only for products that had been ordered or set in `/admin`.
2. **In the test suite**, `test/migration.test.ts`: the same data through Miniflare D1, then checked with the app's own functions.

Results:
- **Live stock is kept**, including a count set in `/admin`. Never-ordered products get their starting stock.
- **Every order and item survives** with its snapshot. Old items get the old product id as `variant_id` and `product_id`, with an empty `option_label`.
- **Old orders still move stock** when their status changes.
- **Carts saved before the migration** still check out.
- **The CHECK constraints and primary keys** survive, and `PRAGMA foreign_key_check` is clean.
- **Git history only ever had `demo-1`…`demo-6`** as product files.

## 7. Tests

`npm test`: 10 files, **100 tests, all passing**. The type check (`npx astro check`) is clean, and `npm run build` completes with the `check-hidden` check passing.

New or changed in this step:
- `test/catalog-pages.test.ts`:
  - pagination (24 per page, newest first, counts only listed products, category filter);
  - the home page's newest 4;
  - `?page=` parsing;
  - the product page's series and up to 4 related products, and null for non-public products;
  - `/api/cart-lines` contents (option only for products with choices, URL with `?v=`, live stock);
  - archived and draft variants left out;
  - the 50-id limit and id format;
  - a variant's product.
- `test/cache.test.ts`:
  - the `Cache-Control` for every kind of response, including never-cacheable paths, non-GET, non-200 and cookies;
  - `Cache-Tag` values;
  - purge tags for product and stock saves;
  - `purgeTags` on success, rejection, an exception and a missing `purge()`.
- `test/seed-dev.test.ts`: the dev seed.
- `test/orders-list.test.ts`: the admin orders list past 100 orders. It fails without the fix.
- `test/stock-api.test.ts`: `/api/stock` is cached for 15 s and tagged `stock`.
- Removed: `test/page-cache.test.ts`, together with `src/lib/page-cache.ts`.

## Open decisions

- **Free or Paid plan.** On Free, Workers Cache makes static assets count against 100,000 requests a day (about 8,300 page views); without it, uncached listing pages sit around the 10 ms CPU limit. On Paid, neither matters.
- **Browser caching after edits:** keep `max-age=60` for browsers, or switch to `s-maxage` so purges take effect for every visitor at once (section 2 (ii)).
- **Admin pagination** for the stock and orders pages before the catalog and order count grow.
- **The `listOrders` fix also belongs on `main`**, which has the same 100-order bug and is live code.
- **Applying `0002` to the remote database** is still to do, after the branch is merged, with `npx wrangler d1 migrations apply karniktochi --remote`.
