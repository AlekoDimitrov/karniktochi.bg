// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

/**
 * `astro dev` only: serves product photos from the local R2 simulation at /dev-media (src/dev/media-route.ts).
 * The route is not injected for `astro build`, so it doesn't exist in the deployed Worker.
 * @returns {import('astro').AstroIntegration}
 */
const devMedia = () => ({
  name: 'dev-media',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command === 'dev') injectRoute({ pattern: '/dev-media/[...path]', entrypoint: './src/dev/media-route.ts', prerender: false });
    },
  },
});

// https://astro.build/config
export default defineConfig({
  // No server-side sessions: the cart is client-side (localStorage).
  // This stops the adapter from adding a SESSION KV binding.
  session: false,
  integrations: [devMedia()],
  adapter: cloudflare({
    // The site's own images are static, so optimize them at build time instead of using the Cloudflare
    // Images (IMAGES) binding. Product photos don't use Astro's image service (they are in R2).
    imageService: 'compile',
  }),
});
