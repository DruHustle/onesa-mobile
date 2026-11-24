# Zimbabwe telecom and data readiness matrix

Evidence reviewed **5 November 2026**. This matrix turns identified policy subjects into engineering work and evidence requests. It is not a licence, regulator approval, current fee quotation or complete legal opinion. Confirm amendments, entity eligibility, licence conditions and the exact service scope with POTRAZ and a Zimbabwe adviser before relying on a release decision.

The cited Gazette instruments are primary legal text; Veritas hosts copies where a direct POTRAZ copy was not available. POTRAZ's older fee tables and the 2001 licensing instrument must not be represented as a verified 2026 quote or the entire current framework. No ownership percentage is asserted here.

## Evidence register

| Source | Relevant subject |
| --- | --- |
| [POTRAZ converged licensing guidance](https://www.potraz.gov.zw/wp-content/uploads/2025/06/Licence-Application-General-Guidelines.pdf) | MVNO and related service categories; host agreement scope |
| [SI 12 of 2021 — Licensing, Registration and Certification](https://www.veritaszim.net/sites/veritas_d/files/SI%202021-12%20Postal%20and%20Telecommunications%20%28Licensing%2C%20Registration%20and%20Certification%29%20Regulations%2C%202021.pdf) | Public licences, equipment, numbering, tariffs, satellite/radio and spectrum requirements |
| [SI 95 of 2014 — Subscriber Registration](https://www.potraz.gov.zw/wp-content/uploads/2015/04/SI_95_of_2014_Subscriber_Registration_Regulations.pdf) | Registration, verification, subscriber records and confidentiality |
| [SI 250 of 2019 — Subscriber Registration amendment](https://www.veritaszim.net/sites/veritas_d/files/SI%202019-250%20Postal%20and%20Telecommunications%20%28Subscriber%20Registration%29%20%28Amendment%29%20Regulations%2C%202019%20%28No.%201%29.pdf) | Conditional use of foreign-hosted storage for subscriber data |
| [SI 155 of 2024 — Data controllers and DPOs](https://www.potraz.gov.zw/wp-content/uploads/2025/02/sI-155-of-2024-Cyber-and-Data-Protection-Normal_240913_1250178.pdf) | Controller licensing, DPO, security, transfers and breach handling |
| [POTRAZ-authored 2025 implementation guidelines, Veritas copy](https://www.veritaszim.net/sites/veritas_d/files/Cyber%20and%20Data%20Protection%20Act%20Implementation%20Guidlines.pdf) | Compliance assessments, impact assessments and cross-border protection guidance, including CDPG 1, 3 and 4 of 2025; guidance accompanying the Act and SI 155/2024, not a new Act |
| [POTRAZ equipment approval form](https://www.potraz.gov.zw/wp-content/uploads/2015/04/TypeApprovalApplicarionForm.pdf) | Model/specification/test-report information; confirm the current submission process |

## Release requirements

Every row is **unverified for Onesa's live service** at the review baseline. Internal records of a document or checklist do not themselves establish its authenticity or legal effect.

| Gate ID | Source requirement or issue | Engineering implementation | Evidence needed from the responsible owner |
| --- | --- | --- | --- |
| `telecom_licence` | Confirm the applicable licensed service and entity using POTRAZ's framework | Associate each sellable service with an approved entity/scope and validity; block use outside that scope | Current licence/conditions or written determination, legal entity and owner |
| `host_agreement` | A licence category does not supply wholesale access | Keep provider configuration inactive until the actual host interface and authority are accepted | Executed host/MVNE agreement, responsibilities, commercial limits and test access |
| `approved_tariff` | SI 12/2021 s22 requires approved/displayed tariffs and prohibits unapproved or misleading publication | Separate proposed concepts from approved offers; version currency, tax, allowance, validity and effective dates | Applicable approval, published terms and host billing acceptance |
| `equipment_approval` | SI 12/2021 s19(3), ss49–52 address approved equipment, radio permissions and spectrum; qualifying low-power exemptions do not remove type approval | Store exact model and approval evidence; prevent commissioning of an unqualified radio asset | Supplier/type approval, applicable import/use determination and commissioning authority |
| `numbering_interconnect` | SI 12/2021 ss19–21 cover interoperability, substantive changes and numbering | Use host-authorized number/short-code ranges; retain change and interconnect responsibilities | Allocation/host rights, interconnect and change process; confirm portability scope |
| `emergency_services` | SI 12/2021 includes emergency-service obligations relevant to licensed services | Model supported/emergency functions separately and require host-approved behavior before a service is sold | Host/regulator responsibility matrix and agreed test evidence |
| `subscriber_registration` | SI 95/2014 ss3–4 requires registration/verification before activation | Keep identity login separate from registered subscriber status; record verification provenance and prevent bypass | Approved procedure, required evidence, agent authority and provider acceptance |
| `data_protection` | SI 155/2024 addresses controller licensing, DPO appointment, secure processing and security testing; SI 250/2019 sets conditions for foreign subscriber-data storage | Define controller/processor roles, retention, access controls, audit, recovery and data-subject processes; qualify hosting, consent and key custody | Applicable controller licence, DPO details/notification, hosting contracts, protection report, local key-custody evidence and appropriate affirmative consent |
| `satellite_authorization` | A foreign service launch or dish subscription does not establish Zimbabwe D2C authority | Match country, host, service, frequency arrangement and permitted test conditions | POTRAZ/host determination specific to the proposed satellite service |
| `satellite_entitlement` | Commercial access must include Onesa's subscribers and offered functions | Track explicit per-offer entitlement; never infer from installed app, eSIM or global coverage | Executed service scope, eligible SIM/device matrix and provider acceptance |
| `device_acceptance` | Device, regional SKU, firmware, SIM and carrier configuration determine the available service; a marketing name alone is insufficient | Record and qualify exact combinations against the host's published or contracted acceptance matrix | Host acceptance, exact device/software references and completed terrestrial/satellite test evidence |
| `operational_acceptance` | Effective controls and customer service need demonstrated operation | Run recovery, reconciliation, security, incident and hardware acceptance; retain open exceptions | Named owners, reviewed results and release sign-off |

The implementation column is Onesa's proposed engineering response. It does not mean the regulator prescribed this database schema or software architecture. Device acceptance is an engineering/contractual gate, informed by the [Vodacom eSIM conditions](https://www.vodacom.co.za/vodacom/terms/esim) and [T-Mobile satellite conditions](https://www.t-mobile.com/coverage/satellite-phone-service); those foreign operators' terms do not confer Zimbabwe service rights. Data location and foreign-storage controls are a mandatory part of the `data_protection` evidence, not a separate gate in the current software.

## Specific operating rules to resolve

**Subscriber records.** Agree the required fields, verification, authorized agents, changes of subscriber details, retention and lawful disclosure process with the host. Minimize access and keep communication content separate from account administration. The subscriber-registration instrument contains duties beyond creating an online account; a payment or email verification must not satisfy them.

**Cloud storage.** Review the original registration rules together with the 2019 amendment. Do not describe them as an absolute foreign-cloud ban, and do not assume a cloud provider's default encryption automatically meets the host-unreadable encryption/local key-custody conditions. Account for backups, logs, support exports and disaster recovery as well as the primary database.

**Breach response.** SI 155/2024 s17 specifies reporting personal-data breaches to the Authority within **24 hours** of awareness, with **72-hour** notification to affected subjects where the stated high-risk condition applies. It also requires responses to the Authority's information requests within **14 days**, and an investigation report within **21 days of notification**. Establish detection, a DPO-led incident clock, notification preparation, an evidence log and recovery drills. Obtain advice on the applicable incident's reporting obligations; no automated email alone constitutes compliance.

**Prices and fees.** Obtain a current written regulatory fee assessment and approved retail tariff process. Do not display the development fixture's sample monetary amounts as Onesa prices. Host wholesale rates and regulator-approved customer tariffs are different records.

**Physical installations.** Identify the applicable licence/permission, equipment approval, installer competence, site owner permission and spectrum conditions before a radio installation. A lab label or reduced transmitter power is not an authorization. An ordinary IP/device bench can be prepared while these matters are resolved.

**Emergency claims.** The production service must satisfy the obligations applicable to its licence and contract. A disclaimer is not a substitute. Separate ordinary voice, app voice and emergency capability, and agree an authorized test procedure rather than calling live emergency services to check a demo.

## Test permission and commercial release

An authorized experiment and a sellable mobile service are different decisions. Record the actual permission to test before performing a physical network trial. Later, the trial results can support device/service acceptance. Requiring an already-completed device acceptance certificate for the experiment that creates it would be circular.

The following is **Onesa's internal record-acceptance policy**, not a claim that POTRAZ requires these database keys. It applies to a **passing manual** radio observation. Plans, blocked/failed observations and clearly labelled simulations can be recorded without claiming successful service.

| Trial path | Required current evidence references | What the evidence must actually cover |
| --- | --- | --- |
| `terrestrial` | `host_agreement`, `equipment_approval` | Authorized host test account/use and the exact permitted equipment scope |
| `direct_to_cell` | The above, plus `satellite_authorization`, `satellite_entitlement` | The specific Zimbabwe handset-to-satellite experiment, operator, device/profile, service functions and observation window |
| `dish_wifi` | `host_agreement`, `equipment_approval` | Authorized broadband account/install/use and equipment; the agreement concerns broadband here, not MVNO access |

Use country `ZW`, the same operator, path and explicit device-scope reference. Accepted evidence must be valid for the observation and still current at review; do not use a document issued after the experiment to backdate permission. Preserve document/record IDs and revisions, the tested asset's identity/firmware revision, approved test-plan reference, pass criteria and observed bearer evidence. D2C needs a handset as the primary test asset; a SIM record alone is insufficient. A managed AP and tablet have their own inventory types.

The `device_acceptance` gate is an outcome of qualification and a commercial release requirement. It is not an entry gate for its own test. Likewise, a service's required licence, registration, tariff, emergency, data and operational obligations remain part of the full launch decision; the smaller test-evidence set does not waive them.

Software checks references, dates and scope. The responsible engineer still verifies documentary authenticity, actual test permission, safety, equipment condition and compliance with the agreed conditions before performing the test. No accepted record sends RF, provisions a SIM, establishes coverage or enables customer sales.

## Evidence lifecycle

Each decision should identify a gate, scope, document reference, issuer, reviewer, issue/observation date, applicable expiry or next-review date, and outcome. Keep attachments in approved restricted storage; put only non-sensitive references in operational records. Rejected, expired, revoked, superseded, missing or mismatched evidence blocks the relevant release decision. Preserve the decision history and require a fresh review after a material network, offer, hosting or device change.

The software can record and evaluate evidence. It cannot issue a licence, bind an operator, allocate spectrum, verify physical possession remotely, or turn a simulated service into an authorized mobile network.
