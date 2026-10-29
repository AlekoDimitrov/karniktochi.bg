# Handoff

Rewritten at the end of every task. Last updated: 2026-10-29, after pushing both branches and deleting the
slice-1-*.txt excerpt files.

## Branch

`products-in-d1`, pushed and tracking `origin/products-in-d1`. `main` is on GitHub at `fa78e84` and is the
deployed version.

## Last 10 commits (before this one)

- `da6caa7` Add docs/HANDOFF.md and docs/DECISIONS.md; CLAUDE.md: read decisions, update handoff
- `ba22d8d` Fix what the click-through found: cart caps, unavailable lines, load failures, admin stock, 404s, phone overflow
- `6695f30` Pages: Cache-Control public, max-age=0, s-maxage=60, stale-while-revalidate=600
- `56b326e` Merge main into products-in-d1: workshop paragraph and footer from main
- `fa78e84` Home: workshop paragraph and footer address and about line (on main, deployed)
- `9928925` Slice 1 report: 500-product CPU table, order and stock-change CPU, Workers Cache answers, walkthrough
- `0aed0fd` Fix the admin orders list past 100 orders; skip purging where Workers Cache has no purge()
- `805ce34` Add npm run seed:dev: local catalog of 2 knives in three sizes and 20 single products
- `cfb120d` Slice 1: no page loads the whole catalog; Workers Cache replaces the page cache
- `bfc08b4` Slice 1 report: CPU per page under wrangler dev, Cache API on workers.dev, migration results

## Finished

- Slice 1, products in D1:
  - products and variants tables;
  - migration of existing orders and stock to variant ids;
  - storefront reads D1 without ever loading the whole catalog;
  - pagination at 24 per page;
  - /api/cart-lines for the cart and checkout;
  - Workers Cache headers and Cache-Tag purging;
  - npm run seed:dev.
- The click-through fixes in `ba22d8d`, each with a test.
- The report: docs/slice-1-report.md (CPU tables, Workers Cache answers, migration results).

## In progress

- Nothing. Slice 2 (admin product manager) is waiting for the brief.

## Tested in a browser (astro dev, local database from seed:dev)

- Size picker, a cart with two sizes of one knife, checkout, and a cancelled order returning its stock.
- Cart: a quantity above stock, "Коригирай количката" with a sold-out line, a line that is no longer
  available, and a failed /api/cart-lines (blocked in the page).
- Checkout: bank transfer, delivery to an address, an order with an email (payload logged, not sent),
  and all six validation errors.
- The admin stock form, including invalid and empty values.
- A category page; the other-models and related sections; pagination with 52 products.
- 404 pages.
- Phone width (390 px, in an iframe) for home, listing, category, product, cart, checkout, thank-you,
  admin and 404.

## Not tested in a browser

- Anything on Cloudflare: cache hits, tag purges, workers.dev, the custom domain, real Cloudflare Access.
- Real email sending through Resend.
- Keyboard-only use and screen readers.
- Real phones (only the 390 px iframe).
- The `/api/cart-lines` failure on first page load. Only a failure after the page had loaded was tested.

## Test and build results (at `ba22d8d`)

- `npm test`: 14 files, 133 tests, all passing.
- `npx astro check`: 0 errors, 0 warnings, 0 hints.
- `npm run build`: completes; check-hidden passes.

## Open questions

- The slice 2 brief itself (constraints already noted: admin pages under ~10 ms CPU at 1,000 variants and
  1,000 orders, orders paginated at 50, inline quick edit replacing /admin/stock/, purgeEverything for
  bulk operations).
- The admin is decided to be in English, but the current admin pages are in Bulgarian. Translate them in slice 2?
- Should the `listOrders` fix go to main now? main is live with the bug.
- When to apply migration 0002 to the remote database (after merge, before the first deploy of this branch).
- The reasons marked "not recorded" in docs/DECISIONS.md.
- Uncommitted edits in src/i18n/bg.ts (the payNote text and a line-wrap) are yours; commit or drop them.
- An untracked `backup-before-0002.sql` is in the project root (not created by Claude). If it is a database
  dump, keep it out of git (it isn't in .gitignore) and store it outside the repo.

## Known bugs and limits

- main (live): the admin orders list fails with more than 100 orders. Fixed on this branch only (`0aed0fd`).
- The admin stock and orders pages render everything: about 40 ms and 26 ms CPU in the slice 1 measurement.
- /api/stock returns every public variant (about 12 KB at 1,000 variants).
- Purging can't be checked locally: local dev has no Workers Cache and no purge().
- Chrome may show a page's old copy once after an edit (stale-while-revalidate in the browser cache).
- No product photos yet; product pages and the cart show placeholders.
- R2 and MEDIA_BASE_URL are decided but not configured.

## New on this branch (names only)

- Command: `npm run seed:dev`
- Config key: `cache.enabled` in wrangler.jsonc
- Migration: `migrations/0002_products.sql`
- Environment variables: none new. Decided but not yet added: `MEDIA_BASE_URL`, an R2 binding.
- Endpoint: `GET /api/cart-lines`
