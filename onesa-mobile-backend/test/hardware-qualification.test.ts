import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/platform/store.ts";
import { Platform } from "../src/platform/service.ts";
import { commissioningKeys, DomainError, type Actor, type RecordItem } from "../src/platform/model.ts";
import { loadPlatformConfig } from "../src/platform/config.ts";

const ops: Actor = { subject: "synthetic-ops", displayName: "Synthetic operations", role: "operations" };
const reviewer: Actor = { subject: "synthetic-reviewer", displayName: "Synthetic reviewer", role: "admin" };
const fault = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
const scope = "LAB-DEVICE-PROFILE-A";
function fixture() {
  const store = new Store(":memory:"), p = new Platform(store, "lab");
  const site = p.createSite(ops, { name: "Synthetic bench", area: "Test only", purpose: "device_bench" }, randomUUID());
  const asset = p.createAsset(ops, { siteId: site.id, tag: "LAB-PHONE", assetType: "android_phone", manufacturer: "Fixture", model: "Synthetic handset", firmware: "fixture-1" }, randomUUID());
  return { store, p, site, asset };
}
function commission(p: Platform, asset: RecordItem): RecordItem {
  let item = asset.state === "planned" ? p.updateAsset(ops, asset.id, { revision: asset.revision, state: "received" }, randomUUID()) : asset;
  for (const check of commissioningKeys) item = p.commission(ops, item.id, { revision: item.revision, check, result: "pass", evidenceRef: "SYNTHETIC-CHECK" }, randomUUID());
  return item;
}
function plan(p: Platform, site: RecordItem, asset: RecordItem, path = "direct_to_cell") {
  return p.createTrial(ops, { siteId: site.id, assetId: asset.id, path, service: "sms", scenario: "Synthetic test of record validation", operator: "Fixture operator", deviceScope: scope, acceptanceCriteria: "Synthetic criterion agreed before this software test. No network was used." }, randomUUID());
}
function evidence(p: Platform, gate: string, path = "direct_to_cell", extra: Record<string, unknown> = {}) {
  const entry = p.submitEvidence(ops, {
    gate, country: "ZW", operator: "Fixture operator", service: path, deviceScope: scope,
    evidenceRef: "SYNTHETIC-" + gate, issuer: "Fixture only", issuedAt: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 86400000).toISOString(), summary: "Synthetic authority reference for validation tests; no actual approval.", ...extra,
  }, randomUUID());
  return p.reviewEvidence(reviewer, entry.id, { revision: entry.revision, decision: "accept", reason: "Synthetic independent review" }, randomUUID());
}
function allEvidence(p: Platform, path = "direct_to_cell") {
  return ["host_agreement", "equipment_approval", ...(path === "direct_to_cell" ? ["satellite_authorization", "satellite_entitlement"] : [])].map(gate => evidence(p, gate, path));
}
function observation(trial: RecordItem, entries: RecordItem[] = [], extra: Record<string, unknown> = {}) {
  return { revision: trial.revision, result: "pass", source: "manual_field_record", observation: "Synthetic passing record; no radio used.", evidenceRef: "SYNTHETIC-OBSERVATION", observedAt: new Date().toISOString(), authorizationRef: "SYNTHETIC-APPROVED-TEST-PLAN", evidenceIds: entries.map(item => item.id), ...extra };
}

test("unknown power is not zero and rating correction invalidates only the power check", () => {
  const { store, p, asset } = fixture();
  try {
    assert.equal(asset.powerWatts, null);
    assert.equal(asset.powerRatingRecorded, false);
    let current = commission(p, asset);
    current = p.updateAsset(ops, current.id, { revision: current.revision, powerWatts: 12.5 }, randomUUID());
    assert.equal(current.powerWatts, 12.5);
    assert.equal(current.powerRatingRecorded, true);
    assert.equal(current.state, "received");
    assert.equal((current.checks as Record<string, {result: string}>).power!.result, "not_run");
    assert.equal((current.checks as Record<string, {result: string}>).firmware!.result, "pass");
    current = p.updateAsset(ops, current.id, { revision: current.revision, powerWatts: null }, randomUUID());
    assert.equal(current.powerWatts, null);
    assert.equal(current.powerRatingRecorded, false);
    assert.equal(store.verifyAudit(), true);
  } finally { store.close(); }
});

