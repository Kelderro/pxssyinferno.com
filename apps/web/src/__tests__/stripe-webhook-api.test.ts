import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  onRequestPost,
  verifyStripeSignature,
  buildStockPatches,
  markerId,
  // @ts-expect-error -- plain JS Pages Function, no type declarations
} from '../../functions/api/stripe-webhook.js'

const SECRET = 'whsec_test'
const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET, SANITY_WRITE_TOKEN: 'sk_sanity' }

function sign(body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) {
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return `t=${t},v1=${sig}`
}

function lineItem(productId: string, quantity: number, meta: Record<string, string> = {}) {
  return { id: `li_${productId}_${quantity}`, quantity, price: { product: { metadata: { product_id: productId, ...meta } } } }
}

// ─── Fixtures: Sanity documents (published + an open draft) ──────────────────

const DOCS = [
  {
    _id: 'jacket',
    variants: [
      { _key: 'k-m', size: 'M', color: 'Black' },
      { _key: 'k-xl', size: 'XL', color: 'Black' },
    ],
  },
  {
    _id: 'drafts.jacket',
    variants: [
      { _key: 'k-m', size: 'M', color: 'Black' },
      { _key: 'k-xl', size: 'XL', color: 'Black' },
    ],
  },
  { _id: 'tee' },
]

let lineItems: unknown[] = []
let mutateBodies: { mutations: any[] }[] = []
let mutateStatus = 200
/** Simulates a concurrent delivery: the next marker check misses a marker that exists. */
let hideMarkerOnce = false
const processed = new Set<string>()

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'api.stripe.com' && parsed.pathname.endsWith('/line_items')) {
      return new Response(JSON.stringify({ data: lineItems, has_more: false }))
    }
    if (parsed.hostname.endsWith('.api.sanity.io') && parsed.pathname.includes('/data/query/')) {
      expect(parsed.searchParams.get('perspective')).toBe('raw')
      const ids: string[] = JSON.parse(parsed.searchParams.get('$ids') || '[]')
      const marker: string = JSON.parse(parsed.searchParams.get('$marker') || '""')
      const done = hideMarkerOnce ? ((hideMarkerOnce = false), false) : processed.has(marker)
      return new Response(JSON.stringify({ result: { docs: DOCS.filter((d) => ids.includes(d._id)), done } }))
    }
    if (parsed.hostname.endsWith('.api.sanity.io') && parsed.pathname.includes('/data/mutate/')) {
      const body = JSON.parse(String(init?.body))
      mutateBodies.push(body)
      // Mimic Sanity: creating an existing marker fails the whole transaction.
      // The status for that isn't documented, so deliberately not 409 here.
      const marker = body.mutations.find((m: any) => m.create)?.create?._id
      if (marker && processed.has(marker)) return new Response('{"error":"exists"}', { status: 400 })
      if (mutateStatus !== 200) return new Response('{}', { status: mutateStatus })
      if (marker) processed.add(marker)
      return new Response(JSON.stringify({ results: [] }))
    }
    throw new Error('Unexpected fetch ' + url)
  })
}

function event(type: string, session: Record<string, unknown>) {
  return JSON.stringify({ id: 'evt_1', type, data: { object: session } })
}

function post(body: string, signature: string | null = sign(body), envOverride: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (signature !== null) headers['stripe-signature'] = signature
  const request = new Request('https://example.test/api/stripe-webhook', { method: 'POST', headers, body })
  return onRequestPost({ request, env: { ...env, ...envOverride } }) as Promise<Response>
}

const paid = (id = 'cs_test_1') => event('checkout.session.completed', { id, payment_status: 'paid' })

