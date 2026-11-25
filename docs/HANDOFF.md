# Handoff

Rewritten at the end of every task. Last updated: 2026-11-25, staging deployed (steps A–D done) at https://staging.karniktochi.com.
Next: the staging checklist (E), you and me. Open finding: X-Robots-Tag on Worker pages (checklist item 3).

## Branches

- `main`: `b98643f`, same as `origin/main`. Not deployed: the live site still runs `fa78e84`.
- `products-in-d1`: pushed to origin at this stop. **Not deployable to production:** `wrangler.jsonc` names
  the R2 bucket `karniktochi-media`, which doesn't exist on Cloudflare, and no production deploy happens
  before `media.karniktochi.com` exists (DECISIONS, 2026-10-30, recorded 2026-11-24). Staging (`env.staging`)
  is fully configured: staging.karniktochi.com, media-staging.karniktochi.com, its database id and Access.
- Temporary worktrees: none. The `--host` dev server is stopped (you no longer need it).
- **Workers Paid is on** (user, 2026-11-25), with a $2 budget alert and a $10 spending limit.

Deploys are manual with wrangler. Pushing to GitHub is only a backup and builds nothing (DECISIONS,
2026-10-30). The live site is the Worker `karniktochi` at karniktochi.kalekcho.workers.dev. karniktochi.com
is active on Cloudflare (nameservers moved from Namecheap, 2026-11-25); production will later be
karniktochi.com and media.karniktochi.com.

## Slice 3 status: built, all 6 steps done

### Since stop 2

- **Photo frame white** whenever a photo is shown (cards, product page, thumbnails, cart, admin); beige
  `--photo` only for the no-photo placeholder (your decision, DECISIONS 2026-11-24; commit `3d40b3e`). Frames
  with a photo get `.has-photo` (in the markup; in the cart, set by the script when the line has a photo).
  Checked in Chrome by computed background: product page main photo, listing cards (all 23 local cards:
  class matches photo presence), cart (photo line white, no-photo line beige; your cart restored), admin
  thumbnail.
- **Step 5, speed** (docs/slice-3-report.md; commits `d69c354`, `964d62e`): `seed-perf.mjs` adds photo rows
  (3 per product, 12 on perf-450..452, none on perf-011/012); `profile.mjs` measures the product page with
  12/3/no photos and the photo upload. **All customer pages under 10 ms JS+GC** (highest: listing 9.5 / 8.1).
  **Upload: 18–22 ms** (admin; under the Workers Paid decision). The ~200 test uploads were removed again
  (0 rows, 0 objects left in the throwaway bucket).
- **Step 6, docs and staging config:** `env.staging` in `wrangler.jsonc` (Worker `karniktochi-staging`,
  database `karniktochi-staging`, bucket `karniktochi-media-staging`, r2.dev `MEDIA_BASE_URL`, replaced on 2026-11-25); checked
  that `CLOUDFLARE_ENV=staging` builds a config with those bindings, and that the normal build is unchanged
  (`karniktochi`, production bindings). Nothing created on Cloudflare. CLAUDE.md (photos, staging, perf
  scripts), plan status, this file.

## Staging setup

### Done by you (2026-11-25)

- Workers Paid on ($2 budget alert, $10 spending limit).
- D1 database `karniktochi-staging` (id `64a85747-ebc3-4524-bb6c-6189bdc7ad98`), still empty.
- Bucket `karniktochi-media-staging` with custom domain media-staging.karniktochi.com; r2.dev off.
- Access application "Karnik Tochi staging admin" on staging.karniktochi.com/admin (team domain
  karniktochi.cloudflareaccess.com).
- Resend: domain karniktochi.com added in the EU region; DNS verification in progress. No API key yet.
- Mail: the sender is orders@karniktochi.com (was porachki@). Cloudflare Email Routing forwards orders@
  (customer replies; customer emails carry no Reply-To) and team@ (shop notifications) to your mailbox.
  The Resend inbox is deleted; Resend only sends (DECISIONS 2026-11-25).

### Done by me (2026-11-25), nothing remote touched

- `env.staging` in `wrangler.jsonc`: database id, bucket, `MEDIA_BASE_URL` https://media-staging.karniktochi.com,
  `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`, sender `orders@karniktochi.com`, a custom-domain route
  for staging.karniktochi.com, and `workers_dev: false` (Access covers only the custom domain).
- Checked: `CLOUDFLARE_ENV=staging npm run build` writes `karniktochi-staging` with those bindings and the
  route; `npx wrangler deploy --dry-run` lists them (uploads nothing). The normal build is unchanged
  (`karniktochi`, production database, media.karniktochi.com, Access empty).
- Read-only: the Worker `karniktochi-staging` doesn't exist yet. Wrangler refuses a Worker's first deploy
  while a required secret (`RESEND_API_KEY`) is unset, so the key goes in before the deploy (step C).

### After your "go", in this order (production Worker `karniktochi` and its database never touched)

