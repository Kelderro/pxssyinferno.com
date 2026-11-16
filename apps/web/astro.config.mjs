// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Production origin. Used for canonical URLs, og:url, absolute og:image and
  // the sitemap. Preview deploys (*.pages.dev) still point their canonical here.
  site: 'https://pxssyinferno.com',
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
