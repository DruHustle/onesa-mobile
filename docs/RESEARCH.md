# Evidence and open questions

Research date: **5 November 2026**. This note separates verified source material from decisions and unverified commercial assumptions. The business brief is a proposal.

| Source | Finding used in the design |
| --- | --- |
| [fraenk product page](https://fraenk.de/hol-dir-fraenk) | App-managed plan, SIM/eSIM, usage and support; use its short journey and visible conditions, not its brand, prices or German contract terms |
| [My Econet](https://www.econet.co.zw/my-econet-app/) | Local self-service benchmark for new SIM/eSIM, suspension/reactivation, balances and support; no Onesa partnership is established |
| [NetOne bundles](https://www.netone.co.zw/which-bundles-does-netone-have) | Separate voice, data, SMS and combined allowances; preserve units, expiry and currency instead of one ambiguous balance |
| [Vodacom eSIM](https://www.vodacom.co.za/vodacom/terms/esim) and [VoLTE conditions](https://www.vodacom.co.za/vodacom/terms/vodacom-volte) | Device/region compatibility, accepted software and provisioned services are distinct; a successful eSIM install does not prove VoLTE or satellite support |
| [T-Mobile T-Satellite](https://www.t-mobile.com/coverage/satellite-phone-service) | Verified US Starlink example: automatic attachment, selected supported apps/devices and explicit sky-view/delay limits; no Zimbabwe rights or emergency numbers are inferred |
| [Starlink Mobile](https://starlink.com/mobile) | Describes messaging, selected-app data and app-based voice; native calling and greater broadband capability are presented as future service |
| [Starlink February 2025 technical release](https://starlink.com/public-files/DIRECT_TO_CELL_SERVICE_FEB_25.pdf) | Describes mobile-operator integration resembling roaming; country and network arrangements matter |
| [POTRAZ converged licensing guidance](https://www.potraz.gov.zw/wp-content/uploads/2025/06/Licence-Application-General-Guidelines.pdf) | Defines the relevant Full/Light/Reseller/MVNE roles; current fee, entity, tariff and test authority still require written confirmation |
| [POTRAZ-authored 2025 DPA guidelines, Veritas copy](https://www.veritaszim.net/sites/veritas_d/files/Cyber%20and%20Data%20Protection%20Act%20Implementation%20Guidlines.pdf) | Adds assessment, DPIA and cross-border-protection guidance to the due-diligence checklist; it is not a new Act or an Onesa compliance certificate |
| [MikroTik L009 specification](https://mikrotik.com/product/l009uigs_rm) and [current bridge/VLAN manual](https://manual.mikrotik.com/docs/bridging-and-switching/) | Lab-router reference and model-specific isolation/recovery design; line speed, listed maximum power and passive PoE are not measured pilot performance |
| [Android constrained-network guidance](https://developer.android.com/develop/connectivity/satellite/constrained-networks) | Documents app opt-in and traffic adaptation for constrained satellite networking |
| [Apple carrier-constrained optimization entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.carrier-constrained.app-optimized) | Documents a platform-specific optimization declaration; carrier qualification remains a separate concern |
| [Expo project workflow](https://docs.expo.dev/workflow/overview/) | Documents generation of native projects through prebuild and the distinction between JS development and native builds |

## Source freshness and retrieval limits

Operator and hardware sources were rechecked on **5 November 2026**. Starlink's current Mobile product text and Apple's entitlement declaration were available in indexed official-page content; direct HTML retrieval returned JavaScript shells. The Gazette copies of SI 12/2021 and SI 250/2019 were read from indexed primary-text PDF copies hosted by Veritas; direct file retrieval returned 404 during this review. This permits checking the cited text, not certifying that the copies include every later amendment. Obtain the regulator's current applicable instrument/conditions for the actual release file.

MikroTik's former `help.mikrotik.com` documentation now identifies itself as frozen and links to the current `manual.mikrotik.com` site; the bench references were updated accordingly. Apply documentation matching the installed firmware, not an assumed latest release.

T-Mobile is the US Starlink operator verified in this review. An add-on sold to a customer of another US carrier is not evidence of a separate Starlink agreement with that carrier. The Starlink partner page does not establish an Onesa/Zimbabwe service entitlement; absence of a listed Onesa arrangement is not proof that a future agreement is impossible.

## Not established by this research

- Commercial Starlink Mobile availability to Onesa customers in Zimbabwe.
- A signed Onesa agreement with Starlink, an MNO or an MVNE.
- A Zimbabwe-specific direct-to-cell partner agreement that includes downstream Onesa subscribers.
- Wholesale prices, public provisioning endpoints, minimum volumes or a guaranteed start date.
- A qualified handset/firmware list, indoor availability, native calling or emergency service for the proposed offering.
- Current all-in regulatory fees or a complete launch budget.

An announcement, global coverage statement, foreign regulator authorization or service in another African country does not establish the Zimbabwe product's availability. An ordinary Starlink dish subscription does not establish direct-to-cell resale rights.

## Design consequences

The website and mobile app label the service as a preview. Proposed plans carry no sellable prices. Readiness is explicit and unimplemented mutations remain unavailable. Future provider adapters are interfaces only. No UI control claims to attach a phone to a satellite.

The physical work starts with the [bench pack](PHYSICAL_BENCH.md) and an inventory of equipment actually available. Keep nameplate power, measured consumption, permitted tests and successful qualification as separate records. A passing manual observation needs scoped current permission references; the resulting device-acceptance review is a later step.

The next external evidence should be a written host proposal, the applicable POTRAZ route, the specific satellite entitlement and an agreed acceptance matrix. Record source dates and recheck the product claims before any public commercial launch.
