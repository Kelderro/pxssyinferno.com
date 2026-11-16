import { describe, it, expect } from 'vitest'
import {
  effectivePrice,
  isOnSale,
  isSoldOut,
  isCustom,
  variantPrice,
  variantPriceRange,
  priceFrom,
  productSizes,
  productColors,
  totalStock,
  formatPrice,
  hasPriceIn,
  choiceDelta,
  basePrice,
  isCurrency,
  categoryLabel,
  type Product,
  type Variant,
} from '../lib/catalog'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseProduct: Product = {
  _id: 'p1',
  title: 'Test Jacket',
  price: 200,
}

const saleProduct: Product = {
  ...baseProduct,
  salePrice: 150,
}

const timedSaleProduct: Product = {
  ...baseProduct,
  salePrice: 150,
  saleStartDate: '2026-01-01T00:00:00Z',
  saleEndDate: '2026-12-31T23:59:59Z',
}

const expiredSaleProduct: Product = {
  ...baseProduct,
  salePrice: 150,
  saleStartDate: '2025-01-01T00:00:00Z',
  saleEndDate: '2025-06-30T23:59:59Z',
}

const readyToShipProduct: Product = {
  ...baseProduct,
  isReadyToShip: true,
  variants: [
    { size: 'S', color: 'Black', stock: 2 },
    { size: 'M', color: 'Black', stock: 0 },
    { size: 'L', color: 'Red',   stock: 1 },
  ],
}

const madeToOrderProduct: Product = {
  ...baseProduct,
  isReadyToShip: false,
}

// ─── effectivePrice ───────────────────────────────────────────────────────────

describe('effectivePrice', () => {
  it('returns the base price when there is no sale price', () => {
    expect(effectivePrice(baseProduct)).toBe(200)
  })

  it('returns the sale price when it is lower than the base price and always active', () => {
    expect(effectivePrice(saleProduct)).toBe(150)
  })

  it('returns the base price when sale price equals base price', () => {
    const p: Product = { ...baseProduct, salePrice: 200 }
    expect(effectivePrice(p)).toBe(200)
  })

  it('returns the base price when sale price exceeds base price', () => {
    const p: Product = { ...baseProduct, salePrice: 300 }
    expect(effectivePrice(p)).toBe(200)
  })

  it('returns sale price within an active timed sale window', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime()
    expect(effectivePrice(timedSaleProduct, 'eur', now)).toBe(150)
  })

  it('returns base price before the sale window starts', () => {
    const now = new Date('2025-12-31T23:59:59Z').getTime()
    expect(effectivePrice(timedSaleProduct, 'eur', now)).toBe(200)
  })

  it('returns base price after the sale window ends', () => {
    const now = new Date('2027-01-01T00:00:00Z').getTime()
    expect(effectivePrice(timedSaleProduct, 'eur', now)).toBe(200)
  })

  it('returns base price for an expired sale', () => {
    expect(effectivePrice(expiredSaleProduct)).toBe(200)
  })

  it('handles missing / undefined product gracefully', () => {
    expect(effectivePrice(undefined as any)).toBe(0)
  })
})

// ─── isOnSale ─────────────────────────────────────────────────────────────────

describe('isOnSale', () => {
  it('returns true when an active sale reduces the price', () => {
    expect(isOnSale(saleProduct)).toBe(true)
  })

  it('returns false for a product without a sale price', () => {
    expect(isOnSale(baseProduct)).toBe(false)
  })

  it('returns false for an expired sale', () => {
    expect(isOnSale(expiredSaleProduct)).toBe(false)
  })
})

// ─── isCustom / isSoldOut ─────────────────────────────────────────────────────

describe('isCustom', () => {
  it('returns true when isReadyToShip is false', () => {
    expect(isCustom(madeToOrderProduct)).toBe(true)
  })

  it('returns false when isReadyToShip is true', () => {
    expect(isCustom(readyToShipProduct)).toBe(false)
  })

  it('returns false when isReadyToShip is undefined', () => {
    expect(isCustom(baseProduct)).toBe(false)
  })
})

describe('isSoldOut', () => {
  it('is never sold out for made-to-order pieces', () => {
    const noStock: Product = { ...madeToOrderProduct, stock: 0 }
    expect(isSoldOut(noStock)).toBe(false)
  })

  it('returns true for a ready-to-ship product with zero stock', () => {
    const p: Product = { ...baseProduct, isReadyToShip: true, stock: 0 }
    expect(isSoldOut(p)).toBe(true)
  })

  it('returns false for a ready-to-ship product with stock', () => {
    expect(isSoldOut(readyToShipProduct)).toBe(false) // 2 + 0 + 1 = 3
  })
})

// ─── totalStock ───────────────────────────────────────────────────────────────

describe('totalStock', () => {
  it('sums variant stock values', () => {
    expect(totalStock(readyToShipProduct)).toBe(3)
  })

  it('falls back to the root stock field when there are no variants', () => {
    const p: Product = { ...baseProduct, stock: 7 }
    expect(totalStock(p)).toBe(7)
  })

  it('returns 0 when both variants and root stock are absent', () => {
    expect(totalStock(baseProduct)).toBe(0)
  })
})

