import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { createDemoState, filterSubscribers, metrics, opsReducer, owners, partners, reviewLabels, ticketLabels } from './model';
import type { OpsAction, OpsState, Owner, ReviewStatus, TicketStatus } from './model';
import './internal.css';

type ViewId = 'overview' | 'subscribers' | 'billing' | 'support' | 'partners' | 'team';
type OperationsProps = { state: OpsState; dispatch: Dispatch<OpsAction> };
const views: { id: ViewId; name: string; description: string; symbol: string }[] = [
  { id: 'overview', name: 'Overview', description: 'A clear view of the work waiting for your team.', symbol: '01' },
  { id: 'subscribers', name: 'Subscribers', description: 'Explore registration reviews using fictional records.', symbol: '02' },
  { id: 'billing', name: 'Billing & agents', description: 'Review synthetic entries and the proposed cash workflow.', symbol: '03' },
  { id: 'support', name: 'Support', description: 'Assign and resolve sample questions in this session.', symbol: '04' },
  { id: 'partners', name: 'Partners', description: 'Track the evidence and agreements needed before launch.', symbol: '05' },
  { id: 'team', name: 'Team & audit', description: 'Proposed roles and the activity in your local preview.', symbol: '06' },
];
const now = () => new Date().toISOString();
const money = (minor: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'green' }) {
  return <span className={`ops-badge ops-badge-${tone}`}>{children}</span>;
}
function Panel({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return <section className="ops-panel"><div className="ops-panel-heading"><h2>{title}</h2>{note && <span>{note}</span>}</div>{children}</section>;
}
function Activity({ state }: { state: OpsState }) {
  return state.audit.length ? (
    <ol className="ops-activity">
      {state.audit.slice(0, 12).map((event) => <li key={event.id}>
        <div><strong>{event.action}</strong><span className="ops-muted">{event.entity} · {new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
        <p>{event.detail}</p>
      </li>)}
    </ol>
  ) : <div className="ops-empty"><strong>Your session starts here.</strong><p>Review a fictional subscriber, match a demo entry or triage a sample ticket to see an audit event.</p></div>;
}

function Overview({ state, go }: { state: OpsState; go: (view: ViewId) => void }) {
  const counts = metrics(state);
  const cards: [string, number, ViewId][] = [['Synthetic subscribers', counts.subscribers, 'subscribers'], ['Reviews waiting', counts.reviews, 'subscribers'], ['Open support cases', counts.tickets, 'support'], ['Entries to reconcile', counts.reconciliation, 'billing']];
  return <>
    <div className="ops-metrics">{cards.map(([label, value, destination]) => <button key={label} onClick={() => go(destination)} className="ops-metric"><span>{label}</span><strong>{value}</strong><small>View queue <span aria-hidden="true">→</span></small></button>)}</div>
    <div className="ops-two-column">
      <Panel title="Next in the queue" note="Derived from this demo">
        <div className="ops-queue">
          {state.subscribers.filter((item) => item.status === 'review').slice(0, 3).map((item) => <button key={item.id} onClick={() => go('subscribers')}><span><strong>{item.label}</strong><small>{item.id} · {item.plan}</small></span><Badge tone="amber">Review</Badge></button>)}
          {!counts.reviews && <p className="ops-muted">All sample registration reviews have been processed.</p>}
        </div>
        <button className="ops-text-button" onClick={() => go('subscribers')}>Open all subscriber records <span aria-hidden="true">→</span></button>
      </Panel>
      <Panel title="Service readiness" note="No live service">
        <div className="ops-readiness"><span className="ops-readiness-dot" /><div><strong>Partner integrations are pending.</strong><p>Subscriber reviews in this demo do not activate SIMs. Starlink access for Onesa remains unverified.</p></div></div>
        <button className="ops-text-button" onClick={() => go('partners')}>Review launch dependencies <span aria-hidden="true">→</span></button>
      </Panel>
    </div>
    <Panel title="Recent session activity" note={`${state.audit.length} local events`}><Activity state={state} /></Panel>
  </>;
}

function Subscribers({ state, dispatch }: OperationsProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ReviewStatus | 'all'>('all');
  const visible = filterSubscribers(state.subscribers, query, status);
  return <>
    <div className="ops-toolbar">
      <label className="ops-search">Search fictional records<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Demo label, reference or plan" /></label>
      <label>Review queue<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus | 'all')}><option value="all">All statuses</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <span className="ops-result-count" role="status">{visible.length} of {state.subscribers.length} records</span>
    </div>
    <div className="ops-notice">Every record is fictional. Reviews update only this preview; no identity is verified and no mobile line is provisioned.</div>
    <div className="ops-records">
      {visible.map((record) => <article className="ops-record" key={record.id}>
        <div><span className="ops-record-id">{record.id}</span><h2>{record.label}</h2><p>{record.plan} · {record.owner}</p></div>
        <div className="ops-record-state"><Badge tone={record.status === 'review' ? 'amber' : 'neutral'}>{reviewLabels[record.status]}</Badge><small>SIM: not provisioned</small></div>
        <div className="ops-record-actions">
          {record.status === 'review' ? <>
            <button className="ops-button" aria-label={`Mark ${record.id} reviewed in demo`} onClick={() => dispatch({ type: 'review', id: record.id, status: 'partner', at: now() })}>Mark reviewed</button>
            <button className="ops-button ops-button-light" aria-label={`Request information for ${record.id} in demo`} onClick={() => dispatch({ type: 'review', id: record.id, status: 'information', at: now() })}>Request information</button>
          </> : <button className="ops-button ops-button-light" aria-label={`Return ${record.id} to demo review`} onClick={() => dispatch({ type: 'review', id: record.id, status: 'review', at: now() })}>Return to review</button>}
        </div>
      </article>)}
      {!visible.length && <div className="ops-empty"><strong>No matching demo records.</strong><p>Try a different search or choose all statuses.</p><button className="ops-text-button" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button></div>}
    </div>
  </>;
}

