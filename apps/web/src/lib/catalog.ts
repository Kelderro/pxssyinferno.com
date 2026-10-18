/**
 * Shared catalog helpers used by the Astro pages (index / shop / product).
 *
 * IMPORTANT: the pricing rule in `effectivePrice()` is intentionally mirrored,
 * in plain JS, inside `functions/api/checkout.js`. If you change how the
 * effective/sale price is calculated here, update it there too. The checkout
 * function is the authoritative source of truth for what a customer is charged.
 */

export type Variant = {
  color?: string
  size?: string
  stock?: number
  price?: number
  swatchColor?: string
}

export type CustomChoice = {
  label: string
  priceDelta?: number
  swatchColor?: string
}

export type CustomOptionGroup = {
  label: string
  required?: boolean
  showSwatches?: boolean
  choices?: CustomChoice[]
}

export type Product = {
  _id: string
  title: string
  slug?: { current: string }
  price: number
  salePrice?: number
  saleStartDate?: string
  saleEndDate?: string
  category?: string
  isReadyToShip?: boolean
  variants?: Variant[]
  customOptions?: CustomOptionGroup[]
  images?: any[]
  description?: any
  stock?: number
  mainImage?: any
  hoverImage?: any
}

/**
 * GROQ projection shared by every product query so the pages all read the
 * same real schema fields (no more phantom `sizes` / `isOnSale` / `isSoldOut`).
 */
export const PRODUCT_FIELDS = `
  _id,
  title,
  slug,
  price,
  salePrice,
  saleStartDate,
  saleEndDate,
  category,
  isReadyToShip,
  variants,
  customOptions,
  stock,
  "mainImage": images[0],
  "hoverImage": images[1]
`

export const PRODUCT_DETAIL_FIELDS = `
  _id,
  title,
  slug,
  price,
  salePrice,
  saleStartDate,
  saleEndDate,
  category,
  isReadyToShip,
  variants,
  customOptions,
  description,
  images,
  stock
`

/** A made-to-order piece: "Ready to Ship" switched OFF in Sanity. */
export function isCustom(p: Product): boolean {
  return p?.isReadyToShip === false
}

/** Price after applying an active sale window. Falls back to regular price. */
export function effectivePrice(p: Product, now: number = Date.now()): number {
  const base = Number(p?.price) || 0
  const sale = Number(p?.salePrice)
  if (!sale || sale <= 0 || sale >= base) return base
  const startOk = !p?.saleStartDate || new Date(p.saleStartDate).getTime() <= now
  const endOk = !p?.saleEndDate || new Date(p.saleEndDate).getTime() >= now
  return startOk && endOk ? sale : base
}

export function isOnSale(p: Product, now: number = Date.now()): boolean {
  return effectivePrice(p, now) < (Number(p?.price) || 0)
}

/**
 * Price of a single variant: its own override if set, else the product's
 * effective (sale-aware) price. KEEP IN SYNC with functions/api/checkout.js.
 */
export function variantPrice(p: Product, v: Variant, now: number = Date.now()): number {
  const vp = Number(v?.price)
  if (vp && vp > 0) return vp
  return effectivePrice(p, now)
}

/** Min / max price across a product's variants (for "From €X" display). */
export function variantPriceRange(
  p: Product,
  now: number = Date.now()
): { min: number; max: number; varies: boolean } {
  const vs = Array.isArray(p?.variants) ? p.variants : []
  if (!vs.length) {
    const e = effectivePrice(p, now)
    return { min: e, max: e, varies: false }
  }
  const prices = vs.map((v) => variantPrice(p, v, now))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return { min, max, varies: max > min }
}

/** Lowest sellable price for a product (the "From" price on cards). */
export function priceFrom(p: Product, now: number = Date.now()): number {
  return variantPriceRange(p, now).min
}

/** Distinct, in-order sizes derived from the variants array. */
export function productSizes(p: Product): string[] {
  const vs = Array.isArray(p?.variants) ? p.variants : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of vs) {
    const s = (v?.size || '').trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

/** Distinct colours derived from the variants array. */
export function productColors(p: Product): string[] {
  const vs = Array.isArray(p?.variants) ? p.variants : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of vs) {
    const c = (v?.color || '').trim()
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

/** Total stock: sum of variant stock, or the fallback `stock` field. */
export function totalStock(p: Product): number {
  const vs = Array.isArray(p?.variants) ? p.variants : []
  if (vs.length) return vs.reduce((acc, v) => acc + (Number(v?.stock) || 0), 0)
  return Number(p?.stock) || 0
}

/** Sold out only applies to ready-to-ship pieces. */
export function isSoldOut(p: Product): boolean {
  if (isCustom(p)) return false
  return totalStock(p) <= 0
}

/** "€340" for whole euros, "€340.50" otherwise. */
export function formatEUR(n: number | string | undefined | null): string {
  const num = Number(n) || 0
  return '€' + (Number.isInteger(num) ? String(num) : num.toFixed(2))
}

/** Display labels for the category slugs stored on products. */
export const CATEGORY_LABELS: Record<string, string> = {
  jackets: 'Jackets',
  't-shirts': 'T-Shirts',
  bags: 'Bags & Totes',
  accessories: 'Accessories',
}

export function categoryLabel(c?: string): string {
  if (!c) return ''
  return CATEGORY_LABELS[c] || c.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}
