# Slice 2 report: admin speed

Measured 2026-10-30 on `products-in-d1` (step 9 of docs/slice-2-plan.md). Target from the slice 2 brief:
every admin page under about 10 ms CPU with 1,000 variants and 1,000 orders.

## How it was measured

The method is the same as docs/slice-1-report.md section 1. This time the scripts are committed.

- **Build and server:** the production build, run with
  `wrangler dev -c dist/server/wrangler.json --inspector-port 9230` (wrangler 4.153.0, local workerd).
- **Data:** a throwaway local D1 database, made with `node scripts/seed-perf.mjs`:
  - 500 published products and 1,000 variants, the slice 1 mix: 300 with one variant, 100 with two, 100 with
    five, and 200 of them in 40 series of five;
  - 1,000 orders with 1–3 items each.
- **Profiling:** `node scripts/profile.mjs admin` (or `storefront`) takes a V8 CPU profile through the Worker's inspector (100 µs
  sampling) around each request: 50 requests per URL, one after another, after one warm-up request.
  - **JS+GC** is JavaScript (Astro and our code) plus garbage collection.
  - **All busy** adds V8's `(program)` time, which locally includes the D1 simulator. The real figure is most
    likely between the two.
  - Two separate runs are reported as run 1 / run 2.
- **Measurement-only change:** the Access JWT check in the middleware was skipped in a scratch worktree that
  was never committed, because local requests carry no Access token. The cost of verifying the token is
  therefore not included. In slice 1 that cost was part of the 7 ms admin stock POST.
- **Worst case for the products list:** the newest products are the five-variant ones, so page 1 has 50
  products with 5 sizes each, which is 250 quick-edit forms.

## Results (ms per request, run 1 / run 2)

| Request | Size | JS+GC | All busy | Wall (median) |
|---|---|---|---|---|
| `GET /admin/` (orders, page 1 of 20) | 63.9 KB | 9.1 / 8.5 | 11.7 / 10.6 | 18.3 / 17.4 |
| `GET /admin/?page=20` | 63.7 KB | 9.0 / 8.1 | 11.0 / 10.6 | 18.4 / 17.3 |
| `GET /admin/?status=new` | 63.7 KB | 9.0 / 7.4 | 10.9 / 12.7 | 18.5 / 16.8 |
| `GET /admin/products/` (page 1 of 10: 50 products × 5 sizes) | 216.5 KB | 13.3 / 11.9 | 18.3 / 17.6 | 29.6 / 28.7 |
| `GET /admin/products/?page=10` (50 products × 1 size) | 70.1 KB | 11.6 / 11.2 | 15.1 / 14.1 | 22.1 / 21.5 |
| `GET /admin/products/?q=гюто` (search) | 116.0 KB | 11.9 / 14.9 | 17.3 / 18.7 | 27.4 / 27.1 |
| `GET /admin/products/?category=kamani&status=published` | 162.2 KB | 11.8 / 11.8 | 15.4 / 15.9 | 25.7 / 25.9 |
| `GET /admin/products/{id}/` (edit, 5 sizes) | 15.7 KB | 6.8 / 8.2 | 9.0 / 9.3 | 14.6 / 14.0 |
| `GET /admin/products/{id}/preview/` | 12.6 KB | 7.4 / 7.6 | 9.4 / 9.4 | 15.5 / 15.5 |
| `GET /admin/stock/` (301 redirect) | | 3.5 / 3.1 | 3.7 / 3.6 | 8.8 / 8.6 |
| `POST /admin/products/{id}/` (save, 5 sizes) | | 15.9 / 12.6 | 17.7 / 14.4 | 21.0 / 20.9 |
| `POST /admin/products/` (quick edit, price and stock) | | 9.2 / 11.0 | 10.0 / 12.0 | 16.3 / 15.9 |

For comparison, slice 1 measured the same method on the old admin:

- `/admin/stock/`: all 1,000 variants on one page, 433 KB, 39.7 / 38.3 ms;
- `/admin/`: 103 orders, 148.5 KB, 26.9 / 25.3 ms.

## Fixes made during the measurement

- **Orders page dates, about 15.5 → 8–9 ms.** `toLocaleString(…, { timeZone: 'Europe/Sofia' })` cost about
  0.1 ms per order in workerd, about 5 ms per page of 50. Sharing one `Intl.DateTimeFormat` didn't help,
  because the time-zone conversion itself is the cost. `formatSofiaDateTime()` in `src/lib/format.ts` now
  does it with arithmetic and the EU summer-time rule. `test/format.test.ts` checks it against Intl for every
  hour of 2025–2028.
- **Product save: one database read instead of two** (wall time about 25 → 21 ms). The edit page passes the
  product it already read to `saveAdminProduct()`. The batch's `updated_at` guard still refuses a save if the
  product changed in between, and a new test covers exactly that race.

## Tried without effect

- **Smaller quick-edit markup.** Removing the per-form `aria-label`s and the hidden button text (about 25% of
  the bytes) measured 15.5 ms instead of 15.0 ms, which is noise. It was reverted. The list's cost isn't the
  bytes; it is Astro's rendering per element: about 0.1 ms per product row, plus about 20 µs per quick-edit
  form (pages 1 and 10 differ by 200 forms and about 2–4 ms).

## Over the target

- **Products list: 11–15 ms JS+GC.** Even 50 products with one size each are 11 ms, so the page size, rather
  than the number of sizes, sets the floor.
- **Product save: 12.6–15.9 ms.** This is parsing and checking the form, the SKU query, a batch of about 15
  statements, and the redirect.