// ─── variantPrice ─────────────────────────────────────────────────────────────

describe('variantPrice', () => {
  it('uses the variant own price when set', () => {
    const v: Variant = { size: 'L', price: 250 }
    expect(variantPrice(baseProduct, v)).toBe(250)
  })

  it('falls back to the effective product price when variant has no price', () => {
    const v: Variant = { size: 'L' }
    expect(variantPrice(saleProduct, v)).toBe(150)
  })
})

// ─── variantPriceRange ────────────────────────────────────────────────────────

describe('variantPriceRange', () => {
  it('returns the min/max across variant prices', () => {
    const p: Product = {
      ...baseProduct,
      variants: [{ price: 100 }, { price: 300 }, { price: 200 }],
    }
    const range = variantPriceRange(p)
    expect(range.min).toBe(100)
    expect(range.max).toBe(300)
    expect(range.varies).toBe(true)
  })

  it('returns varies:false when all variants share the same price', () => {
    const p: Product = {
      ...baseProduct,
      variants: [{ price: 200 }, { price: 200 }],
    }
    expect(variantPriceRange(p).varies).toBe(false)
  })

  it('falls back to effectivePrice when there are no variants', () => {
    const range = variantPriceRange(saleProduct)
    expect(range.min).toBe(150)
    expect(range.max).toBe(150)
    expect(range.varies).toBe(false)
  })
})

// ─── priceFrom ────────────────────────────────────────────────────────────────

describe('priceFrom', () => {
  it('returns the cheapest variant price', () => {
    const p: Product = {
      ...baseProduct,
      variants: [{ price: 180 }, { price: 220 }],
    }
    expect(priceFrom(p)).toBe(180)
  })
})

// ─── productSizes / productColors ─────────────────────────────────────────────

describe('productSizes', () => {
  it('returns distinct sizes in order', () => {
    expect(productSizes(readyToShipProduct)).toEqual(['S', 'M', 'L'])
  })

  it('returns an empty array when there are no variants', () => {
    expect(productSizes(baseProduct)).toEqual([])
  })

  it('deduplicates repeated sizes', () => {
    const p: Product = {
      ...baseProduct,
      variants: [{ size: 'M' }, { size: 'L' }, { size: 'M' }],
    }
    expect(productSizes(p)).toEqual(['M', 'L'])
  })
})

describe('productColors', () => {
  it('returns distinct colours in order', () => {
    expect(productColors(readyToShipProduct)).toEqual(['Black', 'Red'])
  })

  it('returns an empty array when variants have no colour field', () => {
    const p: Product = { ...baseProduct, variants: [{ size: 'M' }] }
    expect(productColors(p)).toEqual([])
  })
})

// ─── formatPrice ──────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats whole euros without decimals', () => {
    expect(formatPrice(340, 'eur')).toBe('€340')
  })

  it('formats whole pounds without decimals', () => {
    expect(formatPrice(340, 'gbp')).toBe('£340')
  })

  it('formats cents / pence with two decimal places', () => {
    expect(formatPrice(99.9, 'eur')).toBe('€99.90')
    expect(formatPrice(99.9, 'gbp')).toBe('£99.90')
  })

  it('groups thousands', () => {
    expect(formatPrice(1200, 'gbp')).toBe('£1,200')
  })

  it('defaults to EUR', () => {
    expect(formatPrice(5)).toBe('€5')
  })

  it('formats 0', () => {
    expect(formatPrice(0, 'eur')).toBe('€0')
  })

  it('handles undefined gracefully', () => {
    expect(formatPrice(undefined, 'gbp')).toBe('£0')
  })

  it('handles string numbers', () => {
    expect(formatPrice('120', 'eur')).toBe('€120')
  })
})

// ─── GBP pricing ──────────────────────────────────────────────────────────────

const gbpProduct: Product = {
  ...baseProduct,
  priceGbp: 175,
  salePriceGbp: 130,
  salePrice: 150,
  saleStartDate: '2026-01-01T00:00:00Z',
  saleEndDate: '2026-12-31T23:59:59Z',
}

describe('isCurrency', () => {
  it('accepts eur and gbp only', () => {
    expect(isCurrency('eur')).toBe(true)
    expect(isCurrency('gbp')).toBe(true)
    expect(isCurrency('usd')).toBe(false)
    expect(isCurrency('GBP')).toBe(false)
    expect(isCurrency(undefined)).toBe(false)
  })
})

