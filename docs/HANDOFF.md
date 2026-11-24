# Handoff

Rewritten at the end of every task. Last updated: 2026-11-24, slice 3 stop 2 (after the shop pages, plan
step 4). Next: your click-through of the shop pages, then step 5 (speed) and step 6 (docs, staging config).

## Branches

- `main`: `b98643f`, same as `origin/main`. Not deployed: the live site still runs `fa78e84`.
- `products-in-d1`: pushed to origin at this stop. **Not deployable:** `wrangler.jsonc` names the R2
  bucket `karniktochi-media`, which doesn't exist on Cloudflare, and no production deploy happens before
  `media.karniktochi.com` exists (DECISIONS, 2026-10-30, recorded 2026-11-24).
- Temporary worktrees: none.
- **Workers Paid is turned on right before staging, after slice 3 is built** (user, 2026-11-24).

Deploys are manual with wrangler. Pushing to GitHub is only a backup and builds nothing (DECISIONS,
2026-10-30). The live site is the Worker `karniktochi` at karniktochi.kalekcho.workers.dev.

## Slice 3 status: approved, steps 1–4 done, stopped for the shop click-through

### Since stop 1

- **Broken admin thumbnail (your click-through):** not a code bug. Your `astro dev` (pid 11211) had been
  running since before `/dev-media` was added to `astro.config.mjs`, so photo URLs got its 404 page. Evidence:
  row `products/proba-santoku/ba8d36ce1e24a0ce` (webp, 400/900/1200, 1200×1200); all 3 objects in the local
  R2 simulation; thumbnail URL `/dev-media/products/proba-santoku/ba8d36ce1e24a0ce-400.webp`: `404 text/html`
  on the old server, `200 image/webp` after the restart, and the thumbnail loads (400×400) in Chrome.
- **Dev server** now runs with `astro dev --background --host`. From an iPhone on the same Wi-Fi:
  `http://10.43.96.72:4321/` (the Wi-Fi address; DHCP may change it — `astro dev status` shows the current
  one). The admin Origin check accepts it: a same-origin POST via that address passes (the page's own 409
  for a dummy action), a cross-site one gets 403.
- **"Leave page?" warning** (`src/scripts/admin-unsaved.ts`, commit `f73a0fd`) on the product form while it
  has unsaved changes, also before photo actions and links; never on the save itself or after a successful
  save; a refused save starts dirty. Checked in Chrome with synthetic `beforeunload` events (a real dialog
  would block the browser tools) and real Save clicks. **iOS Safari ignores `beforeunload`**, so there is no
  warning on the iPhone.
- **Step 4, shop pages** (commit `1063efe`): `Product.photos` (main photo on cards, all on the product page),
  `ProductPhoto.astro` (img with srcset/sizes/width/height, or a placeholder with the product type), cards
  (400/900, first listing row eager), product page gallery (main photo eager + high priority; thumbnails swap
  it, links to the large rendition without JS), cart photo through `/api/cart-lines` (smallest rendition),
  `og:image` (1800, only with an absolute base URL, so not in local dev), whole photo in the 4:5 frame
  (`contain`) on cards, product page and cart. Tests: `catalog-photos.test.ts`, og:image in `photos.test.ts`.
- **Checked by me in Chrome on :4321** (two temporary photos added to "Proba santoku" and removed after):
  gallery with 3 photos, thumbnail swap (src, alt "…, снимка 3", aria-current); listing cards (photo on the
  one with a photo, type placeholder on the rest); cart line photo (`contain`; your cart was restored);
  390 px: product page, listing, home, category, cart and admin preview, no sideways scroll.
- **Look to judge:** photos with a white background show beige bands in the frame (the frame is `--photo`).
  If you prefer, the frame can be white when a photo is shown.

### Steps 1–3 (stop 1)

Plan: `docs/slice-3-plan.md` (approved; decisions recorded there and in DECISIONS on 2026-11-24).

