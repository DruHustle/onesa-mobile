export const PLANS = [
  {
    id: 'everyday',
    name: 'Everyday',
    eyebrow: 'THE SIMPLE START',
    summary: 'A clear monthly mobile plan for daily life.',
    features: ['One understandable allowance', 'Usage and bills in one place', 'Optional renewal, under your control'],
  },
  {
    id: 'reach',
    name: 'Reach',
    eyebrow: 'THE SATELLITE AMBITION',
    summary: 'Explore future connectivity beyond terrestrial coverage.',
    features: ['A proposed satellite add-on', 'Availability must be confirmed', 'Device and network eligibility apply'],
  },
  {
    id: 'family-farm',
    name: 'Family & Farm',
    eyebrow: 'FOR PEOPLE YOU SUPPORT',
    summary: 'A proposed way to manage several lines together.',
    features: ['Individual line allowances', 'Simple spending controls', 'Pay for a family member’s service'],
  },
] as const;

export type PlanId = (typeof PLANS)[number]['id'];
export type ScreenId = 'home' | 'plans' | 'network' | 'account';

export interface PreviewState {
  screen: ScreenId;
  selectedPlanId: PlanId | null;
}

export type PreviewAction =
  | { type: 'navigate'; screen: ScreenId }
  | { type: 'select-plan'; planId: PlanId }
  | { type: 'reset' };

export const INITIAL_PREVIEW: PreviewState = {
  screen: 'home',
  selectedPlanId: null,
};

/** This reducer only changes local presentation. It never provisions a line. */
export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'navigate':
      return { ...state, screen: action.screen };
    case 'select-plan':
      return { ...state, selectedPlanId: action.planId };
    case 'reset':
      return { ...INITIAL_PREVIEW };
  }
}

export type LiveAction = 'activate-sim' | 'collect-payment' | 'connect-satellite';
export type BlockedLiveAction = Readonly<{
  allowed: false;
  reason: string;
}>;

/**
 * A deliberate hard boundary for this starter. A plan selection, environment
 * variable or device permission must never turn a preview into a live service.
 * Future integrations require a separately reviewed authenticated backend flow.
 */
export function liveActionAvailability(action: LiveAction): BlockedLiveAction {
  const reasons: Record<LiveAction, string> = {
    'activate-sim': 'SIM activation is unavailable in this development preview.',
    'collect-payment': 'This development preview cannot collect payments.',
    'connect-satellite': 'Onesa satellite service in Zimbabwe is unconfirmed. This app cannot connect your phone to a satellite.',
  };
  return { allowed: false, reason: reasons[action] };
}

export const PASOFI = {
  url: 'https://pasofi.mobile.onesa.eu',
  introduction: 'Pasofi is Onesa Mobile’s community Wi-Fi product in Zimbabwe.',
  status: 'New purchases and hotspot connections are paused.',
} as const;

export const NETWORK_FACTS = [
  {
    title: 'Mobile network',
    tag: 'HOST PARTNER REQUIRED',
    description: 'Your phone connects to a mobile operator’s terrestrial network. Onesa needs a licensed host network and a commercial agreement before offering service.',
  },
  {
    title: 'Direct to phone',
    tag: 'NOT CONFIRMED FOR ONESA',
    description: 'Satellite mobile service can connect eligible phones directly where the operator, device and local approvals support it. Clear sky visibility and service limits matter.',
  },
  {
    title: 'Pasofi Wi-Fi',
    tag: 'COMMUNITY HOTSPOTS',
    description: `Your phone connects to a nearby Pasofi hotspot over Wi-Fi. ${PASOFI.status}`,
  },
] as const;
