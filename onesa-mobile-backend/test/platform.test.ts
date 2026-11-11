import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/platform/store.ts";
import { Platform } from "../src/platform/service.ts";
import {
  commissioningKeys,
  DomainError,
  type Actor,
  type RecordItem,
} from "../src/platform/model.ts";
import { receiptPdf } from "../src/platform/documents.ts";
import { loadPlatformConfig } from "../src/platform/config.ts";

const actors: Record<string, Actor> = {
  admin: { subject: "admin-1", displayName: "Test admin", role: "admin" },
  ops: { subject: "ops-1", displayName: "Test ops", role: "operations" },
  customer: {
    subject: "customer-1",
    displayName: "Test customer",
    role: "customer",
  },
  other: {
    subject: "customer-2",
    displayName: "Other customer",
    role: "customer",
  },
  finance: {
    subject: "finance-1",
    displayName: "Test finance",
    role: "finance",
  },
  agent: { subject: "agent-1", displayName: "Test agent", role: "agent" },
  support: {
    subject: "support-1",
    displayName: "Test support",
    role: "support",
  },
};
const admin = actors.admin!,
  ops = actors.ops!,
  customer = actors.customer!,
  other = actors.other!,
  finance = actors.finance!,
  agent = actors.agent!,
  support = actors.support!;
const appInput = {
  displayName: "Lab household",
  area: "Pilot district",
  planId: "everyday",
  simFormat: "physical",
  deviceModel: "Test Android",
  consentToPilot: true,
};
function fixture() {
  const store = new Store(":memory:");
  return { store, p: new Platform(store, "lab") };
}
function fault(code: string) {
  return (error: unknown) =>
    error instanceof DomainError && error.code === code;
}
test("production launch interest survives retries and stale devices without creating a subscription or charge", () => {
  const store = new Store(":memory:");
  const p = new Platform(store, "production");
  try {
    const register = { interested: true, revision: 0 };
    const registrationKey = randomUUID();
    assert.equal(p.setLaunchInterest(customer, { interested: false, revision: 0 }, randomUUID()), null);
    const registered = p.setLaunchInterest(customer, register, registrationKey)!;
    assert.equal(registered.state, "registered");
    assert.equal(registered.owner, customer.subject);
    assert.equal(registered.revision, 1);
    assert.deepEqual(p.setLaunchInterest(customer, register, randomUUID()), registered);
    const withdrawn = p.setLaunchInterest(customer, { interested: false, revision: 1 }, randomUUID())!;
    assert.equal(withdrawn.id, registered.id);
    assert.equal(withdrawn.state, "withdrawn");
    assert.equal(withdrawn.revision, 2);
    assert.throws(() => p.setLaunchInterest(customer, register, randomUUID()), fault("REVISION_CONFLICT"));
    assert.throws(() => p.setLaunchInterest(customer, { interested: false, revision: 0 }, registrationKey), fault("IDEMPOTENCY_CONFLICT"));
    assert.deepEqual(p.setLaunchInterest(customer, register, registrationKey), registered);
    assert.deepEqual(store.list("launchInterests", customer.subject), [withdrawn]);
    const renewed = p.setLaunchInterest(customer, { interested: true, revision: 2 }, randomUUID())!;
    assert.equal(renewed.id, registered.id);
    assert.equal(renewed.revision, 3);
    assert.equal(renewed.state, "registered");
    assert.equal(store.count("applications"), 0);
    assert.equal(store.count("ledger"), 0);
    assert.equal(store.count("launchInterests"), 1);
    assert.equal(store.auditEntries().length, 3);
    assert.equal(store.verifyAudit(), true);
    assert.throws(() => p.apply(customer, appInput, randomUUID()), fault("COMMERCIAL_SERVICE_UNAVAILABLE"));
    assert.throws(() => p.recordPayment(finance, {}, randomUUID()), fault("COMMERCIAL_SERVICE_UNAVAILABLE"));
    assert.throws(() => p.networkOperation(), fault("PROVIDER_NOT_COMMISSIONED"));
    for (const type of ["sim_replacement", "number_porting"])
      assert.throws(() => p.request(customer, { type, detail: "Test request" }, randomUUID()), fault("COMMERCIAL_SERVICE_UNAVAILABLE"));
    assert.equal(store.count("requests"), 0);
    for (const type of ["data_correction", "account_closure"])
      assert.equal(p.request(customer, { type, detail: "Test request" }, randomUUID()).status, "received");
  } finally {
    store.close();
  }
});
function siteAsset(p: Platform) {
  const site = p.createSite(
    ops,
    { name: "Bench A", area: "Test lab", purpose: "device_bench" },
    randomUUID(),
  );
  const asset = p.createAsset(
    ops,
    {
      siteId: site.id,
      tag: "TEST-PHONE",
      assetType: "android_phone",
      manufacturer: "Test",
      model: "Test phone",
    },
    randomUUID(),
  );
  return { site, asset };
}
function commissioned(p: Platform, asset: RecordItem) {
  let current = p.updateAsset(
    ops,
    asset.id,
    { revision: asset.revision, state: "received" },
    randomUUID(),
  );
  for (const check of commissioningKeys)
    current = p.commission(
      ops,
      current.id,
      {
        revision: current.revision,
        check,
        result: "pass",
        evidenceRef: "LAB-TEST-" + check,
      },
      randomUUID(),
    );
  return current;
}

