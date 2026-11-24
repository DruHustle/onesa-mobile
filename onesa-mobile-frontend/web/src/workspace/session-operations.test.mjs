import test from 'node:test';
import assert from 'node:assert/strict';
import { browserLogoutDestination, createSessionOperationScope, StaleWorkspaceOperationError } from './session-operations.mjs';

test('browser logout only follows the pinned managed endpoint with an exact Mobile return', () => {
  const origin = 'https://mobile.onesa.eu';
  const destination = new URL('https://auth.onesa.eu/oidc/logout');
  destination.searchParams.set('client_id', 'synthetic_mobile_client');
  destination.searchParams.set('post_logout_redirect_uri', origin + '/');
  assert.equal(browserLogoutDestination(destination.href, origin), destination.href);
  for (const value of [
    undefined,
    destination.href.replace('https:', 'http:'),
    destination.href.replace('auth.onesa.eu', 'lookalike.example.test'),
    destination.href.replace('/oidc/logout', '/v2/logout'),
    destination.href.replace('mobile.onesa.eu', 'other.example.test'),
    destination.href + '&id_token_hint=unwanted',
    destination.href + '#login',
  ]) assert.equal(browserLogoutDestination(value, origin), null);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('a completed mutation from an expired session cannot publish success or refresh another account', async () => {
  const scope = createSessionOperationScope(), operation = scope.begin(), response = deferred();
  let published = false;
  const action = (async () => {
    await operation.wait(() => response.promise);
    operation.assertCurrent();
    published = true;
  })();
  scope.invalidate();
  response.resolve({ id: 'old-record' }); // Models a transport that ignores AbortSignal.
  await assert.rejects(action, StaleWorkspaceOperationError);
  assert.equal(operation.signal.aborted, true);
  assert.equal(published, false);
  operation.finish();
});

test('an old mutation failure cannot trigger a sign-out of the next session', async () => {
  const scope = createSessionOperationScope(), old = scope.begin(), response = deferred();
  const result = old.wait(() => response.promise);
  scope.invalidate();
  const next = scope.begin();
  response.reject(Object.assign(new Error('Expired old token'), { status: 401 }));
  await assert.rejects(result, StaleWorkspaceOperationError);
  assert.equal(next.isCurrent(), true);
  assert.deepEqual(await next.wait(async () => ({ id: 'current-record' })), { id: 'current-record' });
  old.finish(); next.finish();
});

test('the guard remains necessary after an awaited refresh and before form completion', async () => {
  const scope = createSessionOperationScope(), operation = scope.begin();
  await operation.wait(async () => ({ id: 'saved-record' }));
  scope.invalidate();
  assert.throws(() => operation.assertCurrent(), StaleWorkspaceOperationError);
  operation.finish();
});
