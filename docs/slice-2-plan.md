# Slice 2 plan: admin product manager

Status: **approved 2026-10-30** with the decisions at the end of this file. Written 2026-10-30 on
`products-in-d1`.

## What slice 2 delivers

The shop owner can create, edit, publish and archive products and their sizes from `/admin`, in English,
without touching files or deploying. Stock and price can be changed straight from the product list. The
orders page is paginated, and every admin page stays fast at 1,000 variants and 1,000 orders.

## Screens

All admin pages are in English. The storefront stays in Bulgarian.

| URL | Screen |
|---|---|
| `/admin/` | **Orders**: the current orders page translated, 50 per page, with the status filter. |
| `/admin/products/` | **Products**: search, filters, 50 per page, and quick edit of stock and price. |
| `/admin/products/new/` | **New product**: the same form as edit, empty, with one size row. |
| `/admin/products/{slug}/` | **Edit product**: every field, the sizes editor, status, "View on site", and the photo placeholder. |
| `/admin/products/{slug}/preview/` | **Preview**: the storefront product page for any status, including drafts. |
| `/admin/stock/` | Removed. It redirects (301) to `/admin/products/`. |

### Orders (`/admin/`)

- Same content as today, with English labels:
  - statuses: New (to confirm), Confirmed, Shipped, Delivered, Cancelled, Refused (COD);
  - messages and form labels.
- 50 orders per page, newest first, with `?page=` and Previous/Next links. The status filter is kept
  across pages.
- The page loads only its 50 orders and their items, plus one count query.
- Dates stay in Sofia time.
- Customer data (names, addresses, notes) is shown as typed and is not translated.

### Products (`/admin/products/`)

- **Search** with one box (`?q=`). It matches the product name, the brand, or the SKU of any of its
  sizes, ignoring case.
- **Filters:**
  - category: all or one of the four (`?category=`);
  - status: all, draft, published or archived (`?status=`).
- **Paging:** 50 products per page, newest first. Filters and search are kept across pages.
- **One row per product:**
  - name and brand, with a DEMO badge for demo products;
  - category and status;
  - price range ("€129.90" or "€129.90–€189.00");
  - total stock;
  - "Edit" and, for published products, "View on site".
- **Quick edit** (replaces `/admin/stock/`):
  - Under each product, a compact line per active size shows the size label, a stock field and a price
    field, with one "Save" per size.
  - It's a plain form post that redirects back to the same page, filters and position. It works without
    JavaScript.
  - Archived sizes aren't shown in quick edit.
- **New product** button.

### New / edit product (`/admin/products/{slug}/`)

One form, one "Save" button, saved in one database batch.

**Product fields.** Every column in migration 0002:

| Field | Input | Rules |
|---|---|---|
| Name (BG) | text | required, 1–120 chars |
| Brand | text | 0–80 |
| Category | select | one of the four |
| Type | text | 0–80 (e.g. Гюто) |
| Steel | text | 0–80 |
| Blade length (mm) | number | empty or whole number 1–1000 |
| Handle | text | 0–120 |
| Weight (g) | number | empty or whole number 1–20000 |
| Summary (BG) | textarea | 0–300 |
| Description (BG) | textarea | 0–10000, line breaks kept |
| Series | text | 0–80; products with the same series show as "other models" |
| Status | radio | draft, published or archived |
| Demo product | read-only badge | not editable; demo products disappear when the site is built with LAUNCH=1 |
| Option name (admin, EN) | text | e.g. Length; required when there is more than one size |
| Option label (storefront, BG) | text | e.g. Дължина; required when there is more than one size |
| Name, summary, description (EN) | text/textarea | optional; stored, not shown on the storefront yet |

The slug is shown read-only on the edit page. On a new product it's made from the name when you first
save, and it never changes after that, even if the name does.

**Sizes editor**, on the same page. One row per size:

- option value (BG, e.g. "210 мм");
- SKU (optional, unique across the shop);
- price in euros;
- stock;
- buttons: Move up, Move down, Remove.

"Add size" adds an empty row.

- A product with one size is shown as a single row without the option value, the way the storefront treats
  it.
- **Prices** are typed in euros:
  - accepted: `129.90`, `129,90`, `129`, `129.9`, `€ 129,90`, and spaces as thousands separators
    (`1 299,90`);
  - stored as exact integer cents, by parsing the digits rather than through floating point;
  - rejected: more than two decimals, dots as thousands separators (`1.299,90` or `1.299`, with a
    message showing the correct format: `1299,90` or `1 299,90`), zero, negative values, or more than
    €100,000.00.