test("durable data, audit chain and online backup survive reopening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "onesa-domain-")),
    path = join(dir, "pilot.sqlite"),
    copy = join(dir, "copy.sqlite");
  let store = new Store(path);
  try {
    const p = new Platform(store, "lab"),
      site = p.createSite(
        ops,
        { name: "Persistent bench", area: "Test lab", purpose: "device_bench" },
        randomUUID(),
      );
    await store.backupTo(copy);
    store.close();
    store = new Store(path);
    assert.equal(store.get("sites", site.id).name, "Persistent bench");
    assert.equal(store.verifyAudit(), true);
    const recovered = new Store(copy);
    assert.equal(recovered.get("sites", site.id).name, "Persistent bench");
    assert.equal(recovered.verifyAudit(), true);
    recovered.close();
    store.db
      .prepare("UPDATE platform_audit SET action='tampered' WHERE sequence=1")
      .run();
    assert.equal(store.verifyAudit(), false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("retry keys do not duplicate writes and reject changed payloads", () => {
  const { store, p } = fixture();
  try {
    const key = randomUUID(),
      input = { name: "Bench", area: "Test", purpose: "device_bench" };
    const a = p.createSite(ops, input, key),
      b = p.createSite(ops, input, key);
    assert.equal(a.id, b.id);
    assert.equal(store.count("sites"), 1);
    assert.equal(store.auditEntries().length, 1);
    assert.throws(
      () => p.createSite(ops, { ...input, name: "Changed" }, key),
      fault("IDEMPOTENCY_CONFLICT"),
    );
    assert.equal(store.count("sites"), 1);
  } finally {
    store.close();
  }
});
test("RBAC denies customers and support staff hardware or financial writes", () => {
  const { store, p } = fixture();
  try {
    assert.throws(() => p.snapshot(customer), fault("FORBIDDEN"));
    assert.throws(
      () => p.createSite(support, { name: "X" }, randomUUID()),
      fault("FORBIDDEN"),
    );
    assert.throws(
      () => p.recordPayment(support, {}, randomUUID()),
      fault("FORBIDDEN"),
    );
    const snapshot = p.snapshot(finance) as {
      assets: unknown[];
      applications: unknown[];
    };
    assert.deepEqual(snapshot.assets, []);
    assert.deepEqual(snapshot.applications, []);
  } finally {
    store.close();
  }
});
test("hardware cannot be commissioned before receipt and stale versions fail", () => {
  const { store, p } = fixture();
  try {
    const { asset } = siteAsset(p);
    assert.throws(
      () =>
        p.commission(
          ops,
          asset.id,
          { revision: 1, check: "power", result: "pass", evidenceRef: "LAB" },
          randomUUID(),
        ),
      fault("ASSET_NOT_RECEIVED"),
    );
    const updated = p.updateAsset(
      ops,
      asset.id,
      { revision: 1, state: "received" },
      randomUUID(),
    );
    assert.equal(updated.state, "received");
    assert.throws(
      () =>
        p.updateAsset(
          ops,
          asset.id,
          { revision: 1, state: "faulty" },
          randomUUID(),
        ),
      fault("REVISION_CONFLICT"),
    );
    assert.throws(
      () =>
        p.commission(
          ops,
          asset.id,
          {
            revision: updated.revision,
            check: "equipment_approval",
            result: "not_applicable",
            evidenceRef: "LAB",
          },
          randomUUID(),
        ),
      fault("CHECK_REQUIRED"),
    );
  } finally {
    store.close();
  }
});
test("a failed check persists across passing checks and manual receipt changes", () => {
  const { store, p } = fixture();
  try {
    let { asset } = siteAsset(p);
    asset = p.updateAsset(
      ops,
      asset.id,
      { revision: 1, state: "received" },
      randomUUID(),
    );
    asset = p.commission(
      ops,
      asset.id,
      {
        revision: asset.revision,
        check: "power",
        result: "fail",
        evidenceRef: "LAB-FAIL",
      },
      randomUUID(),
    );
    asset = p.commission(
      ops,
      asset.id,
      {
        revision: asset.revision,
        check: "firmware",
        result: "pass",
        evidenceRef: "LAB-PASS",
      },
      randomUUID(),
    );
    assert.equal(asset.state, "faulty");
    asset = p.updateAsset(
      ops,
      asset.id,
      { revision: asset.revision, state: "received" },
      randomUUID(),
    );
    assert.equal(asset.state, "faulty");
  } finally {
    store.close();
  }
});
test("hardware configuration changes invalidate commissioning and retain evidence history", () => {
  const { store, p } = fixture();
  try {
    let { asset } = siteAsset(p);
    asset = commissioned(p, asset);
    assert.equal(asset.state, "commissioned");
    const changed = p.updateAsset(
      ops,
      asset.id,
      { revision: asset.revision, firmware: "2.0" },
      randomUUID(),
    );
    assert.equal(changed.state, "received");
    assert.equal(
      (changed.checks as Record<string, { result: string }>).firmware!.result,
      "not_run",
    );
    assert.ok((changed.commissioningHistory as unknown[]).length > 7);
    assert.equal(changed.connectivityState, "unobserved");
  } finally {
    store.close();
  }
});
test("dish hardware cannot stand in for direct-to-cell and observations are immutable", () => {
  const { store, p } = fixture();
  try {
    const { site, asset } = siteAsset(p);
    const dish = p.createAsset(
      ops,
      {
        siteId: site.id,
        tag: "TEST-DISH",
        assetType: "satellite_terminal",
        manufacturer: "Test",
        model: "Dish",
      },
      randomUUID(),
    );
    const input = {
      siteId: site.id,
      assetId: dish.id,
      path: "direct_to_cell",
      scenario: "Text outside coverage",
      operator: "Uncontracted",
      service: "sms",
    };
    assert.throws(
      () => p.createTrial(ops, input, randomUUID()),
      fault("INVALID_CONNECTIVITY_PATH"),
    );
    const phone = commissioned(p, asset),
      trial = p.createTrial(ops, { ...input, assetId: phone.id }, randomUUID());
    const result = p.recordTrial(
      ops,
      trial.id,
      {
        revision: 1,
        result: "blocked",
        observation: "No authorized host SIM",
        evidenceRef: "LAB-BLOCKED",
        observedAt: new Date().toISOString(),
        source: "lab_simulator",
      },
      randomUUID(),
    );
    assert.equal(result.networkActionExecuted, false);
    assert.throws(
      () =>
        p.recordTrial(
          ops,
          trial.id,
          {
            revision: result.revision,
            result: "pass",
            observation: "Changed",
            evidenceRef: "LAB",
            observedAt: new Date().toISOString(),
            source: "lab_simulator",
          },
          randomUUID(),
        ),
      fault("RESULT_IMMUTABLE"),
    );
  } finally {
    store.close();
  }
});
test("evidence requires a second reviewer, expires, revokes and never activates service", () => {
  const { store, p } = fixture();
  try {
    const input = {
      gate: "host_agreement",
      issuer: "Synthetic lab issuer",
      issuedAt: new Date().toISOString().slice(0, 10),
      country: "ZW",
      operator: "Test operator",
      service: "terrestrial",
      deviceScope: "Test phone only",
      evidenceRef: "LAB-REFERENCE",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      summary: "Synthetic lab evidence",
    };
    const evidence = p.submitEvidence(admin, input, randomUUID());
    assert.throws(
      () =>
        p.reviewEvidence(
          admin,
          evidence.id,
          { revision: 1, decision: "accept", reason: "Self review" },
          randomUUID(),
        ),
      fault("SEPARATE_REVIEWER_REQUIRED"),
    );
    const external = p.submitEvidence(ops, input, randomUUID());
    const accepted = p.reviewEvidence(
      admin,
      external.id,
      { revision: 1, decision: "accept", reason: "Lab review" },
      randomUUID(),
    );
    assert.equal(accepted.state, "accepted");
    assert.equal(
      (p.readiness() as { commercialServiceEnabled: boolean })
        .commercialServiceEnabled,
      false,
    );
    p.reviewEvidence(
      admin,
      external.id,
      {
        revision: accepted.revision,
        decision: "revoke",
        reason: "Evidence withdrawn",
      },
      randomUUID(),
    );
    assert.equal(store.evidenceCounts().host_agreement, undefined);
    assert.throws(
      () =>
        p.submitEvidence(
          ops,
          { ...input, expiresAt: "2020-01-01T00:00:00.000Z" },
          randomUUID(),
        ),
      fault("EVIDENCE_EXPIRED"),
    );
  } finally {
    store.close();
  }
});
test("customer application ownership, correction and host-pending lifecycle", () => {
  const { store, p } = fixture();
  try {
    let app = p.apply(customer, appInput, randomUUID());
    assert.throws(
      () => p.apply(customer, appInput, randomUUID()),
      fault("APPLICATION_EXISTS"),
    );
    assert.deepEqual(
      (p.me(other) as { applications: unknown[] }).applications,
      [],
    );
    app = p.reviewApplication(
      ops,
      app.id,
      {
        revision: 1,
        decision: "request_information",
        note: "Please correct the device model",
      },
      randomUUID(),
    );
    assert.throws(
      () =>
        p.resubmit(
          other,
          app.id,
          { ...appInput, revision: app.revision },
          randomUUID(),
        ),
      fault("NOT_FOUND"),
    );
    app = p.resubmit(
      customer,
      app.id,
      {
        ...appInput,
        revision: app.revision,
        deviceModel: "Corrected test phone",
      },
      randomUUID(),
    );
    assert.equal(app.state, "review_required");
    app = p.reviewApplication(
      ops,
      app.id,
      {
        revision: app.revision,
        decision: "ready_for_host",
        note: "Pilot review completed",
        registrationReference: "LAB-REG-001",
      },
      randomUUID(),
    );
    assert.equal(app.state, "awaiting_host");
    assert.equal(app.registrationVerified, false);
    assert.equal(app.networkState, "not_provisioned");
    assert.throws(
      () => p.networkOperation(),
      fault("PROVIDER_NOT_COMMISSIONED"),
    );
  } finally {
    store.close();
  }
});
test("support cases can be answered, reopened by their owner and resolved with a trail", () => {
  const { store, p } = fixture();
  try {
    let ticket = p.ticket(
      customer,
      {
        category: "sim",
        subject: "SIM question",
        message: "How do I join the pilot?",
      },
      randomUUID(),
    );
    ticket = p.updateTicket(
      support,
      ticket.id,
      {
        revision: 1,
        status: "resolved",
        assignee: "Support desk",
        note: "Awaiting host agreement",
      },
      randomUUID(),
    );
    assert.throws(
      () =>
        p.reply(
          other,
          ticket.id,
          { revision: ticket.revision, message: "Read another customer case" },
          randomUUID(),
        ),
      fault("NOT_FOUND"),
    );
    ticket = p.reply(
      customer,
      ticket.id,
      { revision: ticket.revision, message: "Please keep my case open" },
      randomUUID(),
    );
    assert.equal(ticket.status, "open");
    assert.equal((ticket.notes as unknown[]).length, 2);
    const request = p.request(
      customer,
      { type: "sim_replacement", detail: "Pilot request" },
      randomUUID(),
    );
    const resolved = p.resolveRequest(
      support,
      request.id,
      { revision: 1, status: "resolved", note: "Explained no SIM provisioned" },
      randomUUID(),
    );
    assert.equal(resolved.automaticAction, false);
  } finally {
    store.close();
  }
});
test("lab billing enforces amounts, unique references, ownership, idempotency and refund limits", async () => {
  const { store, p } = fixture();
  try {
    const app = p.apply(customer, appInput, randomUUID()),
      input = {
        applicationId: app.id,
        amountMinor: 1000,
        currency: "USD",
        method: "cash_test",
        reference: "CASH-LAB-0001",
        description: "Lab payment scenario",
      },
      key = randomUUID();
    let payment = p.recordPayment(agent, input, key);
    assert.equal(p.recordPayment(agent, input, key).id, payment.id);
    assert.throws(
      () => p.recordPayment(finance, input, randomUUID()),
      fault("DUPLICATE_RECORD"),
    );
    assert.throws(
      () =>
        p.recordPayment(finance, { ...input, amountMinor: 10.5 }, randomUUID()),
      fault("INVALID_INPUT"),
    );
    assert.throws(() => p.receipt(other, payment.id), fault("NOT_FOUND"));
    assert.throws(
      () =>
        p.refund(
          agent,
          payment.id,
          { revision: 1, amountMinor: 1, reason: "Unauthorized" },
          randomUUID(),
        ),
      fault("REFUND_APPROVAL_REQUIRED"),
    );
    payment = p.refund(
      finance,
      payment.id,
      { revision: 1, amountMinor: 400, reason: "Test partial refund" },
      randomUUID(),
    );
    assert.equal(payment.refundedMinor, 400);
    assert.throws(
      () =>
        p.refund(
          finance,
          payment.id,
          {
            revision: payment.revision,
            amountMinor: 601,
            reason: "Exceeds remaining",
          },
          randomUUID(),
        ),
      fault("REFUND_EXCEEDS_PAYMENT"),
    );
    assert.equal(p.receipt(customer, payment.id).refundedMinor, 400);
    const pdf = await receiptPdf(payment);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
    assert.equal(payment.moneyMoved, false);
    assert.equal(store.verifyAudit(), true);
  } finally {
    store.close();
  }
});
test("production cannot use lab applications or lab charging", () => {
  const store = new Store(":memory:");
  try {
    const p = new Platform(store, "production");
    assert.throws(
      () => p.apply(customer, appInput, randomUUID()),
      fault("COMMERCIAL_SERVICE_UNAVAILABLE"),
    );
    assert.throws(
      () => p.recordPayment(admin, {}, randomUUID()),
      fault("COMMERCIAL_SERVICE_UNAVAILABLE"),
    );
  } finally {
    store.close();
  }
});
test("runtime configuration refuses partial identity, weak keys and wildcard trusted proxies", () => {
  assert.throws(() => loadPlatformConfig({ APP_MODE: "production" }), /HTTPS/);
  assert.throws(
    () => loadPlatformConfig({ ONESA_ISSUER: "https://identity.example.test" }),
    /all three/,
  );
  assert.throws(
    () => loadPlatformConfig({ AUTH_ENCRYPTION_KEY: "weak" }),
    /64 hex/,
  );
  assert.throws(() => loadPlatformConfig({ TRUST_PROXY_IPS: "*" }), /exact IP/);
  assert.equal(loadPlatformConfig({}).mode, "lab");
});

test("production browser origins do not inherit a development localhost allowance", () => {
  const config = loadPlatformConfig({
    APP_MODE: "production",
    PUBLIC_ORIGIN: "https://mobile.example.test",
    AUTH_ENCRYPTION_KEY: "a".repeat(64),
    ONESA_ISSUER: "https://identity.example.test/api/v1/identity",
    ONESA_CLIENT_ID: "test-mobile",
    ONESA_CLIENT_SECRET: "synthetic-test-client-secret",
  });
  assert.deepEqual(config.allowedOrigins, ["https://mobile.example.test"]);
});