describe('GBP: basePrice / effectivePrice', () => {
  const during = new Date('2026-06-15T12:00:00Z').getTime()
  const after = new Date('2027-01-01T00:00:00Z').getTime()

  it('reads the manually set GBP price, not a conversion of EUR', () => {
    expect(basePrice(gbpProduct, 'gbp')).toBe(175)
    expect(basePrice(gbpProduct, 'eur')).toBe(200)
  })

  it('applies the GBP sale price inside the shared sale window', () => {
    expect(effectivePrice(gbpProduct, 'gbp', during)).toBe(130)
    expect(effectivePrice(gbpProduct, 'eur', during)).toBe(150)
  })

  it('returns the GBP regular price outside the sale window', () => {
    expect(effectivePrice(gbpProduct, 'gbp', after)).toBe(175)
  })

  it('ignores a GBP sale price that is not lower than the GBP price', () => {
    const p: Product = { ...baseProduct, priceGbp: 100, salePriceGbp: 120 }
    expect(effectivePrice(p, 'gbp')).toBe(100)
  })

  it('does not use the EUR sale price for GBP', () => {
    const p: Product = { ...saleProduct, priceGbp: 170 }
    expect(effectivePrice(p, 'gbp')).toBe(170)
    expect(isOnSale(p, 'gbp')).toBe(false)
    expect(isOnSale(p, 'eur')).toBe(true)
  })

  it('returns 0 when there is no GBP price', () => {
    expect(effectivePrice(saleProduct, 'gbp')).toBe(0)
  })

  it('isOnSale is per currency', () => {
    expect(isOnSale(gbpProduct, 'gbp', during)).toBe(true)
    expect(isOnSale(gbpProduct, 'gbp', after)).toBe(false)
  })
})

describe('GBP: variant prices', () => {
  const p: Product = {
    ...baseProduct,
    priceGbp: 170,
    variants: [
      { size: 'S', price: 200 },
      { size: 'XL', price: 250, priceGbp: 215 },
      { size: 'XXL', priceGbp: 230 },
    ],
  }

  it('uses the variant GBP override when set', () => {
    expect(variantPrice(p, p.variants![1], 'gbp')).toBe(215)
    expect(variantPrice(p, p.variants![2], 'gbp')).toBe(230)
  })

  it('falls back to the product GBP price, not the variant EUR override', () => {
    expect(variantPrice(p, p.variants![0], 'gbp')).toBe(170)
  })

  it('keeps EUR variant pricing unchanged', () => {
    expect(variantPrice(p, p.variants![1], 'eur')).toBe(250)
    expect(variantPrice(p, p.variants![2], 'eur')).toBe(200)
  })

  it('computes the GBP range and "from" price', () => {
    expect(variantPriceRange(p, 'gbp')).toEqual({ min: 170, max: 230, varies: true })
    expect(priceFrom(p, 'gbp')).toBe(170)
  })

  it('uses the GBP sale price for variants without a GBP override', () => {
    const now = new Date('2026-06-15T12:00:00Z').getTime()
    const sale: Product = { ...gbpProduct, variants: [{ size: 'M' }, { size: 'L', priceGbp: 190 }] }
    expect(variantPriceRange(sale, 'gbp', now)).toEqual({ min: 130, max: 190, varies: true })
  })
})

describe('hasPriceIn', () => {
  it('is true when the product has a price in that currency', () => {
    expect(hasPriceIn(gbpProduct, 'gbp')).toBe(true)
    expect(hasPriceIn(baseProduct, 'eur')).toBe(true)
  })

  it('is false without a GBP price', () => {
    expect(hasPriceIn(baseProduct, 'gbp')).toBe(false)
  })

  it('is false when any variant has no GBP price', () => {
    const p: Product = { ...baseProduct, variants: [{ size: 'S', priceGbp: 150 }, { size: 'M' }] }
    expect(hasPriceIn(p, 'gbp')).toBe(false)
  })

  it('is true when every variant has its own GBP price', () => {
    const p: Product = { ...baseProduct, variants: [{ size: 'S', priceGbp: 150 }, { size: 'M', priceGbp: 160 }] }
    expect(hasPriceIn(p, 'gbp')).toBe(true)
  })

  it('needs a GBP starting price for made-to-order pieces', () => {
    expect(hasPriceIn(madeToOrderProduct, 'gbp')).toBe(false)
    expect(hasPriceIn({ ...madeToOrderProduct, priceGbp: 170 }, 'gbp')).toBe(true)
  })
})

describe('choiceDelta', () => {
  it('reads the added price per currency', () => {
    const c = { label: 'Real Leather', priceDelta: 80, priceDeltaGbp: 70 }
    expect(choiceDelta(c, 'eur')).toBe(80)
    expect(choiceDelta(c, 'gbp')).toBe(70)
  })

  it('is 0 when not set', () => {
    expect(choiceDelta({ label: 'Black' }, 'gbp')).toBe(0)
  })
})

// ─── categoryLabel ────────────────────────────────────────────────────────────

describe('categoryLabel', () => {
  it('returns the human-readable label for known categories', () => {
    expect(categoryLabel('jackets')).toBe('Jackets')
    expect(categoryLabel('t-shirts')).toBe('T-Shirts')
    expect(categoryLabel('bags')).toBe('Bags & Totes')
    expect(categoryLabel('accessories')).toBe('Accessories')
  })

  it('title-cases unknown slugs', () => {
    expect(categoryLabel('hoodies')).toBe('Hoodies')
    expect(categoryLabel('swim-wear')).toBe('Swim Wear')
  })

  it('returns an empty string for undefined', () => {
    expect(categoryLabel(undefined)).toBe('')
  })
})
