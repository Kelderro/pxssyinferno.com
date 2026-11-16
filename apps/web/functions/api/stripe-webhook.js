/**
 * POST /api/stripe-webhook
 * Cloudflare Pages Function.
 *
 * Reduces stock in Sanity once a Stripe Checkout payment has gone through, so
 * a one-of-a-kind piece can't be sold twice.
 *
 * Handles:
 *   checkout.session.completed               (only when payment_status is "paid")
 *   checkout.session.async_payment_succeeded (delayed methods, e.g. SEPA debit)
 * Every other event is acknowledged with 200 and ignored.
 *
 * Which stock to reduce comes from the line items' product metadata that
 * /api/checkout sets: product_id, plus variant_key (the Sanity `_key` of the
 * exact variant checkout sold). The webhook never re-derives the variant from
 * size/colour, so it can't drift from checkout when variants gain properties.
 * Only sessions without variant_key (created before it existed) fall back to
 * a size + colour match.
 *
 * IDEMPOTENT: Stripe retries webhooks. The stock patches and a marker document
 * `stripe-checkout.<session id>` are sent as ONE Sanity transaction. A retry
 * finds the marker up front and is acknowledged without changes. If two
 * deliveries race past that check, the marker's `create` fails for the second
 * one, which fails its whole transaction, so stock is reduced exactly once.
 * IDs containing a "." are not publicly readable, and the marker holds only
 * the session id and a timestamp: no customer or order data goes to Sanity.
 *
 * DRAFTS: if a product has an unpublished draft open in the Studio, the draft
 * is reduced too, so publishing it later doesn't restore the old stock.
 *
 * The site rebuild that shows "sold out" comes from the existing Sanity →
 * Cloudflare deploy-hook webhook (see DEPLOY-CLOUDFLARE.md), which fires on
 * the product update.
 *
 * Required env (Cloudflare Pages > Settings > Environment variables / Secrets):
 *   STRIPE_SECRET_KEY      (secret) to read the session's line items
 *   STRIPE_WEBHOOK_SECRET  (secret) whsec_... from the Stripe webhook endpoint
 *   SANITY_WRITE_TOKEN     (secret) Sanity API token with Editor rights
 * Optional env (same defaults as /api/checkout):
 *   SANITY_PROJECT_ID / SANITY_DATASET / SANITY_API_VERSION
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

/** Max age of a signed event, in seconds (Stripe's own libraries use 300). */
const SIGNATURE_TOLERANCE = 300

const encoder = new TextEncoder()

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string comparison, so the signature can't be guessed byte by byte. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify a `Stripe-Signature` header (t=<unix>,v1=<hex hmac>[,v1=...]) against
 * the raw request body. Returns true only for a fresh, correctly signed body.
 */
export async function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!header || !secret) return false
  let timestamp = ''
  const signatures = []
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') timestamp = v
    else if (k === 'v1') signatures.push(v)
  }
  const t = Number(timestamp)
  if (!timestamp || !Number.isFinite(t) || signatures.length === 0) return false
  if (Math.abs(now / 1000 - t) > SIGNATURE_TOLERANCE) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const expected = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)))
  return signatures.some((s) => safeEqual(s, expected))
}

function sanityBase(env) {
  const projectId = env.SANITY_PROJECT_ID || 'whp8gyuq'
  const dataset = env.SANITY_DATASET || 'production'
  let apiVersion = env.SANITY_API_VERSION || '2026-03-01'
  if (!apiVersion.startsWith('v')) apiVersion = 'v' + apiVersion
  return { root: `https://${projectId}.api.sanity.io/${apiVersion}/data`, dataset }
}

