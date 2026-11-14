# Onesa Mobile project

This product directory contains the Onesa Mobile hardware pilot and operations platform. The project aims to provide a simple Zimbabwean mobile service with a future satellite capability through authorized partners.

## Structure

- Website: `onesa-mobile-frontend/web/`.
- Public/customer UI and internal operations are distinct surfaces. `/account/` and `/internal/` are protected persistent workspaces; synthetic previews are isolated at `/#demo` and `/preview/internal/`.
- Native iPhone, iPad and Android app: `onesa-mobile-frontend/mobile/`, including real generated `ios/` and `android/` projects.
- API: `onesa-mobile-backend/`.
- Product decisions and research: `docs/`.

Keep each package independently installable and buildable. Do not introduce shared frontend/backend runtime folders or cross-package source imports. Communicate through documented APIs. Use the same iOS target for iPhone and iPad.

Canonical repository: `DruHustle/onesa-mobile`. GitHub workflows belong in this repository's root `.github/workflows/`. Keep Mobile independently buildable. `DruHustle/onesa-identity` owns the managed sign-in integration, global accounts and migration tooling. Company Portal owns the legacy issuer during transition. Mobile owns its resource permissions, account records and product sessions.

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


## Workspace and release verification

Keep extra worktrees in `local-tools/worktrees`, deployment evidence in
`local-tools/deployment-evidence`, release verification in
`local-tools/release-verification`, and operational migration records in
`local-tools/migrations`, relative to this repository. Preserve versioned schema
migration locations. Evidence must be sanitized and identify exact source hashes.

The current backend has production Portal OIDC customer/staff authentication,
live entitlement revalidation, native one-use handoff, persistent launch-interest
and internal support workflows. These implemented identity/operations capabilities
do not activate the proposed telecom plans, SIMs, payments or satellite service.
Production provider features stay unavailable until actual partner qualification.
The backend check includes type checking and synthetic local HTTP/data tests;
it does not establish hosted sign-in, real delivery, signed-store acceptance or
physical-network behavior. Run final checks against the same revisions used for
cross-product qualification and report each environment separately.

On macOS, use an installed Node 24 binary explicitly when the default shell has an
older Node. Native builds may need `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
and an installed JDK compatible with the locked Gradle version. Java 21 compiled
the Android debug target during the November 2026 verification; Android Studio's
embedded Java 25 is not a substitute for every locked project. Discover SDKs and signing readiness; do not
substitute a debug key for release signing or claim a simulator is a phone.
