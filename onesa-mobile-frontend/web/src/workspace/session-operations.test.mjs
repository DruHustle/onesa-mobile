import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionOperationScope, StaleWorkspaceOperationError } from './session-operations.mjs';

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
