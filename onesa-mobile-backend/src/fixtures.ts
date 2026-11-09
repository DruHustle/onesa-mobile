export const DEMO_CONTEXT = {
  mode: "demo",
  serviceStatus: "prelaunch",
} as const;

export const health = {
  ...DEMO_CONTEXT,
  status: "ok",
  service: "onesa-mobile-backend",
  productionReady: false,
} as const;

export const catalog = {
  ...DEMO_CONTEXT,
  disclaimer: "Product concepts only. Prices, allowances, partner coverage and availability are not confirmed. No service can be purchased or activated.",
  plans: [
    {
      id: "everyday",
      name: "Everyday",
      description: "A simple mobile plan, managed in one place.",
      price: null,
      allowance: null,
      status: "proposed",
      activationAvailable: false,
      features: ["Proposed mobile subscription", "Clear usage and renewal controls", "Partner and regulatory approvals required"],
    },
    {
      id: "reach",
      name: "Reach",
      description: "Planned satellite connectivity for eligible phones, locations and services.",
      price: null,
      allowance: null,
      status: "proposed",
      activationAvailable: false,
      features: ["Proposed satellite extension", "Device and service eligibility checks required", "Zimbabwe availability has not been verified"],
    },
    {
      id: "family-farm",
      name: "Family & Farm",
      description: "A proposed way to manage several lines and support people back home.",
      price: null,
      allowance: null,
      status: "proposed",
      activationAvailable: false,
      features: ["Proposed line management", "Separate payer and subscriber roles", "No real accounts or payments in this demonstration"],
    },
  ],
} as const;

export const readiness = {
  ...DEMO_CONTEXT,
  productionReady: false,
  enabledTransports: [],
  features: {
    cellular: {
      available: false,
      status: "provider_pending",
      detail: "A host network agreement, provisioning integration and required approvals are pending.",
    },
    satellite: {
      available: false,
      status: "provider_pending",
      detail: "Starlink is the preferred prospective provider. No Zimbabwe wholesale agreement, service authorization or compatible-device qualification has been verified for Onesa.",
    },
    activation: {
      available: false,
      status: "provider_pending",
      detail: "SIM/eSIM provisioning, subscriber registration and acceptance testing are pending.",
    },
    payments: {
      available: false,
      status: "provider_pending",
      detail: "No payment provider is connected. Money cannot be collected.",
    },
    identity: {
      available: false,
      status: "provider_pending",
      detail: "Onesa identity integration and customer registration are not implemented in this starter.",
    },
  },
} as const;

export const demoAccount = {
  ...DEMO_CONTEXT,
  fictional: true,
  label: "Fictional account for demonstration only",
  account: {
    id: "demo-account",
    displayName: "Demo customer",
    selectedPlanId: "everyday",
    subscriptionStatus: "not_activated",
  },
  usage: {
    usedGb: 2.4,
    totalGb: 5,
    source: "fictional_fixture",
    lastUpdated: null,
    illustrationOnly: true,
    description: "Illustrative usage only. These values are not an offered plan allowance, live measurement or billable usage.",
  },
  activationAvailable: false,
  paymentAvailable: false,
} as const;
