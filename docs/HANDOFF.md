# Handoff

Rewritten at the end of every task. Last updated: 2026-10-30, at the slice 2 stop after step 2 (English
admin, Origin check, orders paginated at 50).

## Branch

- `main`: `b98643f`, pushed on 2026-10-30. Not deployed: the live site still runs `fa78e84`.
- `products-in-d1`: pushed on 2026-10-30, including this commit.

Deploys are manual with wrangler. Pushing to GitHub is only a backup and builds nothing (DECISIONS,
2026-10-30). The live site is the Worker `karniktochi` at karniktochi.kalekcho.workers.dev.

## Last 10 commits (before this one)

- `5c2a1b8` Slice 2 step 2: admin orders paginated at 50; npm run seed:orders / unseed:orders for local test orders
- `6b686a6` Slice 2 step 1: admin in English; reject cross-site admin requests (Origin check)
- `341a3ce` Slice 2 plan approved with decisions; DECISIONS: deploy policy, slice 2 choices; CLAUDE.md: products in D1
- `4ae1e76` DECISIONS: no Git-connected builds, karniktochi-bg deleted, deploys manual; HANDOFF updated
- `cae39df` HANDOFF: Workers Builds findings, two Workers, live site is the hand-deployed karniktochi
- `012de11` HANDOFF: social links, new home text, merge; Workers Builds deploys on push
- `60ff51d` Merge main into products-in-d1: footer social links, home text, .gitignore
- `b98643f` Home: new hero text, sharpening text, trust lines, real email and phone (main, cherry-pick of `6f73235`)
- `d3260f9` .gitignore: node_modules without trailing slash, so a symlink is ignored too (main)
- `e0db3b8` Footer: Facebook and Instagram icon links in the contact column (main)

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
  - Steps 1–2 done:
    - the admin is in English;
    - the middleware rejects admin POST/PUT/PATCH/DELETE requests whose Origin isn't the site
      (`src/lib/admin-origin.ts`), in dev too;
    - orders show 50 per page, keeping the status filter; a bad `?page=` goes to page 1, and a page past
      the end goes to the last page.
  - Waiting for the user's click-through of the orders pages before step 3.
  - Next: steps 3–6 (input parsing, the data layer, the products list, quick edit), then the next stop.

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

## Not tested in a browser

- Anything on Cloudflare: cache hits, tag purges, workers.dev, the custom domain, real Cloudflare Access.
- Real email sending through Resend.
- Keyboard-only use (except the footer social links) and screen readers.
- Real phones (only the 390 px iframe).
- The `/api/cart-lines` failure on first page load. Only a failure after the page had loaded was tested.

## Test and build results (at this commit)

- products-in-d1 at `5c2a1b8`:
  - `npm test`: 16 files, 153 tests, all passing;
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
- The admin stock page renders every variant: about 40 ms CPU in the slice 1 measurement. It will be
  replaced in step 6. The orders page is now paginated but not measured yet (step 9).
- The local database has 120 test orders from `npm run seed:orders`; `npm run unseed:orders` removes them.
  Test order KT-00074 was set to Confirmed during the browser check.
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
- .gitignore: `backup*.sql`
- From main: `src/config/site.ts` (social URLs); .gitignore `node_modules` without the trailing slash.
