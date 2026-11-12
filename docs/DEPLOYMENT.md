# Mobile website deployment

The first hosted scope is the prelaunch website and its clearly labelled synthetic previews. Customer and staff route shells are included, but account, authentication, record, payment and network APIs are unavailable until the actual Mobile backend and shared identity are commissioned. A website deployment does not establish a working mobile network.

## Target and build

| Setting | Value |
| --- | --- |
| Public target | `https://mobile.onesa.eu` |
| Vercel project | `onesa-mobile` / `prj_VsgXltJg2z5BKPadggrKqZEBAOZ0` |
| Vercel team | `team_ZCFijEEeYUAKYka9HEyEeyGm` |
| Repository | `DruHustle/onesa-mobile` |
| Project root | `onesa-mobile-frontend/web` |
| Runtime / framework | Node.js 24 / Vite |
| Install / build / output | `npm ci` / `npm run build` / `dist` |

## Current production website

On 12 November 2026, `mobile.onesa.eu` resolved to Vercel production deployment [`dpl_D47faLtCwQR3dEt55PDnYVbeRAQw`](https://onesa-mobile-hy7ywh4wt-druhustles-projects.vercel.app), marked READY at `DruHustle/onesa-mobile` commit [`c0602749`](https://github.com/DruHustle/onesa-mobile/commit/c0602749b9eb64fe88af6a5e3b8da37c80e63786). The custom domain is verified on the original Vercel project. [Standalone transition history](STANDALONE_RESTORATION.md).

Anonymous HTTPS GET checks on the custom domain returned HTML 200 at `/`, `/account/`, `/internal/` and `/preview/internal/`. The health, session, sign-in start and service readiness routes under `/api` each returned JSON 503 with `BACKEND_NOT_CONNECTED` and no session cookie. The public website is serving from the standalone repository. Account and staff operations still require the persistent backend and shared identity client.

Project settings select the web root. The repository’s `vercel.mjs` supplies the site routes. This deployment needs no backend URL, identity client secret, authentication key or database credential. Do not upload private environment files or unrelated product directories as standalone web assets.

## Historical Vercel deployment

| Receipt | Observed result |
| --- | --- |
| Source | [`337142d97cf0b5478494c6b28a73c5fd75ae7383`](https://github.com/DruHustle/onesa-ug/commit/337142d97cf0b5478494c6b28a73c5fd75ae7383) |
| Production deployment | `dpl_9pMTeAEjs9NA6bSZxmnQgih9WvmD` — **READY**, Git source matches the commit above |
| Deployment URL | [onesa-mobile-6rhk7k53s-druhustles-projects.vercel.app](https://onesa-mobile-6rhk7k53s-druhustles-projects.vercel.app) |
| Source qualification | [Run 42129021936](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936) — **all six jobs passed** |

Observed on **5 November 2026 at 23:23 UTC**. Authenticated hosted **GET** requests against that deployment verified:

| Paths | Response |
| --- | --- |
| `/`, `/account/`, `/internal/`, `/preview/internal/` | HTML **200**, `no-store` |
| `/api`, `/api/healthz`, `/api/v1/session`, `/api/v1/auth/onesa/start` | JSON **503**, `BACKEND_NOT_CONNECTED`, `no-store`, no session cookie |
| Built JavaScript and CSS assets | **200**, correct MIME types, immutable caching |

These are deployment-URL observations through authenticated Vercel access. Hosted POST and HEAD were **not** verified; neither anonymous custom-domain availability nor a working backend/sign-in is established by this receipt. The November 12 custom-domain checks above cover anonymous GET requests.

## Routing and availability

The root serves the public application, including its `#demo` synthetic customer preview. `/account/`, `/internal/` and `/preview/internal/` support direct navigation and refresh through explicit SPA rewrites. Existing static assets retain their actual paths; unknown routes are not rewritten into a successful homepage. Account, staff and preview shells carry `noindex` response headers. HTML and API responses are non-cacheable; content-hashed `/assets/` files can be cached.

Without a configured production gateway, all `/api` requests reach the holding function in `api/unavailable.mjs`. The handler returns HTTP **503** and a JSON `BACKEND_NOT_CONNECTED` error, including health, session, sign-in, callback and mutation paths. HEAD is implemented with the same status and no body; the hosted method coverage is recorded above. It reads no credentials, query strings or request bodies, performs no upstream request, sets no cookie and does not emulate an authenticated or healthy API. The workspace displays the explicit unavailable response and does not open a functional account. The local Vite development proxy and the Docker gateway remain separate runtime paths.

Security headers restrict scripts and connections to the same origin, prohibit framing, suppress referrers and disable camera, microphone and geolocation access. The public canonical and Open Graph URL are exactly `https://mobile.onesa.eu/`. The browser uses same-origin API paths for account sessions and redirects.

## Commission account access before mobile service

1. Deploy the production API and gateway on the Onesa server with its dedicated volume and the registered Mobile OIDC client. Set `PUBLIC_ORIGIN` to `https://mobile.onesa.eu`. The gateway exposes the API under `/api/`. It needs its own HTTPS hostname under `onesa.eu`.
2. On that gateway, confirm `GET /api/v1/session` returns `mode: production`, `authMode: onesa`, `ssoAvailable: true` and an anonymous session. Confirm `GET /api/v1/status` advertises launch interest while sales, carrier provisioning, live payments and satellite entitlement are false.
3. Set `MOBILE_ACCOUNT_GATEWAY_ORIGIN` to that HTTPS **origin** in the Vercel project's Production environment and redeploy. The rewrite preserves the API path, query and method on the public custom domain. Previews and other aliases keep the holding response. Leave the variable unset until the gateway exists. Removing it and redeploying restores the holding response.
4. On the custom domain, use an approved test customer to complete Portal sign-in, register interest, refresh, withdraw and sign out. Confirm the account export and staff view reflect the withdrawal. Verify the callback round trip, secure cookie, logout and unauthenticated access before inviting customers. A new customer can create a central Onesa account, verify email and request Mobile access through the Portal.

A launch preference is associated with the signed-in account. Customers can revise it and the team can review its current state. It collects no phone number, identity document or payment details. It carries no promise of a place in a queue, contact or connectivity.

## Website verification

Run `npm test` and `npm run build` from the web package. The deployment tests exercise the real holding handler and check the configured route/cache boundaries. These local checks do not substitute for Vercel's deployed router. For a holding deployment, verify the exact deployed source, HTTPS certificate, public/custom-domain visibility, direct SPA paths, asset MIME types, security headers, and JSON 503 responses for both GET and POST under `/api`. Verify health also returns 503 and no session cookie is issued. Preserve the prior deployment for ordinary website rollback.

Replacing the holding response requires the real persistent API, exact-origin/CSRF/proxy qualification, approved secret custody, and a separately commissioned Onesa Mobile identity client with callback `https://mobile.onesa.eu/api/v1/auth/onesa/callback`. Mobile's production backend and shared sign-in still require commissioning. Portal commit [`74a1ad38`](https://github.com/DruHustle/onesa-company-portal/blob/74a1ad383256438d0c65138e67a6f766c1fd71a9/scripts/release/oracle_portal_identity.py) includes the `mobile` client, its exact public origin and callback in the seven-client registry. For this deployment the Portal operator uses the existing [v2 identity release](https://github.com/DruHustle/onesa-company-portal/blob/74a1ad383256438d0c65138e67a6f766c1fd71a9/scripts/release/oracle_portal_identity_v2.py) and [v2 hosted acceptance](https://github.com/DruHustle/onesa-company-portal/blob/74a1ad383256438d0c65138e67a6f766c1fd71a9/scripts/release/oracle_portal_identity_acceptance_v2.py) procedures. Confirm the registered Mobile client on the live issuer and deliver its matching secret through the protected runtime file before wiring the gateway. On 12 November the Vercel project had no `MOBILE_ACCOUNT_GATEWAY_ORIGIN` and the public sign-in start still returned `503 BACKEND_NOT_CONNECTED`. See the [runtime and recovery guide](../infra/runtime/README.md). Production subscriber registration, charging, provisioning and satellite access remain blocked by the actual provider and regulatory dependencies.

Official routing/runtime references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts), and [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).
