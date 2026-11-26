# Slice 4 plan: photo zoom, admin photo undo and drag order, "order accepted"

Status: **approved 2026-11-26** (decisions recorded in docs/DECISIONS.md, 2026-11-26; thank-you email line changed to "Ще получите имейл с подробностите на {email}."). Branch `products-in-d1`, local only; staging is
redeployed only after everything is approved. Production is never touched.

Four items, built in this order: 2 + 3 (admin photos), then 1 (zoom), then 4 (orders). Decisions I need are
marked **Decision** and collected at the end.

---

## Item 2: removing a photo with Undo instead of a confirmation

### On screen

- With JavaScript, "Remove" (no "…") removes the photo from the list at once. The other photos renumber
  ("Photo 1", "Main photo" moves to the new first one), and the count says "2 of 12".
- In its place, one line: **"Photo 3 removed. Undo"**, for 10 seconds. It is announced to screen readers
  (`role="status"`). Undo puts the photo back exactly where it was, and focus goes back to its Remove button.
- Removing several photos in a row gives one line each, each with its own Undo and its own 10 seconds.
- Without JavaScript, nothing changes: "Remove…" still goes to the confirmation as today.

### When the real delete happens

The photo is only hidden in the page. The real delete is **one request**,
`POST /admin/products/{slug}/photos/remove/` with the photo ids, sent:

1. when the 10 seconds pass; or
2. when you leave the page (`pagehide`: a link, reload, back, closing the tab). It is sent with
   `fetch(…, { keepalive: true })`, which browsers deliver after the page is gone; all photos still waiting
   go in that one request; or
3. right before any other photo change (an upload, a drag, Move up/down), so the server and the page
   never disagree about which photos exist. The Undo line disappears then.

On the server: D1 first, in one batch (delete the rows and renumber 0..n-1; it all happens or none of it
does), then the R2 files in `waitUntil`, so they are deleted even if the browser's connection drops after
D1 has answered. Then the usual purge of the product's pages. A photo that is already gone counts as removed
(the request can safely arrive twice).

### If you close the tab during the 10 seconds

- **Normal case:** closing the tab fires `pagehide`, the browser sends the request, and the photo is removed
  completely (D1, then R2).
- **If the browser doesn't send it** (it crashed, the phone killed it in the background, or iOS Safari
  skipped `pagehide`, which it sometimes does when a tab is swiped away): nothing was deleted. The photo is
  still there, complete, the next time you open the page. You remove it again.
- **Switching to another tab or app does not count as leaving:** the timer keeps running (a background tab
  may run it late, up to about a minute), and the delete then happens normally. **Decision 4.**

### Why nothing is ever half-deleted

- The only state a customer can see is D1. Its change is one atomic batch: the photo row is either there
  (photo fully shown) or gone (photo fully gone, positions closed up).
