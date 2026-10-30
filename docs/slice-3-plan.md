# Slice 3 plan: product photos

Status: **draft, waiting for approval** (2026-10-30, on `products-in-d1`). No code is written for it yet.

## What slice 3 delivers

Photos for products, uploaded on the admin edit page, stored in R2 and shown on the storefront. The design
choices given in the brief are fixed. This plan proposes the details and lists what needs your decision
(see "Decisions needed" at the end).

## Where photos are stored and served from

- **Bucket:** R2 bucket `karniktochi-media`, binding `MEDIA` in `wrangler.jsonc`. Locally, wrangler and
  `astro dev` simulate it in `.wrangler/state`, next to the local D1 database.
- **Photo URLs:** every photo URL is `MEDIA_BASE_URL` + `/` + the object key. `MEDIA_BASE_URL` is a new var
  in `wrangler.jsonc`.
  - **Production:** `https://media.karniktochi.com`, a custom domain attached to the bucket. Photos never
    pass through the Worker, so they cost no Worker CPU or requests (DECISIONS, 2026-10-29).
  - **Local dev (`astro dev`):** `MEDIA_BASE_URL` is `/dev-media`. A route that reads from the local
    bucket serves it. The route is added only in `astro dev`, through `injectRoute` in a small integration
    in `astro.config.mjs`, so it doesn't exist in the production build at all. A request to `/dev-media/…`
    on the built Worker is a plain 404.
  - **Staging, before the domain exists:** a separate bucket, `karniktochi-media-staging`, with its public
    `r2.dev` URL switched on, set as `MEDIA_BASE_URL` in a `staging` environment in `wrangler.jsonc`.
    - Cloudflare rate-limits r2.dev URLs and doesn't cache them, so they are for testing only and never
      for production.
    - A separate bucket mirrors the separate staging database (DECISIONS, 2026-10-30). Deleting a staging
      photo can then never delete a production object.
    - Decision 2 below.
  - **The built Worker run locally** (wrangler dev, used for speed measurements and the admin path check)
    has no `/dev-media` route. Photos don't load there, but the HTML and the CPU times are the same.
- **Object keys:** `products/{productId}/{hash}-{size}.webp`.
  - `{hash}` is the first 16 hex characters of the SHA-256 of the largest rendition, computed on the
    server.
  - `{size}` is the long side in pixels: 400, 900 or 1800, or the photo's own long side if it is smaller.
  - The product id is in the key, so the same picture on two products gives two separate objects. Removing
    it from one product can't break the other.
  - Keys never change, and the objects are stored with
    `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: image/webp`.

## Admin: the Photos section

The section moves out of the product form. It sits below the form on the edit page, because one HTML form
can't contain another. On the new-product page it says "Save the product first, then add photos."