- **Commits this session:** `55c8a9f` type error fix (photoHash), `63f379b` home text (own commit),
  `c02de40` decisions recorded, `a22f463` step 1, `f729504` step 2, `0eb9781` + `39fbbbb` step 3.
- **Step 1, data layer:** the early work in `86b371d` was kept and adapted to the JPEG fallback: a
  `format` column (`webp`|`jpeg`) in 0003, `.jpg` keys and `image/jpeg` for JPEG photos, `src/lib/jpeg.ts`
  and `src/lib/image-info.ts` (format by magic bytes; EXIF noticed). Tests: `photos.test.ts`,
  `image-info.test.ts`, `migration-0003.test.ts`.
- **Step 2, server:** `POST /admin/products/{slug}/photos/` (`src/lib/photo-upload.ts`): 1–3 files,
  WebP or JPEG by bytes, one format per photo, long sides as expected, same proportions, per-file caps and
  3 MB in total, files carrying EXIF refused; then the cap and duplicate checks in `addPhoto`; purge.
  Photo move/remove/alt actions on the edit page, with purging. `/dev-media` route injected only by
  `astro dev` (`src/dev/media-route.ts`, `src/lib/media-base.ts`); not in the build. `check:admin-paths`
  covers the endpoint (GET and POST: 403).
- **Step 3, admin UI:** `PhotoManager.astro` below the product form, `src/scripts/admin-photos.ts`
  (decode, halving resize to 400/900/1800, WebP 0.82 or JPEG 0.85 when the canvas can't make WebP,
  one at a time, XHR progress). Move/remove (with confirmation)/alt work without JavaScript. New uploads
  appear at the end of the list; moving them etc. needs a reload (the page isn't reloaded for you, so
  unsaved typing in the product form is kept). "Published without photos" warning.
- **Not in the plan, added:** the server refuses files with EXIF (JPEG APP1 Exif segment, WebP EXIF
  flag), so location data can't be stored even by a client that skips the canvas. Photo messages are
  shown in the Photos section rather than at the top.
- **Local database:** 0003 was re-applied to the local D1 (dropped and re-run; it had no photo rows) to
  get the `format` column. No remote database or bucket was touched.

### Checked by me in Chrome (astro dev from a scratch worktree on :4322, its own local data)

- 4 files at once: 3000×1500 PNG → Done (WebP 400/900/1800); 300×200 → "Photo too small"; a .txt →
  "Not an image file."; 1000×1250 → Done, sizes 400/900/1250 (no upscaling).
- Safari simulated (`toBlob` patched to return PNG for WebP): the photo is stored as JPEG, shown
  "· JPEG", transparent areas on white.
- Cap: 10 more files picked at 2/12: 8 Done, then "Not added: this product already has 12 photos.";
  input disabled, "12 of 12".
- Move down, Remove (confirmation, then "Photo removed.", 11 of 12), Save alt text.
- Changed a price, uploaded a photo, then clicked Save: "Saved.", no conflict message, price stored.
- HEIC-named file → the HEIC message; published product without photos → the warning.
- 390 px (iframe): no sideways scroll.
- curl: JPEG and WebP uploads 201, mixed formats 422, no Origin 403; `/dev-media` serves the local
  objects with their content type.

### Your click-through (plan step 4 stop), desktop and iPhone at http://10.43.96.72:4321/

Products with several photos, one photo and none: home, /produkti/, a category, the product page (gallery,
thumbnails, the size picker still working), other models and related cards, the cart, the admin preview.

### Earlier click-through (plan step 3), still open if not done: in Chrome and Firefox (and Safari if you have one; that also answers whether Safari's canvas makes
WebP — a Safari upload shows "· JPEG" next to the size if it doesn't): several real photos at once, a
HEIC file, a non-image file, the 12-photo cap, move, remove, alt text, and a photo upload followed by a
form save on the same page.

## Last 10 commits on products-in-d1 (before this one)

