# pxssyinferno.com

Storefront for **Pussy Inferno**: unique, hand-painted apparel drops and custom statement pieces.

The site is a static [Astro](https://astro.build) build styled with Tailwind CSS, with product and page content managed in [Sanity](https://www.sanity.io). Checkout runs through Stripe, and the contact and custom-request forms send email via Resend. Both are handled by Cloudflare Pages Functions.

## Repository layout

This is a [pnpm](https://pnpm.io) workspace with two apps:

```text
.
├── apps/
│   ├── web/                    # Astro storefront (deployed to Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── pages/          # Routes: home, shop, products, about, faq, terms, contact, checkout
│   │   │   ├── components/     # CartDrawer, SanityImage
│   │   │   ├── layouts/        # Shared page layout
│   │   │   ├── lib/            # Sanity client and catalog helpers
│   │   │   └── __tests__/      # Vitest unit tests
│   │   ├── functions/api/      # Cloudflare Pages Functions: checkout, contact, custom-request
│   │   ├── e2e/                # Playwright end-to-end tests
│   │   └── wrangler.toml
│   └── studio/                 # Sanity Studio (content editing)
│       ├── schemaTypes/        # product, about, faq, terms
│       └── scripts/            # One-off content maintenance scripts
├── .github/workflows/          # CI (build, unit, e2e) and CodeQL
└── pnpm-workspace.yaml
```

## Requirements

- Node.js **24** (pinned in [.nvmrc](.nvmrc) to `24.22.1`)
- pnpm

## Getting started

```bash
nvm use
```

```bash
pnpm install
```

Create `apps/web/.env` with the public Sanity settings the Astro build needs:

```dotenv
PUBLIC_SANITY_PROJECT_ID=whp8gyuq
PUBLIC_SANITY_DATASET=production
PUBLIC_SANITY_API_VERSION=2026-03-01
```

Then start both apps:

```bash
pnpm dev
```

| App    | Command           | URL                                        |
| ------ | ----------------- | ------------------------------------------ |
| Web    | `pnpm dev:web`    | <http://localhost:4322>                    |
| Studio | `pnpm dev:studio` | <http://localhost:3333> (Sanity's default) |

### Testing the API functions locally

`astro dev` does not run the Pages Functions in `apps/web/functions`. To try checkout and the forms locally, copy [apps/web/.dev.vars.example](apps/web/.dev.vars.example) to `apps/web/.dev.vars`, fill in your Stripe test key and Resend settings, then build and serve with Wrangler from `apps/web`:

```bash
pnpm --filter web build
```

```bash
npx wrangler pages dev dist
```

## Scripts

Run from the repository root:

| Command                                    | Description                         |
| ------------------------------------------ | ----------------------------------- |
| `pnpm dev`                                 | Run web and studio together         |
| `pnpm --filter web build`                  | Build the storefront to `apps/web/dist` |
| `pnpm --filter web preview`                | Preview the production build        |
| `pnpm --filter web test:unit`              | Run Vitest unit tests               |
| `pnpm --filter web test:e2e`               | Run Playwright end-to-end tests     |
| `pnpm --filter studio build`               | Build the Sanity Studio             |
| `pnpm --filter studio deploy`              | Deploy the Sanity Studio            |

The end-to-end tests expect a running server. Install a browser once with `pnpm --filter web exec playwright install chromium`, then build and start `pnpm --filter web preview --port 4322` before running them.

## API endpoints

| Route                       | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `POST /api/checkout`        | Creates a Stripe Checkout Session for ready-to-ship cart items |
| `POST /api/custom-request`  | Emails a made-to-order quote request (no payment)             |
| `POST /api/contact`         | Emails a general enquiry                                      |

Customer data is delivered by email rather than stored in Sanity, because the `production` dataset is public-read.

## Deployment

The storefront deploys to Cloudflare Pages with `apps/web` as the root directory. Content changes are made in Sanity Studio.

- [apps/web/DEPLOY-CLOUDFLARE.md](apps/web/DEPLOY-CLOUDFLARE.md): Pages project setup, build settings, environment variables and secrets
- [apps/web/PAYMENTS-SETUP.md](apps/web/PAYMENTS-SETUP.md): Stripe, Resend and endpoint configuration

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push to `main` and on pull requests:

1. **Build**: builds the web app and the studio
2. **Unit tests**: Vitest with coverage
3. **E2E tests**: Playwright (Chromium) against the preview server

CodeQL scanning and Dependabot updates are also configured under [.github](.github).
