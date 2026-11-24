# Specialist review resolution register

Date: **5 November 2026**. Product: `DruHustle/onesa-ug/onesa-mobile`.

Five specialist agent reviews were assigned: principal telecommunications engineering, senior graphics design, senior telecom UI/UX, cybersecurity engineering and principal software engineering. These are source/research reviews and implementation checks, not independent human professional certification.

**Status meanings:** “Implemented” means the software/document change exists and has the cited local checks. “Hosted qualification” requires an observed CI result. “External acceptance” requires evidence from actual equipment, authorities, operators, providers or deployment owners. No internal checkbox closes an external dependency. See [validation](../VALIDATION.md) for exact-source results.

## Second specialist review — 5 November 2026

This pass reviewed the deployed website source, persistent API, native account app and physical commissioning workflow. The tables below this section retain the first review as history. The current integrated local result is **154 passing tests** across the API, web, native logic and recovery suites, with one Docker case unavailable locally. That case and the remaining hosted gates passed in [qualification run 42129021936](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936) on `337142d`: **all six jobs**, including **9 recovery tests**, **35 PostgreSQL identity tests** and **20 browser groups / 31 layout observations**. Android and iOS simulator compilation passed on `e30427c`; its native source is unchanged through `337142d`. Exact artifacts and retained screenshots are linked from validation.

| Specialist / findings | Implemented correction | Verification and remaining acceptance |
| --- | --- | --- |
| Principal telecom — TEL-13–18 | Manual passing trials require a prior scoped plan, matching equipment and current independently reviewed authority; D2C requires a handset and satellite authorization/entitlement. Unknown rated power is nullable, corrections invalidate its check, and N/A is restricted and explained. Added the USB-first physical bench, wiring, measured-power worksheet and refreshed POTRAZ/partner matrix. | Thirteen hardware/configuration regressions pass, including the principal engineer's declared-fault cases. Planning template retains 14 **not-run** acceptance cases and 12 **unverified** gates. Actual documents, devices and radio observations remain external acceptance. |
| Senior graphics — GFX-10–16 | Corrected the phone account-link contrast, interactive borders, dark-card focus ring, small captions, FAQ target ownership and narrow-layout wrapping. The native implementation applies the higher-contrast control token. | Source/color calculations, web build and native exports pass. Authenticated Chromium layout/keyboard checks pass; the release owner inspected the retained phone/desktop screenshots and closed the additional commissioning-label, badge, skip-link and FAQ-spacing findings. Physical text scaling and assistive technology remain device acceptance. |
| Senior telecom UX — UX-11–18 | Added native discovery retry, expiry cleanup, stale-read protection, owner/shape validation and usable correction drafts. Web mutations now belong to a session generation, API form errors receive focus, production application copy is accurate and older trial evidence is reachable. | Web **23** and native **25** tests pass; both builds/exports pass. Delayed-response regressions cover old success/error work across identity changes. Physical keyboard, foreground/background, VoiceOver and TalkBack checks remain. |
| Cybersecurity — SEC-02-01, SEC-02-02 and explicit production mode | Re-check the local capability after delayed central authorization, prepare private SQLite/sidecar files before opening them, reject unsafe file/directory links and refuse a production process that omits `APP_MODE`. | API **98** tests pass, including the reproduced logout race and six filesystem regressions. This is source/protocol qualification, not a deployed penetration test or real identity commissioning. |
| Principal engineering — PE-02-11–15 | A declared fault invalidates all seven checks and cannot be cleared by an unrelated pass or receipt edit. Recovery requires an explicitly selected existing volume and matching lab/production mode. Observation times use consistent second precision. Added isolated real-UI browser journeys and corrected the domain/deployment architecture. | Fault regressions pass. Hosted runtime qualification passes **9** recovery tests, actual Compose merge and container persistence/recovery. Chromium passes **20 groups / 31 layout observations**; local execution limitations remain documented rather than presented as passes. |

The software fixes above do not commission equipment or enable a provider. The public website and attached domain have a separate [deployment receipt](../DEPLOYMENT.md); DNS, the persistent production API and Mobile identity remain distinct from a successful web build.

## Principal telecommunications engineering

Source: [telecom review](TELECOM_REVIEW.md). Live provider actions remain unavailable.