beforeEach(() => {
  lineItems = []
  mutateBodies = []
  mutateStatus = 200
  hideMarkerOnce = false
  processed.clear()
  vi.stubGlobal('fetch', mockFetch())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Signature verification ──────────────────────────────────────────────────

describe('verifyStripeSignature', () => {
  const body = '{"hello":"world"}'

  it('accepts a correctly signed, fresh body', async () => {
    expect(await verifyStripeSignature(body, sign(body), SECRET)).toBe(true)
  })

  it('accepts when any of several v1 signatures matches (secret rotation)', async () => {
    const t = Math.floor(Date.now() / 1000)
    const good = sign(body, t).split('v1=')[1]
    expect(await verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${good}`, SECRET)).toBe(true)
  })

  it('rejects a tampered body', async () => {
    expect(await verifyStripeSignature(body + ' ', sign(body), SECRET)).toBe(false)
  })

  it('rejects the wrong secret', async () => {
    expect(await verifyStripeSignature(body, sign(body, undefined, 'whsec_other'), SECRET)).toBe(false)
  })

  it('rejects an old timestamp (replay)', async () => {
    const old = Math.floor(Date.now() / 1000) - 301
    expect(await verifyStripeSignature(body, sign(body, old), SECRET)).toBe(false)
  })

  it('rejects a missing or malformed header', async () => {
    expect(await verifyStripeSignature(body, null, SECRET)).toBe(false)
    expect(await verifyStripeSignature(body, 'garbage', SECRET)).toBe(false)
    expect(await verifyStripeSignature(body, 't=123', SECRET)).toBe(false)
  })
})

// ─── Patch building ──────────────────────────────────────────────────────────

describe('buildStockPatches', () => {
  it('reduces the matching variant on both the published doc and the draft', () => {
    const { patches, skipped } = buildStockPatches([lineItem('jacket', 1, { size: 'XL', color: 'Black' })], DOCS)
    expect(skipped).toEqual([])
    const path = 'variants[_key=="k-xl"].stock'
    expect(patches).toEqual([
      { patch: { id: 'jacket', setIfMissing: { [path]: 0 } } },
      { patch: { id: 'jacket', dec: { [path]: 1 } } },
      { patch: { id: 'drafts.jacket', setIfMissing: { [path]: 0 } } },
      { patch: { id: 'drafts.jacket', dec: { [path]: 1 } } },
    ])
  })

  it('reduces the product-level stock when there are no variants', () => {
    const { patches } = buildStockPatches([lineItem('tee', 2)], DOCS)
    expect(patches).toEqual([
      { patch: { id: 'tee', setIfMissing: { stock: 0 } } },
      { patch: { id: 'tee', dec: { stock: 2 } } },
    ])
  })

  it('adds up the same piece split over several lines', () => {
    const { patches } = buildStockPatches([lineItem('tee', 1), lineItem('tee', 2)], DOCS)
    expect(patches[1].patch.dec).toEqual({ stock: 3 })
  })

  it('groups different variants of one product into one patch per document', () => {
    const { patches } = buildStockPatches(
      [lineItem('jacket', 1, { size: 'M', color: 'Black' }), lineItem('jacket', 2, { size: 'XL', color: 'Black' })],
      DOCS.filter((d) => d._id === 'jacket')
    )
    expect(patches).toHaveLength(2)
    expect(patches[1].patch.dec).toEqual({ 'variants[_key=="k-m"].stock': 1, 'variants[_key=="k-xl"].stock': 2 })
  })

  it('skips products that no longer exist or variants that do not match', () => {
    const { patches, skipped } = buildStockPatches(
      [lineItem('gone', 1), lineItem('jacket', 1, { size: 'S', color: 'Black' })],
      DOCS.filter((d) => d._id === 'jacket')
    )
    expect(patches).toEqual([])
    expect(skipped).toHaveLength(2)
  })

  it('ignores line items without product metadata or a valid quantity', () => {
    const { patches, skipped } = buildStockPatches(
      [{ quantity: 1, price: { product: { metadata: {} } } }, lineItem('tee', 0)],
      DOCS
    )
    expect(patches).toEqual([])
    expect(skipped).toEqual([])
  })
})

describe('markerId', () => {
  it('uses a dotted (non-public) id and strips unsafe characters', () => {
    expect(markerId('cs_test_a1B2')).toBe('stripe-checkout.cs_test_a1B2')
    expect(markerId('cs/../x')).toBe('stripe-checkout.cs____x')
  })
})

// ─── The endpoint ────────────────────────────────────────────────────────────

describe('POST /api/stripe-webhook', () => {
  it('reduces stock and creates the marker in one transaction', async () => {
    lineItems = [lineItem('jacket', 1, { size: 'XL', color: 'Black' }), lineItem('tee', 2)]
    const res = await post(paid())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, updated: 3, skipped: 0 })

    expect(mutateBodies).toHaveLength(1)
    const [marker, ...patches] = mutateBodies[0].mutations
    expect(marker.create).toMatchObject({ _id: 'stripe-checkout.cs_test_1', _type: 'stripeCheckout', sessionId: 'cs_test_1' })
    // setIfMissing then dec for each document, in that order
    expect(patches.map((p) => [p.patch.id, Object.keys(p.patch)[1]])).toEqual([
      ['jacket', 'setIfMissing'], ['jacket', 'dec'],
      ['drafts.jacket', 'setIfMissing'], ['drafts.jacket', 'dec'],
      ['tee', 'setIfMissing'], ['tee', 'dec'],
    ])
  })

  it('does not reduce stock again when Stripe retries the same session', async () => {
    lineItems = [lineItem('tee', 1)]
    expect((await post(paid())).status).toBe(200)
    const retry = await post(paid())
    expect(retry.status).toBe(200)
    expect(await retry.json()).toMatchObject({ duplicate: true })
    // The retry saw the marker and never sent a second transaction.
    expect(mutateBodies).toHaveLength(1)
  })

  it('treats a failed commit as a duplicate when a concurrent delivery got there first', async () => {
    lineItems = [lineItem('tee', 1)]
    expect((await post(paid())).status).toBe(200)
    hideMarkerOnce = true // the second delivery's up-front check races past the marker
    const racer = await post(paid())
    expect(racer.status).toBe(200)
    expect(await racer.json()).toMatchObject({ duplicate: true })
    // Its transaction was sent but rejected as a whole by the marker's create.
    expect(mutateBodies).toHaveLength(2)
    expect(processed.size).toBe(1)
  })

  it('handles delayed payments when they succeed', async () => {
    lineItems = [lineItem('tee', 1)]
    const res = await post(event('checkout.session.async_payment_succeeded', { id: 'cs_async', payment_status: 'paid' }))
    expect(res.status).toBe(200)
    expect(mutateBodies).toHaveLength(1)
  })

  it('ignores a completed session that is not paid yet', async () => {
    const res = await post(event('checkout.session.completed', { id: 'cs_unpaid', payment_status: 'unpaid' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: 'checkout.session.completed' })
    expect(mutateBodies).toHaveLength(0)
  })

  it('ignores unrelated events', async () => {
    const res = await post(event('payment_intent.created', { id: 'pi_1' }))
    expect(res.status).toBe(200)
    expect(mutateBodies).toHaveLength(0)
  })

  it('rejects an invalid signature without touching Sanity', async () => {
    const body = paid()
    const res = await post(body, sign(body, undefined, 'whsec_wrong'))
    expect(res.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a request without a signature header', async () => {
    expect((await post(paid(), null)).status).toBe(400)
  })

  it('returns 500 (so Stripe retries) when not configured', async () => {
    expect((await post(paid(), undefined, { SANITY_WRITE_TOKEN: '' })).status).toBe(500)
  })

  it('returns 502 (so Stripe retries) when Sanity rejects the update', async () => {
    lineItems = [lineItem('tee', 1)]
    mutateStatus = 500
    expect((await post(paid())).status).toBe(502)
  })

  it('still records the session when nothing could be matched, and logs it', async () => {
    lineItems = [lineItem('gone', 1)]
    const res = await post(paid())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ updated: 0, skipped: 1 })
    expect(mutateBodies[0].mutations).toHaveLength(1)
    expect(console.warn).toHaveBeenCalled()
  })
})
