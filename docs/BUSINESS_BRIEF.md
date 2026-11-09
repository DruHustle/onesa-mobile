# Onesa Mobile — business brief

**Decision date and source check: 5 November 2026.**

Source location: `DruHustle/onesa-ug`, application directory `onesa-mobile/`.

Status: a proposed Zimbabwean mobile service and development foundation. Commercial terms, licences, coverage, tariffs and satellite availability remain subject to verification. This brief does not announce a network launch or an operator partnership.

## 1. The proposition

Build Onesa Mobile around a simple promise: **understand your plan, control your spending and get help from one compact mobile experience.** Provide a public website, an authenticated customer portal and a separate staff operations portal. iOS and Android apps should support everyday customer tasks. A prospective satellite capability can extend the proposition once a contracted network partner can deliver it.

Start with a proposed prepaid plan with clear validity, optional renewal and visible allowances. Add products only when customer research shows distinct needs and wholesale economics support them. Publish the amount payable, expiry, included services and cancellation rules together. Agree live prices through the required commercial and regulatory process.

Satellite access should be a precisely described service capability: which customers, devices, locations and functions qualify, under what conditions. Avoid a universal coverage promise. A useful service can begin with an excellent terrestrial mobile experience while the satellite agreement and acceptance work proceed.

## 2. Choose the operating model

