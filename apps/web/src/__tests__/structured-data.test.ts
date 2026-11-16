import { describe, it, expect } from 'vitest'
import { productJsonLd, portableTextToPlain, jsonLdScript } from '../lib/structured-data'
import type { Product } from '../lib/catalog'

const NOW = new Date('2026-06-15T12:00:00Z').getTime()
const URL = 'https://pxssyinferno.com/products/flame-tee/'

const base: Product = {
  _id: 'tee',
  title: 'Flame Tee',
  slug: { current: 'flame-tee' },
  price: 60,
  priceGbp: 52,
  isReadyToShip: true,
  stock: 2,
  category: 'tops',
}

const ld = (p: Partial<Product>, opts: Partial<{ images: string[]; description: string }> = {}) =>
  productJsonLd({ ...base, ...p } as Product, { url: URL, ...opts }, NOW) as any

describe('productJsonLd', () => {
  it('describes the product with one offer per currency', () => {
    const data = ld({}, { images: ['https://cdn.sanity.io/a.jpg'] })
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Flame Tee',
      url: URL,
      image: ['https://cdn.sanity.io/a.jpg'],
      sku: 'flame-tee',
      category: 'tops',
      brand: { '@type': 'Brand', name: 'Pussy Inferno' },
    })
    expect(data.offers).toEqual([
      { '@type': 'Offer', url: URL, priceCurrency: 'EUR', price: '60.00', availability: 'https://schema.org/InStock' },
      { '@type': 'Offer', url: URL, priceCurrency: 'GBP', price: '52.00', availability: 'https://schema.org/InStock' },
    ])
  })

  it('only offers € when there is no £ price', () => {
    const data = ld({ priceGbp: undefined })
    expect(data.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'EUR' })
  })

  it('marks a sold-out piece as SoldOut', () => {
    expect(ld({ stock: 0 }).offers[0].availability).toBe('https://schema.org/SoldOut')
  })

  it('uses the sale price and says when it ends', () => {
    const data = ld({ salePrice: 45, salePriceGbp: 39, saleEndDate: '2026-06-30T23:59:00Z' })
    expect(data.offers[0]).toMatchObject({ price: '45.00', priceValidUntil: '2026-06-30' })
    expect(data.offers[1]).toMatchObject({ price: '39.00', priceValidUntil: '2026-06-30' })
  })

  it('ignores a sale that has not started yet', () => {
    const data = ld({ salePrice: 45, saleStartDate: '2026-07-01T00:00:00Z', saleEndDate: '2026-07-31T00:00:00Z' })
    expect(data.offers[0].price).toBe('60.00')
    expect(data.offers[0].priceValidUntil).toBeUndefined()
  })

  it('gives a price range when variants are priced differently', () => {
    const data = ld({
      stock: undefined,
      variants: [
        { size: 'M', stock: 1 },
        { size: 'XL', stock: 0, price: 75, priceGbp: 65 },
      ],
    })
    expect(data.offers[0]).toEqual({
      '@type': 'AggregateOffer',
      url: URL,
      priceCurrency: 'EUR',
      lowPrice: '60.00',
      highPrice: '75.00',
      offerCount: 2,
      availability: 'https://schema.org/InStock',
    })
  })

  it('offers made-to-order pieces at their starting price', () => {
    const data = ld({ isReadyToShip: false, stock: undefined, priceGbp: undefined })
    expect(data.offers).toEqual({
      '@type': 'Offer',
      url: URL,
      priceCurrency: 'EUR',
      price: '60.00',
      availability: 'https://schema.org/MadeToOrder',
    })
  })

  it('leaves out offers when the piece has no price at all', () => {
    expect(ld({ price: 0, priceGbp: 0 }).offers).toBeUndefined()
  })

  it('takes the description from the Portable Text field', () => {
    const description = [
      { _type: 'block', children: [{ text: 'Hand-painted ' }, { text: 'tee.' }] },
      { _type: 'image' },
      { _type: 'block', children: [{ text: 'Sealed.' }] },
    ]
    expect(ld({ description }).description).toBe('Hand-painted tee.\n\nSealed.')
  })
})

describe('portableTextToPlain', () => {
  it('handles empty and plain-string values', () => {
    expect(portableTextToPlain(undefined)).toBe('')
    expect(portableTextToPlain('  hi ')).toBe('hi')
  })
})

describe('jsonLdScript', () => {
  it('escapes "<" so a title cannot close the script tag', () => {
    const out = jsonLdScript({ name: 'Bad </script><script>alert(1)</script>' })
    expect(out).not.toContain('</script>')
    expect(JSON.parse(out).name).toBe('Bad </script><script>alert(1)</script>')
  })
})
