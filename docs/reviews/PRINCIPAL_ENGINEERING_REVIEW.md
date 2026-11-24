# Principal Engineering review

Review date: 2026-11-05. Scope: the Onesa Mobile software control plane and its additive Onesa Company Portal identity integration. This is an independent specialist agent review, not a human professional sign-off, network certification or regulatory approval.

## Engineering decision

The appropriate first deployable unit is a single-instance hardware-pilot control plane with truthful customer and staff surfaces. The system can record assets, commissioning, observations, applications, support and test financial events. Cellular attachment, SIM/eSIM provisioning, live payments, satellite entitlement and emergency-service integration remain unavailable. Accepted evidence must never automatically enable them.

The runtime and recovery work closes concrete software gaps while preserving this boundary. Commercial launch still depends on actual operator/satellite contracts, licensing, subscriber-registration processes, qualified hardware, production infrastructure and end-to-end acceptance. An empty adapter or a configuration flag is not completion of those dependencies.

## Second independent review

The second pass reviews the integrated telecom, security, visual and UX corrections, concentrating on physical-hardware evidence, runtime recovery and meaningful browser verification. The findings below supersede earlier checkpoint statements where noted. They are software review findings; the physical bench, operator approval and native-device acceptance remain separate work.

| ID | Severity | Reproduced gap | Correction and current evidence |
| --- | --- | --- | --- |
| PE-02-11 | High | Declaring an already commissioned asset faulty could be undone by passing an unrelated label check. A received-state update also needed to preserve a declared physical fault. | The platform owner invalidates all checks on fault declaration and retains `faultReported` until all seven are requalified. Legacy faulty rows receive the same treatment. The original fault/label sequence was independently reproduced; the integrated hardware suite now includes both new-record and legacy regressions. |
| PE-02-12 | High | The recovery overlay always mounted the lab volume. Combining it with production could back up or restore the wrong source while appearing to use the production configuration. | Recovery now requires the exact existing external volume and an explicit mode. Its entrypoint rejects a different command mode before database access. Local recovery/guard suite: **8 passed, 1 skipped**. The skipped test checks the actual Docker Compose merge and missing-selection failure; Docker is unavailable locally. Hosted run `42129021936` passes **all 9** recovery tests, including that actual merge/source-selection case, plus container restart/persistence/recovery. |
| PE-02-13 | Medium | The manual-observation form used minute precision while the backend compared against a millisecond plan timestamp. A valid immediate observation could be rejected as preceding its plan. | The control explicitly accepts seconds, explains its time basis and compares plan order at that same second precision. The backend retains the future-time bound and rejects an observation one second before the plan. Regression is in the integrated hardware suite. |
| PE-02-14 | Qualification | Previous web unit tests and bundle builds did not establish real customer/staff form journeys, responsive layouts or safe handling of a completed response delivered after client expiry. | Added a pinned, development-only Playwright harness and a scoped **Synthetic customer and hardware browser journeys** CI job. It starts only its own loopback API/gateway with disposable synthetic data. Local Chromium was denied a required OS socket before any page opened. Hosted run `42129021936` passes **20 groups / 31 layout observations**; the release owner inspected and retained five actual synthetic screenshots. This closes the browser qualification gap within its documented Chromium/synthetic scope. |
| PE-02-15 | Documentation | Architecture still described `mobile.onesa.eu` as wholly unconfigured after Vercel attachment, obscuring the remaining DNS/backend work. | Architecture now separates the deployed prelaunch web build and verified domain attachment from missing Cloudflare DNS, pending custom-domain serving and the deliberate hosted API `503`. The existing deployment receipt is the source of those observations. |

The browser harness exercises public connectivity explanations and a keyboard FAQ; customer application/support/reply/request/export; staff site and asset registration, focused duplicate-input error, receipt and all seven commissioning checks; a refused evidence-free manual pass followed by a pass referencing four matching accepted synthetic evidence revisions; customer-to-staff denial; service retry; sign-out; and a completed response released after client session expiry. It checks page reflow and visible form-control bounds/targets at **320, 390, 768 and 1440 pixels**, captures 390/1440 screenshots, and separately perturbs text to twice its computed size. This text check is not browser zoom or native accessibility certification.