A. **Done 2026-11-25** (0001–0003 applied; tables orders, order_items, products, variants, stock, product_photos;
   6 demo products published, 6 variants, 6 stock rows, 0 orders, 0 photos). **Me, staging database:** `npx wrangler d1 migrations apply karniktochi-staging --env staging --remote`
   (0001–0003), then list its tables and count products. 0002 inserts the 6 demo products (demo-1…6), so
   staging starts with those.
B. **Seeding: none.** The 6 demo products are enough to test; you add real ones in the admin, and "Archive
   all demo products" is on the checklist. `seed-dev.sql` is written for the local database (it deletes all
   products) and isn't used on staging unless you ask.
C. **Done 2026-11-25** (you set the key; `secret list` shows `RESEND_API_KEY`). **You, Resend key, then your own terminal** (not the `!` prefix, so nothing of it reaches the chat):
   1. resend.com → API Keys → Create API Key. Name `karniktochi-staging`, Permission **Sending access**,
      Domain **karniktochi.com**. Copy the key (`re_…`; shown once).
   2. In a terminal in the project folder: `npx wrangler secret put RESEND_API_KEY --name karniktochi-staging`.
      Wrangler says the Worker doesn't exist and asks to create it: answer yes (an empty placeholder
      Worker; no route, no bindings). Paste the key at the hidden prompt.
   3. Tell me "key set". I check with `npx wrangler secret list --name karniktochi-staging` (names only).
   Emails fail until Resend shows the domain as Verified; the rest of staging works without it.
D. **Done 2026-11-25**, version `79b3fb7c-6ff2-4c1c-be5b-63c66b7d1bb6` from `1bc5e77`. Bindings: D1
   `karniktochi-staging`, R2 `karniktochi-media-staging`, sender orders@, Access values. First look: home 200
   with the 4 published-card demo products, `/admin/` → 302 to the Access login on
   karniktochi.cloudflareaccess.com, karniktochi-staging.kalekcho.workers.dev → 404, production
   karniktochi.kalekcho.workers.dev still 200 (untouched). `dist/` rebuilt as production afterwards.
   **Finding:** Worker-rendered pages have no `X-Robots-Tag` header: `public/_headers` only applies to static
   assets (favicon has it; production's `/` has it because main's home is static). Pages are still hidden by
   `<meta name="robots" content="noindex, nofollow">` (Layout.astro, until `LAUNCH=1`), so not indexable.
   Open: add the header in middleware for Worker responses while hidden (needs a redeploy), and the launch
   checklist must also cover `LAUNCH=1`, not only deleting `_headers`. Original step: **Me, staging deploy:** `CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy`. This uploads the
   site to `karniktochi-staging`, attaches staging.karniktochi.com (Cloudflare creates the DNS record; the
   deploy fails if a DNS record for that name already exists) and keeps workers.dev off. Then
   `npm run build` again, so `dist/` is the production build. Then a first look: home over HTTPS,
   `X-Robots-Tag` present, /admin/ gives the Access login.
E. **Staging checklist** below, you and me.

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

### Click-throughs

- Step 4 (shop pages): done by you on desktop (2026-11-24). Not on a phone (staging checklist).
### Plan step 3 click-through, open if not done: in Chrome and Firefox (and Safari if you have one; that also answers whether Safari's canvas makes
WebP — a Safari upload shows "· JPEG" next to the size if it doesn't): several real photos at once, a
HEIC file, a non-image file, the 12-photo cap, move, remove, alt text, and a photo upload followed by a
form save on the same page.

## Last 10 commits on products-in-d1 (before this one)

- `964d62e` Slice 3 step 5: speed report (customer pages with photos all under 10 ms JS+GC; upload ~18-22 ms, admin); profile.mjs upload sends a 320x400 small rendition
- `d69c354` Slice 3 step 5 (scripts): perf seed photo rows (3 per product, 12 on perf-450..452, none on perf-011/012); profile.mjs measures the photo upload and product pages with 12/3/no photos
- `3d40b3e` Photo frame is white whenever a photo is shown (cards, product page, thumbnails, cart, admin); beige only for the no-photo placeholder
- `dad5f45` HANDOFF: slice 3 stop 2 (shop pages ready for click-through); thumbnail investigation, iPhone address, leave-page warning
- `1063efe` Slice 3 step 4: photos on the shop pages: cards (main photo, 400/900, first listing row eager), product page gallery (all photos, eager main, thumbnails swap it or link to the large rendition), cart line photo via /api/cart-lines, placeholder with the product type, og:image (absolute base only), whole photo in the 4:5 frame (contain)
- `f73a0fd` Admin product form: 'leave page?' warning while the form has unsaved changes (also before photo actions and links); never on the save itself or after a successful save; a refused save starts dirty
- `2b5b26a` HANDOFF: slice 3 stop 1 (admin Photos section ready for click-through)
- `39fbbbb` Slice 3 step 3: photo messages shown in the Photos section; 'Not an image file' for non-images; spacing in the drop text
- `0eb9781` Slice 3 step 3: admin Photos section (PhotoManager.astro, admin-photos.ts: browser resize to 400/900/1800, WebP 0.82 or JPEG 0.85 fallback, per-photo state and XHR progress, 12-photo cap, drop and pick), move/remove-with-confirmation/alt forms without JS, published-without-photos warning; placeholder moved out of ProductForm
- `f729504` Slice 3 step 2: upload endpoint POST /admin/products/{slug}/photos/ (checks by magic bytes, sizes, proportions, caps, EXIF), photo move/remove/alt actions on the edit page with purging, dev-only /dev-media route (local R2 simulation), photos path in check:admin-paths

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

