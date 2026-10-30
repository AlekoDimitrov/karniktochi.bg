# Handoff

Rewritten at the end of every task. Last updated: 2026-10-30, at the slice 2 stop after step 6 (products
list, quick edit, archive demos).

## Branch

- `main`: `b98643f`, pushed on 2026-10-30. Not deployed: the live site still runs `fa78e84`.
- `products-in-d1`: pushed on 2026-10-30, including this commit.

Deploys are manual with wrangler. Pushing to GitHub is only a backup and builds nothing (DECISIONS,
2026-10-30). The live site is the Worker `karniktochi` at karniktochi.kalekcho.workers.dev.

## Last 10 commits (before this one)

- `2faa103` Slice 2 step 6: quick edit of price and stock on the products list; archive all demo products; /admin/stock/ redirects; search also matches the slug
- `374b7ee` Slice 2 step 5: admin products list: search, category and status filters, 50 per page, price range, stock, status
- `68e885f` Slice 2 step 4: admin data layer: list/search, create, edit with size diff and conflict checks, quick edit, delete draft, archive demos; purgeAll
- `e3824b3` Slice 2 step 3: admin input parsing: euro prices to exact cents, product form validation
- `8661bf8` HANDOFF: slice 2 stop after step 2
- `5c2a1b8` Slice 2 step 2: admin orders paginated at 50; npm run seed:orders / unseed:orders for local test orders
- `6b686a6` Slice 2 step 1: admin in English; reject cross-site admin requests (Origin check)
- `341a3ce` Slice 2 plan approved with decisions; DECISIONS: deploy policy, slice 2 choices; CLAUDE.md: products in D1
- `4ae1e76` DECISIONS: no Git-connected builds, karniktochi-bg deleted, deploys manual; HANDOFF updated
- `cae39df` HANDOFF: Workers Builds findings, two Workers, live site is the hand-deployed karniktochi

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

- Slice 2, the admin product manager: plan in docs/slice-2-plan.md (approved 2026-10-30).
  - Steps 1–2, checked by the user in the browser:
    - the admin is in English;
    - the middleware rejects admin POST/PUT/PATCH/DELETE requests whose Origin isn't the site
      (`src/lib/admin-origin.ts`), in dev too;
    - orders show 50 per page, keeping the status filter; a bad `?page=` goes to page 1, and a page past
      the end goes to the last page.
  - Steps 3–6 done, waiting for the user's click-through:
    - `src/lib/admin-input.ts`: euro prices to exact cents, product form and quick-edit validation;
    - `src/lib/admin-products.ts`: list and search, create, edit with the size diff, conflict and stock
      checks, quick edit, restore a size, delete a draft, archive demos;
    - `/admin/products/`: search (name, brand, slug, SKU), filters, 50 per page, quick edit per size,
      "Archive all demo products" with a confirmation;
    - `/admin/stock/` now redirects (301) to `/admin/products/`.
  - The "Edit" links on the list lead to pages that come in step 7; until then they are 404s.
  - Next: steps 7–8 (the create/edit form, then preview and "View on site"), then the next stop.

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
- Admin orders in English with 124 local orders (120 from seed:orders):
  - page 2 shows 51–100 with the pager;
  - saving a test order's status on page 2 returns to page 2 at that order, with "Saved.";
  - `?page=abc`, `?page=99` and a filtered page past the end redirect.
  - A cross-site POST and a POST without Origin get 403 (checked with curl).
- Un-cancelling a real order (KT-00004, local), through the admin form:
  - stock 5/1 while Confirmed, 6/2 after cancelling, and 5/1 after moving it back to Confirmed;
  - with one size set to 0 by hand, moving it back to Confirmed was refused ("not enough stock") and
    nothing changed.
  - Covered by `test/stock.test.ts`: "reserves again when a cancelled order is reopened" and "refuses to
    reopen a cancelled order if its stock was sold meanwhile".
  - The local data was restored afterwards.
- Products list (step 6), desktop and 390 px (no sideways scroll):
  - quick edit save ("1 299,90" → 129 990 cents), the dot-thousands error, and the "an order changed the
    stock" refusal (nothing saved);
  - search "takamura" finds "Петти Такамура R2" through the slug;
  - archive demos: link, confirmation, "Archived 1 demo product.", tried on a local product temporarily
    marked as a demo and then restored;
  - `/admin/stock/` returns 301 to `/admin/products/`.

## Not tested in a browser

- Anything on Cloudflare: cache hits, tag purges, workers.dev, the custom domain, real Cloudflare Access.
- Real email sending through Resend.
- Keyboard-only use (except the footer social links) and screen readers.
- Real phones (only the 390 px iframe).
- The `/api/cart-lines` failure on first page load. Only a failure after the page had loaded was tested.