The harness never accepts an external target. It blocks non-loopback browser requests, keeps generated sign-in values in memory, removes its disposable database, and uploads only explicitly selected synthetic PNG/JSON artifacts. Fixture evidence is submitted and independently accepted through the domain service to arrange the test; the result-entry journey uses the real UI/API. This setup does not establish a licence, provider agreement, radio observation or physical hardware result.

The integrated source checkpoint reported by the lead reviewer passes backend TypeScript and **98 tests**, web **23 tests plus production build**, and native **25 tests plus both JavaScript exports**. This reviewer independently reran the web production build, the **8 passing recovery/entrypoint tests**, JavaScript syntax and scoped whitespace checks. Actual Docker merging/runtime and browser execution now pass in [qualification run 42129021936](https://github.com/DruHustle/onesa-ug/actions/runs/42129021936) on `337142d`. Earlier source `3af4282` CI receipts below remain historical and do not qualify these changes.

Run the new checks from `onesa-mobile/`:

```sh
node --test scripts/tests/*.test.mjs
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install playwright install --with-deps chromium
npm run test:browser
```

Install backend/web dependencies independently and build the web package before the last command. A preinstalled development Chromium can be selected with `MOBILE_BROWSER_EXECUTABLE`; its version is recorded in the report. The hosted job installs the browser matching the pinned Playwright package. Root workflow `onesa-mobile-ci.yml` owns both **Container restart and encrypted recovery** and **Synthetic customer and hardware browser journeys**. The exact-source job receipts and inspected screenshots are retained in [VALIDATION.md](../VALIDATION.md); PE-02-12 and PE-02-14 are closed for the tested software scope. Physical and production acceptance remain separate.

## First-review findings and remediation

| ID | Severity | Finding and impact | Remediation and evidence |
| --- | --- | --- | --- |
| PE-01 | High | Backend Docker image omitted runtime dependencies; the evolved authentication/domain API could not start. | Backend image now installs locked production dependencies and copies them into a non-root runtime. Hosted container build/start/restart/recovery passed on final application source `3af4282`; see the validation receipt. |
| PE-02 | High | Asset status followed only the most recently entered commissioning result, allowing another passing check to hide an earlier failure. | Platform owner changed status derivation to evaluate every check; any failed required check keeps the asset faulty. Regression covered by platform tests. |
| PE-03 | High | Firmware/approval changes could retain stale commissioning evidence, and a manual received state could hide failed checks. | Platform owner invalidates affected checks, retains bounded history, and preserves failure precedence. A changed physical configuration must be qualified again. |
| PE-04 | High | List limits silently excluded older operational records and readiness evidence; cross-scope totals could look like launch authorization. | Readiness counts now aggregate in SQL and explicitly describe their scope. Authenticated cursor pages contain at most 50 rows, preserve owner/role scope and expose total/next-cursor metadata. The UI loads older records; HTTP tests verify complete retrieval beyond the first page and complete owner exports. No count enables service. |
| PE-05 | High | No reproducible recovery process existed for the shared operational/authentication SQLite database and lab key. Copying the main file could miss committed WAL state; an old snapshot could resurrect sessions or revoked lab credentials. | Added online encrypted backups, authenticated restore, schema/integrity/audit verification, no-overwrite installation, mode isolation, session/flow/handoff invalidation, TOTP replay-counter advancement and disabling/revising every recovered lab identity pending reviewed reissue. Six tests pass against the real platform/auth schemas. |
| PE-06 | Medium | All API requests behind one proxy could share a rate-limit identity; an unrestricted forwarded header would be spoofable. The capped limiter map could also fail to clean expired entries. | Platform owner added exact trusted-proxy IP validation and corrected cap cleanup. Gateway overwrites forwarding headers and uses its fixed private IP. No trusted proxy is the API default. |
| PE-07 | Medium | Repeated full commissioning-check snapshots could make a bounded record count serialize hundreds of MB. | Configuration history now records compact invalidation metadata and is capped. Bulk pages omit commissioning history; an authorized detail read retrieves the individual record. HTTP tests verify bulk omission and detail authorization. |
| PE-08 | Medium | Runtime files, auth-key sidecars, bootstrap credentials and encrypted archives were not explicitly ignored by Git/build contexts. | Added product-specific ignore rules and excluded secrets/data from Docker contexts. Bootstrap outputs only protected file paths, not credential values. |
| PE-09 | Medium | Disabling proxy access logs alone does not prevent OAuth callback codes appearing in upstream error logs. | API locations now suppress both raw access and proxy error logs; backend failures retain sanitized correlation IDs. |
| PE-10 | Qualification | A successful JavaScript export was insufficient evidence of native compilation, container behavior or real PostgreSQL provider behavior. | Added isolated container/restart/recovery, Portal PostgreSQL, Android debug and unsigned iOS/iPad simulator jobs. All seven hosted jobs passed on final application source `3af4282`; exact-source and artifact receipts are in the validation record. |

## Architecture and transaction review

The API is the authority for roles, ownership, validation, revisions and state transitions. The web and native clients consume contracts; they do not share backend source or derive authorization from hidden buttons. Customer records are scoped by the verified subject. Staff permissions are explicit for administration, operations, support, finance, agents and auditors.

Operational mutation, idempotency result and hash-linked audit event share a `BEGIN IMMEDIATE` SQLite transaction. A reused actor/key with the same operation and input returns the original result; changed input conflicts. Record updates use revisions to prevent lost updates. Asset tags and test-payment references have database uniqueness constraints. Completed field observations remain immutable, refunds cannot exceed the remaining test balance, and evidence acceptance requires another authorized subject. The idempotency store is persistent and is retained during recovery.

Audit-chain verification detects accidental or unauthenticated changes to linked events. It is not a cryptographic proof against an administrator who controls the whole database and can recompute the chain. Production requires independently retained, access-controlled evidence and an approved retention policy. An operational note or internal evidence acceptance does not itself constitute a statutory certificate or provider approval.

SQLite WAL and a busy timeout are appropriate to qualify for a small single-process pilot. They do not provide failover or multi-host durability. The platform and authentication components use separate connections to the same file and synchronous, bounded transactions. A slow or excessively large synchronous query can delay other requests; response/page/history bounds therefore matter. There is no implemented PostgreSQL Mobile runtime, external message broker, carrier charging system or HA controller, and the review does not claim otherwise.

## Authentication boundary review

The Mobile auth review covered `src/auth/service.ts`, `onesa.ts`, `store.ts` and `crypto.ts`. The central client checks exact issuer, client, endpoints, PKCE, state, nonce and signed identity responses. Provider calls are bounded and do not follow arbitrary redirects. Current Mobile grants are revalidated against the central session endpoint on each protected request. Staff require MFA and retain the original authentication time; sensitive actions require recent proof. A central outage denies protected operations.

Local opaque bearer values are stored as hashes. Provider tokens, PKCE verifiers and TOTP seeds are encrypted. Cookie mutations require an exact allowed Origin and CSRF token. Ambiguous credentials are rejected. Local role changes or disabling an identity invalidate sessions; production refuses lab identities, unconfigured central sign-in and missing external key custody. Native handoff codes are short-lived, single use and bound to native state and PKCE. Logout can destroy the local capability even if the central provider is unavailable.

At the first review checkpoint no fail-open authorization defect had been identified. That statement is superseded by the second security review: **SEC-02-01** reproduced a delayed central authorization result continuing after local logout, and the implementation now rechecks the local capability after the provider response. Its regression is retained in the integrated suite. See the [security review](SECURITY_REVIEW.md) for that race and SQLite file/sidecar corrections. This remains source-and-test review with synthetic identity exchanges, not a penetration test of deployed infrastructure. Host security, issuance/change of central staff grants, external secret custody, TLS ingress and recovery administration remain separate privileged boundaries.

## Runtime and recovery changes

The lab Compose stack uses a same-origin unprivileged web gateway, an internal API, one persistent data volume, explicit health dependencies, loopback-only host publication, read-only root filesystems and dropped capabilities. The API has no provider egress. The web gateway alone also joins an ordinary ingress bridge so Docker can publish its loopback port. The production overlay requires real identity configuration and external secrets, uses a separate volume and remains a configuration candidate pending approved HTTPS ingress and qualification.

Backups use SQLite's online-backup API to capture committed WAL state. They are streamed through AES-256-GCM with authenticated metadata and a database checksum. Temporary plaintext is confined to private directories; archives and keys use owner-only permissions. Restore authenticates before SQLite parsing, rejects unknown schemas or altered audit history, clears all sessions and login handoffs, and advances TOTP counters through the accepted skew window. Security peer review identified the additional rollback risk in historical lab passwords/roles; every restored lab identity is therefore disabled with a new revision until an operator reviews authority and reissues credentials. Restore installs only into a new destination. Lab and production archives are not interchangeable. Live volume encryption, off-host custody, retention and post-snapshot reconciliation are not supplied by the archive format.

The detailed commands and scope are in [the runtime/recovery guide](../../infra/runtime/README.md). [The physical hardware pilot](../HARDWARE_PILOT.md) is the required next layer of evidence after software qualification.

## Verification record

- Executed: six encrypted recovery tests against actual operational and authentication schemas, including online WAL capture, integrity, idempotency/audit preservation, corrupted/truncated archives, wrong keys, no overwrite, key symlinks/permissions, mode isolation and authentication-state invalidation.
- Independently executed at the review checkpoint: backend `npm run check` passed TypeScript checks and all 76 tests, including corrected commissioning states, scoped cursor pagination, complete exports, private history detail reads, OIDC/PKCE, session revocation, role/ownership boundaries, explicit lab credential reissue, API-contract generation and production fail-closed configuration. The final integrated backend suite has 78 passing tests; these are successive checkpoints, not additive counts.
- Executed: YAML parsing for both root workflows and all three Compose files; JavaScript syntax checks for recovery/container scripts; scoped whitespace/diff checks.
- Final hosted [qualification run 42080127807](https://github.com/DruHustle/onesa-ug/actions/runs/42080127807), source `3af4282`, passed all five jobs: 78 backend tests, 14 web tests and production build, 20 native logic tests and both JavaScript exports, six recovery tests plus actual container restart/recovery, and 35 Portal tests against disposable PostgreSQL. The current [validation record](../VALIDATION.md) includes source, job links and tested image IDs.
- Final [native run 42080127515](https://github.com/DruHustle/onesa-ug/actions/runs/42080127515) passed both jobs on the same source: Android arm64 Debug and unsigned iPhone/iPad simulator compilation. The inspected artifact metadata, archive digests, expiry and installation limits are retained in the validation record.
- Docker, Android SDK and Xcode are unavailable in the editing container; their evidence comes from the hosted jobs. Native compilation/artifact receipts are recorded separately in the validation record. Store signing/distribution, the physical bench and any carrier/satellite integration remain unperformed; no generated file substitutes for those observations.

## Remaining qualification before a real customer launch

1. Retain the qualified source, CI receipts, image IDs and native artifact digests. Requalify the selected production images, toolchains, signed packages and actual deployment configuration before release; a lab build receipt is not production commissioning.
2. Execute the hardware matrix on the actual acquired devices, router, power system and approved connectivity path. Requalify after firmware or equipment-scope changes.
3. Commission the approved TLS/identity/data architecture, external secret custody, capacity limits, monitoring, off-host backup and a timed recovery exercise. The current design has one API/database host and no HA claim.
4. Integrate authorized operator/satellite/payment systems with documented contracts, sandbox acceptance and reconciled operational failure handling. Keep live operations unavailable until then.
5. Obtain the required legal, regulatory, carrier and device-scope evidence, independently reviewed by the responsible people. The source code cannot issue it.

## Primary technical references

- [Compose external-volume declarations](https://docs.docker.com/reference/compose-file/volumes/) and [required interpolation](https://docs.docker.com/reference/compose-file/interpolation/).
- [Playwright library](https://playwright.dev/docs/library) and [controlled browser time](https://playwright.dev/docs/clock).
- [Node.js 24.22.1 SQLite](https://nodejs.org/download/release/v24.22.1/docs/api/sqlite.html): online backup and the release-candidate status of this Node API.
- [Official NGINX unprivileged image](https://github.com/nginx/docker-nginx-unprivileged): non-root port/temp-path behavior and moving image tags.
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) and [merge rules](https://docs.docker.com/reference/compose-file/merge/).
- [GitHub runner images](https://github.com/actions/runner-images) and [Android Gradle plugin 9.2 compatibility](https://developer.android.com/build/releases/agp-9-2-0-release-notes).

## Hosted follow-up

The first hosted run built and started all three images. It exposed that Docker cannot publish a port from an internal-only gateway. The gateway now joins a separate ingress bridge while the API remains internal-only, and the smoke test checks actual port publication and network membership. The first Android run also exposed a missing `sdkmanager` PATH entry; the workflow now invokes the runner SDK manager by its exact installed path. The corrected container and both native jobs passed on `c84fa102`. Final source qualification and its artifact receipts are recorded in [VALIDATION.md](../VALIDATION.md); the earlier failed jobs are not counted as passes.