**Decision (2026-10-30, docs/DECISIONS.md): accepted.** Admin requests may exceed 10 ms CPU (measured up to
~16 ms locally). The admin is single-user and runs only on Workers Paid (default 30 s CPU limit). Therefore
Workers Paid must be active before the admin runs on Cloudflare, including staging.

## Storefront, same data (ms per request, run 1 / run 2)

Measured to know whether customer-facing pages stay under 10 ms. Same build, database and method as above.
- Cacheable pages were requested with a unique query string, so every number is a cache miss.
- The order POST ran with a dummy Resend key, so `sendEmail()` built both requests but didn't send them, as
  in slice 1.
- Each order took one item from a size whose stock was set to 100,000.

| Request | Size | JS+GC | All busy | Wall (median) | Slice 1 JS+GC |
|---|---|---|---|---|---|
| `GET /` | 19.6 KB | 7.8 / 8.4 | 9.3 / 10.3 | 16.2 / 15.2 | 7.9 / 8.3 |
| `GET /produkti/` | 19.0 KB | 8.7 / 8.0 | 10.8 / 10.8 | 17.8 / 16.8 | 8.7 / 7.6 |
| `GET /produkti/?page=10` | 18.6 KB | 9.4 / 7.9 | 11.7 / 10.2 | 17.2 / 16.7 | 6.9 / 7.9 |
| `GET /kategoriya/gotvarski/` | 18.9 KB | 8.6 / 8.0 | 11.2 / 10.6 | 17.7 / 17.4 | 7.7 / 7.2 |
| Product page, 5 sizes | 12.5 KB | 7.6 / 7.6 | 9.8 / 9.1 | 15.7 / 15.5 | 7.6 / 7.4 |
| Product page, 1 size, series of 5 | 13.0 KB | 7.0 / 7.6 | 9.7 / 9.2 | 15.9 / 15.7 | 7.3 / 6.5 |
| `GET /kolichka/` (cart, never cached) | 10.8 KB | 4.2 / 3.9 | 5.0 / 4.4 | 9.9 / 9.8 | 5.3 / 4.7 |
| `GET /porachka/` (checkout, never cached) | 12.9 KB | 3.6 / 3.5 | 5.0 / 4.2 | 10.1 / 9.4 | 5.0 / 5.8 |
| `GET /api/stock` (all 1,000 sizes) | 11.9 KB | 8.6 / 9.0 | 9.8 / 9.7 | 15.6 / 15.7 | 10.5 / 8.7 |
| `GET /api/cart-lines`, 5 ids | 1.0 KB | 5.4 / 5.3 | 7.0 / 6.6 | 12.4 / 12.4 | 5.8 / 5.4 |
| **`POST /api/orders` (checkout submit, 1 item)** | | **15.2 / 14.9** | 17.1 / 16.5 | 23.8 / 23.9 | **9.8 / 9.9** |
| `GET /porachka/blagodarim/?id=…` (thank-you) | 7.9 KB | 9.5 / 10.3 | 11.2 / 11.3 | 16.8 / 17.1 | 7.9 / 7.5 |

- **Pages:** all the storefront pages stay under 10 ms JS+GC and are close to slice 1.
- **Over 10 ms: the checkout submit, `POST /api/orders`, at about 15 ms against 9.8 ms in slice 1.**
  - With email building switched off (no Resend key) it is still 14.4 / 14.9 ms, so the emails don't
    explain the difference.
  - The order code (`createOrder`, `orderableVariants`, `insertOrder`) is unchanged since slice 1.
  - The per-function profile has no single hot spot: D1 result decoding (`toJson`, `text`) and per-query
    tracing (`setAttributes`, `enterSpan`) are the largest parts.
  - Not optimised; reported to the user (2026-10-30).
- **Borderline:** the thank-you page, at 9.5 / 10.3 ms (slice 1: 7.9 / 7.5).

### Checkout submit against the number of orders

Measured only, no code changes. The same build and products/sizes were used, with three fresh throwaway
databases holding 0, 1,000 and 5,000 existing orders (`seed-perf.mjs` with the order count changed in a
scratch copy). Emails were built but not sent (no Resend key). Each run was 50 order POSTs after one warm-up,
and the server was restarted for each database.

| Existing orders | JS+GC | All busy | Wall (median) |
|---|---|---|---|
| 0 | 10.0 / 9.3 | 11.2 / 10.7 | 17.0 / 16.2 |
| 1,000 | 10.5 / 9.0 | 11.7 / 10.8 | 17.2 / 16.3 |
| 5,000 | 10.6 / 9.5 | 11.7 / 10.9 | 17.3 / 16.2 |

- **Flat with the order count:** within about 1 ms across 0, 1,000 and 5,000 orders, which is within run-to-run
  noise.
- **The ~15 ms figure didn't come back.** The whole storefront set was rerun on the 1,000-order database, so
  the order POST came after all the page requests as before. It measured 9.7 ms, and the thank-you page
  6.0 ms. The first measurement used a different scratch build, with a stubbed `fetch` and a dummy Resend
  key, so the 15 ms was most likely that setup or machine load rather than the order code. This wasn't proven.

**Decision (2026-10-30, docs/DECISIONS.md): accepted.** The checkout submit is ~15 ms locally at worst
(9–10.6 ms on the rerun), flat with the order count, and accepted under Workers Paid. Real checkout CPU is
to be measured on Cloudflare (HANDOFF, staging checklist).

## Not measured

- Anything on Cloudflare itself. Locally there is no Workers Cache, no real D1 latency, and no Access JWT
  verification. Staging can measure these with real CPU times from Workers Logs or the dashboard.
- The new product page (`/admin/products/new/`): it is the edit form without database reads, so it costs
  less than the edit page.
