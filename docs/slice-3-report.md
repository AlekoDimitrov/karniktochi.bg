# Slice 3 report: speed with photos

Measured 2026-11-24 on `products-in-d1` (step 5 of docs/slice-3-plan.md). Target: customer pages under 10 ms
CPU. Admin requests may exceed it under Workers Paid (docs/DECISIONS.md, 2026-10-30).

## How it was measured

Same method as docs/slice-2-report.md:
- the production build under `wrangler dev -c dist/server/wrangler.json --inspector-port 9230` (wrangler
  4.153.0, local workerd);
- a scratch worktree with its own local D1 and R2, deleted afterwards;
- `node scripts/profile.mjs storefront|admin`: 50 requests per URL after one warm-up, V8 CPU profile at
  100 µs sampling. JS+GC is our code and Astro; "All busy" adds V8's `(program)`, which locally includes the
  D1 simulator. Two runs, shown as run 1 / run 2.

**Data:** `node scripts/seed-perf.mjs`, the slice 2 data (500 products, 1,000 sizes, 1,000 orders) plus
photo rows:
- 3 photos on most products, so every card on home, listing and category pages has a photo;
- 12 on perf-450..452;
- none on perf-011 (the no-photo product page) and perf-012 (the upload target).

The photo rows have no files behind them; the HTML and CPU are the same either way.

**Measurement-only changes, never committed:**
- The Access JWT check was skipped in the scratch worktree, as in slice 2.
- The local `RESEND_API_KEY` was empty, so no email was built or sent.

## Customer pages (ms per request, run 1 / run 2)

| Request | Size | JS+GC | All busy | Wall (median) | Slice 2 JS+GC |
|---|---|---|---|---|---|
| `GET /` (cards with photos) | 21.0 KB | 6.6 / 6.3 | 8.1 / 7.5 | 12.8 / 12.5 | 7.8 / 8.4 |
| `GET /produkti/` (24 cards with photos) | 28.0 KB | 9.5 / 8.1 | 11.2 / 10.7 | 15.5 / 14.9 | 8.7 / 8.0 |
| `GET /produkti/?page=10` | 27.6 KB | 7.8 / 8.3 | 9.9 / 9.6 | 14.8 / 14.3 | 9.4 / 7.9 |
| `GET /kategoriya/gotvarski/` | 27.9 KB | 8.5 / 7.8 | 10.8 / 10.2 | 14.9 / 14.4 | 8.6 / 8.0 |
| Product page, 5 sizes, **12 photos** | 24.1 KB | 7.8 / 5.1 | 9.0 / 5.5 | 13.3 / 8.3 | 7.6 / 7.6 |
| Product page, 1 size, series of 5, 3 photos | 18.6 KB | 7.2 / 5.0 | 9.0 / 5.6 | 13.0 / 7.9 | 7.0 / 7.6 |
| Product page, 1 size, series of 5, **no photo** | 16.0 KB | 6.3 / 5.3 | 8.5 / 5.9 | 12.6 / 8.1 | |
| `GET /kolichka/` (cart, never cached) | 10.8 KB | 3.3 / 3.0 | 4.1 / 3.5 | 8.1 / 5.3 | 4.2 / 3.9 |
| `GET /porachka/` (checkout, never cached) | 12.9 KB | 3.6 / 2.9 | 4.6 / 3.2 | 8.0 / 5.2 | 3.6 / 3.5 |
| `GET /api/stock` (all 1,000 sizes) | 11.9 KB | 8.0 / 5.4 | 9.5 / 5.7 | 13.1 / 8.0 | 8.6 / 9.0 |
| `GET /api/cart-lines`, 5 ids (with photo URLs) | 1.4 KB | 4.5 / 3.3 | 5.4 / 3.6 | 8.8 / 5.7 | 5.4 / 5.3 |
| `POST /api/orders` (checkout submit, 1 item) | | 10.3 / 6.6 | 11.4 / 7.1 | 15.3 / 9.6 | 15.2 / 14.9 |
| `GET /porachka/blagodarim/?id=…` (thank-you) | 7.9 KB | 6.7 / 4.8 | 7.3 / 5.0 | 11.2 / 6.9 | 9.5 / 10.3 |

- **All customer pages are under 10 ms JS+GC.** The highest is the listing page at 9.5 / 8.1 ms, against
  8.7 / 8.0 ms in slice 2.
- **Photos add bytes, not much CPU.** Listing pages grew from about 19 KB to 28 KB (a `srcset` per card). The
  product page with 12 photos is 8 KB larger than with none and within noise of it in CPU.
- **Run 2 was faster across the board,** including requests that photos don't touch (`/api/stock`, the
  checkout submit). That is machine load, not code. Run 1 is the one to compare with slice 2.
- **Checkout submit, 10.3 / 6.6 ms:** unchanged code, already accepted (DECISIONS 2026-10-30).

## Admin (ms per request, run 1 / run 2)

| Request | Size | JS+GC | All busy | Wall (median) |
|---|---|---|---|---|
| `GET /admin/products/perf-450/` (edit, 5 sizes, 12 photos) | 40.1 KB | 7.3 / 8.8 | 8.5 / 9.9 | 13.0 / 13.6 |
| `GET /admin/products/perf-450/preview/` | 24.1 KB | 7.6 / 7.5 | 8.8 / 9.2 | 12.4 / 13.2 |
| **`POST /admin/products/perf-012/photos/`** (upload, 3 WebP renditions, ~1 MB) | | **21.5 / 18.3** | 24.5 / 21.8 | 53.7 / 50.5 |
| `POST /admin/products/perf-450/` (save, 5 sizes) | | 7.7 / 6.0 | 8.9 / 6.5 | 12.9 / 8.5 |
| `POST /admin/products/` (quick edit) | | 6.4 / 4.5 | 7.1 / 5.2 | 10.7 / 7.4 |
| `GET /admin/products/` (page 1 of 10) | 216.5 KB | 11.1 / 11.4 | 15.0 / 16.4 | 23.4 / 23.7 |

The other admin pages don't show photos and measured as in slice 2.

**The upload is about 18–22 ms CPU.**
- **What it covers:** reading a 1 MB multipart body, SHA-256 of the 700 KB rendition, the header checks,
  three puts to the local R2 bucket, and the insert.
- **Why it's acceptable:** it is an admin request, so it falls under the Workers Paid decision (30 s CPU
  limit) and is well within it. It wasn't optimised.
- **Each upload was removed again** outside the profile, through the edit page's photo-remove action.
  Afterwards perf-012 had 0 photo rows and the local bucket had 0 objects, so removal deleted the R2 files
  too.
- **A script bug found on the way:** the first runs sent a 400×500 "400" rendition. The server refused it
  (422, "Expected renditions with long sides 400, 900, 1800 px"), which was correct. The script now sends
  320×400.

## Not measured

- Anything on Cloudflare itself:
  - real R2 put latency (the upload's wall time will differ);
  - Workers Cache;
  - real D1;
  - the Access JWT check.
  Staging can show real CPU in Workers Logs.
- The browser side of an upload (decode, resize, encode), which costs the admin's device, not the Worker.