- **Stock** is a whole number from 0 to 100,000, the existing limit.
- **Order of sizes** is the row order, saved as `position`.
- **Removing a size:**
  - a size that appears in any past order is **archived**, never deleted. It disappears from the
    storefront and from quick edit, and is listed under "Archived sizes" with a "Restore" button;
  - a size with no orders is deleted together with its stock row.
- **Unique option values:** within a product, active sizes need distinct option values. Each one's URL key
  (`?v=210-mm`) is made from its value when the size is created, and never changes after that, even if
  the size is renamed. A new size never reuses a key that an archived size of the same product still
  holds.
- **Deleting a product:** a draft that was never ordered can be deleted, after a confirmation. Every
  other product can only be archived.
- **Archive all demo products:** a button on the products list, behind a confirmation. It is the only
  bulk action, and it purges with `purgeEverything`.
- **Publishing:** a product must have at least one active size before it can be published.
- **Without JavaScript:** a small script handles "Add size", Move up/down and Remove in the page. If
  JavaScript is off, the form still shows the existing rows plus two empty ones, and reordering works by
  editing a position number.

**Other parts of the page:**

- **View on site:** a link to `/produkti/{slug}/`, shown only when the product is published and
  visible (not a demo after launch).
- **Preview:** a link to `/admin/products/{slug}/preview/`, which works for any status.
- **Photos (slice 3):** an empty, clearly labelled "Photos — coming in slice 3" section where the uploader
  will go. No code behind it.
- **Errors:**
  - every invalid field is shown next to the field, in English, with everything you typed kept;
  - nothing is saved unless the whole form is valid.
- **Edits from two tabs:** the form carries the product's `updated_at`. If the product changed since you
  opened it (another tab, or an order changed stock), the save is refused with "This product changed while
  you were editing. Reload to see the current version."

### Preview (`/admin/products/{slug}/preview/`)

- The storefront product page, rendered from the same component, for a product in any status.
- A yellow banner reads "Preview — draft, not visible to customers".
- "Add to cart" is turned off.
- It lives under `/admin`, so it is behind Cloudflare Access and never cached, and drafts stay private.
  Customers can't reach it.

## Stock while orders come in

Stock in the edit form and in quick edit is an absolute number, and orders can change stock between
loading the page and saving it.

- Each stock field carries the count that was shown, and the save only applies where the stock is still
  that count.
- If an order came in meanwhile, nothing for that size is saved, and the page says "Stock changed from 5
  to 4 by an order; check and save again."

Today's `/admin/stock/` doesn't do this check; the new pages will.

## Cache purging after saves

As described in `docs/slice-1-report.md` (section 2) and `src/lib/cache-purge.ts`:

| Action | Purge |
|---|---|
| Product saved (any field, sizes, status) | `productPurgeTags(product, previousCategory)` plus `stock` |
| Quick edit of a price | `productPurgeTags(product)` (the price shows on home, listings and the category page) |
| Quick edit of stock | `stockPurgeTags(productId)` (the existing behaviour) |
| Bulk actions (see the decision list) | one `purgeEverything` call |

- The purge helper moves from `stock.astro` into `src/lib/cache-purge.ts` as `getPurger()`, along with a new
  `purgeAll()` for `purgeEverything`. Every admin save uses them.
- A failed purge is logged and never blocks the save. Pages expire on their own within 60 s plus the
  600 s stale period.
- Locally there's no `purge()`, so purging is covered by unit tests with a fake.

## Security

- **Access:** the middleware keeps verifying the Cloudflare Access token on every `/admin` request,
  unchanged.
- **Cross-site forms:** the middleware rejects every non-GET/HEAD request to `/admin` whose `Origin` header
  is missing or isn't the site's own origin. It returns 403 with nothing saved.
  - Astro's built-in `checkOrigin` already does this for form posts. The explicit check also covers other
    content types, and it makes the rule visible and tested in our own code.
- **Validation:** every input is checked on the server in one pure function, `parseProductForm()`, before
  any database write:
  - lengths, enums, whole-number ranges, price format, unique option values, SKU format and uniqueness,
    and at least one active size to publish;
  - the database constraints (CHECKs, unique SKU index) stay as the last line of defence, and a unique-SKU
    failure turns into a field error.
- **Output:** everything shown is escaped by Astro. No `set:html` with user input.

## Performance

**Target:** every admin page under about 10 ms CPU (JS+GC) with 1,000 variants and 1,000 orders.

**How the pages stay under it:**

- No admin page loads the whole catalog or all orders: products 50 per page, orders 50 per page.
- **Products list:** one batch of three queries: the 50 products, their sizes and stock, and a count. The
  price range and total stock are computed in SQL or from those rows only.
- **Search:** `LIKE` over name, brand and SKU. At 1,000 variants a scan is fine. If measurement shows
  otherwise, I'll add an index.