## Test and build results (at this commit)

- products-in-d1 at `2faa103`:
  - `npm test`: 18 files, 256 tests, all passing;
  - `npx astro check`: 0 errors, 0 warnings;
  - `npm run build`: completes, check-hidden passes.
- main at `b98643f`:
  - `npm test`: 4 files, 39 tests, all passing;
  - `npx astro check`: 0 errors, 0 warnings;
  - `npm run build`: completes, check-hidden passes.

## Open questions

- Remote database: decided, not to be migrated. At launch it is reset (all tables dropped, all migrations
  applied fresh); see the 2026-10-29 reset entry in docs/DECISIONS.md. Open: when to do the reset relative to
  the first deploy of this branch.
- The reasons marked "not recorded" in docs/DECISIONS.md.
- Deploys: resolved on 2026-10-30. There are no Git-connected builds; see the DECISIONS entry of that
  date. What was found and done:
  - The live site is the Worker `karniktochi`, at https://karniktochi.kalekcho.workers.dev. It is
    deployed by hand with wrangler (last on 2026-10-29 at 13:56 UTC, from `fa78e84`) and bound to the
    one D1 database, `karniktochi`.
  - `karniktochi-bg` was the "Hello world" starter Worker that Workers Builds was connected to. Its
    production build for `fa78e84` failed, and its branch builds uploaded nothing.
  - Before deleting `karniktochi-bg`, I checked read-only that it had no bindings, routes, custom domain
    or cron triggers. I then deleted it with `wrangler delete --name karniktochi-bg` on 2026-10-30.
    `karniktochi` was untouched and still serves.
  - After the deletion, a push of products-in-d1 (`cae39df`) got no Workers Builds check on GitHub.
  - The `fa78e84` build log was never read; it was probably deleted with the Worker.
  - The Cloudflare GitHub app may still be installed on the repo. It is harmless without a connected
    Worker; remove it in GitHub settings if you want.
  - Deploy policy decided: production only from products-in-d1 after slice 3; staging is allowed
    (DECISIONS, 2026-10-30).
  - Still open: if a preview environment is ever added, give it its own D1 database first. There is only
    one database today.
- The Organization JSON-LD and Astro `site` wait for karniktochi.com.

## Known bugs and limits

- main (live): the admin orders list fails with more than 100 orders. Fixed on this branch only (`0aed0fd`).
  It is not backported, because main has no real users (DECISIONS, 2026-10-30).
- The admin orders and products pages are paginated at 50 but not measured yet (step 9).
- The local database has 120 test orders from `npm run seed:orders`; `npm run unseed:orders` removes them.
  The user asked to keep them until the step 10 stop. Test order KT-00074 was set to Confirmed during the
  browser check.
- Moving an order whose size has no stock row back to an active status succeeds without taking any stock.
  Seen locally on order 2, whose size `demo-2` was deleted by `seed:dev`. In production this can't happen
  once slice 2 is in, because sizes with orders are archived, never deleted. Not fixed: outside the plan.
- Admin search ignores case for Latin letters, and for Cyrillic only when typed all lower case, all upper
  case or with words capitalised (SQLite's LIKE has no Cyrillic case folding). Latin search also matches
  the slug.
- Local product `belachka-misono-80-mm`: its updated_at changed during the archive-demos check (its status
  and demo flag were restored).
- /api/stock returns every public variant (about 12 KB at 1,000 variants).
- Purging can't be checked locally: local dev has no Workers Cache and no purge().
- Chrome may show a page's old copy once after an edit (stale-while-revalidate in the browser cache).
- No product photos yet; product pages and the cart show placeholders.
- R2 and MEDIA_BASE_URL are decided but not configured.
- main: at 390 px the home page scrolls about 4 px sideways, with or without the social links. It is
  probably the workshop postmark, which products-in-d1 clips (`.band-purple { overflow-x: clip; }`). Not
  checked on products-in-d1.

## New on this branch (names only)

- Commands: `npm run seed:dev`, `npm run seed:orders`, `npm run unseed:orders` (local database only)
- Config key: `cache.enabled` in wrangler.jsonc
- Migration: `migrations/0002_products.sql`
- Environment variables: none new. Decided but not yet added: `MEDIA_BASE_URL`, an R2 binding.
- Endpoint: `GET /api/cart-lines`
- Admin pages: `/admin/products/` (list, quick edit, archive demos); `/admin/stock/` is now a 301 redirect.
- .gitignore: `backup*.sql`
- From main: `src/config/site.ts` (social URLs); .gitignore `node_modules` without the trailing slash.
