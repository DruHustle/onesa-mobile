# Host and satellite integration qualification

Customer applications in the lab record a plan concept, SIM format and device model. A staff member with subscriber-review permission marks the record ready for host review. The application identifier then binds every fixture step to one proposed subscription. The customer can read its simulated status on the web, iOS or Android and open the existing support flow. Staff can replay events in Operations → Pilot applications → Provider qualification fixture.

## Reproduce the Onesa-side contract

From `onesa-mobile-backend`, with Node 24 and the package lock installed, run `node --test test/provider-qualification.test.ts` and `npm run api:check`. The integration test uses an isolated SQLite database, restarts the application, and checks for one application and zero ledger entries. To exercise the interactive flow use the existing lab workspace with `APP_MODE=lab` and a disposable `DATABASE_PATH`. The fixture has no remote URL or credential configuration.

Use a fictional account and either `OM Test Handset 1` with a physical SIM or `OM Test eSIM Handset 1` with an eSIM. Other combinations produce a synthetic device rejection. These model names are fixture identifiers.

| Onesa operation | Input or observation | Expected stored state |
|---|---|---|
| Customer submits application | Plan concept, device and SIM preference | Review required |
| Staff completes registration review | Fictional registration reference | Awaiting host |
| Staff submits fixture | Same application ID and idempotency key on retry | One stable fixture reference |
| Fixture cannot confirm the submission | Timeout | Uncertain |
| Status event arrives | Approval or rejection with increasing status revision | Approved or rejected |
| Operations reconciles after a timeout | Simulated authoritative approval with status revision | Approved |
| Pending request cancelled | Cancellation before terminal result | Cancelled |
| Duplicate or delayed event | Same or older revision, or event after terminal state | Prior result retained |

The authenticated lab endpoint is `POST /v1/ops/applications/{id}/qualification`. For example, a fictional reconciliation payload is `{"revision":4,"step":"reconcile","sequence":2}`. The result contains an application-scoped fixture reference, fixture eligibility, simulated state and status revision. Read the generated OpenAPI definition for exact request and response schemas, session authentication and idempotency headers.

## Joint partner acceptance

The host operator and satellite provider must supply the commercial and technical contacts, interface version, credential and key rotation method, test endpoints, and event verification requirements. Agree the unique external request reference, status ordering and reconciliation authority, cancellation and billing rules, device/firmware qualification matrix, Zimbabwe service scope, supported services, and SIM/eSIM prerequisites. The assumed monotonic status revision and terminal-state rules in this fixture require explicit partner confirmation.

After agreement, partner engineering and Onesa integration should exchange synthetic registrations and test offer references in the partner sandbox. Exercise eligibility, authorization, duplicate submissions, network timeouts before and after provider acceptance, missing or delayed callbacks, reconciliation, rejection and cancellation. Check the provider ledger against the Onesa record and test an authorized handset with the approved SIM, location and service. Record the provider transaction references, actual customer outcome and support escalation. Keep live access dependent on a verified partner integration.