- R2 is deleted only after the row is gone. If that R2 delete fails, the files stay as orphans that nothing
  links to (logged; this is today's behaviour, see HANDOFF "Known bugs and limits").
- Until the request is sent, nothing on the server has changed at all.

### Unsaved typing in the product form

Nothing on this page reloads it any more (remove, undo, move, drag, upload; and alt text, see below). The
product form is never touched. The "leave page?" warning stays: if you leave with unsaved changes and click
"Stay", `pagehide` doesn't fire and the pending removal keeps waiting for its timer.

**Also included (small, same reason):** "Save alt text" is sent with `fetch` too, so it no longer reloads the
page. And photos you just uploaded get the full row (Remove, Move, drag, alt text) at once, so the "Reload
the page to move or remove the new photos" note goes away.

### Files

- `src/lib/photos.ts`: `removePhotos(db, productId, ids)` (one batch for several ids; returns the R2 keys to
  delete); `removePhoto` calls it.
- `src/lib/photo-upload.ts`: handlers for the JSON actions, with purge.
- `src/pages/admin/products/[slug]/photos.ts` moves to `photos/index.ts` (same URL); new
  `photos/remove.ts`, `photos/alt.ts` (JSON, `waitUntil` for R2).
- `src/components/admin/PhotoManager.astro`: a `<template>` of one photo row (used for new uploads), the
  Undo area, JS-only attributes.
- New `src/scripts/admin-photo-list.ts` (remove/undo, alt, and item 3), started from PhotoManager;
  `admin-photos.ts` hands it each new upload.
- `scripts/check-admin-paths.mjs`: the new endpoints (GET and POST must be 403 without Access).
- `src/styles/global.css`: the Undo line.

### Tests

- `removePhotos`: several ids in one batch, positions 0..n-1 after, R2 files gone; an id already gone is not an
  error; a photo of another product is never touched; an R2 failure leaves D1 done and is only logged.
- The JSON handlers: bad input refused with nothing changed; purge called once.
- The pending-removal queue (timer, undo, flush on leave, flush before other changes) as a small pure module
  with an injected clock, tested without a browser.
- In Chrome by me: remove → undo; remove → wait 10 s → reload: gone; remove → reload at once: gone (sent
  on `pagehide`); remove → drag: removed first; unsaved typing kept through all of these.

### Risks

- `keepalive` requests need the Access cookie and an `Origin` header; browsers send both for a same-origin
  POST. Checked locally (Origin) and on staging (Access) before the stop.
- iOS Safari may skip `pagehide` on a swiped-away tab: then the photo stays (safe direction, as above).

---

## Item 3: changing the photo order by drag and drop

### On screen

- Each photo row gets a drag handle (⠿, labelled "Drag to reorder photo 3"). Drag with the mouse, or with a
  finger on the handle (only the handle, so the page still scrolls normally on a phone). The row lifts, a
  gap shows where it will land, and the list scrolls when you drag near the top or bottom edge.
- Drop: the new order is saved at once. "Main photo" moves to whatever is first. A short "Order saved."
  (screen readers hear "Photo moved to position 2."). If saving fails, the list goes back to the saved
  order and says why.
- **Move up / Move down stay**, for the keyboard. With JavaScript they also save without a reload, and focus
  stays on the button you pressed (on the moved photo). Without JavaScript they are the plain forms as today.
- Escape during a drag cancels it.

### How it is saved

`POST /admin/products/{slug}/photos/order/` with the full list of photo ids in the new order. The server
accepts it only if it is exactly the product's current photos (none added or removed meanwhile, e.g. in
another tab); otherwise nothing changes and you get "The photos changed in another tab. Reload." Positions are
written in one UPDATE. Then the product's pages are purged (`productPurgeTags`, as now). Drops in quick
succession are sent one after another, never at the same time.

Each drop is one purge call. For one person reordering a dozen photos that is far below Cloudflare's limits.

### Files

