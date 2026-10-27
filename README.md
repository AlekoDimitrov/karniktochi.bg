# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

# Karnik Tochi storefront (Bulgarian) — how to apply

Built and tested against a fresh Astro 7 + Cloudflare adapter scaffold. Contains the home page, shop listing,
category pages, product pages, the bubble duck and 6 clearly-marked DEMO products. No cart/checkout yet.

## 1. Add the files to your repo
Unzip at the repo root (it overwrites `src/pages/index.astro`). It only touches `src/` and `public/`.
Do NOT overwrite `astro.config.mjs`, `wrangler.jsonc`, `public/_headers` or `CLAUDE.md`.

Delete the old Astro default icons if present: `public/favicon.svg`, `public/favicon.ico`.

## 2. Install the two fonts (self-hosted, so no requests to Google)
```
npm install @fontsource-variable/rubik @fontsource-variable/golos-text
```

## 3. Check it
```
npm run dev      # look at http://localhost:4321
npm run build    # must pass
```

## 4. Append to CLAUDE.md
- Site is Bulgarian first (`lang="bg"`). All UI text lives in `src/i18n/bg.ts`; add `en.ts` later with Astro i18n routing.
- Prices are integer euro cents; format only with `formatPrice()` (`src/lib/format.ts`).
- Products are Markdown files in `src/content/products/` (schema in `src/content.config.ts`).
- Demo products have `placeholder: true` and show a red ДЕМО ribbon. Delete them before launch.
- `LAUNCH=1` (build variable) makes the build FAIL if any demo product remains and removes the noindex meta tag.
- Hero bubble logic: `src/scripts/bubble.ts` (respects reduced-motion, pauses off-screen).
- Cart, Stripe checkout and the legal pages are not built yet (buttons/links are placeholders).

## 5. Launch checklist (adds to the existing one)
1. Replace demo products with real ones (real photos go through `images:` in the product front matter).
2. Fill every `[bracketed]` placeholder in `src/i18n/bg.ts`.
3. Delete `public/_headers` noindex rule, set build variable `LAUNCH=1` in Cloudflare, redeploy.
4. Attach the domain, then set `"workers_dev": false` in `wrangler.jsonc`.

## Notes
- Product photos use `astro:assets`. That works with build-time image optimization (`imageService: 'compile'`).
  If your adapter config still uses the Cloudflare Images binding, switch it before adding real photos.
- During `astro build` you may see "Unable to fetch the Request.cf object". It is harmless.
