import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_PREVIEW, PLANS, liveActionAvailability, previewReducer } from './domain.ts';
import type { LiveAction } from './domain.ts';

test('preview plan selection and navigation never make live actions available', () => {
  const actions: LiveAction[] = ['activate-sim', 'collect-payment', 'connect-satellite'];
  for (const plan of PLANS) {
    const selected = previewReducer(INITIAL_PREVIEW, { type: 'select-plan', planId: plan.id });
    const navigated = previewReducer(selected, { type: 'navigate', screen: 'home' });
    assert.equal(navigated.selectedPlanId, plan.id);
    for (const action of actions) {
      const result = liveActionAvailability(action);
      assert.equal(result.allowed, false);
      assert.ok(result.reason.length > 0);
    }
  }
});

test('reset clears the selected concept and returns to the welcome screen', () => {
  const selected = previewReducer(INITIAL_PREVIEW, { type: 'select-plan', planId: 'reach' });
  const account = previewReducer(selected, { type: 'navigate', screen: 'account' });
  assert.deepEqual(previewReducer(account, { type: 'reset' }), INITIAL_PREVIEW);
  assert.equal(selected.selectedPlanId, 'reach', 'reset must not mutate prior state');
});

test('satellite availability says the service is unconfirmed and cannot be activated by the app', () => {
  const satellite = liveActionAvailability('connect-satellite');
  assert.match(satellite.reason, /unconfirmed/);
  assert.match(satellite.reason, /cannot connect/);
});
