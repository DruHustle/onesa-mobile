import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/workspace/WorkspaceApp.tsx', import.meta.url), 'utf8');

test('an identity outage never sends a customer to Company Portal administration', () => {
  assert.doesNotMatch(source, /https:\/\/portal\.onesa\.eu\/admin/);
  assert.match(source, /function IdentityUnavailableMessage\(\)/);
  assert.match(source, /Onesa sign-in is temporarily unavailable/);
  assert.match(source, /!session\.ssoAvailable&&<Info[^>]*>[^<]*<IdentityUnavailableMessage\/>/);
});

test('normal managed registration retains the exact Mobile product and web return', () => {
  assert.match(source, /account\.onesa\.eu\/register\?audience=/);
  assert.match(source, /&product=mobile&platform=web/);
});
