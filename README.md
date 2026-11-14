# Onesa Mobile

**A Zimbabwe mobile-service venture, starting with a physical device bench and a secured pilot operations platform.**

Canonical source: [`DruHustle/onesa-mobile`](https://github.com/DruHustle/onesa-mobile). This standalone repository preserves the complete Mobile product previously maintained in `onesa-ug/onesa-mobile`. [Restoration provenance and deployment transition](docs/STANDALONE_RESTORATION.md).

The implemented software includes the public website, authenticated customer and staff web workspaces, an API-connected iPhone/iPad/Android app, persistent hardware commissioning and operations records, scoped identity, support conversations, lab billing, protected PDFs, audit and encrypted recovery tooling. **It does not provide an operating mobile network.** Commercial onboarding, real payment settlement, SIM/eSIM provisioning and satellite entitlement remain disabled until the actual providers and Zimbabwe approvals are commissioned. No carrier or Starlink partnership is claimed.

The public website deployment targets [mobile.onesa.eu](https://mobile.onesa.eu). Its initial hosted scope is the prelaunch website and synthetic previews; online account and staff services return an explicit unavailable response until the persistent backend and shared identity are connected. [Deployment scope and configuration](docs/DEPLOYMENT.md).

## Start with the hardware

Start with the [physical bench pack](docs/PHYSICAL_BENCH.md), [hardware pilot runbook](docs/HARDWARE_PILOT.md) and [planned inventory template](infra/hardware/pilot-template.json). The first USB session can reuse a suitable Mac and Android phone. For the multi-device phase, allocate one managed router, a locally approved AP if needed, an iPhone, two representative Android phones, access to a tablet, measured backup power, cabling and encrypted recovery media. The pack includes port roles, isolation checks, a power worksheet and the evidence handover. Starlink dish quantity starts at **zero**; add one only for a separately approved satellite-broadband IP test. A dish does not establish handset direct-to-cell service.

The proposed commercial model is a **Light MVNO**, with a licensed host supplying radio/core functions and Onesa supplying the customer experience and operations. Satellite country, device and service entitlement needs its own written scope. [Business brief](docs/BUSINESS_BRIEF.md), [regulatory matrix](docs/REGULATORY_MATRIX.md), [partner due diligence](docs/PARTNER_DUE_DILIGENCE.md).

## Product surfaces

| Surface | Route / source | Implemented behavior |
| --- | --- | --- |
| Public website | `/`, web `src/App.tsx` | Concept plans, three connectivity paths, FAQs, account/staff entry points |
| Customer workspace | `/account/`, web `src/workspace/` | Free launch-interest registration and withdrawal, cases/replies, account requests and complete account export. Lab accounts also have pilot applications and test receipts |
| Staff operations | `/internal/`, web `src/workspace/` | Role-filtered inventory, commissioning, trial observations, launch evidence and interest records, application reviews, support, test ledger/refunds and audit |
| Isolated visual previews | `/#demo`, `/preview/internal/` | Explicitly fictional, browser-local examples; no operational authority |
| Native customer app | `onesa-mobile-frontend/mobile/` | Secure Onesa sign-in, launch-interest preferences, help, account requests, private downloads and an optional local preview |
| API | `onesa-mobile-backend/` | Independent Node 24 service, SQLite transactions, authenticated REST contract, PDF generation |
| Runtime and recovery | `infra/runtime/`, `scripts/` | Isolated lab Compose stack, production configuration candidate, authenticated encryption of backups and verified restore |
| Reviews | `docs/reviews/` | Telecom, graphics, telecom UX, cybersecurity and principal engineering findings |

Each package has its own dependencies and lockfile. Frontends communicate with the backend over HTTP; they do not import backend runtime code. Native iPhone and iPad share the iOS target. Workflows live in this repository's `.github/workflows/`. Portal identity-provider migration and regression checks belong to `DruHustle/onesa-company-portal`; Mobile keeps its own identity-client contract checks.

## Run the local pilot

Use Node **24.22.1** (the qualified runtime) and Git. Start from this product directory:

```sh
npm ci --prefix onesa-mobile-backend
npm ci --prefix onesa-mobile-frontend/web
node onesa-mobile-backend/src/auth/bootstrap.ts --database onesa-mobile-backend/var/onesa-mobile.sqlite --output onesa-mobile-backend/var/lab-credentials.json --all-roles
npm run dev
```

Open `http://localhost:5173/account/` or `http://localhost:5173/internal/`. The bootstrap writes random lab credentials into a private, ignored file; it never overwrites accounts. Staff require the generated TOTP seed in an authenticator. Keep the credentials local and use synthetic records. This command exposes Vite to the local network; use a trusted development environment. The API binds to loopback by default.

The [runtime guide](infra/runtime/README.md) provides the isolated Docker stack, key handling, recovery drill and production separation. Do not use the production overlay as evidence that a commercial service has been deployed.

### Native app

```sh
cd onesa-mobile-frontend/mobile
npm ci
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:4000 npm start
```

The sample LAN address must be replaced with the actual reachable lab API address. Development allows private HTTP endpoints; production builds require HTTPS. Configure an intentional API listener/firewall for physical-device testing. For a same-origin hosted gateway, use its HTTPS URL ending in `/api`. `npm run ios` needs macOS/Xcode; `npm run android` needs the Android SDK/JDK. Signing and physical-device qualification are separate release steps. [Native guide](onesa-mobile-frontend/mobile/README.md).

## Security and operational behavior

- Lab staff use password plus TOTP. Production requires the registered Onesa Mobile OIDC client and current Mobile grants; local lab authentication is refused.
- Cookies are HttpOnly, use exact allowed origins and anti-CSRF tokens. Native tokens use the device secure store. Role and owner checks run on the server.
- Mutations require actor-scoped retry keys and current record revisions. Evidence acceptance needs a different authorized reviewer. Completed trial observations are immutable.
- Failed commissioning checks remain failed until corrected; declaring a physical fault requires all checks to be repeated. Firmware/approval/power changes invalidate affected checks. Unknown nameplate power stays unknown, and inventory has no invented live telemetry.
- Passing manual trials require prior criteria, the planned device configuration and current independently accepted evidence for the exact operator/path/device scope. D2C records must identify a handset and include satellite authority/entitlement. Results preserve equipment/evidence revisions; simulations stay explicitly synthetic.
- List pages are bounded and have cursors; account exports stream all owned records. Test PDFs are labelled **not tax invoices**, and no lab ledger entry moves money.
- Backups are encrypted; restore verifies the archive/database and invalidates sessions and pending sign-in flows. The audit hash chain detects local alteration but needs independent anchoring to resist a privileged host administrator.

## Verification

| Package / area | Command |
| --- | --- |
| Web | `npm test && npm run build` |
| Backend | `npm run check` |
| Native | `npm run verify` |
| Recovery, from product root | `node --test scripts/tests/*.test.mjs` |

Run package commands after `npm ci`. [Validation evidence and boundaries](docs/VALIDATION.md) distinguish automated tests, browser component checks, native compilation, actual devices and actual provider acceptance. [Review resolution register](docs/reviews/RESOLUTION_REGISTER.md) maps findings to changes and remaining external dependencies.

## Release boundaries

The software pilot is available for synthetic operational exercises. A commercial launch still needs the licensed host/wholesale model, POTRAZ and data-controller decisions, provider sandboxes and documented APIs, approved tariffs/registration, authoritative metering and settlement, native signing, physical commissioning and service acceptance. The related Company Portal Mobile identity migration is additive source code and must be released separately through its normal process. The website's domain attachment and DNS status are recorded separately in the deployment guide. No live identity client, secret, user grant or regulator application is created by this code.

No blanket open-source licence is granted for original Onesa source. Framework/native-template files retain their own licences and notices.

## Onesa Identity pilot

The Mobile backend supports an opt-in managed OIDC issuer. Configure the existing client ID, secret and exact HTTPS issuer (including its trailing slash) and set `ONESA_MOBILE_API_AUDIENCE=https://api.mobile.onesa.eu`. Register the existing Mobile callback, allow the Mobile confidential client, and issue RS256 access tokens with a maximum five-minute lifetime. The namespaced stable user ID retains existing Mobile ownership. A Portal or Identity administrator role alone grants no Mobile staff access. Customer and staff surfaces retain their independent role checks. The native client opens the system browser and exchanges its one-use, PKCE-bound handoff.

The API caches the issuer's public keys in the existing Mobile database. An already-issued session can be served after an API restart until its token expires, subject to a 24-hour maximum age on trusted keys. Staff sign-in additionally requires a recent verified factor. Local logout ends the Mobile session. In managed mode, the API does not report global provider revocation for a self-contained access token. Provider suspension or grant removal blocks future issuance; outstanding tokens are bounded by the configured lifetime. Run the database-backed backend tests including managed-identity.test.ts, then verify the same account on the actual web, iOS and Android clients before switching production.
