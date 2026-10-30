# Decisions

Append-only. One entry per decision: date, decision, reason. To change a decision, add a new entry that
replaces it; don't edit old ones. No secrets, customer data or database output here.

Entries dated 2026-10-29 were recorded together that day; some were made earlier.

---

**2026-10-29: Stack is Astro on Cloudflare Workers, with D1 for data and R2 for files.**
Reason: not recorded. (Astro and D1 are in use; R2 is not configured yet.)

**2026-10-29: The storefront is in Bulgarian; the admin is in English.**
Reason: the shop sells only in Bulgaria, to Bulgarian customers. The reason for an English admin was not
recorded. (The current admin pages are still in Bulgarian.)

**2026-10-29: Cash on delivery is the default payment. Every order is confirmed by a phone call before it
ships. Bank transfer is optional, switched on with ENABLE_BANK_TRANSFER.**
Reason: there is no payment processor (see CLAUDE.md); the confirmation call is the check on each order.

**2026-10-29: Products live in D1. Each product has one option dimension (for example length) and one or
more variants; a product without choices has a single default variant.**
Reason: not recorded. (Inferred, to confirm: products can then be managed in the admin without editing
files and redeploying, and one dimension covers knife sizes while keeping stock, cart and orders keyed by a
single variant id.)

**2026-10-29: Product photos are stored in R2 and served from MEDIA_BASE_URL, never through the Worker in
production.**
Reason: not recorded. (Inferred, to confirm: images served outside the Worker don't add to the per-request
CPU and request counts measured in docs/slice-1-report.md.)

**2026-10-29: Workers Cache replaces the hand-written Cache API page cache.**
Reason: on a cache hit the Worker doesn't run, so it uses no CPU. It works on workers.dev, and Cloudflare
recommends it over the Cache API for new Workers (docs/slice-1-report.md, section 2).

**2026-10-29: The site launches on the paid Workers plan.**
Reason: on the Free plan, uncached pages are at or above the 10 ms CPU limit. With Workers Cache on, static
asset requests also count against the 100,000-requests-a-day limit (docs/slice-1-report.md, sections 1 and 2).

**2026-10-29: No deploy until the admin product manager works.**
Reason: not recorded.

**2026-10-29: Prices are stored as integer euro cents and formatted only for display.**
Reason: whole-number cents avoid rounding errors in totals (see CLAUDE.md: formatPrice()).

**2026-10-29: Shipping is not charged by the shop. The customer pays the courier (Econt or Speedy) at their current rates on delivery; order totals exclude shipping.**
Reason: no shipping logic or shipping column is needed, and the courier's price is the real price.

**2026-10-29: The remote D1 database holds only dummy data. At launch it is reset (all tables dropped, all migrations applied fresh) instead of migrated.**
Reason: no real orders exist, so a reset removes the risk of migrating live data and starts order numbers clean. Database backups are never kept inside the repo (backup*.sql is gitignored).

**2026-10-30: Add Organization JSON-LD and set `site` once karniktochi.com is bought.**
Reason: no site URL is configured yet (no `site` in astro.config.mjs), and the JSON-LD needs the real URL.