- `src/lib/photos.ts`: `reorderPhotos(db, productId, ids)`; `movePhoto` stays for the no-JS forms.
- `src/pages/admin/products/[slug]/photos/order.ts` (JSON).
- `src/scripts/admin-photo-list.ts`: drag with Pointer Events (one code path for mouse and touch; HTML drag
  and drop doesn't work on phones), Move up/down by fetch.
- `PhotoManager.astro`, `global.css`: handle, lifted row, gap.
- `check-admin-paths.mjs`: the new endpoint.

### Tests

- `reorderPhotos`: new positions stored; refused with nothing changed when an id is missing, extra, repeated
  or belongs to another product; purge once on success, none on refusal.
- The pure "move item from i to j" and "where does the dragged row land" functions.
- In Chrome by me: drag with the mouse, with touch emulation at 390 px, keyboard Move up/down with focus
  kept, a drag after an upload, two tabs (the second one's drag refused).

### Risks

- Touch dragging on a real phone can feel different from emulation: part of your click-through.
- No library: Pointer Events are enough for one short vertical list.

### Stop 1 (after items 2 + 3)

Your click-through of the admin Photos section, desktop and phone. Pushed at the stop.

---

## Item 1: photo zoom on the product page

### On screen, desktop (mouse)

- Hovering the main photo shows a magnified view **inside the same frame**: the part under the cursor,
  following it, with a zoom-in cursor. Leaving the frame returns it to normal. Nothing around it moves.
- The magnified view uses the 1,800 px rendition, loaded on the first hover (it is often already loaded on
  high-density screens). The magnification is what that file allows, at most 2.5×. If the photo is too small
  to magnify meaningfully (less than 1.3× its shown size), there is no hover zoom, only the click.
- Clicking the main photo opens the fullscreen view on that photo.
- Thumbnails still swap the main photo, as today.

### On screen, phone

- Tapping the main photo opens the fullscreen view. There is no hover zoom on touch screens.

### The fullscreen view (desktop and phone)

- White background, the photo as large as fits, a counter "2 от 5", a clear **close button (✕, 44×44 px,
  top right, labelled "Затвори")**, and previous/next buttons when there is more than one photo.
- **Phone:** swipe left/right to change photo; pinch to zoom (up to the photo's full detail) and drag to
  look around while zoomed; double-tap to zoom in/out. The browser's own page zoom is not triggered inside the
  view.
- **Desktop:** click on the photo zooms in at that point, moving the mouse pans, a second click zooms out.
  Arrow keys change photo.
- **Back button closes the view** (opening it adds one history entry; closing it with ✕ or Escape removes
  that entry again, so Back afterwards leaves the page as usual). The view is not in the URL, so a reload
  shows the normal page.
- **Keyboard and screen readers:** it is a native `<dialog>` (focus stays inside, Escape closes, the page
  behind is inert). Focus goes to the close button on open and back to the photo you opened it from on close.
  Buttons: Затвори, Предишна снимка, Следваща снимка, Увеличи, Намали (the last two give keyboard zoom; the
  arrow keys pan while zoomed). Each photo has its alt text; the counter is announced. With reduced motion,
  no slide animations.
- **No layout shift:** the hover view is drawn over the frame, the dialog is in the top layer, and the page
  behind is kept from scrolling without the scrollbar's width jumping.
- **Without JavaScript:** the main photo is a link to its largest stored size (and the thumbnails stay links,
  as now). Clicking opens the plain image.

New Bulgarian texts (please check): link text for screen readers "Увеличи снимката", dialog title "Снимки:
{име на продукта}", "Затвори", "Предишна снимка", "Следваща снимка", "Увеличи", "Намали", counter
"{n} от {общо}".

### A larger zoom size: 2,400 px (Decision 1)

Today the largest file is 1,800 px. On a phone (390 px wide, 3× density = 1,170 device pixels) that is only
about 1.5× before it starts to blur; on a desktop screen in fullscreen it is about 1:1. I recommend adding a
**2,400 px rendition** (1.33× the detail of 1,800, about 1.8× the pixels).

- **Which photos get it:** the zoom size is made only when the photo's long side is at least 2,100 px (so
  there is a real gain over 1,800), at min(long side, 2,400). Phone and camera photos (3,000–4,000 px) all
  get it.
- **Cost, estimates to be measured on real photos in step 1a:**
  - **Upload:** a 1,800 px WebP of a knife on white is typically 150–400 KB; 2,400 px adds about 250–700 KB
    per photo and about half a second of encoding in the browser. Limits: 2.5 MB for that file, and the
    request cap goes from 3 MB to 5 MB.
  - **R2 storage:** about +0.5 MB per photo. 300 products × 6 photos ≈ 0.9 GB extra, inside R2's free
    10 GB-month (then $0.015 per GB-month). One more write per photo (free tier: 1 million a month).
    Downloads from R2 cost nothing.
  - **Page speed:** **no change to the normal page.** The product page, cards, cart and og:image never
    offer the 2,400 file (every srcset there is capped at 1,800, checked by a test). The fullscreen view
    starts with the size that fits the screen (900 or 1,800) and loads 2,400 only when you zoom in, for the
    photo you are looking at. The view loads only the current photo and its two neighbours.
  - **Worker CPU:** none for viewing (photos come from the media domain). The upload request reads one more
    file: a millisecond or two, admin only.
- **Photos already uploaded:** they keep 400/900/1,800; the fullscreen view zooms them up to their 1,800 px.
  The originals were never stored, so a larger size can't be made for them; to get it, remove and upload the
  photo again. Today that means staging's one test photo; production has none. That's why this is worth
  doing before you enter real products.
- **Without it (if you say no):** everything above works with 1,800 as the largest size; zoom detail is
  simply limited.

### Library or not

No library: about 400 lines of our own TypeScript (roughly 5–7 KB gzipped), loaded only on the product page
and only after the first hover, focus or tap on the photo, so the page itself gets no heavier. The hard part
is pinch-zoom with panning limits. If your phone click-through finds the gestures poor, the fallback I would
use is **PhotoSwipe 5** (MIT licence; about 20 KB gzipped for the core and lightbox, to be checked on npm
before adding): it is mature on iOS and Android and does pinch, swipe, double-tap and history itself. It is
not *clearly* better for one gallery of at most 12 photos, so I start without it.

### Files

- `src/lib/photo-sizes.ts`: `ZOOM_SIDE = 2400`, `renditionSides()` adds it by the rule above, cap for that
  file, `UPLOAD_MAX_BYTES` 5 MB. Upload checks in `photo-upload.ts` follow automatically.
- `src/scripts/admin-photos.ts`: makes the extra size; hint text "400, 900, 1800 and 2400 px".
- `src/lib/photos.ts`: a `galleryPhotos()` helper that gives the page sizes (capped at 1,800) and the
  viewer sizes separately. `ogImage` is already capped.
- `src/components/ProductView.astro`: main photo wrapped in a link; thumbnails' srcset capped at 1,800
  (today it has no cap, so it would offer 2,400 when a thumbnail is clicked); the viewer's data as JSON.
- New `src/scripts/photo-zoom.ts` (hover) and `src/scripts/photo-viewer.ts` (dialog, gestures, history),
  `src/styles/global.css`, `src/i18n/bg.ts`.
- `docs/DECISIONS.md`: the 2,400 entry if you say yes.

### Tests

- `renditionSides` with 1,800, 2,000, 2,100, 2,400 and 4,000 px; the 2,400 cap; `checkUpload` accepts 4
  renditions and refuses 3 when 4 are expected.
- `galleryPhotos`: no page URL or srcset ever contains the 2,400 file; old photos (1,800 max) work.
- Pure gesture maths: zoom around a point, pan limits, swipe threshold.
- In Chrome by me: desktop hover and click, keyboard only, the 390 px view with touch emulation, Back
  closes, no layout shift (the page's layout-shift score stays 0), the network panel shows no 2,400 request
  before the fullscreen view zooms in.

### Risks

- Real-phone gestures (iOS Safari especially) can't be fully checked in emulation: your phone check at the
  stop matters most here.
- History: the variant picker already rewrites the URL (`?v=`); the viewer adds and removes one history
  entry without changing the URL. Tested together.

### Stop 2 (after item 1)

Your click-through on desktop and a phone (or 390 px). Pushed at the stop.

---

## Item 4: "order received and accepted"

### Confirmed from the code: no email after a status change

- `sendEmail` is called in one place only: `sendOrderEmails()` in `src/lib/checkout.ts`, which runs only from
  `createOrder()` (placing an order). `changeStatus()` in `src/lib/orders.ts` only writes D1. The admin orders
  page calls only `changeStatus()` and `setInternalNote()`. Staging agreed: no email arrived after you
  cancelled the two test orders (HANDOFF, 2026-11-25).
- **There is no test that covers this today.** I add one (`test/status-email.test.ts`):
  1. every status change (all pairs) on a Miniflare D1, with `fetch` replaced by a spy: the spy is never
     called;
  2. a source check: only `src/lib/checkout.ts` imports `sendEmail` or `orderEmails`, so a future admin change
     that starts emailing fails the test.

### Texts, before and after (Decision 2)

**Thank-you page** (`src/i18n/bg.ts`, `thanks`):

| | Before | After |
|---|---|---|
| Heading | Благодарим за поръчката! | Благодарим за поръчката! *(unchanged)* |
| New line under the number | — | Поръчката ви е получена и приета. |
| Call line | Ще ви се обадим на {phone}, за да потвърдим поръчката, преди да я изпратим. | Ще ви се обадим на {phone}, за да уточним доставката. |
| Email line | Ще получите потвърждение на {email}. | Изпратихме подробностите за поръчката на {email}. |

The bank-transfer box stays: "Моля, преведете сумата по сметката по-долу. Изпращаме поръчката, след като
плащането постъпи."

**Customer email** (`src/lib/email.ts`, `customerEmail`):

| | Before | After |
|---|---|---|
| Subject | Поръчка KT-00007 е получена — Карник Точи | Поръчка KT-00007 е приета — Карник Точи |
| Paragraph 2 | Благодарим ви за поръчката! Номерът ѝ е KT-00007. | Благодарим ви за поръчката! Тя е получена и приета. Номерът ѝ е KT-00007. |
| Paragraph 3 | Ще ви се обадим на 0888 123 456, за да потвърдим поръчката, преди да я изпратим.<br>Поръчката не е изпратена, докато не я потвърдим по телефона. | Ще ви се обадим на 0888 123 456, за да уточним доставката. |

Everything else in the email (products, total, delivery, payment, bank details, "Ако имате въпроси…",
signature) is unchanged.

**The checkout page has the same "confirm" wording** (not in your list, but it would contradict the new
texts). I propose changing it too:

| Key | Before | After |
|---|---|---|
| `checkout.phoneHint` | Ще ви се обадим на този номер, за да потвърдим поръчката. Напр. 0888 123 456 | Ще ви се обадим на този номер, за да уточним доставката. Напр. 0888 123 456 |
| `checkout.emailHint` | За да получите потвърждение на поръчката по имейл. | За да получите подробностите за поръчката по имейл. |
| `checkout.callNote` | Ще ви се обадим, за да потвърдим поръчката, преди да я изпратим. | Ще ви се обадим, за да уточним доставката. |

Notes on the wording:
- "За да уточним доставката" gives the customer a reason for your call without making the order sound
  unconfirmed. If you'd rather not mention the call at all, the call lines simply go.
- "Изпратихме" is sent right after the order is saved, but delivery isn't checked by the page; if you prefer
  to be exact: "Ще получите имейл с подробностите на {email}."
- "Приета" means the order is binding when placed. Your future Общи условия (HANDOFF item 13) should say the
  same.

The shop's own email stays as it is ("Обадете се на клиента и сменете статуса в /admin.").

### The "to call" list in the admin (Decision 3)

**Recommended, option A: rename, no database change.**
- Status `new` shows as **"To call"** (was "New (to confirm)"); `confirmed` shows as **"Called"** (was
  "Confirmed"). Stored values don't change, so no migration and nothing for staging's database.
- The top menu says **"Orders (3 to call)"** when there are any; the "To call" filter chip shows the same
  count. One small count query on the existing `(status, created_at)` index.
- In the "To call" list the phone number is a large tap-to-call link.
- Your workflow: an order arrives as "To call" → you phone → set "Called" (or Cancelled) → later Shipped,
  Delivered.

Option B: a separate "Called" mark (a `called_at` column, a migration, a checkbox per order, applied to both
databases). Only worth it if you want to record calls independently of the status, e.g. "called, no answer"
— and then a note does that too. I don't recommend it.

### Files

- `src/i18n/bg.ts` (thanks, checkout), `src/pages/porachka/blagodarim/index.astro` (the new line),
  `src/lib/email.ts`; `src/pages/admin/index.astro` (labels, count, chip), `src/layouts/AdminLayout.astro`
  (menu count), `src/lib/orders.ts` (`countOrders(db, status)`).
- `docs/DECISIONS.md`: "An order is accepted when placed; the phone call stays, to arrange delivery"
  (refines the 2026-10-29 entry); CLAUDE.md's "confirmed by phone before shipping" line reworded to match.

### Tests

- `email.test.ts`: the new subject and text; the customer email contains no "потвърд".
- The new status-email test (above).
- `countOrders`; the admin labels.

### Stop 3 (after item 4)

Your click-through: place an order (thank-you page, the logged email in `astro dev`), then the admin "To
call" list. Pushed at the stop.

---

## Build order and method

Small steps; I continue on my own while `npx astro check`, `npm test` and `npm run build` pass, and commit
each step.

1. **2a** server: `removePhotos`, `reorderPhotos`, the JSON endpoints, tests, check-admin-paths.
2. **2b** remove with Undo, alt text by fetch, full rows for new uploads.
3. **3** drag and drop, Move up/down by fetch.
   → **Stop 1** (push).
4. **1a** the 2,400 rendition (if yes): sizes, upload limits, capped srcsets, tests; measure real file
   sizes and put the numbers in the plan.
5. **1b** main photo link and desktop hover zoom.
6. **1c** fullscreen view: dialog, keyboard, buttons, history.
7. **1d** phone gestures: swipe, pinch, double-tap.
   → **Stop 2** (push).
8. **4** texts, status-email test, "To call".
   → **Stop 3** (push).
9. After your approval of all three: `CLOUDFLARE_ENV=staging npm run build && npx wrangler deploy`, a first
   look on staging.karniktochi.com, then `npm run build` again so `dist/` is production. No migration
   needed (with option A). Then HANDOFF.

---

## Decisions needed

1. **2,400 px zoom size:** add it (recommended), made only for photos at least 2,100 px on the long side?
2. **Texts:** approve the thank-you, email and checkout texts above, or change them. Mention the call
   ("за да уточним доставката") or not?
3. **To call:** option A (rename to "To call" / "Called", count in the menu; recommended) or option B?
4. **Pending removal when switching tabs or apps:** the delete waits for its timer, and only leaving the page
   sends it early (recommended). The alternative is also sending it when the tab is hidden, which is more
   certain on phones but deletes early when you merely switch tabs.
5. **Hover zoom inside the photo frame** (recommended; nothing else on the page moves) rather than a
   separate magnified panel beside the photo.
