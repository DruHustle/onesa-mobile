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
    /activation remain unavailable/,
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
