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

On 11 November 2026, Vercel resolved `mobile.onesa.eu` to the READY production deployment `dpl_BGgNfva268NoUjAYN9pxih5BXu3i`. Its Git metadata identifies `DruHustle/onesa-mobile`, branch `main`, commit [`722504b4`](https://github.com/DruHustle/onesa-mobile/commit/722504b48551a89f7bf7c66a4410c1a9b5d34071). The custom domain is verified on the original Vercel project. [Standalone transition history](STANDALONE_RESTORATION.md).

Anonymous HTTPS GET checks on the custom domain returned HTML 200 at `/`, `/account/`, `/internal/` and `/preview/internal/`. The health, session, sign-in start and service readiness routes under `/api` each returned JSON 503 with `BACKEND_NOT_CONNECTED` and no session cookie. The public website is serving from the standalone repository. Account and staff operations still require the persistent backend and shared identity client.

Project settings select the web root; `vercel.json` intentionally contains no `rootDirectory` key. This deployment needs no backend URL, identity client secret, authentication key or database credential. Do not upload private environment files or unrelated product directories as standalone web assets.

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

These are deployment-URL observations through authenticated Vercel access. Hosted POST and HEAD were **not** verified; neither anonymous custom-domain availability nor a working backend/sign-in is established by this receipt. The November 11 custom-domain checks above supersede this November 5 observation.

## Routing and availability

The root serves the public application, including its `#demo` synthetic customer preview. `/account/`, `/internal/` and `/preview/internal/` support direct navigation and refresh through explicit SPA rewrites. Existing static assets retain their actual paths; unknown routes are not rewritten into a successful homepage. Account, staff and preview shells carry `noindex` response headers. HTML and API responses are non-cacheable; content-hashed `/assets/` files can be cached.

The configuration routes every `/api` and `/api/...` path to one dependency-free Vercel Node function in `api/unavailable.mjs`. The handler returns HTTP **503** and a JSON `BACKEND_NOT_CONNECTED` error, including health, session, sign-in, callback and mutation paths. HEAD is implemented with the same status and no body; the hosted method coverage is recorded above. It reads no credentials, query strings or request bodies, performs no upstream request, sets no cookie and does not emulate an authenticated or healthy API. The workspace displays the explicit unavailable response and does not open a functional account. The local Vite development proxy and the Docker gateway remain separate runtime paths.

Security headers restrict scripts and connections to the same origin, prohibit framing, suppress referrers and disable camera, microphone and geolocation access. The public canonical and Open Graph URL are exactly `https://mobile.onesa.eu/`. No wildcard upstream, cross-origin credential forwarding or new external script is configured.

## Verification and later integration

Run `npm test` and `npm run build` from the web package. The deployment tests exercise the real holding handler and check the configured route/cache boundaries. These local checks do not substitute for Vercel's deployed router. Before reporting the website live, verify the exact deployed source, HTTPS certificate, public/custom-domain visibility, direct SPA paths, asset MIME types, security headers, and JSON 503 responses for both GET and POST under `/api`. Verify health also returns 503 and no session cookie is issued. Preserve the prior deployment for ordinary website rollback.

Replacing the holding response requires the real persistent API, exact-origin/CSRF/proxy qualification, approved secret custody, and a separately commissioned Onesa Mobile identity client with callback `https://mobile.onesa.eu/api/v1/auth/onesa/callback`. Mobile's production backend and shared sign-in still require commissioning. At Portal commit [`9e6001b`](https://github.com/DruHustle/onesa-company-portal/blob/9e6001b/scripts/release/oracle_portal_identity.py), the migration tool includes migrations 015 and 016. The owner release and hosted acceptance tools register AI, Drone and Robot. Adding the Mobile client requires an explicit release profile, the registered mobile callback and a hosted sign-in check. See the [runtime and recovery guide](../infra/runtime/README.md). Production subscriber registration, charging, provisioning and satellite access remain blocked by the actual provider and regulatory dependencies.

Official routing/runtime references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [vercel.json configuration](https://vercel.com/docs/project-configuration/vercel-json), and [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).
