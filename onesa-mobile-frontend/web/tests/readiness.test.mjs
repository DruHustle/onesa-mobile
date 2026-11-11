import test from "node:test";
import assert from "node:assert/strict";
import { describeReadiness } from "../src/readiness.mjs";

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
