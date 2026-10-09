# StudyPilot API on Vercel

This directory contains the TypeScript Hono API. Its historical directory name
is retained because the frontend shares its text utilities through the
`@shared` alias. Vercel serves the React build and the API function under `/api`.

The original Django implementation remains in `../studypilot_backend` as a
reference. Supabase holds the database and serves the existing password hashing
function, so existing accounts keep their passwords.

## Deployment

At the repository root, `npm run build` builds the React app and bundles the
API into `api/_bundle.mjs`. The deployment configuration is `vercel.json`.
Configure backend secrets in Vercel environment variables.

GitHub App connections are managed separately from source files. To stop a
hosting provider's automatic builds, remove StudyPilot from that provider's
repository access in GitHub Settings > Applications > Installed GitHub Apps.
Removing a deployment configuration file alone does not disconnect an app.

## Local development

Use Node 20.12 or newer. At the repository root, run `npm run dev:api`; in a
second terminal, run `npm --prefix studypilot run dev`. The API listens on
127.0.0.1:8787 and Vite proxies `/api` to it. The API rebuilds when its source changes.
The dev script loads local secrets from `.env.local` or `.env.vercel`, if present,
and keeps local wallet challenges on the local origin.

## Checks

```sh
npm --prefix studypilot_worker install
npm --prefix studypilot_worker test
npm --prefix studypilot_worker run typecheck
npm run test:wallet
npm --prefix studypilot run build
node scripts/build-api.mjs
```

## Wallet sign-in

The API issues a five-minute personal-message challenge tied to the website and
wallet address. Vercel's internal HTTP request URL is normalized to the public
HTTPS origin for both challenge creation and verification. Local HTTP development
continues to work. An explicit `SUI_AUTH_ORIGIN` setting takes precedence.

Wallets sign messages through the Sui Wallet Standard, including Slush's web wallet.
The Sui SDK verifies signatures and the claimed account address. zkLogin proof
verification uses the public mainnet Sui verification service and a 15-second timeout.
The browser prepares and validates the challenge before a click opens the wallet's
signature popup. A cancelled or expired attempt gets a fresh challenge.
