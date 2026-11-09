# Onesa Mobile project

This product directory contains the Onesa Mobile hardware pilot and operations platform. The project aims to provide a simple Zimbabwean mobile service with a future satellite capability through authorized partners.

## Structure

- Website: `onesa-mobile-frontend/web/`.
- Public/customer UI and internal operations are distinct surfaces. `/account/` and `/internal/` are protected persistent workspaces; synthetic previews are isolated at `/#demo` and `/preview/internal/`.
- Native iPhone, iPad and Android app: `onesa-mobile-frontend/mobile/`, including real generated `ios/` and `android/` projects.
- API: `onesa-mobile-backend/`.
- Product decisions and research: `docs/`.

Keep each package independently installable and buildable. Do not introduce shared frontend/backend runtime folders or cross-package source imports. Communicate through documented APIs. Use the same iOS target for iPhone and iPad.

Canonical repository: `DruHustle/onesa-mobile`. GitHub workflows belong in this repository's root `.github/workflows/`. Keep Mobile independently buildable; the Company Portal owns the identity provider and its migrations in `DruHustle/onesa-company-portal`.

## Product integrity

The current release is a prelaunch hardware/software pilot. Every fixture must remain clearly fictional. Proposed plans have no approved price or allowance. Live onboarding, SIM provisioning, payments and satellite access have not been integrated. A configuration flag must never turn a mock adapter into an apparent live service.

Network access requires provider and regulatory authorization. Do not invent carrier endpoints, Starlink wholesale APIs, Zimbabwe satellite availability, universal device compatibility or emergency functionality. Mobile network attachment is controlled by the network and device, not by an app switch. Preserve the distinction between identity login, subscriber registration, SIM activation and satellite eligibility.

Use compact mobile layouts, readable type, accessible controls and minimal unnecessary network traffic. Label usage sources and timestamps when implementing real usage. Avoid large empty cards.

## Development and verification

Use Node.js 24.12 or newer within the 24 LTS line. Keep dependency lockfiles and native binary resources, but never commit credentials, production data or signing keystores. Generated Android release configuration must not use a debug key.

- Web: `npm ci && npm test && npm run build`.
- Backend: `npm ci && npm run check`.
- Mobile: `npm ci && npm run verify`.

Run each command in its package directory. Native JS exports do not establish successful native compilation, physical-device behavior or store readiness. Report those separately. Before live integrations, agree the customer-data jurisdiction, controller responsibilities and key custody described in the due-diligence documents.
