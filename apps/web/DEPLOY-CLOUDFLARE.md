# Deploying to Cloudflare Pages (Workers & Pages)

This is a static **Astro** build (`apps/web`) plus a small serverless backend as
**Cloudflare Pages Functions** (`apps/web/functions/api/*`). No SSR adapter is
needed — the functions are auto-detected by Pages.

## 1. Create the Pages project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → pick the repo (`pxssyinferno.com`).

(Alternative without Git: build locally with `pnpm build`, then
`npx wrangler pages deploy dist --project-name pxssyinferno`.)

## 2. Build settings  (the monorepo bits matter)

| Setting | Value |
| --- | --- |
| **Framework preset** | None (or Astro) |
| **Root directory** (Advanced) | `apps/web` |
| **Build command** | `pnpm build` |
| **Build output directory** | `dist` |

- Because the **root directory is `apps/web`**, the `functions/` folder is found
  at `apps/web/functions` automatically — nothing else to configure for the API.
- pnpm is detected from `pnpm-lock.yaml`. Node is pinned to 22 via the
  `.node-version` file in `apps/web`.
- If the build ever fails resolving workspace packages, set the Root directory to
  the repo root instead and use:
  `pnpm --filter web install && pnpm --filter web build`, output `apps/web/dist`.

## 3. Environment variables & secrets

Settings → **Environment variables**. Add to **Production** (and **Preview** if
you want preview deploys to work). `.env` is gitignored, so the Sanity values
below MUST be set here or the build can't fetch products.

**Build-time (public — the Astro build reads these):**
```
PUBLIC_SANITY_PROJECT_ID = whp8gyuq
PUBLIC_SANITY_DATASET     = production
PUBLIC_SANITY_API_VERSION = 2026-03-01
```

**Runtime secrets (the Functions read these — mark as "Encrypt"):**
```
STRIPE_SECRET_KEY   = sk_test_...        (swap to sk_live_ when going live)
RESEND_API_KEY      = re_...
CONTACT_TO_EMAIL    = info@kelderro.nl
CONTACT_FROM_EMAIL  = shop@pxssyinferno.com   (verified Resend sender domain)
```

**Optional (defaults exist):**
```
SITE_URL                   = https://pxssyinferno.com   (used for Stripe success/cancel URLs)
STRIPE_CURRENCY            = eur   (fallback only; the shopper's €/£ choice wins)
ALLOWED_SHIPPING_COUNTRIES = NL,BE,DE,FR,GB,US,CA,AU
```

## 4. First deploy & test

Trigger the deploy (automatic on the first connect, or push a commit). It
publishes to `https://<project>.pages.dev`. On that URL, verify:
- Pages render and products load (confirms Sanity build-time env vars).
- A **test** checkout redirects to Stripe (confirms STRIPE_SECRET_KEY + the
  `/api/checkout` function). Card `4242 4242 4242 4242`.
- The contact form and a custom request send email (confirms Resend vars).

## 5. Custom domain  (cutover — read first)

Settings → **Custom domains** → add `pxssyinferno.com` (and `www`).

⚠️ `pxssyinferno.com` currently serves the **old WordPress site**. Adding it here
repoints the domain to this new site and replaces the old one. Test everything on
the `*.pages.dev` URL first, keep a backup/export of the WordPress site, then add
the custom domain to cut over. If the domain's DNS is already in Cloudflare, the
record is created for you; otherwise follow the DNS instructions shown.

After the domain is live, set `SITE_URL=https://pxssyinferno.com` and switch
`STRIPE_SECRET_KEY` to your live key once you've completed Stripe activation.

## 6. Stripe & Resend dashboards

See `PAYMENTS-SETUP.md` — enable Card / Apple Pay / Google Pay in Stripe, verify
your sending domain in Resend. Apple Pay/Google Pay need no domain file because
checkout is Stripe-hosted.

## Redeploys
Every push to the connected branch rebuilds and redeploys. Changing a secret
requires a new deployment to take effect (Deployments → Retry, or push a commit).
The Sanity **Studio** deploys separately (`cd apps/studio && sanity deploy`); it
is not part of this Pages project.

GitHub Actions does not deploy anything: it only runs CI (build, unit and e2e
tests, CodeQL). Cloudflare Pages builds and deploys through its own Git
connection.

## Rebuild when content changes in Sanity
The site is static: products, prices and pages are read from Sanity **at build
time**. Publishing a change in Sanity does nothing to the live site until the
next build, unless a webhook triggers one.

This matters for prices. `/api/checkout` reads prices from Sanity **live**, so
between a Sanity edit and the next build the page can show the old price while
Stripe charges the new one. A new £ price also keeps showing "Not available in £"
until the rebuild.

Set it up once (no code, no GitHub Action needed):

1. **Cloudflare deploy hook.** Pages project → **Settings → Builds → Deploy
   hooks** → *Add deploy hook*. Name it `sanity`, branch `main`. Copy the URL.
   Treat it as a secret: anyone with it can trigger builds.
2. **Sanity webhook.** [sanity.io/manage](https://www.sanity.io/manage) → this
   project → **API → Webhooks** → *Create webhook*:
   - **URL:** the deploy hook URL from step 1
   - **Dataset:** `production`
   - **Trigger on:** Create, Update, Delete
   - **Filter (optional):** `_type in ["product", "faq", "about", "terms"]`, so
     only content the site renders triggers a build
   - **HTTP method:** `POST`; leave projection, headers and secret empty
   - **Drafts:** leave off, so only *published* changes trigger a build
3. **Test it.** Publish a small change in the Studio, then check that a new
   deployment appears under the Pages project's **Deployments** (a minute or so).

Each publish starts one build, so publishing many documents in a row queues
several builds; Cloudflare runs them one after another and the last one wins.
To rebuild by hand, use **Deployments → Retry deployment** on the latest
production deployment.
