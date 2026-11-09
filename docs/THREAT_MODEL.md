# Onesa Mobile threat model

Review date: 5 November 2026. Scope: the public website, customer account, staff console, Expo iOS/Android client, Mobile API, local pilot database, central Onesa account integration, and the proposed hardware bench. This is an engineering assessment of source and local tests; it is not a penetration-test certificate or authorization to operate a network.

## What the system can currently do

The software records hardware assets, commissioning checks, field observations, readiness evidence, pilot applications, support cases, account requests and test payment/refund entries. It cannot attach a handset to a satellite, activate a SIM, register a subscriber with an operator, carry native emergency calls or move money. An accepted evidence record never enables those effects. A Starlink dish used as Internet backhaul is a separate path from handset direct-to-cell access.

Two identity modes exist. Explicit `lab` mode permits independently generated local credentials for an isolated hardware pilot. `production` identity mode requires HTTPS, a configured confidential Mobile client in the Company Portal and an explicit encryption key. Production identity does not change the status of any network or payment integration. Lab users and sessions cannot be reused in a production database. Recovery disables restored lab identities; each person and current role must be reconciled before a protected, one-user credential reissue. This prevents historical passwords or revoked authority from becoming active after a restore.

## Assets and trust boundaries

| Asset / boundary | Threat | Control in this implementation | Remaining operational responsibility |
| --- | --- | --- | --- |
| Browser to public/customer API | Cross-origin requests, forged sessions, CSRF, public/private cache confusion | Exact allowed origins; opaque random sessions; HttpOnly host-only cookies; SameSite=Lax; Secure on HTTPS; mutation Origin + CSRF; no-store | Terminate TLS at a reviewed proxy; forward one verified client IP only from configured proxy addresses; keep the API private to that proxy |
| Native app to API | Token theft, intercepted custom-scheme callback, replay | Server exchanges the central code; native callback contains a 60-second one-use code bound to state and S256 verifier; native sends an opaque bearer capability | Compile/sign the real app; verify OS secure storage, scheme ownership and physical-device callback behavior; never put confidential client credentials in the bundle |
| Mobile API to Company Portal | Forged JWT roles, wrong issuer/client, stale approval or revoked sessions | Actual Authorization Code + S256 + nonce/state; RS256/JWKS validation; client_secret_basic; live audience-bound `/session` on every authenticated request; original `auth_time` and `amr`; local token existence/expiry rechecked after the asynchronous response | Provision the exact client/callback in both independently released services; qualify TLS, secret custody, availability and revocation against the real environment |
| Staff identity to business records | Customer privilege escalation; unauthorized finance, support or hardware actions | Seven explicit roles; server-side permission matrix; current identity on every request; local staff TOTP; central staff MFA | Approve named staff access; remove access promptly; use distinct people for submission/review |
| One customer to another customer | Guessing another account's application, support case, receipt or export | Ownership checks for customer objects and exports; role checks for staff readers; per-actor idempotency keys | Verify the complete web/native user journey with distinct accounts before inviting real users |
| SQLite database and host filesystem | Stolen database/session tokens; readable WAL/SHM files; linked file overwrite; modified records; key loss | Session tokens are stored as hashes; TOTP seeds, central tokens and flow verifiers use AES-256-GCM; main DB and existing sidecars are prepared as 0600 before SQLite opens; symbolic/hard links and unsafe data directories are refused; local key/credentials files are 0600; role changes revoke sessions | Use a dedicated private data directory and prevent untrusted changes to its ancestors; encrypt the host volume and backups; restrict host accounts; keep production keys outside the database; test recovery; operational records themselves are not field-encrypted |
| Business mutation and retry | Duplicate payments or cases; stale updates; partial records | Parameterized SQL; transactional result/idempotency records; revision checks; integer minor-unit ledger; immutable completed trial observations | Use provider-specific idempotency and reconciliation when real payment/carrier adapters are separately implemented |
| Readiness evidence | Self-approval; stale or out-of-scope documents enabling service | Distinct reviewer for acceptance; expiry checks; country/operator/service/device scope; no automatic activation path | Verify genuine contracts, approvals and test evidence with the responsible counterparties |
| Hardware/customer LAN to management plane | Default passwords, lateral movement, unsafe remote administration | Commissioning records require a management-security check; no software route executes hardware commands | Establish VLAN/firewall isolation, unique device admin credentials, approved firmware, physical custody, configuration backups and reviewed remote access |
| Build/CI to source and secrets | Dependency compromise, malicious PR artifacts, leaked credentials | Locked dependencies; read-only CI permissions; pinned workflow actions; no real provider credentials in tests | Review releases and dependency changes; protect signing keys; do not expose production credentials to PR jobs |

## Identities and authorization

| Role | Intended authority |
| --- | --- |
| customer | Own pilot application, own support cases and requests, own account export and receipts |
| agent | Record test sales; view receipts for sales that this agent recorded |
| support | Read subscriber pilot records and handle support/account requests |
| operations | Hardware and field trials, readiness evidence submission, subscriber review, support |
| finance | Test ledger and test refunds |
| auditor | Read operational evidence, subscriber/support/ledger records and audit status; no business mutation |
| admin | All internal functions, including readiness review; self-acceptance remains forbidden |

Application permissions are not network permissions. The identity `sub` is an immutable account identifier; the frontend never supplies its own authoritative role or owner. Login approval is separate from subscriber-registration verification, SIM ownership and service entitlement.

