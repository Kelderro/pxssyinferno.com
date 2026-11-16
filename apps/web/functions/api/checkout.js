/**
 * POST /api/checkout
 * Cloudflare Pages Function.
 *
 * Creates a Stripe Checkout Session for the ready-to-ship items in the cart
 * and returns { url } for the browser to redirect to.
 *
 * SECURITY: the price the browser sends is IGNORED. Prices are re-fetched from
 * Sanity and computed here. This is the only place that decides what a customer
 * is charged. The sale-window logic below mirrors `src/lib/catalog.ts`
 * (effectivePrice / variantPrice) — keep the two in sync.
 *
 * CURRENCY: the browser sends `currency` ("eur" | "gbp"). It is allow-listed
 * and the Checkout Session is created in that currency using the prices set by
 * hand for it in Sanity (price / priceGbp, etc.). Stripe settles each currency
 * into its own balance (EUR / GBP bank account), so there is no conversion.
 * Do NOT enable Stripe Adaptive Pricing: it would convert back and defeat that.
 *
 * Required env (Cloudflare Pages > Settings > Environment variables / Secrets):
 *   STRIPE_SECRET_KEY            (secret) e.g. sk_test_...
 * Optional env (sensible defaults baked in):
 *   SANITY_PROJECT_ID            default "whp8gyuq"
 *   SANITY_DATASET               default "production"
 *   SANITY_API_VERSION           default "2026-03-01"
 *   STRIPE_CURRENCY              default "eur"; only used when the request has no valid currency
 *   SITE_URL                     e.g. https://pxssyinferno.com (else request origin)
 *   ALLOWED_SHIPPING_COUNTRIES   CSV, default "NL,BE,DE,FR,GB,US,CA,AU"
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const CURRENCIES = ['eur', 'gbp']

/** Allow-list the requested currency; anything else falls back to the default. */
function resolveCurrency(requested, fallback) {
  const r = String(requested || '').toLowerCase()
  if (CURRENCIES.includes(r)) return r
  const f = String(fallback || '').toLowerCase()
  return CURRENCIES.includes(f) ? f : 'eur'
}

/** Mirror of src/lib/catalog.ts effectivePrice(). */
function effectivePrice(p, currency = 'eur', now = Date.now()) {
  const gbp = currency === 'gbp'
  const base = Number(gbp ? p?.priceGbp : p?.price) || 0
  const sale = Number(gbp ? p?.salePriceGbp : p?.salePrice)
  if (!sale || sale <= 0 || sale >= base) return base
  const startOk = !p?.saleStartDate || new Date(p.saleStartDate).getTime() <= now
  const endOk = !p?.saleEndDate || new Date(p.saleEndDate).getTime() >= now
  return startOk && endOk ? sale : base
}

/** Mirror of src/lib/catalog.ts variantPrice(). 0 = no price in that currency. */
function variantPrice(p, v, currency = 'eur', now = Date.now()) {
  const vp = Number(currency === 'gbp' ? v?.priceGbp : v?.price)
  if (vp && vp > 0) return vp
  return effectivePrice(p, currency, now)
}

/**
 * The variant a cart line asks for. By Sanity _key when the cart sends one (an
 * unknown key means the variant is gone: null, so the line is refused). Lines
 * from carts saved before keys existed fall back to an exact size + colour match.
 */
function resolveVariant(p, w) {
  const variants = Array.isArray(p?.variants) ? p.variants : []
  if (!variants.length) return null
  if (w.variantKey) return variants.find((v) => v?._key === w.variantKey) || null
  return variants.find((v) => String(v?.size || '') === w.size && String(v?.color || '') === w.color) || null
}

function totalStock(p) {
  const vs = Array.isArray(p?.variants) ? p.variants : []
  if (vs.length) return vs.reduce((acc, v) => acc + (Number(v?.stock) || 0), 0)
  return Number(p?.stock) || 0
}