- **Adding photos:**
  - drop several photos on the area, or pick them with the file picker (`multiple`, `accept="image/*"`);
  - each photo gets a row with its name and its state: Reading… → Resizing… → Uploading 45% → Done, or a
    clear error;
  - photos upload one at a time, in the order picked, and are added after the existing ones;
  - upload progress uses `XMLHttpRequest`, which reports upload progress (fetch doesn't).
- **The list of photos:**
  - a 400 px thumbnail, "Main photo" on the first;
  - Move up / Move down buttons, as in the sizes editor;
  - Remove, with a confirmation;
  - an alt text field (Bulgarian, at most 200 characters, with a hint to describe the photo, e.g. "Гюто
    Шибата 210 мм, острие отблизо"). When alt is empty, the storefront uses the product name, plus
    "снимка 2", "снимка 3"… after the first photo.
  - Move, remove and alt are plain forms (`action=photo-move|photo-remove|photo-alt`) posted to the edit
    page, which redirects back, so they also work without JavaScript. Only adding photos needs
    JavaScript; without it the section says so.
- **The cap:** at most 12 photos per product. The drop area says "12 of 12" and refuses more.
- **No photos warning:** when a product is published (or saved as published) with no photos, the edit page
  shows: "Published without photos: customers see a placeholder." Saving is allowed.
- **Photo changes and the product form:** photo changes don't touch the product's `updated_at`. Otherwise,
  uploading a photo and then saving the form on the same page would trip the slice 2 "changed while you
  were editing" check.

## Processing in the browser

For each picked file, before anything is uploaded:

1. **Decode** with `createImageBitmap(file)`. Browsers apply the EXIF rotation by default
   (`imageOrientation: 'from-image'`).
2. **Resize** to long sides of **400, 900 and 1800 px**, never upscaling. A photo with a 1,200 px long side
   gives 400, 900 and 1,200. One smaller than 400 px is refused: "Photo too small (at least 400 px on
   the long side)." Resizing uses a canvas, stepping down by halves for sharpness.
3. **Encode as WebP** with `canvas.toBlob(…, 'image/webp', 0.82)`.
   - The canvas holds only pixels, so EXIF data, GPS position and camera details are gone.
   - If the result isn't actually WebP (`blob.type`), the photo stops with an error (decision 1).
4. **Upload** the 2–3 renditions and the alt text in one multipart request.

Browsers and iPhone photos:

- **Chrome and Firefox (desktop):** decode JPEG, PNG and WebP, and encode WebP.
- **HEIC in Chrome or Firefox:** they can't decode HEIC. `createImageBitmap` fails, and the row says:
  "This browser can't read this file (HEIC?). Open it in Safari, or export it as JPEG."
- **Safari (macOS and iOS 17+):** decodes HEIC.
  - As far as I know, Safari can't encode WebP from a canvas: `toBlob` quietly returns PNG instead.
  - I haven't verified this on the current Safari. Step 3 checks it in a real Safari.
  - If it's true, Safari can read iPhone photos but can't produce WebP without help. See decision 1.
- **iPhone file picker:** in its default "Most Compatible" setting, iOS often hands a web page a JPEG
  instead of the HEIC, so the HEIC problem is mainly a Mac and AirDrop problem.
- **Any file the browser can't decode:** shows the error above with the file name, and the other photos
  carry on.

## The upload request (server)

`POST /admin/products/{slug}/photos/`, a new endpoint (`src/pages/admin/products/[slug]/photos.ts`).

- **Access and Origin:** the middleware already applies both to every admin POST. The admin path check
  (`npm run check:admin-paths`) gets this path added.
- **Checks, in this order:**
  1. the product exists;
  2. the request is at most 3 MB, has 1–3 files, and each file is within its cap: 400 → 200 KB,
     900 → 600 KB, 1800 → 1.5 MB;
  3. each file is WebP by its bytes, not its name: `RIFF` at offset 0, `WEBP` at offset 8, and a `VP8 `,
     `VP8L` or `VP8X` chunk. Its width and height are read from that header, never from the client;
  4. the renditions have the expected long sides (400, 900, the largest) and the same aspect ratio;
  5. the product has fewer than 12 photos;
  6. this photo isn't on this product already, judged by its hash.
- **Writes, in this order:**
  1. the 2–3 objects are put to R2;
  2. one D1 statement inserts the row. It sets the position to the end and applies the 12-photo cap and
     the product check again, so they hold even with two tabs uploading at once;
  3. if the insert refuses, the objects just put are deleted again.
- **Answer:** JSON for the upload script: the new photo, or an error message in English.
- **After a successful upload:** the product's cache tags are purged.

Removing a photo deletes the D1 row and closes the gaps in the positions in one batch, then deletes the
R2 objects.
- If the R2 delete fails, the objects stay as orphans: harmless, because nothing links to them. This is
  logged.
- A copy that Cloudflare's edge already has cached may still be served at its old URL for a while, but no
  page links to it.

**Deleting a draft** (slice 2) now also deletes its photos: rows first, then objects.
**Archiving** keeps them.

## Database: migration 0003

```sql
CREATE TABLE product_photos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  position INTEGER NOT NULL CHECK (position >= 0),      -- 0 is the main photo; kept 0..n-1 without gaps
  key TEXT NOT NULL,                                    -- products/{productId}/{hash}; renditions add -{size}.webp
  sizes TEXT NOT NULL,                                  -- long sides stored, e.g. '400,900,1800'
  alt TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL CHECK (width > 0),             -- of the largest rendition
  height INTEGER NOT NULL CHECK (height > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX product_photos_product ON product_photos (product_id, position);
CREATE UNIQUE INDEX product_photos_key ON product_photos (product_id, key);
```

- **`sizes` is one column more than the brief listed.** A small photo has fewer or smaller renditions, and
  the storefront needs to know which ones exist to build `srcset`.
- **Position has no unique index.** SQLite checks uniqueness row by row during an UPDATE, so swapping two
  positions would fail. Tests check that positions stay 0..n-1 instead.
- **Fresh databases:** it only creates a table and indexes, so it works on a fresh database (the remote is
  reset at launch) and on top of 0002 with data. The migration test covers both.

## Storefront

- **Product page gallery:**
  - the main photo is a large `<img>` with `srcset` (all its renditions), `sizes`, and `width`/`height`
    from the database, so nothing shifts while it loads;
  - the first photo is `loading="eager" fetchpriority="high"`; the rest are `loading="lazy"`;
  - the thumbnails below are buttons that swap the main image (a few lines of script). Without
    JavaScript they are links to the large rendition.
- **Cards** (home, listing, category, other models, related): the main photo's 400 and 900 renditions,
  lazy except for the first row of the listing. **The cart** gets the main photo through `/api/cart-lines`
  (its `photo` field, null today).
- **No photos:** a neutral placeholder: the current `--photo` background with the product's type in small
  text, without the "4:5" design notes the placeholders show today.
- **Framing:** the current frames are 4:5 with `object-fit: cover`. A long horizontal knife photo would
  lose both ends. Decision 4.
- **`og:image`** on the product page: the 1800 rendition, with `og:image:width` and `og:image:height`.
  It is left out when `MEDIA_BASE_URL` isn't an absolute URL (local dev).
- **Queries:**
  - the listing, home and category batches get one more statement: the main photos (`position = 0`) of
    the products on the page;
  - the product page batch gets all photos of the product, and the main photos of the other models and
    related products.
  - Nothing else changes in the queries.
- **Speed:** the goal stays under 10 ms CPU for customer pages, measured in step 5.

## Cache purging

Every photo change (upload, remove, move, alt) purges `productPurgeTags(product)`:
- the product's pages, which also covers the pages showing it as related or another model;
- home, listing and its category.

The new main photo appears on cards as soon as it changes. `/api/cart-lines` isn't cached, so it needs
nothing.

## Demo products and seed scripts

- **The 6 demo products and `npm run seed:dev`** keep the placeholder. To try photos locally, upload them
  through the admin: that also tests the real browser processing.
  - A seed script would need a Node image library to make WebP files. That would be a new dependency
    only for this, so I don't propose one.
- **`npm run seed:orders`:** unchanged.
- **`scripts/seed-perf.mjs`:** adds photo rows (3 on most products, 12 on a few) with keys that have no
  object behind them. The HTML and CPU are the same with or without objects.

## Speed measurement

Same method as slice 2 (`scripts/profile.mjs`, throwaway database, production build under wrangler dev):

- **Upload:** a 3-rendition upload of about 1 MB. It includes reading the multipart body, the hash, the
  header checks, 3 R2 puts to the local bucket, and the insert.
  - The upload is an admin request, so it may exceed 10 ms under the Workers Paid decision. I'll report it
    either way.
- **Storefront:**
  - the product page with 12 photos and with none;
  - home, listing and category with photos on every card;
  - `/api/cart-lines`.
  - If a customer page goes over 10 ms, I stop and tell you.

## Build order

The working method is the same as slice 2:
- commit each step once tests, build and the type check pass, and continue automatically;
- stop at click-through points, failures, plan changes or decisions;
- push products-in-d1 at each stop.

1. **Migration and data layer.**
   - `migrations/0003_product_photos.sql`;
   - `src/lib/photos.ts`: add with the cap, remove with renumbering, move, alt, the list per product, main
     photos per product list, and the URL and `srcset` builders;
   - `src/lib/webp.ts`: magic bytes and header dimensions;
   - deleting a draft deletes its photos;
   - tests against Miniflare D1 and R2.
2. **Bucket binding and upload endpoint.**
   - `MEDIA` and `MEDIA_BASE_URL` in `wrangler.jsonc`, and `npm run generate-types`;
   - the dev-only `/dev-media` route;
   - `photos.ts`, the upload endpoint;
   - the photo-move, photo-remove and photo-alt actions on the edit page, with purging;
   - the new path in the admin path check.
3. **Admin Photos section.**
   - `src/scripts/admin-photos.ts`: browser processing, the per-photo state and progress;
   - the list with move, remove and alt;
   - the publish warning;
   - styles.
   - **Stop: click-through** in Chrome and Firefox, and Safari if you have it. Several photos at once, a
     HEIC file, a non-image file, the 12-photo cap, move, remove, alt, and a photo upload followed by a
     form save on the same page.
4. **Storefront.**
   - the gallery, cards, cart photo, placeholder and `og:image`;
   - the product page body stays shared with the admin preview (ProductView).
   - **Stop: click-through** on desktop and at 390 px, with and without photos.
5. **Speed.**
   - perf seed photo rows, and the upload measurement added to `profile.mjs`;
   - the results go in `docs/slice-3-report.md`;
   - stop only if a customer page is over 10 ms.
6. **Docs and staging config.**
   - a `staging` environment in `wrangler.jsonc` (`karniktochi-staging` database,
     `karniktochi-media-staging` bucket, r2.dev `MEDIA_BASE_URL`), written but not created on Cloudflare;
   - CLAUDE.md, DECISIONS and HANDOFF;
   - the staging checklist gets "create the staging bucket, switch on r2.dev, upload a photo".
   - **Final stop.**

## Files

- **New:**
  - `migrations/0003_product_photos.sql`;
  - `src/lib/photos.ts` and `src/lib/webp.ts`;
  - `src/pages/admin/products/[slug]/photos.ts`;
  - `src/scripts/admin-photos.ts` and `src/components/admin/PhotoManager.astro`;
  - the dev media route and its integration, `src/dev/media-route.ts`;
  - `src/components/ProductPhoto.astro`: one `<img>` with `srcset`, or the placeholder;
  - `docs/slice-3-report.md`.
- **Changed:**
  - `wrangler.jsonc`, `worker-configuration.d.ts` and `astro.config.mjs`;
  - `src/lib/catalog.ts`: photos in the product, listing and cart-line queries;
  - `src/lib/admin-products.ts`: deleting a draft also deletes its photos;
  - `ProductView.astro`, `ProductCard.astro` and `Layout.astro` (`image` prop for `og:image`);
  - `src/pages/admin/products/[slug]/index.astro` and `ProductForm.astro` (the section moves out);
  - `src/pages/kolichka/index.astro` and `src/i18n/bg.ts`: the alt fallback ("снимка 2") and the
    placeholder text. Upload errors are shown only in the admin, so they are in English;
  - `global.css`;
  - `scripts/seed-perf.mjs`, `profile.mjs` and `check-admin-paths.mjs`.

## Tests

- **`webp.test.ts`:**
  - a real VP8, VP8L and VP8X file give their dimensions;
  - a PNG or JPEG renamed `.webp`, a truncated file, and `RIFF` with something other than `WEBP` are
    refused.
- **`photos.test.ts`** (Miniflare D1 and R2):
  - an upload adds the row at the end and its objects with immutable Cache-Control;
  - the 13th photo is refused, and its objects are deleted again;
  - a missing product is refused, with nothing left in R2;
  - the same photo twice on one product is refused;
  - the same photo on two products gives two separate objects;
  - remove deletes the row and the objects and closes the position gap;
  - move up and down, including at the ends;
  - alt is at most 200 characters;
  - deleting a draft removes its photos.
- **`upload` tests:**
  - size caps;
  - the expected long sides and the same aspect ratio;
  - no upscaling: the size list for photos of 300, 400, 1,200 and 4,000 px.
  - The size calculation is shared code that the browser script uses too.
- **`catalog` tests:**
  - the main photo on listing, home, category and related cards;
  - every photo, in order, on the product page;
  - `photo` in cart lines;
  - none for a product without photos.
- **`cache` tests:** each photo action purges the product's tags.
- **`migration.test.ts`:** 0003 on a fresh database and on top of 0002 with data.
- **The admin path check:** the photos endpoint answers 403 without Access.
- **`srcset` and `sizes` builder:** small photos list only the sizes that exist.

## Risks

- **Safari's WebP encoding** (decision 1). If it's missing and we don't add an encoder, the admin needs
  Chrome or Firefox.
- **Upload CPU:** a ~1 MB multipart body, a SHA-256 and 3 R2 puts may exceed 10 ms. It is admin-only and on
  Workers Paid (DECISIONS, 2026-10-30), and it will be measured.
- **Browser memory:** decoding a 48-megapixel iPhone photo takes about 200 MB in the browser. Photos are
  processed one at a time to keep this down.
- **Orphaned objects** if an R2 delete fails after the row is gone. Harmless; a cleanup tool is out of scope.
- **Production without the domain** (decision 3): `media.karniktochi.com` needs karniktochi.com on
  Cloudflare. Production deploys were planned right after slice 3, but the domain isn't bought.
- **`wrangler.jsonc` will name a bucket that doesn't exist on Cloudflare yet.** A production deploy fails
  until it is created, which is a useful guard. Nothing is created remotely in this slice.

## Conflicts with the current code and docs

- **The Photos placeholder sits inside the product `<form>`** (`ProductForm.astro`, slice 2). It moves out
  and onto the edit page only.
- **`deleteDraftProduct`** deletes only the product, its sizes and stock. It must also delete photos, or
  the new table's foreign key would refuse it.
- **`CartLineInfo.photo` says "No product photos yet"**, and the cart page already shows `photo` when it's
  set. It gets filled.
- **The placeholder strings** `bg.product.mainPhoto` ("Главна снимка, целият нож, 4:5") and `thumbs` are
  design notes and get replaced.
- **`astro.config.mjs`** says "Product images are static, so optimize them at build time". That stays true
  for the site's own images. Product photos don't go through Astro's image service at all.
- **HANDOFF** says "R2 and MEDIA_BASE_URL are decided but not configured". This slice configures them.
- **DECISIONS (2026-10-29)**, "never through the Worker in production": the dev route exists only in
  `astro dev`, so this holds.
- **DECISIONS** plans production deploys after slice 3, which collides with the missing domain
  (decision 3).

## Decisions needed

1. **Safari and WebP.** If Safari can't encode WebP (checked in step 3), either:
   - **(a)** add a WebP encoder compiled to WebAssembly (e.g. `@jsquash/webp`, about 300 KB), loaded only
     on the admin edit page and used only when the browser's own encoder doesn't give WebP. Every browser
     then works, including Safari with HEIC. **Recommended.**
   - **(b)** no new dependency. Safari shows "Use Chrome or Firefox to upload photos". HEIC files then
     have to be exported as JPEG first.
2. **Staging photos:** a separate bucket, `karniktochi-media-staging`, with its r2.dev URL switched on,
   like the separate staging database. **Recommended.** The alternative is r2.dev on
   `karniktochi-media` itself.
3. **Production and the domain:** production photos need `media.karniktochi.com`. Either production
   waits for the domain (**recommended**), or it uses an r2.dev URL temporarily (rate-limited, not cached,
   not meant for production).
4. **Framing in the shop:** the current frames are 4:5 and crop with `object-fit: cover`. Either:
   - **(a)** keep the 4:5 frames, but show the whole photo (`contain`) on the light `--photo` background,
     so a long knife is never cut off. **Recommended.**
   - **(b)** crop to 4:5 (centre) in the browser at upload;
   - **(c)** keep cover, and you shoot 4:5 photos.
5. **The numbers:**
   - sizes 400 / 900 / 1800 px on the long side, WebP quality 0.82;
   - at most 12 photos per product;
   - file caps 200 KB / 600 KB / 1.5 MB, and 3 MB per upload;
   - photos smaller than 400 px refused.
   - Confirm or change.
