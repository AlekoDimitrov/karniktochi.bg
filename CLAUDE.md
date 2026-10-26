# karniktochi.com

Online store for Japanese kitchen knives.

See also @AGENTS.md (dev server usage and Astro docs links).

## Stack

- **Astro** (TypeScript, `astro/tsconfigs/strict`) deployed to **Cloudflare Workers** via `@astrojs/cloudflare`. Worker config lives in `wrangler.jsonc`.
- **Products** are Markdown/JSON files in the repo (Astro content collections), not a database or CMS.
- **Payments** go through **Stripe Checkout** (hosted checkout page; no card data touches our code).
- **Prices are in EUR.** Store amounts as integer cents to match Stripe's `unit_amount`; format for display only.

## Commands

- `npm run dev`: local dev server
- `npm run build`: production build into `dist/`
- `npm run preview`: preview the built Worker locally
- `npm run generate-types`: regenerate `worker-configuration.d.ts` from `wrangler.jsonc`

Do not deploy unless explicitly asked.

## Working rules

- Commit after each working step: once a change builds and runs, commit it before starting the next one.

## Launch checklist

The site is currently hidden from search engines by `public/_headers` (`X-Robots-Tag: noindex, nofollow` on all paths). At launch, in this order:

1. Delete `public/_headers` and deploy.
2. Attach the karniktochi.com custom domain to the Worker.
3. After the domain is attached and serving, disable the `workers.dev` address (`"workers_dev": false` in `wrangler.jsonc`, or in the Cloudflare dashboard).