- **Edit page:** reads one product, its sizes and stock, and one query for "which of these sizes have
  orders".
- `getStockLevels()` (which reads the whole stock table) and `listAllProducts()` are no longer used by any
  admin page.

**How I'll measure it.** The same method as slice 1 (`docs/slice-1-report.md`, section 1):

- **Build:** the production build under `wrangler dev`, local workerd, with V8 CPU profiles through the
  inspector at 100 µs sampling. Each URL is requested 50 times, in two runs, and I report JS+GC and
  all-busy.
- **Data:** a new committed script, `scripts/seed-perf.mjs`, writes a local-only SQL file with:
  - 500 products and 1,000 variants (the slice 1 mix);
  - 1,000 orders with 1–3 items each.

  It never touches the remote database.
- **URLs:**
  - orders page 1, page 20, and filtered by status;
  - products page 1, a search, and a filtered page;
  - the edit page of a five-size product;
  - the preview page;
  - a product save (POST);
  - a quick edit save.
- **Access check:** under `wrangler dev` the Access check would reject the requests, so, as in slice 1, the
  measurement runs on a measurement-only build in a scratch worktree with the check skipped. That build is
  never committed. The Access JWT verification isn't included in the numbers; I'll note that.
- **Report:** the results go into a new `docs/slice-2-report.md`.

## Files

**New**

- `src/lib/admin-products.ts`: admin reads and writes (no Astro imports, so tests can run it against D1):
  - `listAdminProducts({ q, category, status, page })` and `getAdminProduct(id)`;
  - `saveProduct(input, expectedUpdatedAt)`, which diffs sizes (add, update, reorder, archive, delete) in
    one batch;
  - `variantsWithOrders(ids)`;
  - `quickEditVariant(id, { price?, stock? }, expected)`.
- `src/lib/admin-input.ts`: `parsePriceToCents()`, `parseProductForm()`, and the field limits.
- `src/lib/admin-origin.ts`: `isSameOriginPost(request, url)`, used by the middleware.
- `src/pages/admin/products/index.astro`: the products list and quick edit.
- `src/pages/admin/products/new.astro`: the new product page.
- `src/pages/admin/products/[slug]/index.astro`: the edit page.
- `src/pages/admin/products/[slug]/preview.astro`: the preview page.
- `src/components/admin/ProductForm.astro`: the form shared by the new and edit pages.
- `src/components/ProductView.astro`: the product page body, taken out of `produkti/[slug].astro` so the
  storefront page and the preview render the same thing.
- `src/scripts/admin-variants.ts`: add, remove and reorder size rows in the page.
- `scripts/seed-perf.mjs`: the local performance data.

**Changed**

- `src/pages/admin/index.astro`: English, paginated at 50.
- `src/pages/admin/stock.astro`: becomes a 301 redirect to `/admin/products/`.
- `src/layouts/AdminLayout.astro`: `lang="en"`, and the nav reads Orders · Products · View site.
- `src/middleware.ts`: the Origin check for admin POSTs.
- `src/lib/orders.ts`: `listOrdersPage(db, { status, page })` with a count. The 200-row `listOrders` is
  removed once nothing uses it.
- `src/lib/cache-purge.ts`: `getPurger()` and `purgeAll()`.
- `src/lib/catalog.ts`: a reader for one product in any status, for the preview. The visibility rules
  aren't touched.
- `src/pages/produkti/[slug].astro`: uses `ProductView`.
- `src/styles/global.css`: admin table and form styles.
- `CLAUDE.md`: the Products, Cart and Stock lines still describe product files. They get corrected to D1
  (see "Conflicts").
- `docs/HANDOFF.md` and `docs/DECISIONS.md`: updated at the end of each step.

No new migration is planned: migration 0002 already has every column this needs.

## Tests to add

All run with `npm test`, against the in-memory D1 (Miniflare) where they touch the database.

- **`admin-input.test.ts`:**
  - price parsing: accepted and rejected forms, exact cents (`0.1 + 0.2` style cases, `129,90` →
    12990), the limits;
  - `parseProductForm`: every field rule, the one-size and multi-size cases, duplicate option values,
    publishing without an active size, and that typed values are kept on error.
- **`admin-products.test.ts`:**
  - list: search by name, brand and SKU; the filters; paging; price range and total stock;
  - create: the slug comes from the name, and a duplicate name gets `-2`;
  - edit: the slug doesn't change when the name changes;
  - sizes: add, reorder, remove a size with no orders (deleted along with its stock row), remove a size
    with orders (archived, and its order items untouched), restore an archived size;
  - conflicts: a stale `updated_at` is rejected; stock that changed since loading is rejected;
  - a unique-SKU clash becomes a field error;
  - quick edit of price and stock.