function Billing({ state, dispatch }: OperationsProps) {
  const unmatched = state.payments.filter((item) => item.status === 'unmatched');
  return <>
    <div className="ops-notice"><strong>Synthetic amounts, in USD.</strong> These examples are not Onesa prices, real payments or issued invoices. Matching a row only changes the local demo.</div>
    <Panel title="Reconciliation queue" note={`${unmatched.length} unmatched · ${money(unmatched.reduce((sum, item) => sum + item.amountMinor, 0))} illustrative`}>
      <div className="ops-ledger">
        {state.payments.map((payment) => <article key={payment.id} className="ops-ledger-row">
          <div><span className="ops-record-id">{payment.id}</span><h3>{payment.label}</h3><p>{payment.method}</p></div>
          <div className="ops-amount"><strong>{money(payment.amountMinor)}</strong><small>Synthetic USD</small></div>
          <Badge tone={payment.status === 'matched' ? 'green' : 'amber'}>{payment.status === 'matched' ? 'Matched in demo' : 'Needs matching'}</Badge>
          {payment.status === 'unmatched' ? <button className="ops-button ops-button-light" onClick={() => dispatch({ type: 'match-payment', id: payment.id, at: now() })} aria-label={`Match synthetic entry ${payment.id}`}>Match demo record</button> : <span className="ops-muted ops-settled">No financial action taken</span>}
        </article>)}
      </div>
    </Panel>
    <div className="ops-two-column">
      <Panel title="Cash and agents" note="Proposed workflow"><p>Record a sale, reconcile the agent's cash, then issue an invoice after verified payment. Every step will need staff permissions and a durable audit trail.</p><div className="ops-inline-note"><strong>Demo agent A</strong><span>{state.payments.filter((item) => item.method.includes('agent')).length} synthetic cash entry · no float or payout integration</span></div></Panel>
      <Panel title="Invoices and refunds" note="Planned"><div className="ops-capability"><span>Invoice generation</span><Badge>Not integrated</Badge></div><div className="ops-capability"><span>Refund approval and execution</span><Badge>Not integrated</Badge></div><p className="ops-muted">No invoice, credit note, refund or payment is created from this page.</p></Panel>
    </div>
  </>;
}

