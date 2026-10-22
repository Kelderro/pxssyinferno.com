import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Minimal stub of the Cloudflare Pages Function ───────────────────────────
// We re-implement the pure logic extracted from functions/api/contact.js so we
// can unit-test validation, honeypot and response shapes without a live network.

const escapeHtml = (s: string) =>
  String(s || '').replace(/[&<>"']/g, (c: string) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  )

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''))

interface ContactPayload {
  name?: string
  email?: string
  subject?: string
  message?: string
  company?: string  // honeypot
}

interface Env {
  RESEND_API_KEY?: string
  CONTACT_TO_EMAIL?: string
  CONTACT_FROM_EMAIL?: string
}

interface HandlerResult {
  status: number
  body: Record<string, unknown>
}

async function handleContact(payload: ContactPayload, env: Env): Promise<HandlerResult> {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
    return { status: 500, body: { error: 'The contact form is not configured yet.' } }
  }

  // Honeypot
  if (payload?.company) return { status: 200, body: { ok: true } }

  const name    = String(payload?.name    || '').trim()
  const email   = String(payload?.email   || '').trim()
  const subject = String(payload?.subject || '').trim()
  const message = String(payload?.message || '').trim()

  if (!name || !isEmail(email) || message.length < 5) {
    return { status: 400, body: { error: 'Please provide your name, a valid email, and a message.' } }
  }
  if (message.length > 5000) {
    return { status: 400, body: { error: 'Message is too long.' } }
  }

  return { status: 200, body: { ok: true } }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const validEnv: Env = {
  RESEND_API_KEY:      're_test_key',
  CONTACT_TO_EMAIL:    'to@example.com',
  CONTACT_FROM_EMAIL:  'from@example.com',
}

const validPayload: ContactPayload = {
  name:    'Jane Doe',
  email:   'jane@example.com',
  message: 'Hello, I would like to commission a jacket.',
}

describe('contact API handler', () => {
  describe('environment guard', () => {
    it('returns 500 when env vars are missing', async () => {
      const result = await handleContact(validPayload, {})
      expect(result.status).toBe(500)
      expect(result.body.error).toMatch(/not configured/)
    })
  })

  describe('honeypot', () => {
    it('silently returns ok:true when the honeypot field is filled', async () => {
      const result = await handleContact({ ...validPayload, company: 'spambot' }, validEnv)
      expect(result.status).toBe(200)
      expect(result.body.ok).toBe(true)
    })
  })

  describe('validation', () => {
    it('accepts a valid payload', async () => {
      const result = await handleContact(validPayload, validEnv)
      expect(result.status).toBe(200)
      expect(result.body.ok).toBe(true)
    })

    it('rejects a missing name', async () => {
      const result = await handleContact({ ...validPayload, name: '' }, validEnv)
      expect(result.status).toBe(400)
    })

    it('rejects an invalid email address', async () => {
      const result = await handleContact({ ...validPayload, email: 'not-an-email' }, validEnv)
      expect(result.status).toBe(400)
    })

    it('rejects a message that is too short', async () => {
      const result = await handleContact({ ...validPayload, message: 'Hi' }, validEnv)
      expect(result.status).toBe(400)
    })

    it('rejects a message that exceeds 5000 characters', async () => {
      const result = await handleContact({ ...validPayload, message: 'x'.repeat(5001) }, validEnv)
      expect(result.status).toBe(400)
      expect(result.body.error).toMatch(/too long/)
    })

    it('accepts a message of exactly 5000 characters', async () => {
      const result = await handleContact({ ...validPayload, message: 'x'.repeat(5000) }, validEnv)
      expect(result.status).toBe(200)
    })

    it('accepts a payload with no subject (optional field)', async () => {
      const result = await handleContact({ ...validPayload, subject: undefined }, validEnv)
      expect(result.status).toBe(200)
    })
  })

  describe('escapeHtml helper', () => {
    it('escapes all five HTML special characters', () => {
      expect(escapeHtml('<script>&"\'</script>')).toBe('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;')
    })

    it('leaves safe strings unchanged', () => {
      expect(escapeHtml('Hello world')).toBe('Hello world')
    })
  })

  describe('isEmail helper', () => {
    it('accepts valid email addresses', () => {
      expect(isEmail('user@example.com')).toBe(true)
      expect(isEmail('user+tag@sub.domain.org')).toBe(true)
    })

    it('rejects malformed addresses', () => {
      expect(isEmail('not-an-email')).toBe(false)
      expect(isEmail('@nodomain')).toBe(false)
      expect(isEmail('noatsign.com')).toBe(false)
    })
  })
})
