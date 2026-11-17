// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// Public origin of the site, used for canonical URLs, og:url, absolute
// og:image, the sitemap and robots.txt. Same SITE_URL variable that
// /api/checkout uses for Stripe's return URLs, so cutting over to the custom
// domain (DEPLOY-CLOUDFLARE.md §5) is one setting plus a rebuild. Until then it
// is the production pages.dev address; branch previews also point here (and
// Cloudflare already sends them `x-robots-tag: noindex`).
const site = (process.env.SITE_URL || 'https://pxssyinferno-com.pages.dev').replace(/\/$/, '');

export default defineConfig({
  site,
  integrations: [
    sitemap({
      // Order confirmation / cancel pages are not content (also disallowed in robots.txt).
      filter: (page) => !new URL(page).pathname.startsWith('/checkout/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
