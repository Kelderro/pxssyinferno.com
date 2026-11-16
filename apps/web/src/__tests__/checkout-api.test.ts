import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error -- plain JS Pages Function, no type declarations
import { onRequestPost } from '../../functions/api/checkout.js'

// ─── Fixtures: what Sanity returns ───────────────────────────────────────────

const PRODUCTS = [
  {
    _id: 'jacket',
    title: 'Inferno Jacket',
    price: 200,
    priceGbp: 175,
    isReadyToShip: true,
    variants: [
      { _key: 'j-m', size: 'M', color: 'Black', stock: 3 },
      { _key: 'j-xl', size: 'XL', color: 'Black', stock: 1, price: 250, priceGbp: 215 },
      // Same size + colour as j-m (e.g. differs in a property added later); only the key tells them apart.
      { _key: 'j-m2', size: 'M', color: 'Black', stock: 1, price: 230, priceGbp: 200 },
    ],
  },
  {
    _id: 'tee',
    title: 'Flame Tee',
    price: 60,
    salePrice: 45,
    priceGbp: 52,
    salePriceGbp: 39,
    isReadyToShip: true,
    stock: 5,
  },
  {
    _id: 'eur-only',
    title: 'Euro Bag',
    price: 80,
    isReadyToShip: true,
    stock: 2,
  },
]

let stripeBody: URLSearchParams | null = null

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.api.sanity.io')) {
      const ids: string[] = JSON.parse(parsed.searchParams.get('$ids') || '[]')
      return new Response(JSON.stringify({ result: PRODUCTS.filter((p) => ids.includes(p._id)) }))
    }
    if (url === 'https://api.stripe.com/v1/checkout/sessions') {
      stripeBody = new URLSearchParams(String(init?.body))
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/test' }))
    }
    throw new Error('Unexpected fetch ' + url)
  })
}

const env = { STRIPE_SECRET_KEY: 'sk_test_x' }

