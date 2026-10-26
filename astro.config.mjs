// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // No server-side sessions: the cart is client-side and checkout is on Stripe.
  // This stops the adapter from adding a SESSION KV binding.
  session: false,
  adapter: cloudflare({
    // Product images are static, so optimize them at build time
    // instead of using the Cloudflare Images (IMAGES) binding.
    imageService: 'compile',
  }),
});