A local lab identity always remains labelled `lab`. Staff passwords use scrypt with a random salt and fixed work parameters; TOTP accepts a narrow time window and atomically refuses a reused time step. CLI creation generates secrets and does not reset an existing username. There is no public staff signup or high-privilege self-assignment route.

Central identity does not accept an arbitrary JWT submitted by a browser or phone. The BFF obtains an opaque Portal access token itself and keeps it encrypted server-side. Portal `/session` is the authorization source. Its issuer, audience, subject, Mobile entitlement, role, expiry, source authentication time and factors are validated. When the issuer cannot confirm current access, business requests fail closed. Local logout remains available during that outage and reports whether central token revocation was confirmed.

## Principal abuse cases and verification

1. **Replay a code captured from an app link.** The native exchange must require the original verifier and state, reject a second redemption, and reject a code after 60 seconds. No local bearer token may appear in the callback URL.
2. **Use an administrator ID token after access was removed.** An ID token alone never authenticates a Mobile request. An already issued local session must lose access on the next live Portal check when the source session, grant or product approval is revoked.
3. **Promote a password-only account to staff.** Existing password-only Portal assertions must be denied for all Mobile staff roles, and login/continuation must demand MFA. Local promotion without an enrolled factor is rejected and access changes invalidate existing sessions.
4. **Read a second customer's receipt or modify their application.** Server ownership checks must return an unavailable/not-found result without exposing the object. Frontend filtering is insufficient. Use two generated customers in acceptance tests.
5. **Retry a timed-out mutation with changed input.** Reuse of an idempotency key with a different operation or body must return conflict. Retrying the same successful body returns the prior committed result without an additional audit/business row.
6. **Mark a dish test as successful handset satellite service.** Hardware path validation must refuse a satellite terminal/router as a handset direct-to-cell asset; a recorded passing observation still cannot activate service.
7. **Forge a licence approval or mark an expired document accepted.** A submitter cannot accept their own evidence; expired evidence cannot be accepted; every recorded scope remains explicit. The platform does not fetch arbitrary evidence URLs or treat a typed reference as independently verified proof.
8. **Exhaust authentication or parser resources.** Password/TOTP failures are bounded per address and username; request bodies and headers are bounded; remote identity responses have timeouts and size limits; credentials and arbitrary provider error bodies are not logged.
9. **Restore an old password or disabled-user state.** Recovery must disable all restored lab identities and require explicit expected-role review before enabling one account with a new password/TOTP seed. Restoring sessions alone is insufficient because account revocation may postdate the backup.
10. **Sign out during a central outage or pending inspection.** Cookie logout still requires local Origin/CSRF; the local capability is deleted before the remote revocation attempt. An unavailable provider is reported truthfully. A delayed positive Portal response must recheck the local capability before returning a principal and cannot authorize a deleted/expired session. Operations already authorized before sign-out are a separate transaction boundary.
11. **Read journal files or replace one with a link before startup.** On an existing traversable directory with normal umask, the DB and WAL/SHM files must remain owner-only. Linked database/WAL/SHM/rollback-journal files must be refused before SQLite reads or writes them, and the linked target must remain unchanged. The same guard applies to standalone authentication bootstrap/reissue.

The corresponding executable tests are in `onesa-mobile-backend/test/auth*.test.ts`, `test/platform*.test.ts`, and the Company Portal identity suites. Local mocked transport proves protocol validation logic; it does not prove real hosted client provisioning, eSIM delivery, radio coverage or native signing.

## Hardware pilot boundary

Start with one controlled bench and separately identified paths: an ordinary handset with authorized terrestrial SIM service; a satellite terminal feeding a managed router and customer Wi-Fi; and a future direct-to-cell test path only after the relevant operator/satellite/regulatory agreement is in place. Keep customer traffic, operations devices and equipment management separate. Record asset identifiers, owner, firmware, approval references, power/UPS tests, management-security checks and recovery results before field trials.

SIM/eSIM keys, carrier credentials, subscriber identity documents and Starlink account credentials do not belong in free-text notes, source control or mobile public configuration. Device administration should remain behind a private management network. The public API has no remote shell, modem command, network-attachment switch or provider credential upload endpoint.

## Residual risks and release boundaries

The pilot control plane is a single-instance SQLite application. It is not a distributed mobile core, high-availability billing platform or lawful-interception system. Staff with host/database administrative access can alter data and recompute an unanchored audit hash chain. The audit chain detects accidental or partial tampering; it is not independent, immutable evidence. Operational deployment needs protected audit export/anchoring and tested backups.

Customer privacy, hosting jurisdiction, retention, incident response, telecom authorizations, payment settlement and emergency-service responsibilities require explicit operational decisions and provider evidence. The software deliberately stores limited pilot data and keeps commercial actions disabled. Resolve those deployment obligations before accepting production subscribers or transmitting real regulated traffic; no configuration flag substitutes for the corresponding integration and acceptance tests.

## Technical sources

- [Portal identity configuration and provider](../../onesa-company-portal/onesa-company-portal-backend/src/identity/config.ts) and [live session contract](../../onesa-company-portal/onesa-company-portal-backend/src/identity/routes.ts): the implemented source of issuer/client/claim behavior.
- [OpenID client discovery](https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md), [authorization code grant](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), and [signature validation](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md): protocol client configuration used in the adapter.
- [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html): TOTP algorithm and replay/window considerations. The implementation is verified against the RFC SHA-1 vectors.
