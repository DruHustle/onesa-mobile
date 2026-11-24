# Onesa Mobile API

A persistent **hardware pilot and customer operations API**. It runs independently of the web/native packages on Node 24.22.1. Runtime dependencies include `openid-client`, Zod and PDFKit; install with `npm ci`. Node's `node:sqlite` supplies a single-instance transactional database. This is a control-plane pilot, not a mobile core or a payment processor.

## Run

```sh
npm ci
node src/auth/bootstrap.ts --all-roles
npm run check
npm start
```

The bootstrap generates unique lab credentials and staff authenticator seeds in `var/lab-credentials.json` with owner-only permissions. It refuses overwrite. Use only synthetic records. `npm run dev` watches the API. Environment files are not loaded automatically; export variables or use `node --env-file=.env src/server.ts` with an ignored local file.

| Setting | Meaning |
| --- | --- |
| `APP_MODE` | `lab` default; `production` refuses lab identity and lab charging/registration |
| `HOST`, `PORT` | Default `127.0.0.1:4000`; explicitly bind a private interface for devices or `0.0.0.0` in the isolated container |
| `DATABASE_PATH` | Default `var/onesa-mobile.sqlite`; persistent local disk, one API replica |
| `PUBLIC_ORIGIN` | Exact public browser origin; HTTPS is mandatory in production |
| `CORS_ALLOWED_ORIGINS` | Comma-separated exact browser origins; public origin is also allowed, no wildcards |
| `TRUST_PROXY_IPS` | Explicit trusted peer IPs; only a single valid forwarded IP from such a peer is used for limits |
| `AUTH_ENCRYPTION_KEY` | Production: 64 hex characters from protected secret storage; lab: owner-only key file generated beside DB |
| `ONESA_ISSUER`, `ONESA_CLIENT_ID`, `ONESA_CLIENT_SECRET` | All configured together; mandatory in production; exact callback is `PUBLIC_ORIGIN/api/v1/auth/onesa/callback` |

`APP_MODE=production` configures security boundaries. It cannot activate a commercial carrier, accept real payments or turn manual launch evidence into a licence.

## API groups

The canonical [OpenAPI contract](openapi.json) describes input schemas, responses and security. Routes are served directly below `/v1`; the web gateway prefixes them with `/api`.

| Group | Routes and behavior |
| --- | --- |
| Health / public | `/healthz`, `/v1/status`, `/v1/catalog`; health is distinct from mobile-service availability |
| Identity | `/v1/session`, lab login/logout; Onesa start/callback and native one-time code exchange |
| Customer | `/v1/me`, `/v1/me/export`, `/v1/me/records/:kind`; own applications, support conversations, requests and test receipts |
| Launch interest | `POST /v1/account/launch-interest` records a signed-in customer's preference in lab and production. Send `interested` and the current `revision` (zero for a new record). Customers can withdraw or rejoin. Read the current preference from `launchInterest` in the account or its export. Staff with `subscribers.read` can review the `launchInterests` collection. |
| Hardware | `/v1/ops/sites`, assets/checks, trials/results; persistent inventory and manually evidenced commissioning |
| Readiness | `/v1/ops/evidence` and review; scope, expiry, separate reviewer and no automatic activation |
| Company | `/v1/ops/snapshot`, `/v1/ops/records/:kind`, application reviews, requests, test ledger/refunds and audit |
| Documents | `/v1/documents/:id.pdf`; server-generated private test receipt, no tax-invoice claim |
| Preview compatibility | `/v1/readiness`, `/v1/demo/account`; fictional fixtures isolated from authenticated records |
| Uncommissioned providers | `/v1/activations`, `/v1/payments`, `/v1/provisioning`, `/v1/satellite/attach`; explicit unavailable response after access checks |

Mutation bodies are strict JSON and limited to 16 KB. Domain mutations require `Idempotency-Key` (16–128 letters, digits, underscores or hyphens); retries of the same operation/input reuse the result. Reusing a key with changed input returns 409. Updates require the current positive revision; conflicts return 409 rather than overwriting another operator's work. List pages default to 50 and accept a bounded cursor/limit. Account export streams a consistent snapshot of all owned records.

## Identity and authorization

Production uses the existing Company Portal protocol: confidential Authorization Code with PKCE/state/nonce, RS256 ID-token validation and a **live opaque-token `/session` inspection** for every protected request. The client is `mobile`; this is not generic JWT access-token validation. Mobile's additive Portal migration and role contract must be released before configuring it.

Web sessions use HttpOnly cookies and require exact Origin plus CSRF for mutations. Native bearer sessions use OS secure storage; the browser handoff exposes only a one-use code bound to the app's state/verifier. Staff require MFA; evidence acceptance and refunds require a recent original authentication proof. Sign-out destroys local capability even if central revocation cannot be confirmed.

Roles are customer, support, operations, finance, agent, auditor and admin. Customer access is owner-scoped; agents can see their own lab sales, not the subscriber directory or others' sales. Finance cannot operate hardware. Permission checks remain on the API even when a control is hidden in the UI.

## Data and recovery

SQLite uses WAL, foreign keys, a busy timeout and atomic domain/audit/idempotency writes. The implementation is intentionally one replica on local durable disk, not a distributed billing database. Do not place WAL storage on an unqualified network filesystem or share it across replicas. Node 24.22.1 labels `node:sqlite` Stability 1.2 (release candidate); qualify runtime upgrades and use the committed recovery tests. [Runtime reference](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html).

Authentication secrets/upstream tokens are encrypted; domain records require protected volumes and approved retention/location for real data. Private files are ignored by Git. Use the [runtime/recovery guide](../infra/runtime/README.md), which documents authenticated encryption, WAL-consistent capture, separate keys, fail-closed restore and session invalidation. The audit chain is not independent nonrepudiation against an administrator able to rewrite the entire database.

The database records its deployment mode when opened. Start older databases with their original mode and keys on the first upgrade. The API, lab credential tools and backup validation then reject a volume marked for a different mode. The public customer domain `mobile.onesa.eu` requires production authentication.

The isolated Compose lab binds its web port to loopback and blocks API provider egress. Production configuration is a candidate requiring approved ingress, actual identity configuration, key custody and environment qualification. Use its reviewed deployment process; there is no automatic production migration.

## Provider integration boundary

Carrier/satellite/payment interfaces in `src/contracts/providers.ts` remain future integration contracts. They contain no invented endpoints or live credentials. Provider charging, settlement, SIM issuance, usage, native calls and emergency services need the actual contracted interfaces and their own reconciliation/acceptance tests. A successful lab workflow proves only the lab workflow.

`src/app.ts` preserves the earlier read-only preview implementation for regression coverage. `src/server.ts` starts the authenticated persistent platform. Do not deploy the legacy entry point as the operations API.