async function fetchProductsByIds(env, ids) {
  const projectId = env.SANITY_PROJECT_ID || 'whp8gyuq'
  const dataset = env.SANITY_DATASET || 'production'
  let apiVersion = env.SANITY_API_VERSION || '2026-03-01'
  if (!apiVersion.startsWith('v')) apiVersion = 'v' + apiVersion

  const groq = `*[_type == "product" && _id in $ids]{
    _id, title, price, salePrice, priceGbp, salePriceGbp, saleStartDate, saleEndDate,
    isReadyToShip, variants, stock, "image": images[0].asset->url
  }`

  const url =
    `https://${projectId}.api.sanity.io/${apiVersion}/data/query/${dataset}` +
    `?query=${encodeURIComponent(groq)}` +
    `&$ids=${encodeURIComponent(JSON.stringify(ids))}`

  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Sanity query failed: ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.result) ? body.result : []
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Payments are not configured yet.' }, 500)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const rawItems = Array.isArray(payload?.items) ? payload.items : []
  if (rawItems.length === 0) {
    return json({ error: 'Your cart is empty.' }, 400)
  }

  // Normalise + clamp client input. Only id / size / quantity are trusted as intent.
  const wanted = []
  for (const it of rawItems) {
    const id = String(it?.id || '').trim()
    if (!id) continue
    let qty = parseInt(it?.quantity, 10)
    if (!Number.isFinite(qty) || qty < 1) qty = 1
    if (qty > 99) qty = 99
    wanted.push({
      id,
      variantKey: it?.variantKey ? String(it.variantKey).slice(0, 64) : '',
      size: it?.size ? String(it.size) : '',
      color: it?.color ? String(it.color) : '',
      quantity: qty,
    })
  }
  if (wanted.length === 0) {
    return json({ error: 'No valid items in cart.' }, 400)
  }

  let products
  try {
    products = await fetchProductsByIds(env, [...new Set(wanted.map((w) => w.id))])
  } catch (err) {
    return json({ error: 'Could not load products. Please try again.' }, 502)
  }

  const byId = new Map(products.map((p) => [p._id, p]))
  const currency = resolveCurrency(payload?.currency, env.STRIPE_CURRENCY)

  // Total requested per resolved variant, so stock also holds when the same piece is
  // split over several lines (e.g. a keyed line plus one from a cart saved before keys).
  const requested = new Map()
  const variantId = (w) => {
    const p = byId.get(w.id)
    const v = p && resolveVariant(p, w)
    return v ? `${w.id}#${p.variants.indexOf(v)}` : ''
  }
  for (const w of wanted) {
    const key = variantId(w)
    if (key) requested.set(key, (requested.get(key) || 0) + w.quantity)
  }
  const requestedFor = (w) => requested.get(variantId(w)) || 0
  const requestedForProduct = (id) => wanted.filter((x) => x.id === id).reduce((s, x) => s + x.quantity, 0)

  const lineItems = []
  for (const w of wanted) {
    const p = byId.get(w.id)
    if (!p) return json({ error: 'A product in your cart is no longer available.' }, 409)
    if (p.isReadyToShip === false) {
      return json({ error: `"${p.title}" is made to order and cannot be bought directly.` }, 409)
    }
    const variants = Array.isArray(p.variants) ? p.variants : []
    let matchedVariant = null
    // Label and metadata from the variant itself once found; the browser's size/colour are only a fallback.
    let size = w.size
    let color = w.color
    const label = () => [color, size].filter(Boolean).join(' / ')
    if (variants.length) {
      matchedVariant = resolveVariant(p, w)
      if (matchedVariant) {
        size = String(matchedVariant.size || '')
        color = String(matchedVariant.color || '')
      }
      const comboLabel = label()
      const vStock = matchedVariant ? Number(matchedVariant.stock) || 0 : 0
      if (!matchedVariant || vStock < requestedFor(w)) {
        return json(
          { error: `"${p.title}"${comboLabel ? ' (' + comboLabel + ')' : ''} is not available in that quantity.` },
          409
        )
      }
    } else {
      const stock = totalStock(p)
      if (stock <= 0) return json({ error: `"${p.title}" is sold out.` }, 409)
      if (stock < requestedForProduct(p._id)) {
        return json({ error: `"${p.title}" is not available in that quantity.` }, 409)
      }
    }
    // Per-variant price override wins; otherwise the product's sale-aware price.
    const unitPrice = matchedVariant ? variantPrice(p, matchedVariant, currency) : effectivePrice(p, currency)
    const unitAmount = Math.round(unitPrice * 100)
    if (unitAmount <= 0) {
      if (currency === 'gbp') {
        return json(
          { error: `"${p.title}" is not available in £. Remove it or switch to €.`, code: 'currency_unavailable' },
          409
        )
      }
      return json({ error: `"${p.title}" has an invalid price.` }, 409)
    }
    const comboLabel = label()
    lineItems.push({
      name: comboLabel ? `${p.title} — ${comboLabel}` : p.title,
      image: p.image || '',
      unitAmount,
      quantity: w.quantity,
      productId: p._id,
      // Exact variant sold, so /api/stripe-webhook reduces this one without re-matching attributes.
      variantKey: matchedVariant?._key ? String(matchedVariant._key) : '',
      size,
      color,
    })
  }

  // Build Stripe Checkout Session (form-encoded REST call — no SDK needed on Workers).
  const origin = (env.SITE_URL && env.SITE_URL.replace(/\/$/, '')) || new URL(request.url).origin
  const countries = (env.ALLOWED_SHIPPING_COUNTRIES || 'NL,BE,DE,FR,GB,US,CA,AU')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)

  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('success_url', `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`)
  form.set('cancel_url', `${origin}/checkout/cancel`)
  form.set('metadata[currency]', currency)
  form.set('billing_address_collection', 'auto')
  form.set('phone_number_collection[enabled]', 'true')
  countries.forEach((c, i) => form.set(`shipping_address_collection[allowed_countries][${i}]`, c))
  // NOTE: we deliberately do NOT set payment_method_types. Stripe then shows every
  // method enabled in your Dashboard (cards, Apple Pay, Google Pay, iDEAL, Bancontact…).

  lineItems.forEach((li, i) => {
    form.set(`line_items[${i}][quantity]`, String(li.quantity))
    form.set(`line_items[${i}][price_data][currency]`, currency)
    form.set(`line_items[${i}][price_data][unit_amount]`, String(li.unitAmount))
    form.set(`line_items[${i}][price_data][product_data][name]`, li.name)
    if (li.image) form.set(`line_items[${i}][price_data][product_data][images][0]`, li.image)
    form.set(`line_items[${i}][price_data][product_data][metadata][product_id]`, li.productId)
    if (li.variantKey) form.set(`line_items[${i}][price_data][product_data][metadata][variant_key]`, li.variantKey)
    if (li.size) form.set(`line_items[${i}][price_data][product_data][metadata][size]`, li.size)
    if (li.color) form.set(`line_items[${i}][price_data][product_data][metadata][color]`, li.color)
  })

  let session
  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    session = await res.json()
    if (!res.ok) {
      const msg = session?.error?.message || 'Stripe rejected the checkout request.'
      return json({ error: msg }, 502)
    }
  } catch (err) {
    return json({ error: 'Could not reach the payment provider.' }, 502)
  }

  if (!session?.url) {
    return json({ error: 'Payment provider did not return a checkout URL.' }, 502)
  }
  return json({ url: session.url })
}
