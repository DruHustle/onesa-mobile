# Principal telecommunications engineering review

Review date: **5 November 2026**. Follow-up baseline: commit `29da3e5285a21ef4e01cff8ab1668c797475dc99` and the working changes described below, scoped to `onesa-mobile/`. The earlier review of `1e53a20f5cfbb8f589de1191a6005bc0e1a658b7` is retained explicitly as historical evidence. This is a role-based engineering review of the repository and public source material. No physical site, host network, SIM, satellite entitlement or regulatory application was inspected or commissioned.

## Decision

Continue with a **Light MVNO negotiating position**, using a licensed host's mobile network and developing Onesa's customer and operating systems. Start the physical work with a small **device and IP acceptance bench**. A purchased Starlink terminal does not establish a handset-to-satellite mobile service.

POTRAZ's published guidance distinguishes a Light MVNO from branded resale; the latter does not confer ownership of subscribers, infrastructure or SIMs. The actual host agreement must settle customer control and migration rights. [POTRAZ converged licensing guidance](https://www.potraz.gov.zw/wp-content/uploads/2025/06/Licence-Application-General-Guidelines.pdf).

There is currently no repository evidence of an Onesa host agreement, assigned mobile numbering, network credentials, a qualified handset list or authorized Zimbabwe Starlink Mobile service. Public source research did not establish such an entitlement. That is an unresolved commercial/regulatory dependency, not proof that negotiations cannot succeed.

## Current follow-up: hardware first

The software now supports an authenticated, persistent pilot operation. The first deliverable in the physical world remains an isolated device and IP bench. The new [physical bench pack](../PHYSICAL_BENCH.md) provides a numbered topology and port-role proposal, USB-first sequence, purchase/reuse decisions, IPv4/IPv6 isolation matrix, measured-power worksheet and handover evidence. No subnet, live router configuration, hardware order or measured value is invented.

| Current component inspected | Observed implementation | Limit of the evidence |
| --- | --- | --- |
| `src/platform/model.ts`, `service.ts` and persistent store in the backend | Sites/assets, seven commissioning checks, immutable completed trials, twelve evidence gates, revisions, permissions and audit records | Records organize work; they do not establish physical custody, document authenticity, equipment approval or network operation |
| Manual trial acceptance | Exact operator/path/device scope, accepted current evidence, approved-test-plan reference, pre-existing criteria and asset/configuration snapshots | An internal record review cannot authorize RF, extend a provider's terms or prove the observed bearer |
| Web hardware workflow | Inventory and trial preparation for a protected staff workspace; managed AP and tablet are distinct asset types | UI review and synthetic tests do not establish installation or physical-device acceptance |
| Customer and operational records | Persistent application/support/financial workflows and separate identity controls | No live SIM, charging, metering, voice, SMS or satellite provider is connected |
| Local deployment and recovery | Isolated lab runtime and documented recovery path | Real hosting, shared identity, data-controller arrangements and production operations still require their own acceptance |
| Public deployment | Vercel website deployment and requested domain attachment are recorded in `DEPLOYMENT.md`; DNS/backend completion remains separate | A reachable website or API health result is not mobile-service coverage or commercial readiness |
| Pilot template | Fourteen asset-planning rows, fourteen acceptance cases and twelve unverified release gates | Planned quantities and not-run rows are not installed hardware or completed results |

### Follow-up findings and closure