- Staging: deployed; staging checklist next.

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

## Test and build results (2026-11-25, products-in-d1, after the staging values)

- `npx astro check`: 0 errors, 0 warnings, 1 hint (unused variable in scripts/profile.mjs, old);
- `npm test`: 26 files, 314 tests, all passing;
- `npm run build`: completes, check-hidden passes; `CLOUDFLARE_ENV=staging npm run build` and `wrangler deploy --dry-run` show the staging bindings and route.
- `check:admin-paths`: all 14 spellings 403 (private, no-store) or 404, including the photo endpoint.

## Open decisions for you

1. **Staging:** your "go" for "Staging setup" A–D above.
2. **Remote database reset:** when to reset it relative to the first deploy of products-in-d1
   (DECISIONS, 2026-10-29).
3. The reasons marked "not recorded" in docs/DECISIONS.md.

## To do

- After the final merge, normalize the quote style in src/i18n/bg.ts on both branches in one
  formatting-only commit. (main uses single quotes, products-in-d1 double quotes; the string values of
  the 2026-10-30 home-text commit are identical on both.)

## Open questions

- **Open before staging:**
  1. **Staging database and bucket: created by you, configured; migrations 0001–0003 applied** (2026-11-25). The production database `karniktochi` is not reset for staging, because the live Worker still
     runs main, which expects the old schema.
  2. **Workers Paid:** on (2026-11-25).
  3. **Production photos:** no production deploy before `media.karniktochi.com` exists (bucket
     `karniktochi-media` with that custom domain).
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
  2. Apply migrations 0001–0003 to the staging database ("Staging setup" above; database, bucket and
     `env.staging` are done). Never apply them to `karniktochi`, the production database. Then deploy products-in-d1
     by hand with wrangler to that environment, never from main.
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
  9. Photos: upload a photo in the staging admin; it appears in the admin and on the shop page from the
     media-staging.karniktochi.com; removing it deletes its three files from the bucket.
  10. Upload a photo taken on an iPhone from Safari in the admin; confirm it shows "· JPEG" (or WebP if Safari
      can encode it), that EXIF/GPS is stripped, and that it appears on the shop page. Check the shop pages
      on a real phone. (User, 2026-11-24.)
  11. Photo upload CPU on Cloudflare (local: 18–22 ms, docs/slice-3-report.md) and the customer pages with
      photos, from Workers Logs.

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
- R2 and MEDIA_BASE_URL are configured in `wrangler.jsonc`, but neither bucket exists on Cloudflare, so a
  deploy fails (intended until staging/production are set up).
- iOS Safari ignores the admin's "leave page?" warning (`beforeunload`).
- Orphaned R2 objects: if an R2 delete fails after the D1 row is gone, the files stay (logged). No
  cleanup tool.
- main: at 390 px the home page scrolls about 4 px sideways, with or without the social links. It is
  probably the workshop postmark, which products-in-d1 clips (`.band-purple { overflow-x: clip; }`). Not
  checked on products-in-d1.

## New on this branch (names only)

- Commands: `npm run seed:dev`, `npm run seed:orders`, `npm run unseed:orders` (local database only),
  `npm run check:admin-paths` (after a build)
- Scripts: `scripts/seed-perf.mjs` (SQL for a throwaway local performance database, with photo rows),
  `scripts/profile.mjs` (CPU profiles of the admin or storefront requests under wrangler dev, including the
  photo upload)
- Config: `env.staging` in wrangler.jsonc (Worker `karniktochi-staging`); `CLOUDFLARE_ENV=staging` selects it
  at build time
- Config key: `cache.enabled` in wrangler.jsonc
- Migrations: `migrations/0002_products.sql`; `migrations/0003_product_photos.sql` (applied locally only)
- Environment variables: `MEDIA_BASE_URL`. Binding: R2 `MEDIA` → `karniktochi-media` (bucket not created).
- Endpoint: `POST /admin/products/{slug}/photos/`; dev only: `GET /dev-media/{key}`.
- Endpoint: `GET /api/cart-lines`
- Admin pages: `/admin/products/` (list, quick edit, archive demos), `/admin/products/new/`,
  `/admin/products/{slug}/` (edit), `/admin/products/{slug}/preview/`; `/admin/stock/` is now a 301 redirect.
- .gitignore: `backup*.sql`
- From main: `src/config/site.ts` (social URLs); .gitignore `node_modules` without the trailing slash.
