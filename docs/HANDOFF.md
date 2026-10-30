# Handoff

Rewritten at the end of every task. Last updated: 2026-10-30, after the footer social links, the new home
text, and merging main into products-in-d1.

## Branch

Nothing from 2026-10-30 is pushed yet; the user pushes after approving.

- `main`: local `b98643f`, 3 commits ahead of `origin/main` (`fa78e84`).
- `products-in-d1`: local, ahead of `origin/products-in-d1` (`376f463`) by `02f6d0a` onwards, including this commit.

**Pushing deploys.** Cloudflare Workers Builds is connected to the GitHub repo (Worker `karniktochi-bg`).
GitHub shows a "Workers Builds: karniktochi-bg" check on `fa78e84` (main, production build) and on
`da6caa7` (a preview build for products-in-d1). So a push to main starts a production build and deploy,
and a push to products-in-d1 makes a preview build. The `fa78e84` build **failed** (cause not looked at:
see the build log in the Cloudflare dashboard), so the live site may be older than `fa78e84`.

## Last 10 commits (before this one)

- `60ff51d` Merge main into products-in-d1: footer social links, home text, .gitignore
- `b98643f` Home: new hero text, sharpening text, trust lines, real email and phone (main, cherry-pick of `6f73235`)
- `d3260f9` .gitignore: node_modules without trailing slash, so a symlink is ignored too (main)
- `e0db3b8` Footer: Facebook and Instagram icon links in the contact column (main)
- `6f73235` Home: new hero text, sharpening text, trust lines, real email and phone
- `042dd4a` DECISIONS: Organization JSON-LD and site wait for karniktochi.com
- `02f6d0a` Shipping paid to the courier on delivery; remote D1 reset at launch; gitignore backups
- `376f463` HANDOFF: branch pushed, excerpt files deleted, flag the untracked database backup
- `da6caa7` Add docs/HANDOFF.md and docs/DECISIONS.md; CLAUDE.md: read decisions, update handoff
- `ba22d8d` Fix what the click-through found: cart caps, unavailable lines, load failures, admin stock, 404s, phone overflow

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
- On both branches (2026-10-30):
  - Facebook and Instagram icon links in the footer's КОНТАКТ column. The URLs are in `src/config/site.ts`
    and the aria-labels in `bg.ts`.
  - The user's new home text: hero, sharpening section, trust lines, and the real email and phone in the
    footer. The strings are identical on both branches (checked by loading both bg.ts files).
- The Organization JSON-LD is not added: there is no site URL yet. See the 2026-10-30 entry in
  docs/DECISIONS.md.

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
- Footer social links, on main before the home-text commit:
  - desktop and 390 px: 44×44 targets, cream icons, yellow on hover;
  - keyboard: Tab order Поверителност → Facebook → Instagram, yellow icon and outline on focus.
  - Not rechecked in a browser on products-in-d1 after the merge.

## Not tested in a browser

- Anything on Cloudflare: cache hits, tag purges, workers.dev, the custom domain, real Cloudflare Access.
- Real email sending through Resend.
- Keyboard-only use (except the footer social links) and screen readers.
- Real phones (only the 390 px iframe).
- The `/api/cart-lines` failure on first page load. Only a failure after the page had loaded was tested.

## Test and build results (at this commit)

- products-in-d1, with the merge resolved:
  - `npm test`: 14 files, 133 tests, all passing;
  - `npx astro check`: 0 errors, 0 warnings;
  - `npm run build`: completes, check-hidden passes.
- main at `b98643f`:
  - `npm test`: 4 files, 39 tests, all passing;
  - `npx astro check`: 0 errors, 0 warnings;
  - `npm run build`: completes, check-hidden passes.

## Open questions

- The slice 2 brief itself (constraints already noted: admin pages under ~10 ms CPU at 1,000 variants and
  1,000 orders, orders paginated at 50, inline quick edit replacing /admin/stock/, purgeEverything for
  bulk operations).
- The admin is decided to be in English, but the current admin pages are in Bulgarian. Translate them in slice 2?
- Should the `listOrders` fix go to main now? main is live with the bug.
- Remote database: decided, not to be migrated. At launch it is reset (all tables dropped, all migrations
  applied fresh); see the 2026-10-29 reset entry in docs/DECISIONS.md. Open: when to do the reset relative to
  the first deploy of this branch.
- The reasons marked "not recorded" in docs/DECISIONS.md.
- Pushing main deploys it through Workers Builds. DECISIONS says "No deploy until the admin product manager
  works", but main has been deployed before. Is pushing main still allowed?
- Why did the Workers Builds production build for `fa78e84` fail, and what is live now?
- The Workers Builds Worker is `karniktochi-bg`, but `wrangler.jsonc` names the Worker `karniktochi`. Are these
  the same Worker?
- The Organization JSON-LD and Astro `site` wait for karniktochi.com.

## Known bugs and limits

- main (live): the admin orders list fails with more than 100 orders. Fixed on this branch only (`0aed0fd`).
- The admin stock and orders pages render everything: about 40 ms and 26 ms CPU in the slice 1 measurement.
- /api/stock returns every public variant (about 12 KB at 1,000 variants).
- Purging can't be checked locally: local dev has no Workers Cache and no purge().
- Chrome may show a page's old copy once after an edit (stale-while-revalidate in the browser cache).
- No product photos yet; product pages and the cart show placeholders.
- R2 and MEDIA_BASE_URL are decided but not configured.
- main: at 390 px the home page scrolls about 4 px sideways, with or without the social links. It is
  probably the workshop postmark, which products-in-d1 clips (`.band-purple { overflow-x: clip; }`). Not
  checked on products-in-d1.

## New on this branch (names only)

- Command: `npm run seed:dev`
- Config key: `cache.enabled` in wrangler.jsonc
- Migration: `migrations/0002_products.sql`
- Environment variables: none new. Decided but not yet added: `MEDIA_BASE_URL`, an R2 binding.
- Endpoint: `GET /api/cart-lines`
- .gitignore: `backup*.sql`
- From main: `src/config/site.ts` (social URLs); .gitignore `node_modules` without the trailing slash.
