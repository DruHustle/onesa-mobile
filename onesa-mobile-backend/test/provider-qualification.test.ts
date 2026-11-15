import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Platform } from "../src/platform/service.ts";
import { Store } from "../src/platform/store.ts";
import type { Actor, RecordItem } from "../src/platform/model.ts";
import { applyQualificationStep, type Qualification } from "../src/contracts/qualification.ts";

const customer: Actor = { subject: "fixture-subscriber", role: "customer", displayName: "Fixture customer" };
const ops: Actor = { subject: "fixture-operator", role: "operations", displayName: "Fixture operator" };
const application = { displayName: "Sample Applicant", area: "Pilot area", planId: "reach", simFormat: "physical", deviceModel: "OM Test Handset 1", consentToPilot: true };
const review = { decision: "ready_for_host", registrationReference: "fixture-reviewed", note: "Ready for the synthetic host pilot" };
const qualification = (item: RecordItem) => item.qualification as Qualification;

test("review, timeout, restart, recovery and delayed fixtures preserve one application and zero billing", () => {
  const dir = mkdtempSync(join(tmpdir(), "mobile-qualification-"));
  const path = join(dir, "app.sqlite");
  let store = new Store(path);
  try {
    let platform = new Platform(store, "lab");
    let item = platform.apply(customer, application, randomUUID());
    const submit = (revision: number) => ({ revision, step: "submit" });
    assert.throws(() => platform.qualifyProvider(ops, item.id, submit(item.revision), randomUUID()), /Complete the pilot registration/);
    item = platform.reviewApplication(ops, item.id, { ...review, revision: item.revision }, randomUUID());
    assert.throws(() => platform.qualifyProvider(customer, item.id, submit(item.revision), randomUUID()));
    assert.throws(() => new Platform(store, "production").qualifyProvider(ops, item.id, submit(item.revision), randomUUID()));
    const key = randomUUID(), payload = submit(item.revision);
    const submitted = platform.qualifyProvider(ops, item.id, payload, key);
    assert.deepEqual(platform.qualifyProvider(ops, item.id, payload, key), submitted);
    assert.deepEqual(platform.qualifyProvider(ops, item.id, payload, randomUUID()), submitted);
    item = platform.qualifyProvider(ops, item.id, { revision: submitted.revision, step: "timeout", sequence: 42 }, randomUUID());
    assert.equal(qualification(item).state, "uncertain");
    const retried = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "timeout", sequence: 42 }, randomUUID());
    assert.deepEqual(retried, item);
    store.close(); store = new Store(path); platform = new Platform(store, "lab");
    assert.equal(qualification(store.get("applications", item.id)).state, "uncertain");
    assert.throws(() => platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "approve" }, randomUUID()), /status revision/);
    const approved = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "reconcile", sequence: 2 }, randomUUID());
    assert.deepEqual(qualification(approved), { ...qualification(submitted), state: "approved", sequence: 2 });
    for (const sequence of [1, 2, 3]) {
      const replay = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "reject", sequence }, randomUUID());
      assert.deepEqual(replay, approved);
    }
    assert.equal(store.count("applications"), 1);
    assert.equal(store.count("ledger"), 0);
    assert.equal(approved.networkState, "not_provisioned");
    assert.equal(store.verifyAudit(), true);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("unsupported device, rejection and cancellation remain terminal through later approvals", () => {
  for (const scenario of ["device", "reject", "cancel"] as const) {
    const store = new Store(":memory:");
    try {
      const platform = new Platform(store, "lab");
      let item = platform.apply(customer, { ...application, deviceModel: scenario === "device" ? "Unknown model" : application.deviceModel }, randomUUID());
      item = platform.reviewApplication(ops, item.id, { ...review, revision: item.revision }, randomUUID());
      item = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "submit" }, randomUUID());
      if (scenario === "device") assert.equal(qualification(item).eligibility, "fixture_device_unsupported");
      else item = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: scenario, ...(scenario === "reject" ? {sequence: 1} : {}) }, randomUUID());
      assert.equal(qualification(item).state, scenario === "cancel" ? "cancelled" : "rejected");
      const late = platform.qualifyProvider(ops, item.id, { revision: item.revision, step: "approve", sequence: 5 }, randomUUID());
      assert.deepEqual(late, item);
      assert.equal(store.count("ledger"), 0);
    } finally { store.close(); }
  }
});

test("an older uncertain fixture can recover from a timeout that carried a local sequence", () => {
  const previous: Qualification = { reference: "fixture-old", state: "uncertain", sequence: 42, eligibility: "fixture_compatible" };
  const approved = applyQualificationStep("old", "OM Test Handset 1", "physical", previous, "approve", 1);
  assert.equal(approved.state, "approved");
  assert.equal(approved.sequence, 1);
});
