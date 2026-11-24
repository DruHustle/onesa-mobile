export type ReviewStatus = 'review' | 'information' | 'partner';
export type TicketStatus = 'open' | 'in-progress' | 'resolved';
export type Owner = 'Unassigned' | 'Demo ops A' | 'Demo ops B';
export type Subscriber = { id: string; label: string; plan: string; status: ReviewStatus; owner: Owner };
export type Ticket = { id: string; subject: string; subscriber: string; priority: 'High' | 'Normal'; status: TicketStatus; owner: Owner };
export type Payment = { id: string; label: string; method: string; amountMinor: number; status: 'unmatched' | 'matched' };
export type AuditEvent = { id: number; at: string; action: string; entity: string; detail: string };
export type OpsState = { subscribers: Subscriber[]; tickets: Ticket[]; payments: Payment[]; audit: AuditEvent[]; nextAuditId: number };
export type OpsAction =
  | { type: 'review'; id: string; status: ReviewStatus; at: string }
  | { type: 'ticket'; id: string; status: TicketStatus; owner: Owner; at: string }
  | { type: 'match-payment'; id: string; at: string }
  | { type: 'reset'; at: string };

export const owners: Owner[] = ['Unassigned', 'Demo ops A', 'Demo ops B'];
export const reviewLabels: Record<ReviewStatus, string> = { review: 'Needs review', information: 'Awaiting information', partner: 'Ready for partner review' };
export const ticketLabels: Record<TicketStatus, string> = { open: 'Open', 'in-progress': 'In progress', resolved: 'Resolved in demo' };

/** Fresh fictional records on every call. No phone numbers, identity documents or real people. */
export function createDemoState(): OpsState {
  return {
    subscribers: [
      { id: 'DEMO-S01', label: 'Demo household A', plan: 'Everyday', status: 'review', owner: 'Demo ops A' },
      { id: 'DEMO-S02', label: 'Demo shop B', plan: 'Everyday', status: 'information', owner: 'Demo ops B' },
      { id: 'DEMO-S03', label: 'Demo farm C', plan: 'Family & Farm', status: 'review', owner: 'Unassigned' },
      { id: 'DEMO-S04', label: 'Demo household D', plan: 'Reach', status: 'partner', owner: 'Demo ops A' },
      { id: 'DEMO-S05', label: 'Demo workshop E', plan: 'Everyday', status: 'review', owner: 'Demo ops B' },
      { id: 'DEMO-S06', label: 'Demo family F', plan: 'Family & Farm', status: 'review', owner: 'Unassigned' },
    ],
    tickets: [
      { id: 'DEMO-T01', subject: 'How would eSIM eligibility work?', subscriber: 'Demo household A', priority: 'Normal', status: 'open', owner: 'Unassigned' },
      { id: 'DEMO-T02', subject: 'Explain the sample billing entry', subscriber: 'Demo shop B', priority: 'High', status: 'in-progress', owner: 'Demo ops A' },
      { id: 'DEMO-T03', subject: 'Is satellite service available?', subscriber: 'Demo farm C', priority: 'High', status: 'open', owner: 'Demo ops B' },
      { id: 'DEMO-T04', subject: 'Where would usage appear?', subscriber: 'Demo family F', priority: 'Normal', status: 'resolved', owner: 'Demo ops A' },
    ],
    payments: [
      { id: 'DEMO-P01', label: 'Demo purchase A', method: 'Cash · demo agent A', amountMinor: 650, status: 'unmatched' },
      { id: 'DEMO-P02', label: 'Demo purchase B', method: 'Mobile money example', amountMinor: 1200, status: 'unmatched' },
      { id: 'DEMO-P03', label: 'Demo purchase C', method: 'Card example', amountMinor: 850, status: 'matched' },
    ],
    audit: [],
    nextAuditId: 1,
  };
}

