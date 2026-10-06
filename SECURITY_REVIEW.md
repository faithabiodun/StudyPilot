# Security and bug fixes — 6 October 2026

## Fixed

- Wallet login now signs the website origin, canonical wallet address, nonce,
  issue time and five-minute expiry. The frontend validates the full message
  and passes the selected account explicitly to the wallet. Signature ownership
  and atomic nonce consumption remain enforced by the API.
- Disabled wallet, Google and Supabase accounts cannot receive login tokens.
  Google email must be verified, and linked provider identities must match.
- Concurrent wallet account creation recovers the account created by the
  winning request instead of returning a database error. Django creates the
  address and account together.
- Logout submits the refresh token for server revocation. Another account's
  token cannot be revoked, and an in-flight refresh cannot restore a locally
  logged-out session.
- Custom request headers no longer replace authentication headers. Requests
  that write data are no longer automatically repeated after a lost response.
- The frontend defaults to `/api` for the same-host deployment.
- Flashcard decks can only reference documents owned by the signed-in user.
- Malformed JWT headers, signatures and user identifiers are rejected cleanly.
- Public registration on the Django reference backend cannot select an admin
  role. The deployed TypeScript API already enforced student signup.
- Compatible frontend and API tooling dependency security updates applied.

## Verification and limits

- 50 tests pass, including 17 new regressions. Wallet endpoint tests use real
  signatures from the official Sui SDK and a scripted database double; these
  do not constitute a live PostgreSQL concurrency test.
- TypeScript typecheck, frontend production build and Vercel API bundle pass.
- npm reports zero vulnerabilities in root and API dependencies, including
  development dependencies, and zero in frontend production dependencies.
- The frontend's full dependency audit still reports seven advisories in
  Tailwind 3 build tooling (five high, two moderate). npm's proposed resolution
  upgrades Tailwind to version 4, requiring a separate styling migration and
  visual checks. The current published braces version remains affected.
- Python source syntax checked. Django tests could not run because Django is
  absent from the available Python environment. The Python backend is retained
  as a reference/rollback; deployment uses the TypeScript API.
- Changes are local and have not been deployed. No production database changes
  or wallet transactions were performed. No schema migration is required.

## Wallet trust warning

The exact warning and wallet name have not been provided, so its cause is not
confirmed. These changes improve authentication; they do not establish that a
wallet's website reputation warning has cleared. Any reputation review must use
the wallet provider's process once the warning is identified.

For proxy deployments, `SUI_AUTH_ORIGIN` can pin the public origin used in signed
messages. Set it to the frontend or API origin, without a path. Deploy the API
and frontend together; users with an older challenge should request a fresh one.
