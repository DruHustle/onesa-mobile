import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountReadTracker, canEditPilotApplication, isAccountSnapshot, isPublicAccountApi, isSessionDiscovery, launchInterestChange, sessionRemainingMs } from './account-state.ts';
import type { Account, Credential } from './api.ts';

const credential: Credential = {token: 'x'.repeat(43), user: {subject: 'synthetic-customer', displayName: 'Test', role: 'customer', source: 'lab', expiresAt: 1000}};
const account: Account = {
  profile: {subject: 'synthetic-customer', displayName: 'Test'}, applications: [], tickets: [], ledger: [], requests: [],
  network: {state: 'not_provisioned', usage: null, lastMeasuredAt: null},
  status: {mode: 'lab', productionReady: false, commercialSalesEnabled: false},
};

test('failed or malformed discovery is not represented as a configured sign-in service', () => {
  assert.equal(isSessionDiscovery(null), false);
  assert.equal(isSessionDiscovery({error: {code: 'BACKEND_NOT_CONNECTED'}}), false);
  assert.equal(isSessionDiscovery({mode: 'production', authMode: 'onesa', ssoAvailable: 'yes'}), false);
  assert.equal(isSessionDiscovery({mode: 'production', authMode: 'onesa', ssoAvailable: false}), true);
  assert.equal(isSessionDiscovery({mode: 'lab', authMode: 'lab', ssoAvailable: false}), true);
});

test('account records must have the right owner and usable lists before they are actionable', () => {
  assert.equal(isAccountSnapshot(account, credential.user.subject), true);
  assert.equal(isAccountSnapshot(account, 'another-account'), false);
  assert.equal(isAccountSnapshot({...account, tickets: null}, credential.user.subject), false);
  assert.equal(isAccountSnapshot({...account, tickets: [{id: 'bad', revision: 0}]}, credential.user.subject), false);
  assert.equal(isAccountSnapshot({...account, status: {mode: 'unknown'}}, credential.user.subject), false);
});

test('the public account API requires production discovery with central sign-in', () => {
  assert.equal(isPublicAccountApi('https://mobile.onesa.eu/api'), true);
  assert.equal(isPublicAccountApi('https://mobile.onesa.eu'), true);
  assert.equal(isPublicAccountApi('https://lab.example.test/api'), false);
  assert.equal(isPublicAccountApi('http://10.0.2.2:4000'), false);
  assert.equal(isPublicAccountApi(null), false);
  const lab = {mode: 'lab', authMode: 'lab', ssoAvailable: true};
  assert.equal(isSessionDiscovery(lab, true), false);
  assert.equal(isSessionDiscovery(lab, false), true);
  assert.equal(isSessionDiscovery({...lab, mode: 'production'}, true), false);
  assert.equal(isSessionDiscovery({...lab, mode: 'production', authMode: 'onesa'}, true), true);
});

test('an expired or malformed credential cannot remain active after a foreground check', () => {
  assert.equal(sessionRemainingMs(credential, 999000), 1000);
  assert.equal(sessionRemainingMs(credential, 1000000), 0);
  assert.equal(sessionRemainingMs(credential, 1005000), 0);
  assert.equal(sessionRemainingMs(null, 999000), 0);
  assert.equal(sessionRemainingMs({...credential, user: {...credential.user, expiresAt: Number.NaN}}), 0);
});

test('production and host-review states never offer a lab pilot application edit', () => {
  assert.equal(canEditPilotApplication(account, undefined, credential), true);
  assert.equal(canEditPilotApplication({...account, status: {...account.status, mode: 'production'}}, undefined, credential), false);
  assert.equal(canEditPilotApplication(account, undefined, {...credential, user: {...credential.user, role: 'admin'}}), false);
  assert.equal(canEditPilotApplication(account, {id: 'a', revision: 1, createdAt: '', state: 'awaiting_host'}, credential), false);
  assert.equal(canEditPilotApplication(account, {id: 'a', revision: 2, createdAt: '', state: 'information_required'}, credential), true);
  assert.equal(canEditPilotApplication(null, undefined, credential), false);
});

test('launch interest uses the displayed revision for registering, withdrawing and rejoining', () => {
  const enabled: Account = {...account, status: {...account.status, mode: 'production', capabilities: {launchInterest: true}}, launchInterest: null};
  const record = {state: 'registered' as const, revision: 1, updatedAt: '2026-11-11T12:00:00Z'};
  assert.deepEqual(launchInterestChange(enabled, credential), {interested: true, revision: 0});
  assert.deepEqual(launchInterestChange({...enabled, launchInterest: record}, credential), {interested: false, revision: 1});
  assert.deepEqual(launchInterestChange({...enabled, launchInterest: {...record, state: 'withdrawn', revision: 2}}, credential), {interested: true, revision: 2});
  assert.equal(launchInterestChange(account, credential), null);
  assert.equal(launchInterestChange({...enabled, launchInterest: undefined}, credential), null);
  assert.equal(launchInterestChange({...enabled, launchInterest: {...record, revision: 0}}, credential), null);
  assert.equal(launchInterestChange({...enabled, launchInterest: {...record, updatedAt: 'unknown'}}, credential), null);
  assert.equal(launchInterestChange(enabled, {...credential, user: {...credential.user, role: 'admin'}}), null);
  assert.equal(launchInterestChange(enabled, {...credential, user: {...credential.user, subject: 'another-user'}}), null);
});

test('a slow old refresh cannot override a newer success or rescue a failed refresh', () => {
  const reads = new AccountReadTracker(), old = reads.begin(), newer = reads.begin();
  newer.accept();
  assert.equal(reads.isFresh, true);
  old.fail();
  assert.equal(reads.isFresh, true);
  assert.equal(old.isCurrent(), false);
  const failed = reads.begin();
  failed.fail();
  old.accept();
  assert.equal(reads.isFresh, false);
  assert.equal(newer.isCurrent(), false);
  const retry = reads.begin();
  retry.accept();
  assert.equal(reads.isFresh, true);
  reads.invalidate();
  retry.accept();
  assert.equal(reads.isFresh, false);
});
