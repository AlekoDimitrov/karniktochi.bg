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
- **Profiling:** `node scripts/profile-admin.mjs` takes a V8 CPU profile through the Worker's inspector (100 µs
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

These numbers matter for the Free plan's 10 ms CPU limit. DECISIONS (2026-10-29) says the site launches on the
paid plan, where the limit is 30 s and CPU is billed per millisecond. Admin pages are used by one person and
are never cached. Options are listed in docs/HANDOFF.md.

## Not measured

- Anything on Cloudflare itself. Locally there is no Workers Cache, no real D1 latency, and no Access JWT
  verification. Staging can measure these with real CPU times from Workers Logs or the dashboard.
- The new product page (`/admin/products/new/`): it is the edit form without database reads, so it costs
  less than the edit page.
