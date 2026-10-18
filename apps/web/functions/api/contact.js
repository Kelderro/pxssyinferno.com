/**
 * POST /api/contact
 * Cloudflare Pages Function. Emails a general enquiry to the shop owner via Resend.
 *
 * Required env:
 *   RESEND_API_KEY      (secret) re_...
 *   CONTACT_TO_EMAIL    where enquiries are delivered, e.g. info@kelderro.nl
 *   CONTACT_FROM_EMAIL  a verified Resend sender on your domain, e.g. shop@pxssyinferno.com
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''))

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
    return json({ error: 'The contact form is not configured yet.' }, 500)
  }

  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  // Honeypot: real users never fill this hidden field.
  if (data?.company) return json({ ok: true })

  const name = String(data?.name || '').trim()
  const email = String(data?.email || '').trim()
  const subject = String(data?.subject || '').trim()
  const message = String(data?.message || '').trim()

  if (!name || !isEmail(email) || message.length < 5) {
    return json({ error: 'Please provide your name, a valid email, and a message.' }, 400)
  }
  if (message.length > 5000) {
    return json({ error: 'Message is too long.' }, 400)
  }

  const subjectLine = `Contact form — ${subject || name}`
  const text =
    `New enquiry from the Pussy Inferno site\n\n` +
    `Name: ${name}\nEmail: ${email}\nSubject: ${subject || '(none)'}\n\n${message}\n`
  const html =
    `<h2>New enquiry</h2>` +
    `<p><strong>Name:</strong> ${escapeHtml(name)}<br>` +
    `<strong>Email:</strong> ${escapeHtml(email)}<br>` +
    `<strong>Subject:</strong> ${escapeHtml(subject || '(none)')}</p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`

  try {
    await sendEmail(env, { subject: subjectLine, html, text, replyTo: email })
  } catch (err) {
    return json({ error: 'Could not send your message. Please email us directly.' }, 502)
  }
  return json({ ok: true })
}