function audited(state: OpsState, at: string, action: string, entity: string, detail: string): OpsState {
  return { ...state, nextAuditId: state.nextAuditId + 1, audit: [{ id: state.nextAuditId, at, action, entity, detail }, ...state.audit] };
}

/** Presentation-only transitions: no state in this model can activate a SIM or settle money. */
export function opsReducer(state: OpsState, action: OpsAction): OpsState {
  if (action.type === 'reset') {
    return audited(createDemoState(), action.at, 'Demo reset', 'Preview', 'Restored synthetic records and cleared earlier session activity.');
  }
  if (action.type === 'review') {
    const record = state.subscribers.find((item) => item.id === action.id);
    const allowed: Record<ReviewStatus, ReviewStatus[]> = { review: ['information', 'partner'], information: ['review'], partner: ['review'] };
    if (!record || !allowed[record.status].includes(action.status)) return state;
    const next = { ...state, subscribers: state.subscribers.map((item) => item.id === record.id ? { ...item, status: action.status } : item) };
    return audited(next, action.at, 'Demo review updated', record.id, `${reviewLabels[record.status]} → ${reviewLabels[action.status]}. No SIM activated.`);
  }
  if (action.type === 'ticket') {
    const ticket = state.tickets.find((item) => item.id === action.id);
    if (!ticket || !owners.includes(action.owner) || !Object.hasOwn(ticketLabels, action.status)) return state;
    if (ticket.status === action.status && ticket.owner === action.owner) return state;
    const next = { ...state, tickets: state.tickets.map((item) => item.id === ticket.id ? { ...item, status: action.status, owner: action.owner } : item) };
    return audited(next, action.at, 'Demo support updated', ticket.id, `${ticketLabels[ticket.status]} → ${ticketLabels[action.status]}; owner: ${ticket.owner} → ${action.owner}.`);
  }
  if (action.type === 'match-payment') {
    const payment = state.payments.find((item) => item.id === action.id);
    if (!payment || payment.status === 'matched') return state;
    const next: OpsState = { ...state, payments: state.payments.map((item) => item.id === payment.id ? { ...item, status: 'matched' } : item) };
    return audited(next, action.at, 'Demo record matched', payment.id, 'Marked a synthetic entry as matched. No money moved and no invoice was issued.');
  }
  return state;
}

export function metrics(state: OpsState) {
  return {
    subscribers: state.subscribers.length,
    reviews: state.subscribers.filter((item) => item.status === 'review').length,
    tickets: state.tickets.filter((item) => item.status !== 'resolved').length,
    reconciliation: state.payments.filter((item) => item.status === 'unmatched').length,
  };
}

export function filterSubscribers(records: Subscriber[], query: string, status: ReviewStatus | 'all') {
  const term = query.trim().toLowerCase();
  return records.filter((record) => (status === 'all' || record.status === status) && `${record.id} ${record.label} ${record.plan} ${record.owner}`.toLowerCase().includes(term));
}

export const partners = [
  { name: 'Regulatory authorisation', status: 'Confirmation required', detail: 'Confirm the licence category, application and permitted operating scope with POTRAZ.' },
  { name: 'Host mobile network', status: 'Not contracted', detail: 'A licensed host, commercial terms and operational responsibilities must be agreed.' },
  { name: 'SIM and eSIM fulfilment', status: 'Not connected', detail: 'Subscriber registration, provisioning and device eligibility need a provider integration.' },
  { name: 'Starlink Mobile', status: 'Unverified for Onesa', detail: 'Zimbabwe service availability, wholesale access, device support and local authorisation are not confirmed for Onesa.' },
  { name: 'Payment providers', status: 'Not integrated', detail: 'Cash procedures and direct provider agreements need reconciliation, refund and invoice workflows.' },
  { name: 'Staff identity and permissions', status: 'Integration pending', detail: 'Staff sign-in, server-enforced access control and a durable audit log are required before using real records.' },
] as const;