**Target a Light MVNO agreement.** POTRAZ's published converged-licence guidance describes a Light MVNO using the host operator's radio and core networks, while focusing on customer-facing operations. It separately describes branded/reseller MVNOs as handling branding, customer care, sales and marketing without ownership of subscribers, infrastructure or SIMs. [POTRAZ licence guidance](https://www.potraz.gov.zw/wp-content/uploads/2025/06/Licence-Application-General-Guidelines.pdf).

A Light MVNO is the preferred negotiating position because Onesa needs room to create its own account experience, support processes and product rules. The contract must establish what control is actually available. A branded reseller arrangement is a reasonable first step if the economics, service quality and customer-transition rights are acceptable.

The agreement should define ownership and access for the customer relationship, numbers, SIM stock, billing records, service data and application interfaces. Require a practical exit process before investing heavily in customer acquisition. Compare a host-managed implementation with an MVNE-supported implementation on total operating cost and responsibility, including minimum commitments.

## 3. Start with a focused customer group

These are proposed research segments, not measured market sizes:

| Segment | Customer problem to test | Initial product hypothesis |
| --- | --- | --- |
| Rural households | Unclear spending and variable connectivity | Simple prepaid service with honest coverage information |
| Farms and small businesses | Managing several staff lines and getting support | Small group account with per-line spending controls |
| Families | Paying for another person's connectivity | Gifted top-ups with recipient consent and clear payer permissions |
| Zimbabwean diaspora | Reliable support for family connectivity at home | Remote purchase and invoices through approved payment channels |

Choose one geographic pilot area and one primary segment after interviews. Assess the phones people already own, signal conditions, preferred language, payment habits and support needs. Include people who need assisted onboarding. eSIM support should complement physical SIMs wherever the contracted service supports both.

Family funding should never grant a payer access to another adult's messages, call history or identity documents. Separate billing authority from subscriber privacy. Business administrators should see only the line-management information necessary for their role.

## 4. What Starlink contributes

The desired product is direct communication between an eligible handset and a satellite-enabled mobile network. Treat that as a prospective wholesale network capability, requiring confirmed Zimbabwe authorization, a commercial entitlement and device/service acceptance.

The separate dish-and-router product connects nearby users over Wi-Fi. It may complement Onesa's wider connectivity work, but needs its own commercial terms and accurate product description. Neither a retail Starlink order nor an Onesa app prototype establishes a mobile network partnership.

Before adding a satellite feature to a plan, obtain written answers about supported messaging, data, calls, emergency access, capacity, availability conditions, billing and incident escalation. Make these answers part of the acceptance plan. Publish only the functions that have passed the contracted service's tests.

## 5. Product experience and implementation boundaries

Design three surfaces with explicit responsibilities:

| Surface | Intended audience and purpose | Proposed production location |
| --- | --- | --- |
| Public website | Explain plans, eligibility, coverage limitations and help | `mobile.onesa.eu` |
| Customer portal | Authenticated customers manage their own subscriptions, usage, payments, invoices and support | `mobile.onesa.eu`, within an authenticated area |
| Internal operations | Authorized staff operate the company and investigate exceptions | `ops.mobile.onesa.eu` |

These hosts are proposed and unconfigured. The current customer experience and `/internal/` operations preview use synthetic data. The internal preview has no staff authentication or live operational authority.

For customers, use **Home, Plan, Payments and Help**. Combine allowance, renewal and synchronization age in one summary. Keep controls accessible and panels compact across phones and tablets. Verification, activation tracking, renewal, suspension, refunds and recovery are future live workflows.

Internal modules should cover subscribers, registration and provisioning; subscriptions; billing, reconciliation, invoices and refunds; agent cash settlements; support; providers and service readiness; reports; staff permissions and audit. Use compact work queues and actionable exception details.

Define customer, support, billing, agent, operations and admin roles with minimum necessary access. Enforce account and action permissions in the backend, require staff MFA, and scope shared Onesa identity to this product. Paying for a family member's service grants no access to their communications or identity documents. [Architecture and role boundaries](ARCHITECTURE.md).

Keep clients and backend independently buildable, connected through documented provider adapters. Authentication governs application access; SIM provisioning governs connectivity. Both require approved integrations before customer use.

Subscriber registration must precede activation under POTRAZ's published regulations. Design an explicit verification state and use authoritative provisioning results to confirm service activation. [Subscriber registration regulations](https://www.potraz.gov.zw/wp-content/uploads/2015/04/SI_95_of_2014_Subscriber_Registration_Regulations.pdf).

## 6. Pilot by evidence

The following are proposed acceptance targets, not achieved results or launch dates:

| Stage | Work | Exit evidence |
| --- | --- | --- |
| Concept | Customer interviews, compact prototype and partner proposal | One priority segment, documented needs and a credible host discussion |
| Commercial readiness | Licence scope, contract, tariffs, hosting and responsibilities | Written approvals and terms covering every service offered |
| Integration | Synthetic accounts and provider test environments | Successful and failed payments reconciled; duplicate retries produce no duplicate charge or activation |
| Controlled mobile pilot | Small, consented cohort using approved real service | At least 95% of eligible activations complete within the agreed service window; every exception has an owner |
| Satellite acceptance | Contracted devices, locations and supported functions | Recorded results and limitations; unsupported combinations remain unavailable |
| Expansion | Review service, support and contribution margin | No unresolved critical defect; reconciliation complete; positive measured contribution |

For the controlled pilot, agree cohort size with the host before onboarding. Test refunds, lost phones, SIM replacement, exhausted allowances, unavailable providers and support escalation. Record actual network behavior separately from app behavior. A successful screen transition is insufficient evidence of a working telephone service.

## 7. Economics before a public price

Calculate contribution per active customer as:

**Net subscription revenue − wholesale mobile usage − satellite charges − SIM/platform fees − payment costs − support, fraud and fulfilment costs.**

Then compare total contribution with fixed operating costs and minimum wholesale commitments. Keep taxes, currencies, settlement delays, refunds and working capital explicit. Prevent double counting when wholesale charges bundle several services.

The following arithmetic is an **internal sensitivity example using invented assumptions**. It is neither a proposed retail tariff nor a provider quote, cost estimate or forecast.

| Monthly assumption, USD | Example A | Example B |
| --- | ---: | ---: |
| Net revenue per active customer | 8 | 8 |
| Total variable costs per active customer | 5 | 7 |
| Contribution per active customer | 3 | 1 |
| Fixed operating costs | 3,000 | 3,000 |
| Active customers to cover those fixed costs | 1,000 | 3,000 |

The decision rule is straightforward: replace every assumption with written commercial terms and pilot observations before committing to scale. If contribution is zero or negative, adding customers does not solve the operating loss.

## 8. Decisions to make next

Select the first segment and pilot geography; pursue Light MVNO terms alongside a clearly understood reseller alternative; settle the licence and data-handling model; then connect the application to verified provider interfaces. The companion [partner due-diligence checklist](PARTNER_DUE_DILIGENCE.md) lists the questions and responsibilities to resolve. No outreach or regulatory application has been performed by preparing these documents.
