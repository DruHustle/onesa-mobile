# Delivery and physical launch sequence

Updated **5 November 2026**. The implemented hardware/software pilot is distinct from a commissioned telecommunications service. No launch date is promised without the host, regulator, device and commercial evidence.

| Stage | Current delivery / next action | Completion evidence |
| --- | --- | --- |
| 1. Software pilot | Implemented public, customer, staff and native surfaces; persistent API, identity boundary, hardware/support/test-ledger workflows and recovery | Package tests/builds, review register and exact-commit CI |
| 2. Physical bench | Inventory/reuse devices, select router/AP and measured backup power, install native test builds | Received assets, seven commissioning checks, isolation/power/recovery evidence |
| 3. Licensed commercial model | Confirm entity, POTRAZ route, host/MVNE agreement, data responsibilities and wholesale terms | Written scope, responsibility matrix, viable approved offer |
| 4. Identity deployment | Release additive Portal Mobile migration/client and qualify actual browser/native SSO | Exact callback, all roles, MFA, revocation, outage and device tests against the real environment |
| 5. Host integration | Build actual provisioning, registration, SIM/eSIM/numbering, usage and interconnect adapters | Provider-confirmed success/failure, duplicate prevention and reconciliation |
| 6. Commercial billing | Approved payment provider, tax/invoice treatment, settlement/refunds and agent controls | End-to-end reconciliation and correct financial documents under failure/retry |
| 7. Terrestrial acceptance | Signed builds, physical matrix, service tests and customer support/incident drills | Agreed voice/SMS/data, device/accessibility and emergency responsibility evidence |
| 8. Satellite qualification | Written Zimbabwe entitlement, exact device/service scope and constrained-network approval | Actual attachment/transport evidence and separate messaging/data/app-voice/native-voice acceptance |
| 9. Controlled service launch | Small approved cohort, published limits, incident ownership and rollback/remedy | Regulatory/commercial release approval and monitored performance before expansion |

The first bench uses an existing authorized internet path and can begin with a Mac-to-Android USB session. A Starlink dish is optional for a separate IP test. Purchasing a dish does not unlock stage 8. [Physical wiring and first-session pack](PHYSICAL_BENCH.md), [hardware runbook and bill of materials](HARDWARE_PILOT.md).

## Software already implemented

Customer application corrections, case conversations, account requests, private documents/export, seven-role server enforcement, staff MFA, independent evidence acceptance, inventory/commissioning/trials, bounded pagination, idempotency/revision conflicts, production/lab separation, encrypted backups and session-safe restore are in this change. They are no longer future UI placeholders. See [architecture](ARCHITECTURE.md) and [review resolution](reviews/RESOLUTION_REGISTER.md).

## Remaining implementation depends on commissioned interfaces

Obtain the host's schema, test environment, credentials, callback signature, metering unit/interval, retry/compensation semantics and responsibilities before implementing actual radio or settlement effects. Then build provider-backed state machines, durable delivery/reconciliation, verified registration, SIM/eSIM issuance, number transfer, usage/rating, real invoices, settlement and notifications. The generic future interfaces are not a simulated claim of those services.

For satellite access, agree country/operator/plan/device/software/service scope. Test each capability independently; app voice is not automatically native voice, and an outdoor test is not a nationwide indoor coverage claim. Keep customer-facing availability evidence-based.

## External prerequisites

No equipment has been bought or commissioned; no host or Starlink agreement, regulator application, licence, merchant account, live identity client, real SIM profile, telephone number or store release has been created by the repository change. The public website is deployed with `mobile.onesa.eu` attached; DNS and persistent backend commissioning are tracked in the [deployment guide](DEPLOYMENT.md). Actual physical execution needs the pilot site/custodian, existing device/router inventory, power/internet details, procurement budget, provider contacts and appropriate credentials through secure channels.
