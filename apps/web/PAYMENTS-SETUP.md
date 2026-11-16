# Payments, custom requests & contact — setup

This site now has a small backend implemented as **Cloudflare Pages Functions**
(`apps/web/functions/api/*`). They call Stripe and Resend over plain `fetch`,
so there are **no extra npm dependencies** and the static Astro build is
unchanged. Four endpoints:

| Route                 | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `POST /api/checkout`        | Creates a Stripe Checkout Session for ready-to-ship cart items |
| `POST /api/custom-request`  | Emails a made-to-order "request a quote" to you (no payment)   |
| `POST /api/contact`         | Emails a general enquiry to you                                |
| `POST /api/stripe-webhook`  | Reduces stock in Sanity after a paid checkout (called by Stripe) |

> Why not store orders/requests in Sanity? The web client queries the
> `production` dataset unauthenticated, i.e. it is **public-read**. Anything
> written there (names, emails, addresses) would be publicly readable, so
> customer data is delivered by email instead.

---

## 1. Environment variables

Set these in **Cloudflare Pages → your project → Settings → Environment variables**.
Mark `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SANITY_WRITE_TOKEN` and `RESEND_API_KEY` as **Secret**. Add them to both
*Production* and *Preview* as needed.

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes (checkout) | `sk_test_…` | Use a **test** key first (`sk_test_`). Swap to `sk_live_` to go live. |
| `STRIPE_WEBHOOK_SECRET` | yes (stock) | `whsec_…` | Signing secret of the Stripe webhook endpoint (see *Stock* below). |
| `SANITY_WRITE_TOKEN` | yes (stock) | `sk…` | Sanity API token with **Editor** rights. Server-only. |
| `RESEND_API_KEY` | yes (forms) | `re_…` | |
| `CONTACT_TO_EMAIL` | yes (forms) | `info@kelderro.nl` | Where enquiries/requests land. |
| `CONTACT_FROM_EMAIL` | yes (forms) | `shop@pxssyinferno.com` | Must be a **verified** Resend sender on your domain. |
| `STRIPE_CURRENCY` | no | `eur` | Fallback only (`eur` or `gbp`). The shopper's €/£ choice is sent with each checkout and wins. |
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

### EUR and GBP (multi-currency settlement)

Shoppers pick **€** or **£** in the header. The Checkout Session is created in
that currency, so Stripe puts the money in the matching balance: £ payments in
the GBP balance, € payments in the EUR balance. With one bank account per
currency, each balance pays out to its own account, with no conversion.

- **Prices are set by hand in Sanity**, per product: `Regular Price (£)`,
  `Sale / Discounted Price (£)`, the variant `Price for this variant (£)` and the
  made-to-order `Added Price (£)`. Nothing is converted from €.
- A product **without a £ price** shows "Not available in £" in £ mode and
  cannot be added to the cart or checked out in £ (the function returns 409).
- The sale start/end dates apply to both currencies.
- Made-to-order pieces follow the same rule. In £ mode they need a £ starting
  price, plus a £ `Added Price` on every option that costs extra in €. Until
  then they show "Not available in £" and the request form is disabled in £.
  The request email states the currency the estimate was shown in.

One-off Stripe Dashboard setup:

1. In the Dashboard settings for bank accounts and currencies, enable
   multi-currency settlement and add **GBP** as a settlement currency.
2. Attach the UK **GBP** bank account; keep the Portuguese **EUR** account as the
   EUR/default account. Both must be in the name of the same legal entity as the
   Stripe account. Check that a GBP account is supported for the account's
   country and look at the settlement and payout fees.
3. Leave **Adaptive Pricing off** (payment settings). It
   converts to the customer's local currency and would defeat the split.
4. Test mode: pay once in £ and once in €, then check **Balances**: the £
   payment should be in the GBP balance and the € one in the EUR balance.

### Stock: reduced automatically after payment (webhook)
`POST /api/stripe-webhook` reduces stock in Sanity once Stripe confirms a
payment, so a sold piece can't be bought again. It handles
`checkout.session.completed` (when paid) and
`checkout.session.async_payment_succeeded` (delayed methods), verifies Stripe's
signature, and takes the bought quantity off the exact variant checkout sold
(recorded as `variant_key`), or off the product's own stock if it has no variants. An open draft
in the Studio is reduced too, so publishing it doesn't bring the old count back.

Only stock is written to Sanity. Each handled session also leaves a small
marker document `stripe-checkout.<session id>` (session id + timestamp only), so
a webhook Stripe sends twice doesn't reduce stock twice. IDs with a `.` are not
publicly readable, and no customer or order data is stored; that stays in Stripe.

The site rebuild that shows "sold out" comes from the Sanity → Cloudflare
deploy-hook webhook in `DEPLOY-CLOUDFLARE.md` ("Rebuild when content changes in
Sanity"). Set that up too, or the stock changes but the page doesn't update until
the next deploy (checkout still refuses an out-of-stock piece either way).

One-off setup:

1. **Sanity token.** [sanity.io/manage](https://www.sanity.io/manage) → this
   project → **API → Tokens** → *Add API token*, permission **Editor**. Set it as
   the `SANITY_WRITE_TOKEN` secret. Never put it in a `PUBLIC_` variable.
2. **Stripe endpoint.** Stripe Dashboard → **Developers → Webhooks** → *Add
   endpoint*:
   - **URL:** `https://pxssyinferno.com/api/stripe-webhook`
   - **Events:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   Copy the endpoint's **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
   Test mode and live mode have separate endpoints and secrets.
3. **Check it.** Make a test purchase, then look at the endpoint in Stripe: the
   event should show `200`, and the product's stock in the Studio should be one
   lower. A failed delivery (`5xx`) is retried by Stripe automatically.

Known gap: if two people pay for the last piece within the same few minutes,
both payments go through (stock is only checked when checkout starts). Stock
then goes below 0 in the Studio, which is the sign to refund one of them in
Stripe. The piece still shows as sold out.

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

To test the stock webhook locally, forward Stripe events with the
[Stripe CLI](https://docs.stripe.com/stripe-cli) and put the `whsec_…` it prints
in `.dev.vars` as `STRIPE_WEBHOOK_SECRET`:

```sh
stripe listen --forward-to localhost:8788/api/stripe-webhook
```

This writes to the real `production` dataset, so test with a product you can
restore afterwards.

---

## 6. Keep in sync

`functions/api/checkout.js` re-computes prices from Sanity and is the **only**
authority on what a customer is charged (the browser's price is ignored). Its
sale-window and per-currency logic mirrors `src/lib/catalog.ts` →
`effectivePrice()` / `variantPrice()`. If you change pricing rules, change both.

`functions/api/checkout.js` decides which variant is sold and records its Sanity
`_key` as `variant_key` in the Stripe line-item metadata.
`functions/api/stripe-webhook.js` reduces exactly that variant and never matches
on colour or size itself, so a new variant property only needs handling in
checkout. (Sessions from before `variant_key` existed fall back to a colour + size
match; that fallback can be removed once they have all been paid or expired.)
