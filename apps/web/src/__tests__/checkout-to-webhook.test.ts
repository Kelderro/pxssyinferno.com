/**
 * Checkout and the stock webhook must agree on WHICH variant was sold.
 * This runs a cart through /api/checkout, turns the Stripe form it sent into
 * the line items Stripe would return, and feeds those to the webhook's patch
 * builder: the variant checkout picked must be the one whose stock goes down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error -- plain JS Pages Function, no type declarations
import { onRequestPost as checkout } from '../../functions/api/checkout.js'
// @ts-expect-error -- plain JS Pages Function, no type declarations
import { buildStockPatches } from '../../functions/api/stripe-webhook.js'

// Two variants with the SAME size and colour (e.g. differing in a property
// added to the schema later). Only their _key tells them apart.
const PUBLISHED = {
  _id: 'jacket',
  title: 'Inferno Jacket',
  price: 200,
  isReadyToShip: true,
  variants: [
    { _key: 'k-first', size: 'M', color: 'Black', stock: 1 },
    { _key: 'k-second', size: 'M', color: 'Black', stock: 1 },
    { _key: 'k-xl', size: 'XL', color: 'Black', stock: 2 },
  ],
}
// An open draft with the same variants in a different order.
const DRAFT = { ...PUBLISHED, _id: 'drafts.jacket', variants: [...PUBLISHED.variants].reverse() }

let stripeForm: URLSearchParams | null = null

beforeEach(() => {
  stripeForm = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (new URL(url).hostname.endsWith('.api.sanity.io')) {
        return new Response(JSON.stringify({ result: [PUBLISHED] }))
      }
      if (url === 'https://api.stripe.com/v1/checkout/sessions') {
        stripeForm = new URLSearchParams(String(init?.body))
        return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/test' }))
      }
      throw new Error('Unexpected fetch ' + url)
    })
  )
})

afterEach(() => vi.unstubAllGlobals())

/** What Stripe's line_items endpoint returns for the session checkout created. */
function lineItemsFromForm(form: URLSearchParams) {
  const items = []
  for (let i = 0; form.has(`line_items[${i}][quantity]`); i++) {
    const meta: Record<string, string> = {}
    const prefix = `line_items[${i}][price_data][product_data][metadata][`
    for (const [k, v] of form) if (k.startsWith(prefix)) meta[k.slice(prefix.length, -1)] = v
    items.push({ quantity: Number(form.get(`line_items[${i}][quantity]`)), price: { product: { metadata: meta } } })
  }
  return items
}

async function buy(items: unknown[]) {
  const request = new Request('https://example.test/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items, currency: 'eur' }),
  })
  const res = (await checkout({ request, env: { STRIPE_SECRET_KEY: 'sk_test_x' } })) as Response
  expect(res.status).toBe(200)
  return lineItemsFromForm(stripeForm!)
}

/** Variant keys whose stock the webhook reduces, per document. */
function reducedKeys(lineItems: unknown[]) {
  const { patches } = buildStockPatches(lineItems, [PUBLISHED, DRAFT])
  const out: Record<string, string[]> = {}
  for (const { patch } of patches) {
    if (!patch.dec) continue
    out[patch.id] = Object.keys(patch.dec).map((p) => p.match(/_key=="([^"]+)"/)![1])
  }
  return out
}

describe('checkout → stock webhook', () => {
  it('passes the exact variant checkout sold to the webhook', async () => {
    const lineItems = await buy([{ id: 'jacket', size: 'XL', color: 'Black', quantity: 2 }])
    expect(lineItems[0].price.product.metadata).toMatchObject({ product_id: 'jacket', variant_key: 'k-xl' })
    expect(reducedKeys(lineItems)).toEqual({ jacket: ['k-xl'], 'drafts.jacket': ['k-xl'] })
  })

  it('reduces the variant checkout picked, even when another has the same size and colour', async () => {
    const lineItems = await buy([{ id: 'jacket', size: 'M', color: 'Black', quantity: 1 }])
    const sold = lineItems[0].price.product.metadata.variant_key
    expect(sold).toBe('k-first')
    // Matching by size/colour would hit k-second in the reordered draft.
    expect(reducedKeys(lineItems)).toEqual({ jacket: [sold], 'drafts.jacket': [sold] })
  })
})
