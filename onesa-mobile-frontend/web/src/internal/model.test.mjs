import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState, filterSubscribers, metrics, opsReducer } from './model.ts';

const at = '2026-11-05T12:00:00.000Z';

test('a review changes only its fictional record and records the transition without activating service', () => {
  const original = createDemoState();
  const next = opsReducer(original, { type: 'review', id: 'DEMO-S01', status: 'partner', at });
  assert.equal(original.subscribers[0].status, 'review');
  assert.equal(next.subscribers[0].status, 'partner');
  assert.equal(metrics(next).reviews, metrics(original).reviews - 1);
  assert.equal(next.audit.length, 1);
  assert.match(next.audit[0].detail, /No SIM activated/);
  assert.equal(opsReducer(next, { type: 'review', id: 'DEMO-S01', status: 'active', at }), next);
  assert.equal(opsReducer(next, { type: 'review', id: 'missing', status: 'review', at }), next);
});

test('requesting information requires a return to review before partner review', () => {
  const original = createDemoState();
  assert.equal(opsReducer(original, { type: 'review', id: 'DEMO-S02', status: 'partner', at }), original);
  const reviewed = opsReducer(original, { type: 'review', id: 'DEMO-S02', status: 'review', at });
  assert.equal(opsReducer(reviewed, { type: 'review', id: 'DEMO-S02', status: 'partner', at }).subscribers[1].status, 'partner');
});

test('support ownership and resolution update queues and add one audit event per actual change', () => {
  const original = createDemoState();
  const action = { type: 'ticket', id: 'DEMO-T01', status: 'resolved', owner: 'Demo ops B', at };
  const next = opsReducer(original, action);
  assert.equal(next.tickets[0].owner, 'Demo ops B');
  assert.equal(metrics(next).tickets, metrics(original).tickets - 1);
  assert.equal(next.audit.length, 1);
  assert.equal(opsReducer(next, action), next);
  assert.equal(opsReducer(next, { ...action, owner: 'Real user' }), next);
});

test('synthetic reconciliation is idempotent and preserves amounts', () => {
  const original = createDemoState();
  const action = { type: 'match-payment', id: 'DEMO-P01', at };
  const next = opsReducer(original, action);
  assert.equal(next.payments[0].amountMinor, original.payments[0].amountMinor);
  assert.equal(metrics(next).reconciliation, metrics(original).reconciliation - 1);
  assert.equal(opsReducer(next, action), next);
  assert.match(next.audit[0].detail, /No money moved/);
});

test('reset creates independent seed records and a fresh demo audit', () => {
  const seed = createDemoState();
  const changed = opsReducer(seed, { type: 'match-payment', id: 'DEMO-P01', at });
  const reset = opsReducer(changed, { type: 'reset', at });
  assert.deepEqual(reset.payments, createDemoState().payments);
  assert.notEqual(reset.payments[0], seed.payments[0]);
  assert.equal(changed.payments[0].status, 'matched');
  assert.equal(reset.audit.length, 1);
  assert.equal(reset.audit[0].action, 'Demo reset');
  assert.equal(reset.nextAuditId, 2);
});

test('subscriber filtering combines case-insensitive search and queue status', () => {
  const records = createDemoState().subscribers;
  assert.equal(filterSubscribers(records, '  FARM ', 'review')[0].id, 'DEMO-S03');
  assert.equal(filterSubscribers(records, 'DEMO-S03', 'partner').length, 0);
  assert.equal(filterSubscribers(records, '', 'all').length, 6);
});
