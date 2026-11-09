# Physical hardware pilot and commissioning runbook

Prepared **5 November 2026** for a proposed Zimbabwe Light MVNO with a conditional satellite extension. This is a procurement and acceptance plan. No hardware was purchased, configured, connected, measured or commissioned during this review. Existing PamoFi routers/Starlink terminals have not been inspected or assigned to Onesa Mobile.

Start with the [physical bench pack](PHYSICAL_BENCH.md): numbered wiring plan, staged purchase/reuse decisions, isolation test matrix, power worksheet and first-session handover. The machine-readable [pilot template](../infra/hardware/pilot-template.json) contains unfilled planning fields; it is not a device configuration or evidence that a bench exists.

## What to obtain first

Build one small **IP and device test bench**. Inventory and reuse suitable existing equipment first. The quantities below are proposed minimums for one bench, not a rollout forecast. Final radio-capable models need local supplier/type-approval evidence and the exact device/firmware acceptance conditions from the host.

| Item | Quantity | Minimum selection/acceptance criterion | Procurement decision |
| --- | ---: | --- | --- |
| Development workstation | 1 | Encrypted disk, supported OS, at least 16 GB RAM and 512 GB SSD as an engineering sizing target; enough free storage for mobile toolchains | Reuse a suitable workstation. For local iOS compilation choose a Mac compatible with the selected stable Xcode; Apple silicon is the recommended new purchase. Check [Apple's matrix](https://developer.apple.com/xcode/system-requirements/) first. |
| Managed Ethernet router | 1 | VLANs, firewall rules, maintained firmware, configuration export/recovery and local management access | Reference candidate: **MikroTik L009UiGS-RM**. It provides eight Gigabit Ethernet ports and RouterOS v7; its PoE output is passive, so do not assume it powers an arbitrary AP. Obtain a local quote/approval evidence. [Manufacturer](https://mikrotik.com/product/l009uigs_rm). |
| Wi-Fi access point | 1 | Supported firmware, separate tagged management/test/visitor networks, client isolation, suitable local radio approval | Reuse a qualified managed AP or select through a local authorized supplier. Use its approved power supply/injector. No AP is required for a wired-only first bench. |
| iPhone | 1 | Supported app OS, unlocked exact regional SKU; host approval is required for later SIM/eSIM/VoLTE/satellite tests | Borrow or reuse first. Record model identifier, OS and carrier-settings versions. Do not purchase solely because a US carrier's list includes a similarly named phone. |
| Mainstream Android phone | 1 | Supported app OS and host-accepted radio/SIM configuration | Include a physical-SIM/eSIM combination if the host supplies both. Record SKU and firmware, not just marketing name. |
| Lower-cost Android phone | 1 | A device representative of the intended pilot customers, within the app's supported OS range | Test resource use, text scaling and slow/offline workflows; satellite qualification is a separate decision. |
| Tablet | 1 borrowed/shared | iPad or Android tablet with a supported OS | Verify the customer UI and compact operations layout; add the other platform when the pilot's actual device mix justifies it. |
| UPS or packaged battery backup | 1 | Rated for measured load and the required runtime, manufacturer-approved supplies, safe shutdown support where applicable | Select after measurement. Suggested bench target: two hours for the network equipment; this is an engineering target, not a legal requirement. VA alone does not establish runtime. |
| Ethernet/USB cabling and adapters | 1 set | Labelled Cat6 patch leads, the selected workstation's Ethernet adapter, correct phone cables, router console access if supported | Start with six patch leads and the three phones' required cables; verify connectors and power compatibility. |
| Encrypted removable backup medium | 1 | Capacity for configuration exports and approved lab recovery data; recovery key stored separately | Use for synthetic lab data initially. Any live subscriber backup needs the approved retention and key-custody design. |
| USB power banks | 2 | Manufacturer-approved charging behavior and capacity measured with the test phones | Useful for outdoor field acceptance after host authorization. |

The L009 is a lab routing reference, not a guaranteed production throughput recommendation. A port's line rate is not its encrypted or filtered routing capacity. Measure the intended firewall/VPN path before selecting production edge equipment.

For this model, subscriber traffic uses the licensed host's mobile network and contracted satellite access. The bench router supplies lab IP connectivity; it is not a cellular base station, mobile core, SMS centre or Starlink gateway. Onesa does not need to buy those carrier components for the proposed Light MVNO bench. The host must accept its responsibilities before any radio-service trial.

**Do not purchase a Starlink dish just to make ordinary phones connect directly to satellites.** Direct-to-cell acceptance uses qualified phones, host-issued service profiles and the contracted network. Starlink's published architecture describes operator integration; the ordinary dish is a different access product. [Technical description](https://starlink.com/public-files/DIRECT_TO_CELL_SERVICE_FEB_25.pdf).

### Conditional additions after a host agreement

| Item | Proposed initial quantity | Gate before ordering or use |
| --- | ---: | --- |
| Host physical test SIMs | 6 | Host-approved lab accounts and permitted registration process; allocate active, inactive, replacement and negative-test cases |
| Host test eSIM profiles | Up to 6 activations | Host-approved issuance/reissue process and qualified devices; store activation secrets outside Git and ordinary logs |
| Host/MVNE private connectivity equipment | As specified by host | Agreed API/VPN/security design and compatibility test; do not invent APNs, PLMN values or network keys |
| Additional qualified handset | As needed | A material gap in the pilot's actual device matrix; re-use the initial phones where approved |
| Optional Starlink broadband terminal and mounting set | 0 by default; 1 only for a separate IP-path test | Confirm exact kit version, Zimbabwe account/service terms, permission for the proposed use, safe installation and local equipment requirements |
| Additional licensed cellular site/backhaul equipment | 0 in this Light MVNO plan | A separately approved network project, site survey, host responsibility, spectrum and commissioning design |

A dish-based IP test can measure the web/app's behavior over that internet connection. Its result must be labelled **satellite broadband over Wi-Fi/Ethernet**, never handset direct-to-cell. Use the supplied kit's current wiring and mounting instructions; connectors and power arrangements differ across Starlink generations. [Starlink router integration guidance](https://starlink.com/mt/support/article/0b372c01-c692-8920-8396-ffb7f429aab1).

## Bench network design

Use the existing authorized internet connection for the first phase. The workstation and apps do not need a satellite link to test account, billing and operations software. Allocate an address plan only after checking for collisions with existing networks and remote-access routes.

| Proposed segment | Devices | Allowed purpose |
| --- | --- | --- |
| Management VLAN 10 | Authorized administrator workstation and device management interfaces | Router/AP maintenance, configuration backup and approved administrative access |
| Test VLAN 20 | Test phones/tablet and lab application endpoints | Application tests and explicitly approved outbound provider test interfaces |
| Visitor VLAN 30, if needed | Untrusted visitor devices | Internet only; no access to management, database or test assets |

Apply explicit inter-segment firewall rules. Confirm both IPv4 and IPv6 behavior; a working IPv4 rule does not prove IPv6 isolation. Keep database and device administration off the public WAN. Use a reviewed outbound-initiated remote-access design if required; do not forward public management ports as a shortcut. The physical installation needs a documented local recovery path.

This is a design specification, not an importable configuration for an unknown router. Before creating a device-specific change, capture its model, firmware, interfaces, existing bridges/VLANs, addressing and access path. MikroTik's documentation warns that incorrect VLAN filtering can create security and access problems. [Bridge/VLAN documentation](https://manual.mikrotik.com/docs/bridging-and-switching/).

## Power sizing

Measure the router, AP and any optional satellite terminal at idle and representative load. Include losses and startup demand. Keep laptop charging and other large loads out of the network-runtime budget unless deliberately included.

The inventory power field is a declared nameplate/rating, not a measured runtime load. Record **unknown** until a rating or measurement is available in its corresponding record; zero watts is not a substitute for missing information. Retain meter, timestamp, supply, measured average/peak, included loads and evidence reference in the separate power worksheet. After replacing a supply, changing PoE load or changing the recorded rating, repeat the affected power and recovery checks. The [worksheet](PHYSICAL_BENCH.md#5-power-and-recovery-worksheet) keeps total load and runtime uncalculated until those inputs are supplied.

For an initial battery estimate:

`required nominal Wh = measured continuous W × target hours ÷ (usable battery fraction × conversion efficiency)`

Example using invented sizing assumptions: a 100 W load, two-hour target, 80% usable battery capacity and 85% conversion efficiency needs approximately **294 Wh** before extra aging/temperature margin. This is arithmetic, not a product runtime guarantee. Check the supplier's discharge curves and run a controlled unplug test. Have a qualified installer handle mains wiring, earthing, surge protection and any outdoor installation.

## Commissioning sequence

1. **Create the site record.** Assign a site ID, owner, purpose and country. Keep private addresses, precise location and photographs in approved restricted storage. The repository template contains no actual site location.
2. **Receive and inventory assets.** Record manufacturer, exact model/SKU, serial reference, firmware, supplier, custody and approval evidence. Mark received equipment as received; commissioning requires later evidence.
3. **Inspect power and cabling.** Match supplies and PoE types, label cables, record measured load and retain the backup-runtime result.
4. **Prepare the network change.** Export and verify the previous configuration, document the management path and rollback steps, then apply a reviewed device-specific configuration locally.
5. **Verify isolation and recovery.** Test management access, forbidden paths, power-cycle recovery, DNS/time behavior and configuration restoration. Record failures as failures.
6. **Install app test builds.** Record application commit/build IDs and device versions. A JavaScript bundle export does not satisfy this step.
7. **Run IP-only application acceptance.** Use synthetic accounts and payment/provider simulators explicitly labelled as such. Test loss, delay, stale data, duplicate submissions, signed-out access and recovery.
8. **Run host-network acceptance when authorized.** Use the approved SIMs, devices, locations, tests and service window. Store host event references and test outcomes without publishing identifiers or secrets.
9. **Run direct-to-cell acceptance separately.** Begin only with written country/service authorization and entitlement. Confirm actual transport using agreed network/device evidence; the presence of a dish or an app label is insufficient.
10. **Review and sign off.** Require the named technical and operational owners to accept results and open exceptions. Commissioning status does not authorize customer sales; the commercial/regulatory release gates remain separate.

### Evidence before a passing manual radio observation

Use the [trial-authority policy](REGULATORY_MATRIX.md#test-permission-and-commercial-release) for the specific operator, path and device scope. The software's acceptance of a record is not permission to transmit; the physical operator must verify the actual documents and conditions before testing. A SIM record alone cannot identify a direct-to-cell test: record the handset, exact SKU/software, host profile reference and permitted functions. `device_acceptance` is a later decision supported by trial results, so do not make it a circular precondition for its own qualification trial.

A physical asset with firmware, network connectivity or recoverable configuration must be tested for those functions. Use the dedicated `access_point` and `tablet` inventory types. A legacy managed AP entered as `other` still needs these checks and must not use its generic classification to skip them. Record a substantive reason whenever a check is legitimately not applicable, such as firmware on a passive accessory; never use that outcome just because equipment or test access is missing.

## First Android USB bench session

This is an operator procedure for a device in your custody. It has not been executed on a physical phone in this task. Start the local Docker lab and issue synthetic identities using the [runtime guide](../infra/runtime/README.md). Keep the gateway bound to loopback. Obtain the debug APK from the successful native workflow for the source revision you are testing, or build that revision locally. The CI APK targets **arm64** and needs Metro; it is not a standalone store release.

Install official Android Platform Tools on the workstation. On the intended test phone, enable developer/USB debugging and approve the connection yourself. Use `adb devices` to identify that exact device, then forward only the lab gateway and development bundler over USB:

```sh
ONESA_TEST_SERIAL='replace-with-your-authorized-test-device-serial'
adb -s "$ONESA_TEST_SERIAL" reverse tcp:8080 tcp:8080
adb -s "$ONESA_TEST_SERIAL" reverse tcp:8081 tcp:8081
adb -s "$ONESA_TEST_SERIAL" install /absolute/path/to/app-debug.apk
```

From `onesa-mobile/onesa-mobile-frontend/mobile/`, using the same source revision and Node 24.22.1:

```sh
npm ci
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8080/api npm start -- --localhost
```

Open **Onesa Mobile Preview** on the connected phone. The two forwarded ports allow the debug app to reach Metro and the synthetic account API without changing the lab's public-network exposure. If an earlier debug install has a different debug signing certificate, use a deliberately managed test-device installation process; do not erase an existing app's data blindly. The release signing identity and physical iOS signing are separate owner-controlled steps.

Record the source/build ID, exact phone/OS, launch behavior, readable text, sign-in, session switch/logout, draft clearing, offline recovery and a synthetic account export. Test loss of the USB/data path and reconnection. Complete the hardware acceptance rows with actual observations; a successful compiler job does not complete them. After the session, remove the two forwards and revoke USB-debugging trust when the test-device policy requires it:

```sh
adb -s "$ONESA_TEST_SERIAL" reverse --remove tcp:8080
adb -s "$ONESA_TEST_SERIAL" reverse --remove tcp:8081
```

Primary procedure references: [React Native device/USB setup](https://reactnative.dev/docs/running-on-device), [Expo localhost development server](https://docs.expo.dev/more/expo-cli/). For physical iPhone/iPad use the owner's Apple signing/provisioning and an approved lab connection; the unsigned CI simulator archive cannot be installed on those devices.

## Acceptance cases

All cases start as **not run** in the machine-readable [pilot template](../infra/hardware/pilot-template.json). Recommended samples and thresholds must be agreed before a test; do not decide pass criteria after seeing the result.

| ID | Test | Required evidence and pass condition |
| --- | --- | --- |
| HW-01 | Inventory and model qualification | Received devices match records; applicable local approval and supplier evidence are linked; no planned item is shown as installed |
| HW-02 | Management isolation | Test and visitor segments cannot reach management or database services; authorized admin path succeeds; IPv4/IPv6 results retained |
| HW-03 | Power and restart | Measured runtime meets the recorded target; controlled restart restores expected configuration and pending records without data corruption |
| HW-04 | Configuration restore | A saved configuration is restored on the bench and management/test access is re-verified |
| HW-05 | Native application install | Signed test builds install and launch on the chosen phone/tablet matrix; build IDs, OS versions, accessibility and layout findings retained |
| HW-06 | Intermittent connectivity | Cache age/failed requests are visible; bounded retry works; reconnection produces no duplicated financial or provisioning effect |
| NET-01 | Registration and activation | Unverified subscribers cannot activate; host-confirmed success/failure is correlated to each request; repeated submissions do not create another line |
| NET-02 | Terrestrial service | Approved incoming/outgoing voice, SMS and data tests meet the host-agreed conditions; unsupported functions remain unavailable |
| NET-03 | SIM/eSIM recovery | Loss/reissue/suspension/recovery follows approved identity controls; obsolete profiles do not remain unexpectedly usable |
| NET-04 | Usage and billing reconciliation | Metering units, source interval and freshness match authoritative provider records; duplicate/late/corrected events are handled |
| SAT-01 | D2C eligibility and attachment | Country, device, firmware, SIM and plan match approved scope; actual satellite transport is evidenced independently of Onesa UI |
| SAT-02 | D2C function and recovery | Each contracted service is tested separately across agreed conditions; delay, failure, transitions and unsupported combinations are recorded |
| EMG-01 | Emergency-service responsibility | Host/regulator-approved procedures and test facility verify the required behavior; no unsolicited public emergency call is placed |
| OPS-01 | Incident and rollback drill | A simulated provider failure creates an owned exception; customer status remains honest; recovery and rollback evidence is retained |

For radio tests, record the device/SIM references, permitted test location, time, sky/obstruction conditions, software/carrier versions, actual network evidence, attempts, success/failure and duration. Agree performance thresholds with the host and POTRAZ where applicable. Do not turn a small successful sample into a national or indoor coverage claim. T-Mobile's current satellite product explicitly qualifies devices, apps and availability, which is the appropriate kind of claim discipline to adopt. [T-Satellite](https://www.t-mobile.com/coverage/satellite-phone-service).

## Information needed to execute the physical phase

The plan can proceed to an inventory visit once Onesa supplies a pilot location, access/custodian, available power, existing internet connection, router/AP models and firmware, test-phone SKUs/OS versions, and a procurement budget. Carrier/SIM details and satellite entitlement are additionally required for the radio stages. Collect sensitive identifiers through approved channels, not a public issue, repository or screenshot.