- **`admin-origin.test.ts`:**
  - same-origin POST: allowed;
  - missing Origin: rejected;
  - another site's Origin: rejected;
  - `null` Origin: rejected;
  - GET: not checked.
- **`orders-list.test.ts`** (extended): 50 per page, the page count, the status filter with paging, and
  items belonging only to their own orders across page boundaries.
- **`cache.test.ts`** (extended): the tags each save path purges (with a fake purger), and `purgeAll`.
- **`admin-stock.test.ts`:** replaced by quick-edit tests. Its existing cases (invalid values, an empty
  field, an unknown variant) move over.
- **Draft preview:** visible under `/admin` for any status, while the public `getProductPage` still hides
  drafts (the existing visibility tests stay).

## Build order

Each step ends with:

- `npm test`, `npx astro check` and `npm run build` passing;
- a browser check where there's a screen;
- a commit, shown to you before the next step starts.

1. **Admin in English.** Translate the layout, orders page and stock page as they are, with no behaviour
   changes. Add the Origin check in the middleware, with tests.
2. **Orders paginated at 50.** `listOrdersPage`, Previous/Next, the filter kept across pages, and tests.
3. **Input parsing.** `admin-input.ts`: the price parser and product form validation, with tests. No
   screens yet.
4. **Admin data layer.** `admin-products.ts`: list, get, save with the size diff and conflict checks,
   quick edit, and `variantsWithOrders`. Plus `getPurger`/`purgeAll`, all with D1 tests.
5. **Products list.** `/admin/products/` with search, filters, paging, price range, stock and status,
   read-only. Add Products to the nav.
6. **Quick edit.** Stock and price on the list, with conflict messages and purging. `/admin/stock/`
   becomes a redirect, and its tests move over.
7. **Create and edit.** The form with every field, the sizes editor and its script, the error display,
   saves with purging, the slug rules, archiving instead of deleting, and the empty photo section.
8. **View on site and preview.** Extract `ProductView`, add the preview page and the links. Check that the
   storefront page renders exactly as before.
9. **Measurement.** `seed-perf.mjs`, the profiles, the report, and fixes if any page is over about 10 ms.
10. **Docs.** CLAUDE.md corrections, DECISIONS entries for the choices made below, and HANDOFF.

## Conflicts with the current code and docs

- **CLAUDE.md is out of date.** It says products are Markdown/JSON content-collection files, that the
  server recomputes prices "from the product files", and that the product file's `stock` is the starting
  value. Since slice 1 all of this is in D1. Fixed on 2026-10-30, together with the commit of this plan.
- **The admin is in Bulgarian today**, including `lang="bg"` and the order status labels. DECISIONS already
  says the admin is in English, so this plan follows DECISIONS. Order emails to customers stay Bulgarian.
- **`/admin/stock/` sets stock without checking for orders placed meanwhile,** so a save can overwrite a
  sale that happened while the page was open. The quick edit that replaces it adds that check.
- **`listOrders` has a hard limit of 200 and no paging.** Orders past 200 are invisible in the admin today.
  It gets replaced by paging.
- **The slice 1 report and my notes mention bulk operations** ("import", "delete all demos") that use
  `purgeEverything`. This brief doesn't list any bulk action. See decision 1.
- **There's one D1 database for everything.** If a preview environment is ever set up (DECISIONS now says
  deploys are manual), a separate preview database should come first. Nothing in slice 2 depends on it.

## Decisions (2026-10-30)

1. **Bulk actions:** only "Archive all demo products".
2. **Deleting:** a draft that was never ordered can be deleted, after a confirmation.
3. **Size URL keys:** a size's `?v=` key is set when the size is created and never changes, even if the
   size is renamed.
4. **Prices:**
   - spaces are accepted as thousands separators (`1 299,90`);
   - dots as thousands separators (`1.299,90`, `1.299`) are rejected with a message showing the correct
     format;
   - at most 2 decimals.
5. **Speed measurements:** in a new `docs/slice-2-report.md`.
6. **Reordering sizes:** up/down buttons.
7. **Demo flag:** shown as a read-only badge, not an editable checkbox.

## Working method

- After each step: tests, build and type check pass, then the step is committed, and work continues.
- Stops for the user's review: after steps 2, 6, 8 and 10, or whenever:
  - something fails;
  - a test has to be weakened or deleted;
  - the plan has to change;
  - a decision is needed.
- At each stop: the dev server is started on :4321, with exact click-through steps, a plain-language
  summary, and test and build results. Then products-in-d1 is pushed.
- Never deploy, and never touch the remote database.
