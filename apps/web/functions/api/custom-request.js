/**
 * POST /api/custom-request
 * Cloudflare Pages Function. Emails a made-to-order "request a quote" to the
 * shop owner via Resend. No payment is taken — this mirrors the old site's
 * "Request Custom Design" flow (owner quotes & collects payment manually).
 *
 * Required env (same as /api/contact):
 *   RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''))
// Mirrors formatPrice() in src/lib/catalog.ts
const formatPrice = (n, currency) => {
  const num = Number(n) || 0
  const digits = Number.isInteger(num) ? 0 : 2
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency === 'gbp' ? 'GBP' : 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num)
}

async function sendEmail(env, { subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: replyTo ? [replyTo] : undefined,
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend failed: ${res.status} ${body}`)
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    return json({ error: 'Custom requests are not configured yet.' }, 500)
  }

  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  if (data?.company) return json({ ok: true }) // honeypot

  const name = String(data?.name || '').trim()
  const email = String(data?.email || '').trim()
  const phone = String(data?.phone || '').trim()
  const message = String(data?.message || '').trim()
  const productTitle = String(data?.productTitle || 'Custom piece').trim()
  const productSlug = String(data?.productSlug || '').trim()
  const options = Array.isArray(data?.options) ? data.options : []
  const estimatedTotal = Number(data?.estimatedTotal) || 0
  // Currency the shopper saw the (indicative) estimate in; allow-listed
  const currency = String(data?.currency || '').toLowerCase() === 'gbp' ? 'gbp' : 'eur'
  const money = (n) => formatPrice(n, currency)

  if (!name || !isEmail(email)) {
    return json({ error: 'Please provide your name and a valid email.' }, 400)
  }
  if (message.length > 5000) {
    return json({ error: 'Message is too long.' }, 400)
  }

  const optionLines = options
    .map((o) => {
      const label = String(o?.label || '').trim()
      const value = String(o?.value || '').trim()
      const delta = Number(o?.priceDelta) || 0
      return { label, value, delta }
    })
    .filter((o) => o.label && o.value)

  const subjectLine = `Custom request — ${productTitle} — ${name}`

  const optionsText = optionLines.length
    ? optionLines.map((o) => `  • ${o.label}: ${o.value}${o.delta ? ` (+${money(o.delta)})` : ''}`).join('\n')
    : '  (none selected)'

  const text =
    `New made-to-order request from the Pussy Inferno site\n\n` +
    `Product: ${productTitle}${productSlug ? ` (/products/${productSlug})` : ''}\n` +
    `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '(none)'}\n\n` +
    `Selected options:\n${optionsText}\n\n` +
    `Estimated total (indicative): ${money(estimatedTotal)}\n\n` +
    `Message:\n${message || '(none)'}\n`

  const optionsHtml = optionLines.length
    ? `<ul>${optionLines
        .map(
          (o) =>
            `<li><strong>${escapeHtml(o.label)}:</strong> ${escapeHtml(o.value)}` +
            `${o.delta ? ` <em>(+${money(o.delta)})</em>` : ''}</li>`
        )
        .join('')}</ul>`
    : `<p>(none selected)</p>`

  const html =
    `<h2>New made-to-order request</h2>` +
    `<p><strong>Product:</strong> ${escapeHtml(productTitle)}` +
    `${productSlug ? ` (/products/${escapeHtml(productSlug)})` : ''}</p>` +
    `<p><strong>Name:</strong> ${escapeHtml(name)}<br>` +
    `<strong>Email:</strong> ${escapeHtml(email)}<br>` +
    `<strong>Phone:</strong> ${escapeHtml(phone || '(none)')}</p>` +
    `<p><strong>Selected options:</strong></p>${optionsHtml}` +
    `<p><strong>Estimated total (indicative):</strong> ${money(estimatedTotal)}</p>` +
    `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${escapeHtml(message || '(none)')}</p>`

  try {
    await sendEmail(env, { subject: subjectLine, html, text, replyTo: email })
  } catch (err) {
    return json({ error: 'Could not send your request. Please email us directly.' }, 502)
  }
  return json({ ok: true })
}
