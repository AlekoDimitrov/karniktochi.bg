# karniktochi.com

Online store for Japanese kitchen knives.

See also @AGENTS.md (dev server usage and Astro docs links).

## Stack

- **Astro** (TypeScript, `astro/tsconfigs/strict`) deployed to **Cloudflare Workers** via `@astrojs/cloudflare`. Worker config lives in `wrangler.jsonc`.
- **Products** are Markdown/JSON files in the repo (Astro content collections), not a database or CMS.
- **No payment processor.** Bulgaria only. Cash on delivery (default) or bank transfer (switched by `ENABLE_BANK_TRANSFER` in `wrangler.jsonc`). Every order is confirmed by phone before shipping.
- **Prices are in EUR.** Store amounts as integer cents; format for display only (`formatPrice()`).
- **Cart** is client-side (`src/scripts/cart.ts`, localStorage). The server recomputes all prices from the product files.
- **Orders** live in **Cloudflare D1** (binding `DB`, schema in `migrations/`). `src/lib/orders.ts` holds the SQL; `createOrder()` in `src/lib/checkout.ts` is the single entry point for placing an order (add rate limiting/captcha there).
- **Stock**: the D1 `stock` table is the live count once a product has been ordered; the product file's `stock` is only the starting value. Orders reserve stock; `cancelled`/`refused` release it. The CHECK constraints make overselling and stale status changes roll back.
- **Emails** go through Resend (`src/lib/email.ts`, secret `RESEND_API_KEY`).
- **/admin** is behind Cloudflare Access; `src/middleware.ts` also verifies the Access JWT (skipped in `astro dev`).

## Commands

- `npm run dev`: local dev server
- `npm run build`: production build into `dist/`
- `npm run preview`: preview the built Worker locally
- `npm test`: unit tests (vitest; stock tests run against an in-memory D1 via Miniflare)
- `npx astro check`: type check
- `npm run generate-types`: regenerate `worker-configuration.d.ts` from `wrangler.jsonc`
- `npx wrangler d1 migrations apply karniktochi --local` (or `--remote`): apply D1 migrations
- Local secrets and var overrides go in `.dev.vars` (gitignored; see `.dev.vars.example`)

Do not deploy unless explicitly asked.

## Working rules

- Commit after each working step: once a change builds and runs, commit it before starting the next one.
- Read docs/DECISIONS.md at the start of every session.
- Update docs/HANDOFF.md at the end of every task.

## Launch checklist

The site is currently hidden from search engines by `public/_headers` (`X-Robots-Tag: noindex, nofollow` on all paths). At launch, in this order:

1. Delete `public/_headers` and deploy.
2. Attach the karniktochi.com custom domain to the Worker.
3. After the domain is attached and serving, disable the `workers.dev` address (`"workers_dev": false` in `wrangler.jsonc`, or in the Cloudflare dashboard).
