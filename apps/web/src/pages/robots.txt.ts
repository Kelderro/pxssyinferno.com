import type { APIRoute } from 'astro'

// Generated (not a static file in public/) so the Sitemap line follows the
// configured `site` (SITE_URL) when the custom domain goes live.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site).href
  const body = [
    'User-agent: *',
    '# Checkout result pages and the server functions are not content.',
    'Disallow: /checkout/',
    'Disallow: /api/',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
