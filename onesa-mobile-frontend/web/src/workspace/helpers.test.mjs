import test from 'node:test';
import assert from 'node:assert/strict';
import { usdMinor, makeRetryKeys, applicationState, stateTone, mergeRecordPage, createSessionDownloadScope } from './helpers.mjs';

test('money input uses exact minor units and rejects excess precision or ambiguous amounts', () => {
  assert.equal(usdMinor('12.34'), 1234);
  assert.equal(usdMinor('0.01'), 1);
  assert.equal(usdMinor('100000.00'), 10000000);
  for (const value of ['0', '-1', '1.005', '1e3', '1,000', '100000.01', '']) assert.throws(() => usdMinor(value));
});
test('uncertain retries retain their request key; changed input and confirmed new requests get new keys', () => {
  let count = 0;
  const keys = makeRetryKeys(() => `request-${++count}`);
  const first = keys.get('POST /ledger', { amountMinor: 1234 });
  assert.equal(keys.get('POST /ledger', { amountMinor: 1234 }).key, first.key);
  assert.notEqual(keys.get('POST /ledger', { amountMinor: 1235 }).key, first.key);
  keys.confirmed(first.fingerprint);
  assert.notEqual(keys.get('POST /ledger', { amountMinor: 1234 }).key, first.key);
  keys.clear();
  assert.notEqual(keys.get('POST /ledger', { amountMinor: 1234 }).key, first.key);
});
test('application and financial labels never turn a pilot record into active service', () => {
  assert.match(applicationState('awaiting_host')[1], /Activation still needs/);
  assert.match(applicationState('information_required')[1], /update your application/);
  for (const state of ['test_recorded', 'test_refunded', 'planned', 'lab_simulator']) assert.equal(stateTone(state), 'neutral');
});
test('overlapping cursor pages preserve row identity and the latest record revision', () => {
  const current=[{id:'a',revision:3,state:'review_required'},{id:'b',revision:1}];
  const merged=mergeRecordPage(current,[{id:'a',revision:2,state:'information_required'},{id:'b',revision:2},{id:'c',revision:1}]);
  assert.deepEqual(merged.map(row=>row.id),['a','b','c']);
  assert.equal(merged[0].state,'review_required');
  assert.equal(merged[1].revision,2);
  assert.deepEqual(current,[{id:'a',revision:3,state:'review_required'},{id:'b',revision:1}]);
});

function deferred() {
  let resolve, reject;
  const promise=new Promise((accept,fail)=>{resolve=accept;reject=fail;});
  return {promise,resolve,reject};
}
test('a late export from the signed-out session cannot download or announce success in the next session', async () => {
  const scope=createSessionDownloadScope(),response=deferred(),delivered=[];
  let signal,oldBodyReads=0;
  const old=scope.run(active=>{signal=active;return response.promise;},blob=>delivered.push(blob));
  scope.invalidate(); // Sign-out cancels immediately, before its HTTP reply.
  assert.equal(signal.aborted,true);
  scope.invalidate(); // A different login, including a new session for the same user.
  const currentBlob=new Blob(['current account'],{type:'application/json'});
  assert.equal(await scope.run(async()=>({blob:async()=>currentBlob}),blob=>delivered.push(blob)),true);
  response.resolve({blob:async()=>{oldBodyReads++;return new Blob(['old account']);}});
  assert.equal(await old,false);
  assert.equal(oldBodyReads,0);
  assert.deepEqual(delivered,[currentBlob]);
});
test('session expiry during Blob conversion suppresses the private download callback', async () => {
  const scope=createSessionDownloadScope(),body=deferred(),bodyStarted=deferred();
  let downloads=0,notices=0,signal;
  const pending=scope.run(async active=>{
    signal=active;
    return {blob:()=>{bodyStarted.resolve();return body.promise;}};
  },()=>{downloads++;notices++;});
  await bodyStarted.promise;
  scope.invalidate();
  body.resolve(new Blob(['private receipt'],{type:'application/pdf'}));
  assert.equal(await pending,false);
  assert.equal(signal.aborted,true);
  assert.equal(downloads,0);
  assert.equal(notices,0);
});
test('obsolete download errors are discarded while current-session failures still reach the caller', async () => {
  const scope=createSessionDownloadScope(),response=deferred();
  const errors=[];
  const obsolete=scope.run(()=>response.promise,()=>assert.fail('An obsolete download must not be delivered.'),error=>errors.push(error));
  scope.invalidate(); // Session changed or the workspace unmounted.
  const expired=Object.assign(new Error('Authentication required'),{status:401});
  response.reject(expired);
  assert.equal(await obsolete,false); // No stale 401 can expire the new session.
  assert.deepEqual(errors,[]);
  await assert.rejects(scope.run(async()=>{throw expired;},()=>assert.fail('A failed download must not be delivered.'),error=>errors.push(error)),error=>error===expired);
  assert.deepEqual(errors,[expired]);
});