- `86b371d` WIP slice 3: photo upload, unfinished, do not deploy
- `9ffff2a` Slice 3 plan (draft, waiting for approval): product photos in R2
- `a44e1e4` setStock moved to the shared test helper; check-admin-paths migrates its throwaway database and was shown to fail with a broken admin check
- `034893d` Admin path spellings checked against the built Worker (all 403 or 404); check:admin-paths regression script; staging gets its own D1 database (decision)
- `0be8015` Slice 2 step 10: checkout submit flat with order count (0/1k/5k) and accepted under Workers Paid; docs, open list before slice 3 and staging checklist; local test orders removed
- `ab83564` Slice 2: admin CPU over 10 ms accepted (Workers Paid required, also for staging); storefront measured: checkout submit at ~15 ms; profile.mjs measures admin or storefront
- `4f8e9cd` HANDOFF: slice 2 stop after step 9, decision needed on the admin speed target
- `e93b471` Slice 2 step 9: admin speed measured (docs/slice-2-report.md); Sofia dates without Intl time zones; one read per product save; seed-perf and profile-admin scripts
- `3068fa9` HANDOFF: slice 2 stop after step 8
- `b0e635e` Slice 2 step 8: admin preview of any product (draft banner, cart off) and View on site links; product page body shared as ProductView

## Slice 2 status: finished

All 10 steps of docs/slice-2-plan.md are done and committed (details under "Finished" below).

- **Clicked through in a browser by you:** steps 1–2 (admin in English, Origin check, orders at 50 per
  page), steps 3–6 (products list, search, filters, quick edit, archive demos, /admin/stock/ redirect)
  and steps 7–8 (create and edit form, sizes editor, errors, two-tab conflict, archived sizes, delete a
  draft, preview, View on site). Steps 9–10 changed no screens (speed measurements and docs).
- **Not clicked through:**
  - anything on Cloudflare: real Cloudflare Access, cache hits and tag purges (including after a save,
    a quick edit, publishing and "Archive all demo products"), workers.dev;
  - keyboard-only and screen-reader use of the new admin pages;
  - a real phone (only the 390 px iframe);
  - the footer social links on products-in-d1 after the merge (they were checked on main).

## Workers Paid is required

Workers Paid must be active before the admin runs on Cloudflare, staging included (DECISIONS,
2026-10-30). Free-plan Workers stop at 10 ms CPU per request; Paid allows 30 s by default. Local
measurements, production build under wrangler dev, JS+GC time, with 500 products, 1,000 sizes and 1,000
orders (docs/slice-2-report.md):

| Request | CPU | Over 10 ms? |
|---|---|---|
| Admin products list | 11–15 ms | yes |
| Admin product save | 12.6–15.9 ms | yes |
| Admin quick edit | 9–11 ms | sometimes |
| Admin edit and preview pages | 7–8 ms | no |
| Admin orders pages | 7–9 ms | no |
| Checkout submit, POST /api/orders | 14.4–15.2 ms first run, 9.0–10.6 ms rerun | yes, on the first run |
| Every other storefront page | under 10 ms | no |

- Checkout CPU stays the same with 0, 1,000 and 5,000 stored orders.
- Why the first checkout run was ~15 ms and the rerun ~10 ms isn't known. The real figure comes from
  staging (staging checklist, item 7).
- Slice 1 found that uncached storefront pages are at or near 10 ms on the Free plan too (DECISIONS,
  2026-10-29: the site launches on Workers Paid).

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