function Support({ state, dispatch }: OperationsProps) {
  const [openOnly, setOpenOnly] = useState(true);
  const visible = state.tickets.filter((ticket) => !openOnly || ticket.status !== 'resolved');
  return <>
    <div className="ops-toolbar"><label className="ops-checkbox"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /> Show open cases only</label><span className="ops-result-count" role="status">{visible.length} sample cases</span></div>
    <div className="ops-records">
      {visible.map((ticket) => <article className="ops-ticket" key={ticket.id}>
        <div className="ops-ticket-summary"><div className="ops-ticket-top"><span className="ops-record-id">{ticket.id}</span><Badge tone={ticket.priority === 'High' ? 'amber' : 'neutral'}>{ticket.priority} priority</Badge></div><h2>{ticket.subject}</h2><p>{ticket.subscriber} · fictional request</p></div>
        <div className="ops-ticket-controls">
          <label>Owner<select aria-label={`Owner for ${ticket.id}`} value={ticket.owner} onChange={(event) => dispatch({ type: 'ticket', id: ticket.id, status: ticket.status, owner: event.target.value as Owner, at: now() })}>{owners.map((owner) => <option key={owner}>{owner}</option>)}</select></label>
          <label>Status<select aria-label={`Status for ${ticket.id}`} value={ticket.status} onChange={(event) => dispatch({ type: 'ticket', id: ticket.id, status: event.target.value as TicketStatus, owner: ticket.owner, at: now() })}>{Object.entries(ticketLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </article>)}
      {!visible.length && <div className="ops-empty"><strong>The sample queue is clear.</strong><p>Turn off the open-only filter to view or reopen a resolved demo case.</p></div>}
    </div>
    <p className="ops-muted ops-footnote">Changes are local. No customer receives a message, and there is no live helpdesk connection.</p>
  </>;
}

function Partners() {
  return <><div className="ops-notice">These are launch dependencies, not connected services. Their status cannot be changed into a live service from this preview.</div><div className="ops-partners">{partners.map((partner, index) => <article className="ops-partner" key={partner.name}><span className="ops-partner-number">0{index + 1}</span><div><div className="ops-partner-heading"><h2>{partner.name}</h2><Badge tone="amber">{partner.status}</Badge></div><p>{partner.detail}</p></div></article>)}</div></>;
}

function Team({ state }: { state: OpsState }) {
  const rows = [
    ['Company admin', 'Manage', 'Manage', 'Approve', 'Manage'],
    ['Operations', 'Review', 'Manage', 'Read', '—'],
    ['Support', 'Limited read', 'Manage', 'Limited read', '—'],
    ['Finance', 'Limited read', 'Read', 'Reconcile', '—'],
    ['Agent', 'Assigned only', 'Create', 'Own sales only', '—'],
    ['Auditor', 'Read', 'Read', 'Read', 'Read'],
  ];
  return <>
    <div className="ops-notice"><strong>Permissions are proposed, not enforced.</strong> Access is not restricted in this preview. Staff authentication and server-side authorisation are required before using real customer records.</div>
    <Panel title="Proposed role matrix" note="Design for review"><div className="ops-table-scroll" tabIndex={0} role="region" aria-label="Proposed permissions table, scroll horizontally on smaller screens"><table><caption>Proposed access by role. No role grants exist in this demo.</caption><thead><tr>{['Role', 'Subscribers', 'Support', 'Billing', 'Team & audit'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map(([role, ...permissions]) => <tr key={role}><th scope="row">{role}</th>{permissions.map((permission, index) => <td key={index}>{permission}</td>)}</tr>)}</tbody></table></div></Panel>
    <Panel title="Activity in this session" note={`${state.audit.length} events · latest 12 shown`}><p className="ops-muted ops-footnote">This local demonstration log clears on refresh or reset. It is not a compliance audit log.</p><Activity state={state} /></Panel>
  </>;
}

export default function InternalApp() {
  const [state, dispatch] = useReducer(opsReducer, undefined, createDemoState);
  const [view, setView] = useState<ViewId>('overview');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = views.find((item) => item.id === view)!;
  useEffect(() => {
    const previous = document.title;
    document.title = 'Internal operations · Onesa Mobile';
    return () => { document.title = previous; };
  }, []);
  function go(next: ViewId) {
    setView(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  }
  function reset() { dispatch({ type: 'reset', at: now() }); go('overview'); }
  return <div className="ops-root">
    <a href="#ops-main" className="ops-skip">Skip to operations content</a>
    <header className="ops-header"><div className="ops-brand"><span className="ops-brand-mark" aria-hidden="true"><i /><i /><i /></span><span>onesa <small>mobile</small></span><span className="ops-brand-divider" /><strong>Operations</strong></div><div className="ops-header-actions"><a href="/">Customer website <span aria-hidden="true">→</span></a><button className="ops-button ops-button-light" onClick={reset}>Reset demo</button></div></header>
    <div className="ops-banner"><span aria-hidden="true" />Internal operations demo · synthetic records · no operational access</div>
    <div className="ops-layout">
      <aside className="ops-sidebar">
        <label className="ops-section-picker">
          <span>Section</span>
          <select aria-label="Operations section" aria-controls="ops-main" value={view} onChange={(event) => setView(event.target.value as ViewId)}>
            {views.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <nav aria-label="Operations navigation">{views.map((item) => <button key={item.id} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden="true">{item.symbol}</span>{item.name}</button>)}</nav>
        <div className="ops-sidebar-note"><Badge>DEVELOPMENT</Badge><p>Local demonstration data.<br />No live operator connections.</p></div>
      </aside>
      <main id="ops-main" className="ops-main" tabIndex={-1}>
        <div className="ops-page-heading"><div><span className="ops-eyebrow">COMPANY WORKSPACE</span><h1 ref={headingRef} tabIndex={-1}>{current.name}</h1><p>{current.description}</p></div><Badge>Preview session</Badge></div>
        <div className="ops-session-update" role="status" aria-live="polite">{state.audit[0] ? `${state.audit[0].action}: ${state.audit[0].detail}` : 'Explore the queues below. All changes stay in this browser session.'}</div>
        {view === 'overview' && <Overview state={state} go={go} />}
        {view === 'subscribers' && <Subscribers state={state} dispatch={dispatch} />}
        {view === 'billing' && <Billing state={state} dispatch={dispatch} />}
        {view === 'support' && <Support state={state} dispatch={dispatch} />}
        {view === 'partners' && <Partners />}
        {view === 'team' && <Team state={state} />}
      </main>
    </div>
  </div>;
}
