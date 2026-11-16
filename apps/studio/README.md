# Pxssy Inferno Sanity Studio

Sanity Studio for project `whp8gyuq`, dataset `production`. The hosted Studio
target is fixed by `deployment.appId` in `sanity.cli.ts`.

## Local development

```bash
pnpm --filter studio dev
```

## Deploying the hosted Studio

The hosted Studio deploys automatically from GitHub Actions
(`.github/workflows/deploy-studio.yml`) on every push to `main` that changes
`apps/studio/**`, `pnpm-lock.yaml` or the workflow itself. Schema changes merged
to `main` therefore reach the hosted Studio without anyone running
`sanity deploy` by hand.

To redeploy without a code change, run the workflow manually: GitHub →
**Actions** → **Deploy Studio** → **Run workflow**.

### One-time setup

The workflow authenticates with a Sanity API token stored as a repository secret.
If the secret is missing the job fails at its first step with a message saying so.

1. In [sanity.io/manage](https://www.sanity.io/manage) → project `whp8gyuq` →
   **API** → **Tokens**, add a token named `github-deploy` with the
   **Deploy Studio** permission.
2. In GitHub → repository **Settings** → **Secrets and variables** →
   **Actions**, add a repository secret named `SANITY_AUTH_TOKEN` with that
   token as its value.

### Manual deploy

Still possible from a machine logged in to Sanity:

```bash
pnpm --filter studio run deploy
```