function post(body: unknown, envOverride: Record<string, string> = {}) {
  const request = new Request('https://example.test/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return onRequestPost({ request, env: { ...env, ...envOverride } }) as Promise<Response>
}

/** line_items[i][price_data][...] fields from the captured Stripe form */
function lineItem(i: number) {
  const get = (k: string) => stripeBody?.get(`line_items[${i}][price_data][${k}]`)
  return { currency: get('currency'), unitAmount: Number(get('unit_amount')), quantity: Number(stripeBody?.get(`line_items[${i}][quantity]`)) }
}

beforeEach(() => {
  stripeBody = null
  vi.stubGlobal('fetch', mockFetch())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/checkout currency', () => {
  it('creates a GBP session with the GBP prices from Sanity', async () => {
    const res = await post({
      currency: 'gbp',
      items: [
        { id: 'jacket', size: 'M', color: 'Black', quantity: 2 },
        { id: 'jacket', size: 'XL', color: 'Black', quantity: 1 },
        { id: 'tee', quantity: 1 },
      ],
    })
    expect(res.status).toBe(200)
    expect(lineItem(0)).toEqual({ currency: 'gbp', unitAmount: 17500, quantity: 2 })
    expect(lineItem(1)).toEqual({ currency: 'gbp', unitAmount: 21500, quantity: 1 }) // variant £ override
    expect(lineItem(2)).toEqual({ currency: 'gbp', unitAmount: 3900, quantity: 1 }) // £ sale price
    expect(stripeBody?.get('metadata[currency]')).toBe('gbp')
  })

  it('creates a EUR session with the EUR prices from Sanity', async () => {
    const res = await post({
      currency: 'eur',
      items: [
        { id: 'jacket', size: 'XL', color: 'Black', quantity: 1 },
        { id: 'tee', quantity: 1 },
      ],
    })
    expect(res.status).toBe(200)
    expect(lineItem(0)).toEqual({ currency: 'eur', unitAmount: 25000, quantity: 1 })
    expect(lineItem(1)).toEqual({ currency: 'eur', unitAmount: 4500, quantity: 1 })
  })

  it('ignores prices sent by the browser', async () => {
    await post({ currency: 'gbp', items: [{ id: 'tee', quantity: 1, price: 1, prices: { gbp: 1 } }] })
    expect(lineItem(0).unitAmount).toBe(3900)
  })

  it('falls back to EUR for an unknown currency', async () => {
    const res = await post({ currency: 'usd', items: [{ id: 'tee', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(lineItem(0)).toMatchObject({ currency: 'eur', unitAmount: 4500 })
  })

  it('falls back to EUR when no currency is sent', async () => {
    await post({ items: [{ id: 'tee', quantity: 1 }] })
    expect(lineItem(0).currency).toBe('eur')
  })

  it('uses STRIPE_CURRENCY as the default when it is allowed', async () => {
    await post({ items: [{ id: 'tee', quantity: 1 }] }, { STRIPE_CURRENCY: 'GBP' })
    expect(lineItem(0)).toMatchObject({ currency: 'gbp', unitAmount: 3900 })
  })

  it('accepts an upper-case currency', async () => {
    await post({ currency: 'GBP', items: [{ id: 'tee', quantity: 1 }] })
    expect(lineItem(0).currency).toBe('gbp')
  })

  it('rejects a GBP checkout for a product without a GBP price (409)', async () => {
    const res = await post({ currency: 'gbp', items: [{ id: 'tee', quantity: 1 }, { id: 'eur-only', quantity: 1 }] })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.code).toBe('currency_unavailable')
    expect(data.error).toContain('Euro Bag')
    expect(stripeBody).toBeNull()
  })

  it('still sells that product in EUR', async () => {
    const res = await post({ currency: 'eur', items: [{ id: 'eur-only', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(lineItem(0)).toMatchObject({ currency: 'eur', unitAmount: 8000 })
  })
})

describe('POST /api/checkout stock', () => {
  it('accepts a quantity equal to the stock of a product without variants', async () => {
    const res = await post({ items: [{ id: 'eur-only', quantity: 2 }] })
    expect(res.status).toBe(200)
    expect(lineItem(0).quantity).toBe(2)
  })

  it('rejects more than the stock of a product without variants (409)', async () => {
    const res = await post({ items: [{ id: 'eur-only', quantity: 3 }] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('not available in that quantity')
    expect(stripeBody).toBeNull()
  })

  it('rejects more than the variant stock (409)', async () => {
    const res = await post({ items: [{ id: 'jacket', size: 'XL', color: 'Black', quantity: 2 }] })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })

  it('adds up lines for the same variant before checking stock', async () => {
    const res = await post({
      items: [
        { id: 'jacket', size: 'M', color: 'Black', quantity: 2 },
        { id: 'jacket', size: 'M', color: 'Black', quantity: 2 },
      ],
    })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })

  it('adds up lines for the same product without variants before checking stock', async () => {
    const res = await post({ items: [{ id: 'eur-only', quantity: 1 }, { id: 'eur-only', quantity: 2 }] })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })
})

// Lines without variantKey (the stock tests above) exercise the size + colour fallback.
describe('POST /api/checkout variant key', () => {
  const meta = (i: number, k: string) => stripeBody?.get(`line_items[${i}][price_data][product_data][metadata][${k}]`)

  it('sells the variant named by variantKey, and labels it from Sanity, not the browser', async () => {
    // The browser's size is wrong on purpose: the key decides.
    const res = await post({ items: [{ id: 'jacket', variantKey: 'j-xl', size: 'M', color: 'Black', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(lineItem(0).unitAmount).toBe(25000)
    expect(meta(0, 'variant_key')).toBe('j-xl')
    expect(meta(0, 'size')).toBe('XL')
    expect(stripeBody?.get('line_items[0][price_data][product_data][name]')).toBe('Inferno Jacket — Black / XL')
  })

  it('tells apart two variants with the same size and colour', async () => {
    const res = await post({ items: [{ id: 'jacket', variantKey: 'j-m2', size: 'M', color: 'Black', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(lineItem(0).unitAmount).toBe(23000)
    expect(meta(0, 'variant_key')).toBe('j-m2')
  })

  it('checks stock of the keyed variant, not its size + colour lookalike', async () => {
    // j-m has 3 in stock, j-m2 only 1.
    const res = await post({ items: [{ id: 'jacket', variantKey: 'j-m2', size: 'M', color: 'Black', quantity: 2 }] })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })

  it('refuses an unknown key instead of falling back to size + colour (409)', async () => {
    const res = await post({ items: [{ id: 'jacket', variantKey: 'deleted', size: 'M', color: 'Black', quantity: 1 }] })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })

  it('adds a keyed line and a keyless (old cart) line for the same variant before checking stock', async () => {
    // j-xl has 1 in stock; the old line resolves to it via size + colour.
    const res = await post({
      items: [
        { id: 'jacket', variantKey: 'j-xl', size: 'XL', color: 'Black', quantity: 1 },
        { id: 'jacket', size: 'XL', color: 'Black', quantity: 1 },
      ],
    })
    expect(res.status).toBe(409)
    expect(stripeBody).toBeNull()
  })

  it('records the resolved key for a keyless (old cart) line too', async () => {
    const res = await post({ items: [{ id: 'jacket', size: 'XL', color: 'Black', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(meta(0, 'variant_key')).toBe('j-xl')
  })
})
