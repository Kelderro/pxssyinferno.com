# Payments, custom requests & contact — setup

This site now has a small backend implemented as **Cloudflare Pages Functions**
(`apps/web/functions/api/*`). They call Stripe and Resend over plain `fetch`,
so there are **no extra npm dependencies** and the static Astro build is
unchanged. Three endpoints:

| Route                 | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `POST /api/checkout`        | Creates a Stripe Checkout Session for ready-to-ship cart items |
| `POST /api/custom-request`  | Emails a made-to-order "request a quote" to you (no payment)   |
| `POST /api/contact`         | Emails a general enquiry to you                                |

> Why not store orders/requests in Sanity? The web client queries the
> `production` dataset unauthenticated, i.e. it is **public-read**. Anything
> written there (names, emails, addresses) would be publicly readable, so
> customer data is delivered by email instead.

---

## 1. Environment variables

Set these in **Cloudflare Pages → your project → Settings → Environment variables**.
Mark `STRIPE_SECRET_KEY` and `RESEND_API_KEY` as **Secret**. Add them to both
*Production* and *Preview* as needed.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes (checkout) | `sk_test_…` | Use a **test** key first (`sk_test_`). Swap to `sk_live_` to go live. |
| `RESEND_API_KEY` | yes (forms) | `re_…` | |
| `CONTACT_TO_EMAIL` | yes (forms) | `info@kelderro.nl` | Where enquiries/requests land. |
| `CONTACT_FROM_EMAIL` | yes (forms) | `shop@pxssyinferno.com` | Must be a **verified** Resend sender on your domain. |
| `STRIPE_CURRENCY` | no | `eur` | Default `eur`. |
| `SITE_URL` | no | `https://pxssyinferno.com` | Used for success/cancel URLs; falls back to the request origin. |
| `ALLOWED_SHIPPING_COUNTRIES` | no | `NL,BE,DE,FR,GB,US,CA,AU` | Countries offered at checkout. |
| `SANITY_PROJECT_ID` / `SANITY_DATASET` / `SANITY_API_VERSION` | no | — | Defaults baked in (`whp8gyuq` / `production` / `2026-03-01`). |

For **local** testing, copy `.dev.vars.example` → `.dev.vars` (gitignored).

---

## 2. Stripe (Apple Pay / Google Pay / iDEAL)

The checkout function intentionally does **not** pin `payment_method_types`, so
Stripe automatically offers every method you enable in the Dashboard.

1. Create/log in to your Stripe account and stay in **Test mode** (toggle top-right).
2. **Settings → Payment methods**: enable **Cards**, **Apple Pay**, **Google Pay**.
   Stripe shows each method only to shoppers it applies to. **iDEAL** and
   **Bancontact** are optional NL/BE-only methods (EUR) — enable them only if
   you want to serve those markets; they never appear for US/UK customers.
3. Apple Pay & Google Pay work on **hosted** Checkout with no domain-association
   file needed — that step is only for on-site wallet buttons, which we don't use.
4. Copy your **test secret key** (`sk_test_…`) into `STRIPE_SECRET_KEY`.
5. Test card: `4242 4242 4242 4242`, any future expiry, any CVC. Apple/Google Pay
   show on supported devices/browsers.
6. Going live: enable the same methods in live mode, complete account activation,
   and replace the key with `sk_live_…`.

### Optional but recommended: stock & fulfilment via webhook
Payment success currently just shows `/checkout/success` and clears the cart.
Stock is **not** auto-decremented. If you want that (and a server-verified order
record), add a `POST /api/stripe-webhook` function subscribed to
`checkout.session.completed`, verify the signature with a
`STRIPE_WEBHOOK_SECRET`, and write stock back to Sanity with a write token. I
left this out to avoid storing order data in the public dataset — say the word
and I'll wire a private store for it.

---

## 3. Resend (emails)

1. Create a Resend account, add and **verify your domain** (`pxssyinferno.com`)
   via the DNS records Resend gives you.
2. Create an API key → `RESEND_API_KEY`.
3. Set `CONTACT_FROM_EMAIL` to an address on the verified domain and
   `CONTACT_TO_EMAIL` to where you want to receive messages.

Until a domain is verified you can send only to your own account email and only
from `onboarding@resend.dev` — fine for a first test, not for production.

---

## 4. Cloudflare Pages build settings

In the Pages project (for this monorepo):

- **Root directory:** `apps/web`
- **Build command:** `pnpm build` (or `npm run build`)
- **Build output directory:** `dist`
- **Functions:** auto-detected from `apps/web/functions/` — no config needed.

If your Pages "root directory" is the repo root instead of `apps/web`, move the
`functions/` folder to the repo root (functions must sit at the build root).

---

## 5. Local testing

Functions don't run under `astro dev`. Build once, then serve the static output
+ functions together with Wrangler:

```sh
pnpm build
npx wrangler pages dev dist      # reads .dev.vars automatically
```

Open the printed URL, add a ready-to-ship product to the cart, and hit checkout.

---

## 6. Keep in sync

`functions/api/checkout.js` re-computes prices from Sanity and is the **only**
authority on what a customer is charged (the browser's price is ignored). Its
sale-window logic mirrors `src/lib/catalog.ts` → `effectivePrice()`. If you
change pricing rules, change both.
