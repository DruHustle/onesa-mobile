# Hardware-pilot software validation

Date: **5 November 2026**. Scope: the persistent Onesa Mobile hardware-pilot and customer/staff control plane, its native clients, and the additive Company Portal identity integration. This is software qualification with synthetic records. It is not evidence of an operating mobile network or commissioned equipment.

## Current hosted qualification — source `337142d`

[Qualified application source](https://github.com/DruHustle/onesa-ug/commit/337142d97cf0b5478494c6b28a73c5fd75ae7383) passed **all six jobs** in [qualification run 42129021936](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936) on `337142d`. Final job conclusions and bounded test/compiler output were inspected. This supersedes pending hosted statements from the local second-review checkpoint; historical receipts below remain tied to their own source.

| Job | Observed result |
| --- | --- |
| API types and HTTP contracts | TypeScript; **98 tests passed**, zero failures/skips. |
| Public, customer and staff web | TypeScript, production build; **23 tests passed**, zero failures/skips. |
| Native logic and JavaScript | TypeScript and both iOS/Android exports; **25 tests passed**, zero failures/skips. |
| Runtime and recovery | **9 tests passed**, zero failures/skips, including actual Compose merge/source selection; container build, protected routes, restart persistence and encrypted recovery passed. |
| Portal identity | **35 tests passed**, zero failures/skips, against disposable actual PostgreSQL. No live migration was run. |
| Authenticated Chromium journeys | **20 journey/check groups**, **31 layout observations**, Chromium **151.0.7922.34**. The API/gateway and all accounts were disposable synthetic test resources. |

The API, web, native and recovery suites contain **155 passing tests**; the **35 Portal cases** and **20 browser groups** are reported separately. Repeated runs are not added together. Native compilation is a different gate, recorded below.

### Browser evidence and visual inspection

The passing browser run exercised real customer application/support/reply/request/export writes, hardware site/asset/receipt and all seven commissioning checks, rejection of a manual pass without authority, acceptance with four matching independently reviewed synthetic evidence revisions, customer denial of staff access, service retry, sign-out, keyboard FAQ/skip navigation and a committed mutation delivered after client expiry. No external browser request or runtime error was observed.

Layout checks cover seven surfaces at **320, 390, 768 and 1440 CSS pixels**, plus twice-computed-size text on public, customer and hardware screens. Text overrides are restored before later journeys. The release owner visually inspected the retained public/customer phone screens, hardware phone/desktop screens and trial-result phone screen. This is focused Chromium qualification, not WCAG certification, physical-device testing or subscriber research.

The downloaded [browser artifact](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936/artifacts/13461663540) is **3,405,227 bytes**, archive SHA-256 `1c37872c0196c486efe320d519fb8ce9a2155220a84148193c141baa6be424b9`, expiring **12 November 2026, 23:23:24 UTC**. Its checksum was verified before bounded extraction. The [report and five inspected screenshots](validation/337142d/README.md) are preserved in the repository independently of artifact retention.

The preceding run on `e30427c` failed because its trial-site locator also matched the test-asset hint. Its screenshots exposed compressed commissioning words/site badges. The next source `3e050bb` passed all six jobs; screenshot inspection then caught a mobile FAQ spacing issue and text-size overrides retained by the test harness. Both were corrected in `337142d`, whose complete run and ordinary-typography screenshots are recorded here. Failed or partial runs are not counted as passing evidence.

### Current native compiler artifacts

[Native compilation run 42126218304](https://github.com/DruHustle/onesa-ug/actions/runs/42126218304) passed both Android job `127590990208` and iOS job `127590990816` on source **`e30427cdfb727b62622916cad572eeef13983a63`**. The native application directory and native compile workflow have **no Git diff** between that source and `337142d`. Web/test/report follow-ups do not claim a newer native compilation.

| Artifact | GitHub archive size | Archive SHA-256 | Retention expiry (UTC) |
| --- | ---: | --- | --- |
| [Android arm64 debug APK](https://github.com/DruHustle/onesa-ug/actions/runs/42126218304/artifacts/13462120800) | 47,909,070 bytes | `08a02397ebca879c1d26bb857233f8b8dfb5641b17ea2e7ff6ff19c3a3c812a7` | 12 November 2026, 23:05:45 |
| [Unsigned iPhone/iPad simulator app](https://github.com/DruHustle/onesa-ug/actions/runs/42126218304/artifacts/13460638650) | 34,481,158 bytes | `6f7252fda0ad699a0dd7770c979b6509b8ba08ea5429509c2b4e23ea17b8639d` | 12 November 2026, 23:08:00 |

These are GitHub archive digests, not extracted APK/app checksums. Job conclusions and artifact metadata establish compilation; exact iOS tool versions were not independently extracted from its full log. Both outputs use Debug configuration and need Metro with matching source. The Android output is for arm64 test devices. The unsigned iOS output runs in the simulator and cannot be installed on a physical iPhone/iPad. Neither is a signed store release or a physical radio observation. Use the [Android USB bench procedure](HARDWARE_PILOT.md#first-android-usb-bench-session).

## Second-review local qualification — 5 November 2026

These checks were rerun on the integrated second-review worktree before publication. They supersede the baseline local counts below. Hosted CI and deployment receipts are separate exact-source observations.

| Area | Command / observed result | Scope |
| --- | --- | --- |
| Mobile API | `npm run check`: TypeScript and **98 tests passed** | Includes 13 hardware/configuration cases, the delayed central-authorization/logout regression, six filesystem-security cases, real HTTP authorization/ownership and OpenAPI freshness. |
| Web | `npm test` and `npm run build`: **23 tests passed**, TypeScript and production bundle passed | Includes obsolete mutation success/errors, private download boundaries, retry/paging and hosted holding-handler routes. |
| Native | `npm run verify`: TypeScript, **25 tests passed**, iOS and Android JavaScript exports passed | Includes discovery, expiry, account ownership/shape, edit eligibility and stale-read ordering, plus existing delayed-session/storage/share tests. These are not native compiler or physical-device results. |
| Recovery | `node --test scripts/tests/*.test.mjs`: **8 passed, 1 skipped** | Real encrypted database recovery and explicit recovery-mode guards pass. Actual Compose merging is skipped because Docker is unavailable locally; hosted runtime CI executed it successfully in the current receipt above. |
| Browser | `npm run test:browser`: launch blocked locally | Chromium was refused its singleton socket by the executor before any page loaded. No local authenticated browser result or new screenshot is claimed. The dedicated GitHub job executes the same synthetic loopback journeys and retains their report/screenshots. |

Total: **154 passing local tests**, with one explicitly skipped Docker case. Repeat runs are not added together. The browser harness exercises real customer writes/export, hardware receipt and all seven checks, denied/accepted scoped trial recording, role denial, connection recovery, sign-out and a committed mutation delivered after client expiry. It also measures 320/390/768/1440-pixel layout and enlarged text; the successful hosted report above now records their execution.

The second-review findings and physical dependencies are in the [resolution register](reviews/RESOLUTION_REGISTER.md). The new [physical bench guide](PHYSICAL_BENCH.md) starts with an existing Mac and Android phone over USB. No actual equipment, operator entitlement, radio service or production identity was established by these checks.

## Earlier local qualification — source `3af4282`

The results in this baseline section and the historical hosted receipts below describe that earlier source revision. Later website deployment and the second specialist review are separate qualification events; do not apply an older native artifact or test count to changed source.

| Area | Observed result | What the check establishes |
| --- | --- | --- |
| Mobile API | Strict TypeScript and **78 tests passed** | Domain transitions, authenticated HTTP, role/owner isolation, retry/revision handling, evidence review, lab receipts, current OpenAPI and identity failure boundaries |
| Public/customer/staff web | TypeScript, production build and **14 tests passed** | Buildable application; preview rules, money parsing, retry identity, truthful pilot states, cursor merging and stale-session export cancellation |
| Native application | TypeScript and **20 tests passed** | Pilot/demo state, API configuration, private-IP origins, scoped pagination and 12 delayed-session/storage/download regressions |
| Native JavaScript | Metro/Hermes production exports completed for iOS and Android | Compilable source and JavaScript bundles; native compilers are a separate gate below |
| Native generation and artwork | Expo prebuild completed; deterministic SVG-to-PNG generation and visual icon inspection passed | iOS/Android source/configuration and consistent installed artwork; iPhone/iPad support enabled |
| Encrypted recovery | **6 tests passed** against actual platform/authentication schemas | Online WAL capture, integrity/audit/idempotency preservation, tamper/wrong-key refusal, no overwrite, mode isolation and recovered-access invalidation |
| API schema | **41 paths / 87 operations**; freshness and formal OpenAPI 3.1 validation passed | Requests, responses, authorization and route inventory agree with implementation |
| Portal integration | Backend types/build/lint/contracts passed; frontend generated types/types/lint and **26 domain/callback tests passed** | Additive Mobile product/client/role support and existing-product compatibility |
| Portal local identity exercise | Migrations 001–015 and **7 focused cases passed** using disposable PGlite | Selected migration/protocol behavior; not PostgreSQL concurrency |
| Dependency review | API and native production audits reported **zero advisories**; Expo fingerprint completed | Inspected lockfiles and audit snapshot; not a guarantee against future advisories |

The API, web, native logic and recovery suites contain **118 passing tests** in total. Portal results are separate. Generated OpenAPI tests are included in the backend count. Repeated checkpoints are not counted as independent coverage.

The legacy Portal hygiene command rejected the ancestor monorepo because it expects a standalone repository root. It is not reported as passed. Publication uses a scoped monorepo diff, artifact and secret review instead.

## Authenticated HTTP and recovery evidence

HTTP tests start the actual server against temporary SQLite databases and generated identities. They cover cookie/CSRF and bearer sessions, customer denial of staff access, cross-customer record/receipt denial, least-privilege staff, independent evidence acceptance, idempotent mutations, stale revisions, immutable completed observations and unavailable provider operations.

Pagination tests create more than one page, apply owner/role scope before pagination, retrieve subsequent pages and verify complete owner export. Bulk equipment responses omit history; the protected detail endpoint retains it. Readiness aggregates include older evidence and never enable service.

Identity tests exercise signed OIDC, PKCE/state/nonce, the Portal opaque-token contract, live role/MFA changes, replay/expiry, secure native handoff, TOTP replay, restart persistence and logout during issuer outage. Encoded HTTPS issuer query parameters reach the callback; encoded path separators remain rejected. Production does not inherit localhost browser trust.

Recovery rejects corrupt archives and wrong keys, clears historical sessions/flows/handoffs, preserves idempotency/audit continuity and disables all restored lab identities. Reissue tests require explicit current-role confirmation, password/TOTP rotation and private output persistence before committing.

Client lifecycle regressions deliberately delay reads, old 401 responses, login responses, uncancellable storage writes and export completion across logout, identity replacement and unmount. They verify stale results cannot replace a later account, stale private files are not shared, and failed cleanup blocks later reads/writes until an explicit successful retry.

These are synthetic protocol tests. They do not establish a configured live Portal, carrier or payment provider.

## Earlier browser and visual review

Reviewed the actual public page and customer/staff sign-in routes in Chromium at phone and desktop sizes. Corrected a hidden mobile account link and a workspace footer contrast/style collision. At the inspected 360px frame, document width remained within available CSS width after the scrollbar.

Reviewed actual customer components for summary, application/correction, support, lab billing and requests; staff components for overview, equipment, trials, evidence, applications, support, ledger and audit. An ignored local harness supplied prominently labelled synthetic props at 360, 390, 768 and 1280px widths. It had no authentication, credentials or business API calls, was not imported by the application and is not shipped.

Checks covered mobile navigation, readable labels, contained tables, equipment details, seven commissioning states, custody/serial/supplier references and the protected-history control. A correction form preserved its values and produced the expected local fixture submission; no real application was saved. Authenticated browser login and production transactions were not performed. Real authorization was exercised through the HTTP suite.

The preserved staff preview was rechecked at 360px after its typography/navigation changes. Its document and viewport widths both measured 345 CSS pixels (the frame reserves 15px for the scrollbar), and the section selector measured 44px high with 16px text. Switching to Billing & agents worked without document overflow. Its banner now identifies an unauthenticated demonstration instead of implying operational authentication is still pending.

The [hardware workspace screenshot](screenshots/hardware-workspace.png) shows actual components with synthetic review data. It is not operational inventory or a network measurement. This focused review is not WCAG certification or a Zimbabwe subscriber usability study. Native styling and artwork were inspected; physical screens, text scaling, VoiceOver and TalkBack require hardware acceptance.

## Hosted qualification

Two workflows provide exact-source gates:

- [Software, container and PostgreSQL qualification](../../.github/workflows/onesa-mobile-ci.yml): package checks, container build/start/restart, encrypted recovery and Portal identity tests against disposable PostgreSQL.
- [Native compilation](../../.github/workflows/onesa-mobile-native-compile.yml): Android arm64 debug application and unsigned iPhone/iPad simulator build. No signing keys are uploaded and no app is published.

### Integration history

Initial source: [`f95059f4`](https://github.com/DruHustle/onesa-ug/commit/f95059f4e1bb711b00057acf7233b431686f8336). [Qualification run](https://github.com/DruHustle/onesa-ug/actions/runs/42076695029): web, API and native JavaScript passed; **35 Portal identity tests passed against actual PostgreSQL**, including the existing concurrent-flow cases. Container images built and became healthy, but the first smoke test found an unpublished gateway port caused by its internal-only network. The gateway now has a separate ingress bridge; the API remains internal-only. [Native run](https://github.com/DruHustle/onesa-ug/actions/runs/42076694933): Android found an SDK-manager PATH error before compilation, which is corrected to the exact installed tool path. The follow-up [qualification run on `c84fa102`](https://github.com/DruHustle/onesa-ug/actions/runs/42077694265) passed all five jobs. Both native jobs also passed on that revision in [run 42077694246](https://github.com/DruHustle/onesa-ug/actions/runs/42077694246). Failed initial jobs are not counted as successful evidence.

### Baseline source qualification

Qualified application source: [`3af428298835db7987c15a18a73133429e45d4ea`](https://github.com/DruHustle/onesa-ug/commit/3af428298835db7987c15a18a73133429e45d4ea). This includes the final guarded session/storage/download lifecycles and private-draft cleanup. A later documentation-only commit may record these receipts without changing the compiled application source.

[Qualification run 42080127807](https://github.com/DruHustle/onesa-ug/actions/runs/42080127807) passed **all five jobs**. The job conclusions and bounded log evidence were inspected directly.

| Job | Observed final result |
| --- | --- |
| Mobile API types and HTTP contracts | TypeScript passed; **78 tests passed, zero failures** |
| Public, customer and staff web | Production build passed; **14 tests passed, zero failures** |
| Native application types and JavaScript bundles | TypeScript and iOS/Android exports passed; **20 tests passed, zero failures** |
| Container restart and encrypted recovery | Three images built; actual loopback gateway publication, protected HTTP, restart/session/record/idempotency/audit persistence and container recovery passed; **6 recovery tests passed, zero failures** |
| Portal identity and Mobile authorization | **35 tests passed, zero failures**, against disposable actual PostgreSQL |

The runtime job recorded these local Docker image IDs. They identify the tested job outputs, not images published to a registry:

| Job image | SHA-256 image ID |
| --- | --- |
| `onesa-mobile-api:lab` | `4a4f04deb31f0abb2e3c87f515b8cfcc3026d72335fb8cc656ec4f688a14f73a` |
| `onesa-mobile-web:lab` | `bf47030062a18c1071bc9141113ffdcfaec2e857cdcf4300b7bed1a70b7b4b7c` |
| `onesa-mobile-recovery:ci` | `983eec71aae2377b66dca1669e0229279c8bf5afe1891b5a08d905b20c92d8c6` |

The observed base images were Node `24.22.1-alpine` at `sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53` and NGINX unprivileged `stable-alpine` at `sha256:44e74ca483234093081138b6d7b6f561d55557756a2deefc3a5056148defeb99`. A future rebuild must requalify moving upstream image tags.

### Baseline native artifacts

[Native run 42080127515](https://github.com/DruHustle/onesa-ug/actions/runs/42080127515) completed successfully on the same source `3af428298835db7987c15a18a73133429e45d4ea`. Android job `127430692599` and iOS job `127430693000` both passed. Together with the five qualification jobs, **all seven hosted jobs passed**. Artifact metadata was inspected directly and identifies that exact source revision.

| Artifact | GitHub archive size | Archive SHA-256 | Retention expiry (UTC) |
| --- | ---: | --- | --- |
| [Android arm64 debug APK, artifact 13440955996](https://github.com/DruHustle/onesa-ug/actions/runs/42080127515/artifacts/13440955996) | 47,909,070 bytes | `6f0b0a9ca182ca46b351375a26b97bd6f94a7b499c0aa38efece03d25d60ef2c` | 12 November 2026, 18:06:46 |
| [Unsigned iOS simulator application, artifact 13440966608](https://github.com/DruHustle/onesa-ug/actions/runs/42080127515/artifacts/13440966608) | 34,481,194 bytes | `d10c04ebd12112f6c5c5f3aa207c497ee44825184701d387b8056c46796ca580` | 12 November 2026, 18:12:56 |

These are the **GitHub artifact archive digests**, not checksums of an extracted APK or the inner simulator `.tar.gz`. Downloads may require GitHub sign-in. The workflow retains these artifacts for seven days and can regenerate them from source. Android compiled on `ubuntu-24.04` with the workflow-selected JDK 17 and pinned Android SDK/NDK; iOS compiled on `macos-26`, with installed Xcode/CocoaPods versions recorded by the workflow.

The completed iOS full-log retrieval failed with `Transport closed`. Exact Xcode/CocoaPods versions and the compiler's final text line were therefore not independently extracted here. The successful job/step conclusions and uploaded artifact metadata establish the reported compilation result.

Both outputs use Debug configuration and require Metro with the matching application source. The Android APK targets arm64 test devices and uses development signing. The iOS archive contains an unsigned iPhone/iPad **simulator** `.app`; it cannot be installed on a physical iPhone or iPad. Neither is an App Store/Play release, an installed-device observation or an operational radio test. The [hardware runbook](HARDWARE_PILOT.md#first-android-usb-bench-session) explains the first controlled Android USB session.

## Physical and commercial acceptance

No site, router, UPS, phone, SIM, eSIM or terminal was commissioned. No real subscriber, payment, number, tax invoice or emergency call was created. The public website has a Vercel production deployment and domain attachment, recorded in [deployment evidence](DEPLOYMENT.md); its DNS connection and persistent customer/staff backend remain separate requirements. No live Portal migration, customer/staff backend deployment, DNS publication, partner outreach, regulatory submission or app-store release is established by these software tests.

The [hardware runbook](HARDWARE_PILOT.md) defines 14 acceptance cases. The [regulatory matrix](REGULATORY_MATRIX.md) and [resolution register](reviews/RESOLUTION_REGISTER.md) identify external evidence. Physical installs, provider sandbox/reconciliation, approved hosting, identity/TLS/key custody, operational recovery, licensing and host/satellite entitlement remain necessary before real service.