test("N/A requires a reason and cannot bypass checks on active network devices", () => {
  const { store, p, site, asset } = fixture();
  try {
    for (const type of ["android_phone", "access_point", "router", "tablet", "workstation"]) {
      let current = type === "android_phone" ? asset : p.createAsset(ops, { siteId: site.id, tag: "LAB-" + type.toUpperCase(), assetType: type, manufacturer: "Fixture", model: "Fixture" }, randomUUID());
      current = p.updateAsset(ops, current.id, { revision: current.revision, state: "received" }, randomUUID());
      for (const check of ["firmware", "connectivity", "recovery"]) assert.throws(() => p.commission(ops, current.id, { revision: current.revision, check, result: "not_applicable", evidenceRef: "SYNTHETIC", note: "Unjustified skip" }, randomUUID()), fault("CHECK_REQUIRED"));
    }
    let passive = p.createAsset(ops, { siteId: site.id, tag: "LAB-CABLE", assetType: "other", manufacturer: "Fixture", model: "Passive cable" }, randomUUID());
    passive = p.updateAsset(ops, passive.id, { revision: passive.revision, state: "received" }, randomUUID());
    assert.throws(() => p.commission(ops, passive.id, { revision: passive.revision, check: "firmware", result: "not_applicable", evidenceRef: "SYNTHETIC" }, randomUUID()), fault("CHECK_REASON_REQUIRED"));
    const checked = p.commission(ops, passive.id, { revision: passive.revision, check: "firmware", result: "not_applicable", evidenceRef: "SYNTHETIC", note: "Passive cable has no software; inspected on bench." }, randomUUID());
    assert.equal((checked.checks as Record<string, {result: string}>).firmware!.result, "not_applicable");
  } finally { store.close(); }
});

test("a declared physical fault survives an unrelated check and manual receipt until full requalification", () => {
  const { store, p, asset } = fixture();
  try {
    let current = commission(p, asset);
    current = p.updateAsset(ops, current.id, {revision: current.revision, state: "faulty"}, randomUUID());
    assert.equal(current.faultReported, true);
    assert.equal(current.state, "faulty");
    assert.ok(Object.values(current.checks as Record<string, {result: string}>).every(check => check.result === "not_run"));
    current = p.commission(ops, current.id, {revision: current.revision, check: "asset_label", result: "pass", evidenceRef: "SYNTHETIC-LABEL"}, randomUUID());
    assert.equal(current.state, "faulty");
    current = p.updateAsset(ops, current.id, {revision: current.revision, state: "received"}, randomUUID());
    assert.equal(current.state, "faulty");
    for (const check of commissioningKeys.filter(key => key !== "asset_label")) current = p.commission(ops, current.id, {revision: current.revision, check, result: "pass", evidenceRef: "SYNTHETIC-REQUALIFICATION"}, randomUUID());
    assert.equal(current.state, "commissioned");
    assert.equal(current.faultReported, false);
    assert.equal(store.verifyAudit(), true);
  } finally { store.close(); }
});

test("legacy declared faults with no failed check are requalified rather than silently cleared", () => {
  const { store, p, asset } = fixture();
  try {
    const current = commission(p, asset);
    // Emulate the on-disk record produced by the previous application version.
    store.db.prepare("UPDATE platform_records SET payload=json_remove(json_set(payload,'$.state','faulty'),'$.faultReported') WHERE id=?").run(current.id);
    const checked = p.commission(ops, current.id, {revision: current.revision, check: "asset_label", result: "pass", evidenceRef: "SYNTHETIC-LABEL"}, randomUUID());
    assert.equal(checked.state, "faulty");
    assert.equal(checked.faultReported, true);
    assert.equal((checked.checks as Record<string, {result: string}>).recovery!.result, "not_run");
  } finally { store.close(); }
});

test("a SIM by itself cannot be a direct-to-cell handset", () => {
  const { store, p, site } = fixture();
  try {
    const sim = p.createAsset(ops, { siteId: site.id, tag: "LAB-SIM", assetType: "test_sim", manufacturer: "Fixture", model: "Synthetic SIM" }, randomUUID());
    assert.throws(() => plan(p, site, sim), fault("INVALID_CONNECTIVITY_PATH"));
  } finally { store.close(); }
});

test("a manual satellite pass needs all four accepted scope-specific evidence records", () => {
  const { store, p, site, asset } = fixture();
  try {
    const current = commission(p, asset), trial = plan(p, site, current);
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial), randomUUID()), fault("TRIAL_AUTHORIZATION_REQUIRED"));
    const entries = allEvidence(p);
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries.slice(0, 3)), randomUUID()), fault("TRIAL_AUTHORIZATION_REQUIRED"));
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries, { authorizationRef: undefined }), randomUUID()), fault("TRIAL_AUTHORIZATION_REQUIRED"));
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries, { evidenceIds: [entries[0]!.id, entries[0]!.id] }), randomUUID()), fault("INVALID_INPUT"));
    assert.equal(store.get("trials", trial.id).state, "planned");
  } finally { store.close(); }
});

test("evidence for a different operator, access path or device scope cannot qualify a trial", () => {
  const { store, p, site, asset } = fixture();
  try {
    const trial = plan(p, site, commission(p, asset)), entries = allEvidence(p);
    for (const extra of [{operator: "Other operator"}, {service: "terrestrial"}, {deviceScope: "OTHER-DEVICE"}]) {
      const wrong = evidence(p, "host_agreement", "direct_to_cell", extra);
      assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, [wrong, ...entries.slice(1)]), randomUUID()), fault("TRIAL_EVIDENCE_SCOPE"));
    }
  } finally { store.close(); }
});