| ID | Priority | Gap identified | Change and verified closure |
| --- | --- | --- | --- |
| TEL-13 | High | A passing manual radio result could be recorded with no scoped permission evidence; a SIM could be the sole D2C test asset | Manual passes now require matching accepted evidence, valid both when observed and when recorded. D2C requires host, equipment, satellite-authorization and satellite-entitlement references; terrestrial/dish paths require their own host-use and equipment scope. D2C requires an actual handset at planning and recording. Planned criteria/configuration must precede and match the observation. Evidence revisions and the equipment snapshot are retained. Synthetic regression tests pass. |
| TEL-14 | Medium | Unknown power defaulted to zero and its rating could not be corrected through the asset update | Rating is nullable and editable, with an explicit recorded-rating flag. A rating correction invalidates the power check and preserves history. The docs distinguish nameplate rating from a meter reading and require the separate measurement/runtime worksheet. Regression tests pass; no actual load has been measured. |
| TEL-15 | Medium | Firmware, connectivity and recovery could be skipped without rationale, including on active network equipment | N/A now requires a reason and is limited to asset categories where it may be legitimate. Active phone/router/AP/tablet/workstation categories cannot skip those checks. Managed AP and tablet types remove the need to classify them as generic accessories. Regression tests pass. Human review remains necessary for an item classified as `other`. |
| TEL-16 | Medium | Partner due diligence described the protected workspace as an unauthenticated preview and deployment as wholly unconfigured | Corrected the surface descriptions and linked the current deployment record. This closes documentation drift; DNS, backend and shared-identity deployment still have separate external dependencies. |
| TEL-17 | Medium | Procurement guidance lacked an executable first-session topology, port map and measured-power packet | Added `PHYSICAL_BENCH.md` and expanded the planning template. Stage A uses a current Mac/phone over USB; Stage B needs a reviewed lab interface/gateway before Wi-Fi clients can reach the loopback-only runtime. Procurement starts with an actual inventory. No device-specific configuration or price is asserted. |
| TEL-18 | Medium | The policy/research pack omitted newer POTRAZ implementation guidance and some breach-response deadlines | Added the POTRAZ-authored 2025 compliance/DPIA/cross-border guidance, completed the SI 155/2024 incident timing summary, and recorded source retrieval limits. Current entity, licence, fee and test conditions still need written confirmation. |

The telecom reviewer independently ran `node --test test/hardware-qualification.test.ts` after inspecting the model/service changes: **11 tests passed, 0 failed**. The suite exercises unknown power, N/A restrictions, handset-only D2C planning, absent/mismatched/revoked/expired authority, immutable evidence snapshots, terrestrial/dish scopes, simulation distinctions and plan/configuration timing. These are synthetic record-integrity tests, not field tests or regulator acceptance. Broader application/native verification is reported by the coordinating engineering review.