- Slice 2, the admin product manager: plan in docs/slice-2-plan.md (approved 2026-10-30, all 10 steps done).
  - Steps 1–2, checked by the user in the browser:
    - the admin is in English;
    - the middleware rejects admin POST/PUT/PATCH/DELETE requests whose Origin isn't the site
      (`src/lib/admin-origin.ts`), in dev too;
    - orders show 50 per page, keeping the status filter; a bad `?page=` goes to page 1, and a page past
      the end goes to the last page.
  - Steps 3–6, checked by the user in the browser:
    - `src/lib/admin-input.ts`: euro prices to exact cents, product form and quick-edit validation;
    - `src/lib/admin-products.ts`: list and search, create, edit with the size diff, conflict and stock
      checks, quick edit, restore a size, delete a draft, archive demos;
    - `/admin/products/`: search (name, brand, slug, SKU), filters, 50 per page, quick edit per size,
      "Archive all demo products" with a confirmation;
    - `/admin/stock/` now redirects (301) to `/admin/products/`.
  - Steps 7–8, checked by the user in the browser:
    - `/admin/products/new/` and `/admin/products/{slug}/`: one form (`src/components/admin/ProductForm.astro`)
      with every product field, the sizes editor (`src/scripts/admin-variants.ts`: Add size, Move up/down;
      without JavaScript, spare rows and order numbers), errors per field with the typing kept, the
      two-tab conflict message, and the "an order changed the stock" message per size;
    - archived sizes are listed with Restore; a never-ordered draft can be deleted after a confirmation;
    - an empty "Photos — coming in slice 3" section;
    - `/admin/products/{slug}/preview/`: the storefront page for any status, with a yellow banner and
      add-to-cart off; `getProductPage(…, { anyStatus: true })`;
    - "Preview" and "View on site" links on the edit page; "View on site" only when customers can see it;
    - the product page body moved to `src/components/ProductView.astro`. The storefront HTML was compared
      before and after on 4 product pages: identical.
    - The slug "new" is reserved (it would collide with /admin/products/new/).
  - Step 9 done (docs/slice-2-report.md):
    - orders pages are now 7–9 ms JS+GC: the dates no longer use Intl time zones;
    - edit and preview are 7–8 ms; quick edit 9–11 ms;
    - **over the ~10 ms target:** the products list at 11–15 ms, and the product save at 12.6–15.9 ms.
  - The admin overage was accepted by the user (DECISIONS, 2026-10-30): Workers Paid must be active
    before the admin runs on Cloudflare, including staging.
  - Storefront measured with the same data (docs/slice-2-report.md): every page is under 10 ms. The
    checkout submit, POST /api/orders, measured 14.4–15.2 ms at first and 9.0–10.6 ms on the rerun. It is
    flat with the number of stored orders (0, 1,000 and 5,000 orders measured). Accepted under Workers
    Paid (DECISIONS, 2026-10-30); real checkout CPU is to be measured on Cloudflare.
  - Step 10: docs (CLAUDE.md admin lines, DECISIONS, report, plan status, this file). `npm run
    unseed:orders` removed the 120 test orders; the local database has its 4 own orders and no perf data
    (that only ever lived in throwaway databases).

## In progress

- Slice 3: steps 5–6 (speed, docs and staging config) after your click-through.

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
- Create and edit (steps 7–8), on two test products that were deleted afterwards:
  - new product with 3 sizes through Add size, Move up/down, saved as Draft: slug from the name, prices
    99,90 / 1 129,50 / 149 stored as entered;
  - the draft: 404 on /produkti/{slug}/, absent from /produkti/, the category and home; the preview shows
    the yellow "draft, not visible to customers" banner, the size picker changes the price, and
    add-to-cart stays off;
  - published: on /produkti/ and the category, product page at the right prices and stock (210 мм at 0
    disabled), /api/stock has the counts, and add-to-cart works (the cart was restored afterwards);
  - errors: empty name, `1.299`, a duplicate size value: summary at the top gets focus, errors per field,
    typing kept;
  - two-tab conflict: refused with the message and a Reload link; the other tab's save kept;
  - remove a size with no orders: deleted. Remove a size with orders (local "Петти Такамура R2" 170 мм):
    archived, gone from the shop, then restored;
  - delete a draft: confirmation, then "Deleted the draft …"; no product, size or stock rows left;
  - 390 px: new, edit and preview pages with no sideways scroll.

