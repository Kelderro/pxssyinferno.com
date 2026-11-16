/**
 * schema.org structured data (JSON-LD) for search engines.
 *
 * Built from the same pricing helpers the pages use, so Google sees the same
 * price, currency and stock the shopper sees. The site is static, so this is
 * a build-time snapshot, refreshed by the Sanity → deploy-hook rebuild.
 */
import {
  CURRENCIES,
  basePrice,
  hasPriceIn,
  isCustom,
  isOnSale,
  isSoldOut,
  variantPriceRange,
  type Currency,
  type Product,
} from './catalog'

const SCHEMA = 'https://schema.org'
const BRAND = 'Pussy Inferno'

/** Plain text from Portable Text blocks (the product description field). */
export function portableTextToPlain(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks.trim()
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((b) => b && b._type === 'block' && Array.isArray(b.children))
    .map((b) => b.children.map((c: { text?: string }) => c?.text || '').join(''))
    .filter((t) => t.trim())
    .join('\n\n')
    .trim()
}

/** schema.org prices: a plain decimal string, e.g. "45.00". */
const money = (n: number) => n.toFixed(2)

/** The sale end date (YYYY-MM-DD) while a sale is running in this currency. */
function priceValidUntil(p: Product, currency: Currency, now: number): string | undefined {
  if (!p.saleEndDate || !isOnSale(p, currency, now)) return undefined
  const d = new Date(p.saleEndDate)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10)
}

function offerFor(p: Product, currency: Currency, url: string, now: number) {
  const priceCurrency = currency.toUpperCase()
  if (isCustom(p)) {
    // Made to order: the "From" price; the final price is quoted by hand.
    return {
      '@type': 'Offer',
      url,
      priceCurrency,
      price: money(basePrice(p, currency)),
      availability: `${SCHEMA}/MadeToOrder`,
    }
  }
  const range = variantPriceRange(p, currency, now)
  const availability = `${SCHEMA}/${isSoldOut(p) ? 'SoldOut' : 'InStock'}`
  const validUntil = priceValidUntil(p, currency, now)
  if (range.varies) {
    // Variants priced differently (e.g. a bigger size costs more).
    return {
      '@type': 'AggregateOffer',
      url,
      priceCurrency,
      lowPrice: money(range.min),
      highPrice: money(range.max),
      offerCount: Array.isArray(p.variants) ? p.variants.length : 1,
      availability,
    }
  }
  return {
    '@type': 'Offer',
    url,
    priceCurrency,
    price: money(range.min),
    availability,
    ...(validUntil ? { priceValidUntil: validUntil } : {}),
  }
}

/**
 * Product JSON-LD with one offer per currency the piece is sold in
 * (a product without a £ price only gets the € offer).
 */
export function productJsonLd(
  p: Product,
  opts: { url: string; images?: string[]; description?: string },
  now: number = Date.now()
) {
  const offers = CURRENCIES.filter((c) => hasPriceIn(p, c, now)).map((c) => offerFor(p, c, opts.url, now))
  const description = opts.description || portableTextToPlain(p.description)
  return {
    '@context': SCHEMA,
    '@type': 'Product',
    name: p.title,
    url: opts.url,
    ...(opts.images?.length ? { image: opts.images } : {}),
    ...(description ? { description } : {}),
    sku: p.slug?.current || p._id,
    ...(p.category ? { category: p.category } : {}),
    brand: { '@type': 'Brand', name: BRAND },
    ...(offers.length ? { offers: offers.length === 1 ? offers[0] : offers } : {}),
  }
}

/**
 * JSON for inside <script type="application/ld+json">. Escapes "<" so a
 * product title or description containing "</script>" can't break out.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