| Finding | Resolution | Disposition / remaining evidence |
| --- | --- | --- |
| TEL-01 — host/satellite authority | Light MVNO negotiating position, distinct terrestrial/D2C/dish paths, scoped readiness and explicit provider hold | **External acceptance:** signed host/service/territory responsibilities, POTRAZ route, test access and satellite entitlement |
| TEL-02 — physical inventory | Persistent sites/assets, custody/serial/supplier/firmware/power/approval fields, receipt state, seven commissioning checks and history export | **Implemented. Physical acceptance:** receive assets and perform checks |
| TEL-03 — evidence validity | Issuer, issue date, country/operator/path/device scope, expiry, revocation and independent fresh-auth reviewer; no automatic activation | **Implemented. External acceptance:** obtain and verify actual documents |
| TEL-04 — eligibility | Scoped trials/evidence; dish/router cannot stand in for a D2C handset; exact device/software/SIM/feature matrix specified | **Implemented pilot records. External acceptance:** host-qualified combinations and commercial eligibility interface |
| TEL-05 — subscriber lifecycle | Owned lab application, information-request correction, staff review and awaiting-host state; registration/payment/network states distinct | **Implemented pilot journey. External integration:** registration and host provisioning/reconciliation |
| TEL-06 — usage authority | No invented live counters; unavailable/unobserved usage and required source/time/unit/event reconciliation documented | **External integration:** no metering feed has been supplied; live usage is not claimed |
| TEL-07 — approved tariffs | Public concepts separate from purchasable offers; test-only ledger/PDF with exact amounts and currency | **Implemented hold. External acceptance:** approved tariffs, tax and charging/settlement |
| TEL-08 — health separation | App health, refresh, manual observation and readiness distinguished; owned support queues | **Implemented separation. External integration:** radio/provider telemetry, service monitoring and escalation |
| TEL-09 — native/physical acceptance | Generated native projects, compiler workflows and 14-case hardware matrix | **Hosted compilation passed** for Android and iPhone/iPad simulator on `3af4282`; **physical acceptance** remains for installed devices and services |
| TEL-10 — emergency/numbering | Separate evidence gates and approved-test-only procedure | **External acceptance:** responsibilities, numbering/interconnect and test facility |
| TEL-11 — hosting/recovery | Explicit identity/key/proxy configuration, private runtime, encrypted recovery and restored-user reissue | **Implemented controls. External acceptance:** data location, key custody, TLS, retention, durable host and timed restore |
| TEL-12 — changes/rollback | Configuration history, invalidation after firmware/serial/approval changes and documented pre-change backup/rollback | **Implemented records. Physical acceptance:** prove restore/isolation on equipment |

## Senior graphics design

Source: [graphics review](GRAPHICS_REVIEW.md) and [design system](../DESIGN_SYSTEM.md).

| Findings | Implemented resolution | Evidence / remaining scope |
| --- | --- | --- |
| GFX-01, GFX-02 — tiny text | Public, protected, legacy-preview and native readable type scale; operational inputs 16px | Web build and focused browser review; physical text scaling remains |
| GFX-03 — inconsistent brand | Common forest/mint palette, three-bar marks and deterministic native SVG-to-PNG artwork | Source/asset inspection and prebuild; installed behavior remains |
| GFX-04 — small targets | At least 44px product target for touch actions | Style/layout review; not a blanket accessibility certification |
| GFX-05 — marketing-first account | Customer/native home leads with state and next task; public hero retained | Actual component and native source review |
| GFX-06 — concealed navigation | Labelled phone section selectors in protected and legacy workspaces | Phone component review and build |
| GFX-07 — misleading colors | Neutral concept/demo, labelled pending/failure/unavailable states; no activation by selection | State/source review |
| GFX-08 — weak focus | Mint focus on dark headers, dark focus on light controls | Source and focused browser review |
| GFX-09 — unjustified online status | Planned/received/commissioned/faulty inventory, not-run checks and observed source/time | Domain/HTTP tests and browser review; equipment remains unmeasured |

## Senior telecom UI/UX

Source: [telecom UX review](TELECOM_UX_REVIEW.md).

| Findings | Implemented resolution | Evidence / remaining scope |
| --- | --- | --- |
| UX-01 — ephemeral operations | Protected persistent `/internal/`; synthetic preview relocated to `/preview/internal/` | Real HTTP permission/persistence checks and component browser review |
| UX-02 — incomplete recovery | `/account/` and native application/correction, conversations, requests, receipts and exports | Domain/HTTP tests and form review; production browser SSO remains |
| UX-03 — conflated states | Account/application/registration/test finance/network separated; explicit refresh | State/source/browser review |
| UX-04 — no hardware journey | Receipt, checks and trials; immutable finished observations and manual/simulated source | Domain/HTTP and component review |
| UX-05 — duplicates/conflicts | Persistent idempotency, retained retry keys, revisions, preserved input and required refresh | Domain/HTTP/web tests; slow physical link in HW-06 |
| UX-06 — apparent commerce | Test ledger/receipts, exact minor units, bounded refunds and protected downloads | Financial/authorization tests; no settlement or tax-invoice claim |
| UX-07 — small-screen difficulty | Labelled mobile navigation, readable type, 44px controls, contained tables, expandable forms | Narrow-frame review; no exhaustive accessibility certification |
| UX-08 — native/offline hierarchy | Four task tabs, account-first home, minimized cache, freshness and secure storage | Logic/types/bundles; device acceptance remains |
| UX-09 — ambiguous authentication | Actual configured mode, central production login, generated lab credentials and staff MFA | Auth/HTTP tests and actual sign-in page review |
| UX-10 — unscoped readiness | Issuer/date/scope/expiry, second reviewer and reason; no live toggle | Evidence tests and component review |