- Checks before step 9 (2026-10-30):
  - check-hidden still catches problems: with `hidden` removed from the added-to-cart message the build
    failed ("not hidden: <p class=\"pdp__added\" data-added role=\"status\">"); with the data-max element
    gone it failed ("no element with data-max"); restored, it passes.
  - A product URL that 404s (a draft or a missing product) sends `Cache-Control: no-store` and no Cache-Tag
    (cacheControlFor: anything but 200 is no-store; test "never caches … errors" in test/cache.test.ts). So
    no 404 can be stored, and publishing purges home, listing and the category through productPurgeTags.

- Admin path spellings (2026-10-30), production build under wrangler dev with dummy non-empty
  `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` (Access check on), paths sent unnormalised. All pass, no redirects, no
  code change needed. Now a regression check: `npm run build && npm run check:admin-paths`
  (`scripts/check-admin-paths.mjs`; not part of `npm test`, because it needs the build and a wrangler
  server).

  | Path | Status | Cache-Control |
  |---|---|---|
  | `/admin/`, `/admin` | 403 | private, no-store |
  | `/ADMIN/`, `/Admin/products/` | 404 | no-store |
  | `/%61dmin/`, `/%61dmin/products/` | 403 | private, no-store |
  | `/admin%2Fproducts/` | 404 | no-store |
  | `//admin/`, `/./admin/`, `/admin/products/../`, `/x/../admin/` | 403 | private, no-store |

  The runtime decodes `%61` and resolves `.`/`..` before the middleware sees the path, so those reach the
  Access check. Upper-case paths and an encoded slash match no route.

  The check was shown to fail: with the middleware's prefix changed to `/admim/` (built, never committed),
  7 of the 11 paths returned the admin page (200, `no-store`) and the script exited 1. After restoring the
  file, it passed again. The script applies the migrations to its throwaway database first, so a leak shows
  as a 200 and not as a database error.

- `setStock()` moved from `src/lib/orders.ts` to `test/d1.ts`, the shared test helper. No app code called
  it; the three tests that use it to set up stock are unchanged.

## Not tested in a browser

- Anything on Cloudflare: cache hits, tag purges, workers.dev, the custom domain, real Cloudflare Access.
- Real email sending through Resend.
- Keyboard-only use (except the footer social links) and screen readers.
- Real phones (only the 390 px iframe).
- The `/api/cart-lines` failure on first page load. Only a failure after the page had loaded was tested.

## Test and build results (2026-11-24, products-in-d1 at this stop)

- `npx astro check`: 0 errors, 0 warnings, 1 hint (unused variable in scripts/profile.mjs, old);
- `npm test`: 26 files, 314 tests, all passing;
- `npm run build`: completes, check-hidden passes.
- `check:admin-paths` was last run at stop 1 (no admin routes added since).

## Open decisions for you

1. **Staging:** create the `karniktochi-staging` D1 database and the `karniktochi-media-staging` bucket,
   and turn on Workers Paid right before it, after slice 3 is built.
2. **Remote database reset:** when to reset it relative to the first deploy of products-in-d1
   (DECISIONS, 2026-10-29).
3. The reasons marked "not recorded" in docs/DECISIONS.md.

## To do

- After the final merge, normalize the quote style in src/i18n/bg.ts on both branches in one
  formatting-only commit. (main uses single quotes, products-in-d1 double quotes; the string values of
  the 2026-10-30 home-text commit are identical on both.)

## Open questions