/** All line items of a Checkout Session, with their product metadata. */
async function fetchLineItems(env, sessionId) {
  const items = []
  let startingAfter = ''
  for (;;) {
    const url =
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items` +
      `?limit=100&expand[]=data.price.product` +
      (startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : '')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })
    if (!res.ok) throw new Error(`Stripe line_items failed: ${res.status}`)
    const body = await res.json()
    const data = Array.isArray(body?.data) ? body.data : []
    items.push(...data)
    if (!body?.has_more || data.length === 0) return items
    startingAfter = data[data.length - 1].id
  }
}

/**
 * Published and draft versions of the given products (with variant keys), and
 * whether this session's marker already exists.
 */
async function fetchState(env, ids, marker) {
  const { root, dataset } = sanityBase(env)
  const allIds = ids.flatMap((id) => [id, `drafts.${id}`])
  const groq = `{
    "docs": *[_id in $ids]{ _id, variants[]{ _key, size, color } },
    "done": count(*[_id == $marker]) > 0
  }`
  const url =
    `${root}/query/${dataset}?query=${encodeURIComponent(groq)}` +
    `&$ids=${encodeURIComponent(JSON.stringify(allIds))}` +
    `&$marker=${encodeURIComponent(JSON.stringify(marker))}` +
    // API versions from 2025-02-19 default to the "published" perspective, which hides drafts.
    `&perspective=raw`
  const res = await fetch(url, {
    headers: { accept: 'application/json', Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  const body = await res.json()
  return {
    docs: Array.isArray(body?.result?.docs) ? body.result.docs : [],
    done: body?.result?.done === true,
  }
}

/**
 * Turn the paid line items into Sanity patches: one patch per document, with
 * the quantity to take off each stock field. Pure, so it's easy to test.
 */
export function buildStockPatches(lineItems, docs) {
  // Total quantity per product / size / colour
  const wanted = new Map()
  for (const li of lineItems) {
    const meta = li?.price?.product?.metadata || {}
    const productId = String(meta.product_id || '').trim()
    const quantity = parseInt(li?.quantity, 10)
    if (!productId || !Number.isFinite(quantity) || quantity < 1) continue
    const variantKey = meta.variant_key ? String(meta.variant_key) : ''
    const size = meta.size ? String(meta.size) : ''
    const color = meta.color ? String(meta.color) : ''
    const key = JSON.stringify([productId, variantKey, size, color])
    const prev = wanted.get(key)
    wanted.set(key, { productId, variantKey, size, color, quantity: (prev?.quantity || 0) + quantity })
  }

  const byDoc = new Map() // doc id -> { path -> quantity }
  const add = (docId, path, qty) => {
    const paths = byDoc.get(docId) || {}
    paths[path] = (paths[path] || 0) + qty
    byDoc.set(docId, paths)
  }
  const skipped = []

  for (const w of wanted.values()) {
    const versions = docs.filter((d) => d?._id === w.productId || d?._id === `drafts.${w.productId}`)
    if (versions.length === 0) {
      skipped.push(w)
      continue
    }
    for (const doc of versions) {
      const variants = Array.isArray(doc.variants) ? doc.variants : []
      if (variants.length) {
        const v = w.variantKey
          ? // The exact variant /api/checkout sold. No attribute matching, so a
            // new variant property only ever needs handling in checkout.
            variants.find((x) => x?._key === w.variantKey)
          : // Sessions created before checkout sent variant_key: fall back to
            // checkout's old size + colour match. Safe to remove once those are settled.
            variants.find((x) => String(x?.size || '') === w.size && String(x?.color || '') === w.color)
        if (v?._key) add(doc._id, `variants[_key=="${v._key}"].stock`, w.quantity)
        else skipped.push({ ...w, docId: doc._id })
      } else {
        add(doc._id, 'stock', w.quantity)
      }
    }
  }

  // `dec` fails on a field that doesn't exist, so default it to 0 first. Two
  // separate patches (applied in order within the transaction) rather than one
  // patch with both operations, whose relative order Sanity doesn't document.
  const patches = [...byDoc.entries()].flatMap(([id, paths]) => [
    { patch: { id, setIfMissing: Object.fromEntries(Object.keys(paths).map((p) => [p, 0])) } },
    { patch: { id, dec: paths } },
  ])
  return { patches, documents: byDoc.size, skipped }
}

/** Marker document ID for a processed session (the "." keeps it out of public reads). */
export function markerId(sessionId) {
  return `stripe-checkout.${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}`
}

async function commit(env, mutations) {
  const { root, dataset } = sanityBase(env)
  const res = await fetch(`${root}/mutate/${dataset}?returnIds=false&visibility=sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.SANITY_WRITE_TOKEN}`,
    },
    body: JSON.stringify({ mutations }),
  })
  return res
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.SANITY_WRITE_TOKEN) {
    // 500 makes Stripe retry, so nothing is lost while the env is being set up.
    return json({ error: 'Webhook is not configured.' }, 500)
  }

  const rawBody = await request.text()
  const ok = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET)
  if (!ok) return json({ error: 'Invalid signature.' }, 400)

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid payload.' }, 400)
  }

  const session = event?.data?.object
  const paid =
    (event?.type === 'checkout.session.completed' && session?.payment_status === 'paid') ||
    event?.type === 'checkout.session.async_payment_succeeded'
  if (!paid || !session?.id) {
    return json({ received: true, ignored: event?.type || 'unknown' })
  }

  let lineItems
  try {
    lineItems = await fetchLineItems(env, session.id)
  } catch (err) {
    return json({ error: 'Could not read the session from Stripe.' }, 502)
  }

  const productIds = [
    ...new Set(lineItems.map((li) => String(li?.price?.product?.metadata?.product_id || '').trim()).filter(Boolean)),
  ]
  const marker = markerId(session.id)
  let state
  try {
    state = await fetchState(env, productIds, marker)
  } catch (err) {
    return json({ error: 'Could not load products from Sanity.' }, 502)
  }
  // Already handled (a Stripe retry): acknowledge without touching stock.
  if (state.done) return json({ received: true, duplicate: true })

  const { patches, documents, skipped } = buildStockPatches(lineItems, state.docs)
  if (skipped.length) {
    console.warn('stripe-webhook: no stock to reduce for', JSON.stringify(skipped), 'session', session.id)
  }

  const mutations = [
    // `create` fails if the marker exists, which fails the whole transaction:
    // the guard against two deliveries of the same event racing each other.
    { create: { _id: marker, _type: 'stripeCheckout', sessionId: session.id, processedAt: new Date().toISOString() } },
    ...patches,
  ]

  let res
  try {
    res = await commit(env, mutations)
  } catch (err) {
    return json({ error: 'Could not reach Sanity.' }, 502)
  }
  if (!res.ok) {
    // A concurrent delivery may have committed first, making our `create` fail.
    // Sanity doesn't document a specific status for that, so check the marker.
    try {
      if ((await fetchState(env, [], marker)).done) return json({ received: true, duplicate: true })
    } catch {
      // fall through: report the original failure so Stripe retries
    }
    return json({ error: `Sanity rejected the stock update (${res.status}).` }, 502)
  }
  return json({ received: true, updated: documents, skipped: skipped.length })
}