The smaller trial-permission policy deliberately does not require `device_acceptance` before the trial that establishes device acceptance. An approved test plan and permission to operate must exist first; the observed results then support the separate qualification/release decision. See the [exact policy and legal distinction](../REGULATORY_MATRIX.md#test-permission-and-commercial-release).

### Remaining external acceptance

The software-control gaps above are addressed. Hardware, host, regulatory and production-service dependencies remain open because no actual equipment or executed service evidence was provided. The minimum next packet is a real inventory/site custodian, exact device and router/AP versions, authorized internet handoff, measured power conditions and spending ceiling. Host-issued test profiles, permitted test functions and any Zimbabwe D2C entitlement are additional inputs for the radio phase. No purchase or radio test was performed by this review.

The earlier TEL-02, TEL-03 and TEL-12 software deficiencies now have implemented record and change controls. Their physical/documentary acceptance is still outstanding. TEL-01 and the live-network aspects of TEL-04 through TEL-11 remain launch dependencies; an internal acceptance row does not close them. Keep provisioning, payments and live satellite claims unavailable until the actual integrations and full release evidence are accepted.

## Historical baseline implementation

The following table describes only commit `1e53a20f5cfbb8f589de1191a6005bc0e1a658b7`; it is not a description of the current persistent platform.

| Inspected component | Observed implementation | Engineering implication |
| --- | --- | --- |
| `onesa-mobile-backend/src/app.ts` | Four static read resources; activation, payment and identity mutations return unavailable | No subscriber lifecycle or network command is executed |
| `onesa-mobile-backend/src/fixtures.ts` | Fictional account, proposed catalogue and static readiness | API availability is not radio coverage or commercial readiness |
| `onesa-mobile-backend/src/contracts/providers.ts` | TypeScript interfaces with no carrier or satellite implementation | There is no integration endpoint to configure or test against |
| `onesa-mobile-backend/Dockerfile` | Single non-root HTTP API image definition | No deployment, database, private provider connectivity, recovery or production operation is established by this file |
| `scripts/dev.mjs` | Starts local API and Vite development processes | Development orchestration is not a carrier operations environment |
| Web customer and internal interfaces | Local synthetic workflow state | A reviewed row or matched sample payment cannot prove a provisioned line |
| Native package and generated platforms | Source projects and JavaScript export qualification | Device install, carrier behavior and native release acceptance remain separate |
| Physical infrastructure | No commissioned inventory or measured site evidence in baseline | Nothing in this review establishes that hardware is installed, powered or reachable |

## Historical findings and required closure evidence

These findings describe the earlier baseline. The current follow-up above records subsequent implementation and its limits; a document or UI label alone does not close a network dependency.

| ID | Priority | Finding | Required remediation and closure evidence |
| --- | --- | --- | --- |
| TEL-01 | Launch blocker | No contracted and authorized host/satellite service | Written scope and responsibility schedule, approved service territory and features, host test access, commercial terms and provider acceptance. Until then, provisioning remains unavailable. |
| TEL-02 | High | No physical pilot inventory or commissioning record | Persistent sites, assets, serial/model references, firmware, custodian, approval evidence, power and connectivity tests. Planning rows must be distinguishable from received and commissioned assets. |
| TEL-03 | High | Static readiness cannot represent evidence expiry or revocation | Store readiness evidence with scope, issuer, reviewer, observation date and validity. Missing, expired, rejected or out-of-scope evidence must block the relevant service. An ordinary app setting must not enable a live provider. |
| TEL-04 | High | No device/service eligibility model | Separate country, host, offer, device SKU, software/carrier profile, SIM format and feature. Keep SMS, app data, app voice, native voice, emergency and roaming distinct. Every approved combination needs evidence. |
| TEL-05 | High | No authoritative subscription lifecycle | Separate account access, subscriber registration, payment, provisioning and network state. Persist pending/failed/confirmed transitions; protect duplicate requests and reconcile provider outcomes before declaring service active. |
| TEL-06 | High | No usage ingestion or freshness contract | Validate provider identity and event identifiers, retain measurement intervals, units and source timestamps, reject duplicate events, reconcile corrections and show stale/unavailable data honestly. |
| TEL-07 | High | No approved-offer and tariff control | Retain proposed concepts separately from sellable offers. Approval evidence, currency, tax treatment, allowances, validity and billing rules must be versioned before a price becomes public or purchasable. See the regulatory matrix. |
| TEL-08 | High | API health does not measure network health | Monitor application, database, provider API, provisioning backlog, reconciliation lag and radio-service incidents separately. Give each exception an owner and escalation path. |
| TEL-09 | High | Physical and native acceptance not performed | Install signed test builds on representative phones/tablets; verify slow/offline behavior, SIM/eSIM lifecycle, real usage and approved radio functions in a recorded pilot. |
| TEL-10 | High | No agreed emergency, numbering and interconnection responsibility | Obtain host/regulator acceptance for the offered service. Test using an agreed test facility or test numbers; do not place unsolicited calls to emergency centers. |
| TEL-11 | High | No qualified data-hosting and recovery design | Establish controller/processor responsibilities, authorized data locations and key custody, protected operational access, tested backups and restore evidence before real subscriber information is stored. |
| TEL-12 | Medium | No reproducible physical change and rollback process | Record configuration version, verified pre-change backup, access method, maintenance owner, acceptance results and rollback outcome for each commissioned asset. |

## Three distinct connectivity products

| Product | Access path | What Onesa would operate or contract |
| --- | --- | --- |
| Mobile with satellite extension | Handset/SIM uses contracted terrestrial access and, where entitled, a satellite-enabled mobile network | Host provisioning, commercial entitlement, qualified device/service combinations, customer operations and support |
| Dish-based internet | User device uses Wi-Fi/Ethernet behind a satellite terminal | A separately authorized broadband installation and its local network; retail or resale terms must match its use |
| Satellite backhaul | Handset uses a terrestrial radio site whose upstream link is satellite | A licensed radio/access-network project with a host, site engineering and a specific backhaul design |

Starlink's technical release describes operator spectrum and roaming-style integration. Its current Mobile page distinguishes supported app/data/messaging capabilities from future native calling and expanded broadband. Neither a dish order nor a generic eSIM creates the missing host entitlement. [Starlink technical release](https://starlink.com/public-files/DIRECT_TO_CELL_SERVICE_FEB_25.pdf); [Starlink Mobile](https://starlink.com/mobile).

Do not create a local eNodeB/gNodeB, buy spectrum-capable transmitters, or deploy a software mobile core as a substitute for the commercial and regulatory route. A Light MVNO acceptance lab needs interfaces to an authorized host, not an unlicensed broadcast network.

## Reference operators: lessons to implement

The references below are product and engineering benchmarks, not prospective Onesa partners unless an agreement is obtained.

| Reference | Verified pattern | Onesa engineering decision |
| --- | --- | --- |
| [fraenk](https://fraenk.de/hol-dir-fraenk) | App-managed plan, SIM/eSIM, usage and support | Keep the core account journey short; show the offer's full conditions with its price |
| [My Econet](https://www.econet.co.zw/my-econet-app/) | Registration, physical SIM/eSIM, suspension/reactivation and account self-service | Model lifecycle actions explicitly and require provider-confirmed outcomes; introduce recovery and assisted service paths |
| [NetOne](https://www.netone.co.zw/which-bundles-does-netone-have) | Separate data, voice, SMS and combo bundles, with self-service/support entry points | Represent allowance types and validity independently, rather than a single ambiguous balance |
| [Vodacom eSIM](https://www.vodacom.co.za/vodacom/terms/esim) and [VoLTE](https://www.vodacom.co.za/vodacom/terms/vodacom-volte) | Compatibility involves device/region, software and provisioned service | Qualify exact device and network combinations; eSIM support alone does not establish voice or satellite support |
| [T-Mobile T-Satellite](https://www.t-mobile.com/coverage/satellite-phone-service) | Automatic network attachment, supported devices/apps, and stated outdoor/availability limitations | Show entitlement and limitations; never present an app control as a radio attachment switch |

T-Mobile is the verified US Starlink direct-to-cell benchmark used here. Its ability to sell an add-on to some other carriers' customers is not evidence that every such carrier has its own Starlink integration. US prices, emergency numbers, roaming arrangements and approvals must not be copied into Zimbabwe's product.

## Acceptance responsibilities

| Owner to appoint | Responsibility | Evidence to retain |
| --- | --- | --- |
| Onesa commercial lead | Host/MVNE agreement, service scope, supplier commitments and exit rights | Executed agreement references and authorized product scope |
| Onesa regulatory lead with Zimbabwe adviser | Applicable licence, tariff, equipment, data and numbering requirements | Written authority/host determinations and current approvals |
| Host network team | SIM profiles, network registration, numbering, voice/SMS/data, satellite entitlement and network incidents | Test accounts, approved interface specification, device list and signed acceptance results |
| Onesa engineering | Account/order state, provider integration, persistence, idempotency, usage and operational tooling | Reproducible tests and linked provider event evidence |
| Onesa operations | Asset custody, commissioning, support, maintenance and incident handling | Inventory, check results, configuration/restore history and trained owners |

The physical sequence and procurement controls are in [Hardware pilot](../HARDWARE_PILOT.md). The applicable policy evidence is in [Regulatory matrix](../REGULATORY_MATRIX.md). All assets and checks in the [pilot template](../../infra/hardware/pilot-template.json) start as planned or not run. They are not evidence of installed equipment or authorization.