test("revoked and now-expired evidence cannot qualify a new manual result", t => {
  const { store, p, site, asset } = fixture();
  try {
    const trial = plan(p, site, commission(p, asset)), entries = allEvidence(p);
    p.reviewEvidence(reviewer, entries[0]!.id, {revision: entries[0]!.revision, decision: "revoke", reason: "Synthetic withdrawal"}, randomUUID());
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries), randomUUID()), fault("TRIAL_EVIDENCE_NOT_ACCEPTED"));
    entries[0] = evidence(p, "host_agreement");
    const input = observation(trial, entries), future = Date.now() + 2 * 86400000;
    t.mock.method(Date, "now", () => future);
    assert.throws(() => p.recordTrial(ops, trial.id, input, randomUUID()), fault("TRIAL_EVIDENCE_EXPIRED"));
  } finally { store.close(); }
});

test("manual results capture equipment and evidence revisions and retries preserve the original record", () => {
  const { store, p, site, asset } = fixture();
  try {
    const current = commission(p, asset), trial = plan(p, site, current), entries = allEvidence(p);
    const input = observation(trial, entries), key = randomUUID(), result = p.recordTrial(ops, trial.id, input, key);
    assert.equal(result.authorizationAssessment, "internal_evidence_review");
    assert.equal((result.authorizationEvidence as unknown[]).length, 4);
    assert.equal((result.assetSnapshot as Record<string, unknown>).revision, current.revision);
    p.reviewEvidence(reviewer, entries[0]!.id, { revision: entries[0]!.revision, decision: "revoke", reason: "Later withdrawal" }, randomUUID());
    p.updateAsset(ops, current.id, { revision: current.revision, firmware: "fixture-2" }, randomUUID());
    assert.deepEqual(p.recordTrial(ops, trial.id, input, key), result);
    assert.equal((store.get("trials", trial.id).assetSnapshot as Record<string, unknown>).firmware, "fixture-1");
    assert.equal(result.networkActionExecuted, false);
    assert.equal((p.status() as {commercialSalesEnabled: boolean}).commercialSalesEnabled, false);
    assert.equal(store.verifyAudit(), true);
  } finally { store.close(); }
});

test("terrestrial and dish paths use their own accepted host-use and equipment scope", () => {
  for (const path of ["terrestrial", "dish_wifi"]) {
    const { store, p, site, asset } = fixture();
    try {
      const trial = plan(p, site, commission(p, asset), path), entries = allEvidence(p, path);
      assert.equal(p.recordTrial(ops, trial.id, observation(trial, entries), randomUUID()).state, "completed");
    } finally { store.close(); }
  }
});

test("simulated passes and blocked field notes remain distinct from reviewed authorization", () => {
  const { store, p, site, asset } = fixture();
  try {
    const current = commission(p, asset), simulated = plan(p, site, current), blocked = plan(p, site, current);
    const result = p.recordTrial(ops, simulated.id, observation(simulated, [], {source: "lab_simulator", authorizationRef: undefined, evidenceIds: undefined}), randomUUID());
    assert.equal(result.authorizationAssessment, "simulation_only");
    assert.deepEqual(result.authorizationEvidence, []);
    const note = p.recordTrial(ops, blocked.id, observation(blocked, [], {result: "blocked", authorizationRef: undefined, evidenceIds: undefined}), randomUUID());
    assert.equal(note.authorizationAssessment, "not_assessed");
  } finally { store.close(); }
});

test("manual pass criteria and hardware configuration must precede and match the observation", () => {
  const { store, p, site, asset } = fixture();
  try {
    let current = commission(p, asset);
    const trial = plan(p, site, current), entries = allEvidence(p);
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries, {observedAt: new Date(Date.parse(trial.createdAt) - 1000).toISOString()}), randomUUID()), fault("TRIAL_PLAN_AFTER_OBSERVATION"));
    current = p.updateAsset(ops, current.id, {revision: current.revision, firmware: "fixture-2"}, randomUUID());
    commission(p, current);
    assert.throws(() => p.recordTrial(ops, trial.id, observation(trial, entries), randomUUID()), fault("TRIAL_CONFIGURATION_CHANGED"));
    const legacy = p.createTrial(ops, {siteId: site.id, assetId: asset.id, path: "terrestrial", service: "sms", scenario: "Legacy plan", operator: "Fixture operator"}, randomUUID());
    assert.throws(() => p.recordTrial(ops, legacy.id, observation(legacy, []), randomUUID()), fault("TRIAL_AUTHORIZATION_REQUIRED"));
  } finally { store.close(); }
});

test("production-process configuration cannot select lab authentication by omission", () => {
  assert.throws(() => loadPlatformConfig({NODE_ENV: "production"}), /Set APP_MODE explicitly/);
  assert.equal(loadPlatformConfig({NODE_ENV: "production", APP_MODE: "lab"}).mode, "lab");
  assert.equal(loadPlatformConfig({}).mode, "lab");
});