## Cybersecurity engineering

Source: [security review](SECURITY_REVIEW.md) and [threat model](../THREAT_MODEL.md). The second review reproduced and fixed a delayed authorization race after local sign-out and private database sidecar exposure. The following earlier controls remain in place; they are not a penetration test of a deployed system.

| Finding group | Implemented control/evidence | Remaining acceptance |
| --- | --- | --- |
| Access/object authority | Backend seven-role permissions, immutable-subject ownership, scoped SQL and private exports/documents | Real staff grant administration/access review |
| Correct central protocol | Confidential authorization code, PKCE/state/nonce, signed identity and opaque-token `/session` revalidation | Qualified Portal migration 015, exact client/origins and actual deployment test |
| Portal compatibility | Optional Mobile client/roles; legacy client vocabulary preserved; staff MFA | 35 tests passed against hosted disposable PostgreSQL; no live migration run |
| Credential/replay controls | Scrypt, TOTP replay protection, hashed sessions, encrypted capabilities, exact origin/CSRF, 60-second one-use native PKCE handoff | External key custody and physical OS/callback acceptance |
| Stale grants/outage logout | Live central authorization, source auth time, fresh approvals/refunds, local-first logout | Actual issuer outage/revocation drill |
| Backup access revival | Restore disables all lab users and old capabilities; per-user reissue confirms role and privately rotates secrets | Operator reconciles actual people and current authority |
| Accidental provider effects | Unavailable network/payment adapters; production rejects lab registration/charging | Contracted provider specification and negative-path acceptance |
| Retry/audit integrity | Atomic records/idempotency/audit, revisions and immutable observations | Independent audit anchoring/retention; DB admin can recompute local chain |
| Dependency advisories | Locked scoped glob/minimatch overrides, zero production advisories, real fingerprint generation and successful native compilation | Ongoing monitoring and requalification after dependency/toolchain changes |
| Path/origin validation | Encoded OIDC queries handled correctly; production lacks implicit localhost trust; private HTTP requires real IPs | New regressions passed; deployed TLS/proxy qualification remains |
| Late private work and retained drafts | Native lifecycle cancellation, guarded shared secure-storage queue, explicit failed-cleanup retry, cleared private drafts, scoped export sharing and web download/session guards | Delayed-response/storage/download regressions; physical OS storage/share-sheet acceptance remains |

## Principal software engineering

Source: [principal engineering review](PRINCIPAL_ENGINEERING_REVIEW.md).

| Finding | Implemented resolution | Evidence / remaining scope |
| --- | --- | --- |
| PE-01 — incomplete image | Locked runtime dependencies installed in non-root image | Container build/start/restart/recovery passed on earlier application source `3af4282`; the production API is not commissioned. Website hosting is recorded separately. |
| PE-02 — hidden failed check | Any failed required check remains dominant | Domain regression passed |
| PE-03 — stale evidence | Firmware/serial/approval changes invalidate checks and retain history; receipt cannot hide failure | Domain/HTTP regressions passed |
| PE-04 — truncated records | Scoped cursor pages, SQL totals/readiness, full export and retained loaded ranges | Multi-page HTTP and web merge tests passed |
| PE-05 — unsafe/missing recovery | Online encrypted WAL backup, validation, no overwrite, mode isolation and recovered-access invalidation | Six real-schema tests and actual container recovery passed; timed physical drill remains |
| PE-06 — proxy/rate limiting | Exact trusted peers, overwritten forwarded input and expiry cleanup at limiter cap | Config/HTTP checks; actual ingress configuration remains |
| PE-07 — excessive history payload | Compact bounded history omitted from lists, retained in protected detail | HTTP regression passed |
| PE-08 — secret artifacts | Git/Docker exclusions for keys, databases, credentials, archives and signing files | Scoped publication review; no real secrets supplied |
| PE-09 — OAuth logging | Raw API proxy access/error logs disabled; sanitized correlation IDs | Config inspection; deployed log review remains |
| PE-10 — absent runtime/native evidence | Container/restart/recovery, PostgreSQL identity, Android debug and unsigned iOS/iPad jobs | **All seven hosted jobs passed** on `3af4282`; exact artifact receipts are in [validation](../VALIDATION.md). Release signing and physical installs remain |

## Release decision

The completed software scope is an authenticated, persistent **hardware-pilot control plane** with customer web/native journeys and internal operations. Code can close its software findings. It cannot create a host contract, provider specification, regulated tariff, approved site, measured radio service or physical custody.

Before real subscriber launch, appoint accountable owners for licensing/host negotiation, privacy/hosting, field acceptance, identity/security and settlement. Execute the [hardware pilot](../HARDWARE_PILOT.md), [regulatory matrix](../REGULATORY_MATRIX.md), [runtime guide](../../infra/runtime/README.md) and [roadmap](../ROADMAP.md). All unperformed physical cases remain “not run”; all uncommissioned commercial/provider actions remain unavailable.
