import test from "node:test";
import assert from "node:assert/strict";
import { accountModeMatchesHost, describeReadiness, publicLaunchInterestOpen } from "../src/readiness.mjs";

test("the customer domain refuses lab sign-in and lab principals", () => {
  const live = { mode: "production", authMode: "onesa", authenticated: false, user: null };
  const lab = { mode: "lab", authMode: "lab", authenticated: false, user: null };
  assert.equal(accountModeMatchesHost("mobile.onesa.eu", live), true);
  assert.equal(accountModeMatchesHost("mobile.onesa.eu", lab), false);
  assert.equal(accountModeMatchesHost("mobile.onesa.eu", { ...live, authenticated: true, user: { source: "lab" } }), false);
  assert.equal(accountModeMatchesHost("localhost", lab), true);
  assert.equal(accountModeMatchesHost("pilot-mobile.vercel.app", lab), false);
  assert.equal(accountModeMatchesHost("pilot-mobile.vercel.app", live), true);
});

test("API success cannot turn a preview into an advertised live service", () => {
  assert.match(
    describeReadiness({
      mode: "demo",
      serviceStatus: "prelaunch",
      productionReady: false,
    }),
    /Customer activation and mobile network service are pending/,
  );
  for (const value of [
    null,
    {},
    { productionReady: true },
    { mode: "demo", serviceStatus: "prelaunch", productionReady: true },
    { mode: "live", serviceStatus: "prelaunch", productionReady: false },
  ]) {
    assert.throws(() => describeReadiness(value));
  }
});

test("the public holding response and a service outage have distinct status messages", () => {
  const holding = { error: { code: "BACKEND_NOT_CONNECTED" } };
  assert.match(describeReadiness(holding, 503), /accounts haven’t opened yet/);
  assert.throws(() => describeReadiness(holding, 200));
  assert.throws(() => describeReadiness({ error: { code: "UPSTREAM_TIMEOUT" } }, 503));
  assert.throws(() => describeReadiness({
    mode: "demo", serviceStatus: "prelaunch", productionReady: false,
  }, 500));
});

test("only a prelaunch production workspace can advertise launch registration", () => {
  const status = {
    mode: "production", serviceStatus: "prelaunch", productionReady: false,
    networkConnected: false, commercialSalesEnabled: false,
    capabilities: { launchInterest: true },
  };
  assert.equal(publicLaunchInterestOpen(status), true);
  assert.match(describeReadiness(status), /register interest/);
  for (const input of [null, {...status, mode: "lab"}, {...status, mode: "demo"},
    {...status, capabilities: {}}, {...status, productionReady: true},
    {...status, commercialSalesEnabled: true}, {...status, networkConnected: true}]) {
    assert.equal(publicLaunchInterestOpen(input), false);
  }
  assert.equal(publicLaunchInterestOpen(status, 503), false);
  assert.match(describeReadiness({...status, mode: "lab"}), /testing/);
});