- **Open before slice 3:**
  1. **Staging database: decided, not created.** Staging gets its own D1 database, `karniktochi-staging`
     (DECISIONS, 2026-10-30). The production database `karniktochi` is not reset for staging, because the
     live Worker still runs main, which expects the old schema. Still to do: create it, add a staging
     environment to `wrangler.jsonc` bound to it, and apply all migrations to it. I haven't touched any
     remote database.
  2. **Workers Paid** must be active before any staging deploy (DECISIONS, 2026-10-30).
  3. **Slice 3 setup:** the R2 binding `MEDIA` and `MEDIA_BASE_URL` are in `wrangler.jsonc` (WIP
     `86b371d`). The bucket isn't created on Cloudflare. The plan is written and waiting for approval.
  4. **Checkout CPU:** why the first local measurement was ~15 ms and the rerun ~10 ms is not proven.
     Staging gives the real figure (checklist item 7).
  5. Small items, none blocking:
     - an order whose size has no stock row can be reopened without taking stock (Known bugs);
     - Cyrillic search case folding (Known bugs);
     - footer social links not rechecked in a browser on this branch; the 4 px sideways scroll at 390 px
       on main;
     - keyboard-only and screen-reader checks of the new admin pages;
     - the reasons marked "not recorded" in docs/DECISIONS.md.

- **Staging checklist** (things only Cloudflare can show), in order:
  1. Workers Paid must be active before the admin runs on Cloudflare, including staging (DECISIONS,
     2026-10-30).
  2. Create the D1 database `karniktochi-staging`, bind it in a staging environment in `wrangler.jsonc`,
     and apply migrations 0001–0002 to it (open item 1). Never apply them to `karniktochi`, the
     production database. Then deploy products-in-d1 by hand with wrangler to that environment, never
     from main.
  3. `X-Robots-Tag: noindex, nofollow` present on the staging address.
  4. Cloudflare Access on /admin: without a login you get the Access page; with one, the middleware
     accepts the JWT; a cross-site admin POST still gets 403.
  5. Workers Cache: a second request to home, listing, category and a product page is a cache hit; after
     a product save, a quick edit, publishing a draft and "Archive all demo products", the affected pages
     show the change on the next request (tag purges and purgeEverything).
  6. Real email through Resend: a test order sends the customer and shop emails.
  7. Measure real checkout CPU on Cloudflare (POST /api/orders), plus the admin products list and product
     save, from Workers Logs or the dashboard, and compare with docs/slice-2-report.md.
  8. A real phone: product page, cart, checkout and the admin products list.

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
- The 120 local test orders were removed with `npm run unseed:orders` at the step 10 stop; `npm run
  seed:orders` brings them back if needed.
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
- R2 and MEDIA_BASE_URL are configured in `wrangler.jsonc`, but the bucket doesn't exist on Cloudflare,
  so a deploy fails (intended until staging/production are set up).
- Orphaned R2 objects: if an R2 delete fails after the D1 row is gone, the files stay (logged). No
  cleanup tool.
- main: at 390 px the home page scrolls about 4 px sideways, with or without the social links. It is
  probably the workshop postmark, which products-in-d1 clips (`.band-purple { overflow-x: clip; }`). Not
  checked on products-in-d1.

## New on this branch (names only)

- Commands: `npm run seed:dev`, `npm run seed:orders`, `npm run unseed:orders` (local database only),
  `npm run check:admin-paths` (after a build)
- Scripts: `scripts/seed-perf.mjs` (SQL for a throwaway local performance database), `scripts/profile.mjs`
  (CPU profiles of the admin or storefront requests under wrangler dev)
- Config key: `cache.enabled` in wrangler.jsonc
- Migrations: `migrations/0002_products.sql`; `migrations/0003_product_photos.sql` (applied locally only)
- Environment variables: `MEDIA_BASE_URL`. Binding: R2 `MEDIA` → `karniktochi-media` (bucket not created).
- Endpoint: `POST /admin/products/{slug}/photos/`; dev only: `GET /dev-media/{key}`.
- Endpoint: `GET /api/cart-lines`
- Admin pages: `/admin/products/` (list, quick edit, archive demos), `/admin/products/new/`,
  `/admin/products/{slug}/` (edit), `/admin/products/{slug}/preview/`; `/admin/stock/` is now a 301 redirect.
- .gitignore: `backup*.sql`
- From main: `src/config/site.ts` (social URLs); .gitignore `node_modules` without the trailing slash.
