import {
  commissioningKeys,
  DomainError,
  gateKeys,
  gateLabels,
  parse,
  permissions,
  requirePermission,
  schemas,
  type Actor,
  type Kind,
  type Permission,
  type RecordItem,
} from "./model.ts";
import { Store } from "./store.ts";

export class Platform {
  store: Store;
  mode: "lab" | "production";
  constructor(store: Store, mode: "lab" | "production") {
    this.store = store;
    this.mode = mode;
  }
  private write<T>(
    actor: Actor,
    key: string,
    operation: string,
    input: unknown,
    action: () => T,
  ): T {
    return this.store.idempotent(actor, key, operation, input, action);
  }
  private labOnly(): void {
    if (this.mode !== "lab")
      throw new DomainError(
        503,
        "COMMERCIAL_SERVICE_UNAVAILABLE",
        "Commercial telecom service, registration and charging require commissioned provider integrations.",
      );
  }
  status(): unknown {
    return {
      mode: this.mode,
      serviceStatus: "prelaunch",
      productionReady: false,
      networkConnected: false,
      commercialSalesEnabled: false,
      capabilities: {
        hardwareInventory: true,
        commissioning: true,
        fieldTrialRecords: true,
        subscriberPilot: this.mode === "lab",
        support: true,
        labBilling: this.mode === "lab",
        carrierProvisioning: false,
        satelliteEntitlement: false,
        livePayments: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }
  readiness(): unknown {
    const counts = this.store.evidenceCounts();
    return {
      commercialServiceEnabled: false,
      automaticNetworkActivation: false,
      providerIntegrations: "not_commissioned",
      gates: gateKeys.map((key) => ({
        key,
        label: gateLabels[key],
        currentEvidence: counts[key] ?? 0,
      })),
      evidenceScope:
        "Counts across recorded scopes only; each country/operator/service/device combination requires its own assessment.",
      notice:
        "Evidence acceptance is an internal review record. It does not issue a licence, establish provider entitlement or activate service.",
    };
  }
  me(actor: Actor): unknown {
    const pages = Object.fromEntries(
      ["applications", "tickets", "ledger", "requests"].map((kind) => [
        kind,
        this.page(actor, true, kind),
      ]),
    );
    return {
      profile: { subject: actor.subject, displayName: actor.displayName },
      ...Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.items]),
      ),
      pageLimit: 50,
      counts: Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.total]),
      ),
      cursors: Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.nextCursor]),
      ),
      network: {
        state: "not_provisioned",
        source: "no_host_integration",
        usage: null,
        lastMeasuredAt: null,
      },
      status: this.status(),
    };
  }
  snapshot(actor: Actor): unknown {
    if (actor.role === "customer")
      throw new DomainError(403, "FORBIDDEN", "Staff access is required.");
    const granted = permissions(actor),
      has = (p: string) => granted.includes(p as (typeof granted)[number]);
    const pages = Object.fromEntries(
      [
        "sites",
        "assets",
        "trials",
        "gates",
        "applications",
        "tickets",
        "requests",
        "ledger",
        "billingAccounts",
        "audit",
      ].map((kind) => [
        kind,
        this.canRead(actor, kind)
          ? this.page(actor, false, kind)
          : { items: [], total: 0, nextCursor: null },
      ]),
    );
    return {
      permissions: granted,
      status: this.status(),
      readiness: has("readiness.read") ? this.readiness() : null,
      ...Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.items]),
      ),
      auditIntegrity: has("audit.read") ? this.store.verifyAudit() : null,
      pageLimit: 50,
      counts: Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.total]),
      ),
      cursors: Object.fromEntries(
        Object.entries(pages).map(([kind, page]) => [kind, page.nextCursor]),
      ),
    };
  }
  private canRead(actor: Actor, kind: string): boolean {
    const required: Record<string, Permission> = {
      sites: "hardware.read",
      assets: "hardware.read",
      trials: "hardware.read",
      gates: "readiness.read",
      applications: "subscribers.read",
      tickets: "support.read",
      requests: "support.read",
      ledger: "billing.read",
      billingAccounts: "billing.read",
      audit: "audit.read",
    };
    return (
      permissions(actor).includes(required[kind]!) ||
      (kind === "ledger" && actor.role === "agent")
    );
  }
  page(
    actor: Actor,
    own: boolean,
    kind: string,
    limit = 50,
    cursor?: string,
  ): { items: unknown[]; total: number; nextCursor: string | null } {
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (cursor && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor))
    )
      throw new DomainError(
        400,
        "INVALID_PAGE",
        "Use a page size of 1–50 and a valid cursor.",
      );
    if (
      own
        ? !["applications", "tickets", "ledger", "requests"].includes(kind)
        : !this.canRead(actor, kind)
    )
      throw new DomainError(
        403,
        "FORBIDDEN",
        "Your account cannot read this collection.",
      );
    if (kind === "audit") return this.store.auditPage(limit, cursor);
    const page = this.store.page(
      kind === "billingAccounts" ? "applications" : (kind as Kind),
      {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(own
          ? { owner: actor.subject }
          : kind === "ledger" && actor.role === "agent"
            ? { soldBy: actor.subject }
            : {}),
      },
    );
    if (kind === "billingAccounts")
      return {
        ...page,
        items: page.items.map((item) => ({
          id: item.id,
          displayName: item.displayName,
        })),
      };
    return page;
  }
  record(
    actor: Actor,
    own: boolean,
    kind: string,
    id: string,
  ): Record<string, unknown> {
    if (
      own
        ? !["applications", "tickets", "ledger", "requests"].includes(kind)
        : !this.canRead(actor, kind) || kind === "audit"
    )
      throw new DomainError(
        403,
        "FORBIDDEN",
        "Your account cannot read this record.",
      );
    const item = this.store.get(
      kind === "billingAccounts" ? "applications" : (kind as Kind),
      id,
    );
    if (
      (own && item.owner !== actor.subject) ||
      (!own &&
        kind === "ledger" &&
        actor.role === "agent" &&
        item.soldBy !== actor.subject)
    )
      throw new DomainError(404, "NOT_FOUND", "The record is not available.");
    return kind === "billingAccounts"
      ? { id: item.id, displayName: item.displayName }
      : item;
  }
  createSite(actor: Actor, input: unknown, key: string): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.site, input);
    return this.write(actor, key, "site.create", data, () => {
      const item = this.store.insert("sites", actor.subject, {
        ...data,
        state: "planning",
        country: "ZW",
      });
      this.store.audit(actor, "site.created", item.id);
      return item;
    });
  }
  createAsset(actor: Actor, input: unknown, key: string): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.asset, input);
    return this.write(actor, key, "asset.create", data, () => {
      this.store.get("sites", data.siteId);
      const checks = Object.fromEntries(
        commissioningKeys.map((k) => [k, { result: "not_run" }]),
      );
      const item = this.store.insert("assets", actor.subject, {
        ...data,
        state: "planned",
        powerRatingRecorded: data.powerWatts !== null,
        faultReported: false,
        checks,
        telemetry: null,
        connectivityState: "unobserved",
      });
      this.store.audit(actor, "asset.created", item.id);
      return item;
    });
  }
  updateAsset(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.assetUpdate, input);
    return this.write(actor, key, "asset.update:" + id, data, () => {
      const item = this.store.get("assets", id);
      if (item.state === "retired")
        throw new DomainError(
          409,
          "ASSET_RETIRED",
          "Retired assets are read-only. Create a replacement asset.",
        );
      const { revision, ...patch } = data,
        checks = { ...(item.checks as Record<string, { result: string }>) };
      const changed: string[] = [];
      const legacyDeclaredFault = item.faultReported === undefined && item.state === "faulty" && !Object.values(checks).some(check => check.result === "fail");
      const newDeclaredFault = data.state === "faulty" || legacyDeclaredFault;
      const faultReported = newDeclaredFault || item.faultReported === true;
      if (newDeclaredFault) changed.push(...commissioningKeys);
      if (
        data.serialReference !== undefined &&
        data.serialReference !== item.serialReference
      )
        changed.push(
          "asset_label",
          "equipment_approval",
          "connectivity",
          "recovery",
        );
      if (data.firmware !== undefined && data.firmware !== item.firmware)
        changed.push("firmware", "connectivity", "recovery");
      if (data.powerWatts !== undefined && (data.powerWatts !== item.powerWatts || item.powerRatingRecorded !== (data.powerWatts !== null)))
        changed.push("power");
      if (
        data.typeApprovalRef !== undefined &&
        data.typeApprovalRef !== item.typeApprovalRef
      )
        changed.push("equipment_approval", "connectivity");
      const history = [...((item.commissioningHistory ?? []) as unknown[])];
      if (changed.length) {
        history.push({
          action: "configuration_changed",
          invalidatedChecks: [...new Set(changed)],
          previousRevision: item.revision,
          previousFirmware: item.firmware,
          previousTypeApprovalRef: item.typeApprovalRef ?? null,
          previousSerialReference: item.serialReference ?? null,
          previousPowerWatts: item.powerWatts ?? null,
          declaredFault: newDeclaredFault,
          by: actor.subject,
          at: new Date().toISOString(),
        });
        for (const check of changed) checks[check] = { result: "not_run" };
      }
      if (history.length > 200)
        throw new DomainError(
          409,
          "HISTORY_LIMIT",
          "Export the asset history and create a replacement record before further reconfiguration.",
        );
      let state = patch.state ?? item.state;
      if (state !== "retired" && state !== "planned")
        state = faultReported || Object.values(checks).some((c) => c.result === "fail")
          ? "faulty"
          : changed.length
            ? "received"
            : state;
      if (state === "planned" && item.state !== "planned")
        throw new DomainError(
          409,
          "ASSET_STATE_CONFLICT",
          "A received asset cannot return to planned.",
        );
      const result = this.store.update(item, revision, {
        ...patch,
        ...(data.powerWatts !== undefined ? { powerRatingRecorded: data.powerWatts !== null } : {}),
        faultReported,
        checks,
        state,
        commissioningHistory: history,
      });
      this.store.audit(actor, "asset.updated", id);
      return result;
    });
  }
  commission(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.check, input);
    return this.write(actor, key, "asset.check:" + id, data, () => {
      const item = this.store.get("assets", id);
      if (item.state === "planned" || item.state === "retired")
        throw new DomainError(
          409,
          "ASSET_NOT_RECEIVED",
          "Receive the asset before recording commissioning checks.",
        );
      if (
        data.result === "not_applicable" &&
        [
          "asset_label",
          "power",
          "management_security",
          "equipment_approval",
        ].includes(data.check)
      )
        throw new DomainError(
          400,
          "CHECK_REQUIRED",
          "This check cannot be marked not applicable.",
        );
      if (data.result === "not_applicable") {
        if (!["test_sim", "ups", "other"].includes(String(item.assetType)))
          throw new DomainError(400, "CHECK_REQUIRED", "Firmware, connectivity and recovery must be checked for this equipment type.");
        if (!data.note)
          throw new DomainError(400, "CHECK_REASON_REQUIRED", "Explain why this check does not apply to this exact item.");
      }
      const existingChecks = item.checks as Record<string, {result: string}>;
      const legacyDeclaredFault = item.faultReported === undefined && item.state === "faulty" && !Object.values(existingChecks).some(check => check.result === "fail");
      const declaredFault = item.faultReported === true || legacyDeclaredFault;
      const checks = {
        ...(legacyDeclaredFault ? Object.fromEntries(commissioningKeys.map(check => [check, {result: "not_run"}])) : existingChecks),
        [data.check]: {
          result: data.result,
          evidenceRef: data.evidenceRef,
          note: data.note ?? "",
          checkedBy: actor.subject,
          checkedAt: new Date().toISOString(),
        },
      };
      const complete = commissioningKeys.every((k) =>
        ["pass", "not_applicable"].includes(
          String((checks[k] as { result: string }).result),
        ),
      );
      const hasFailure = commissioningKeys.some(
        (k) => (checks[k] as { result: string }).result === "fail",
      );
      const state = hasFailure || (declaredFault && !complete)
        ? "faulty"
        : complete
          ? "commissioned"
          : "received";
      const history = [
        ...((item.commissioningHistory ?? []) as unknown[]),
        { check: data.check, ...(checks[data.check] as object), ...(legacyDeclaredFault ? {legacyFaultRequalification: true} : {}), ...(declaredFault && complete ? {declaredFaultCleared: true} : {}) },
      ];
      if (history.length > 200)
        throw new DomainError(
          409,
          "HISTORY_LIMIT",
          "Export the asset history and create a replacement record before more commissioning.",
        );
      const result = this.store.update(item, data.revision, {
        checks,
        state,
        faultReported: declaredFault && !complete,
        commissioningHistory: history,
      });
      this.store.audit(actor, "asset.check_recorded", id);
      return result;
    });
  }
  createTrial(actor: Actor, input: unknown, key: string): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.trial, input);
    return this.write(actor, key, "trial.create", data, () => {
      this.store.get("sites", data.siteId);
      const asset = this.store.get("assets", data.assetId);
      if (asset.siteId !== data.siteId || asset.state === "retired")
        throw new DomainError(
          400,
          "ASSET_SCOPE",
          "Choose a non-retired asset belonging to this site.",
        );
      if (
        data.path === "direct_to_cell" &&
        !["android_phone", "iphone"].includes(
          String(asset.assetType),
        )
      )
        throw new DomainError(
          400,
          "INVALID_CONNECTIVITY_PATH",
          "Choose the actual Android phone or iPhone under test. A SIM, dish or Wi-Fi router is not a handset.",
        );
      const item = this.store.insert("trials", actor.subject, {
        ...data,
        plannedAsset: {
          id: asset.id, assetType: asset.assetType, manufacturer: asset.manufacturer,
          model: asset.model, firmware: asset.firmware, serialReference: asset.serialReference ?? null,
          typeApprovalRef: asset.typeApprovalRef ?? null,
        },
        state: "planned",
        result: null,
        networkActionExecuted: false,
      });
      this.store.audit(actor, "trial.planned", item.id);
      return item;
    });
  }
  recordTrial(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "hardware.write");
    const data = parse(schemas.trialResult, input);
    return this.write(actor, key, "trial.result:" + id, data, () => {
      const item = this.store.get("trials", id);
      if (item.state === "completed")
        throw new DomainError(
          409,
          "RESULT_IMMUTABLE",
          "Completed observations are immutable. Plan a repeat trial to record another result.",
        );
      if (Date.parse(data.observedAt) > Date.now() + 60000)
        throw new DomainError(
          400,
          "FUTURE_OBSERVATION",
          "An observation cannot be in the future.",
        );
      const asset = this.store.get("assets", String(item.assetId));
      if (data.result === "pass" && asset.state !== "commissioned")
        throw new DomainError(
          409,
          "ASSET_NOT_COMMISSIONED",
          "Complete asset commissioning before accepting a passing field result.",
        );
      let authorizationEvidence: Record<string, unknown>[] = [];
      if (data.result === "pass" && data.source === "manual_field_record") {
        if (!item.deviceScope || !item.acceptanceCriteria || !data.authorizationRef)
          throw new DomainError(409, "TRIAL_AUTHORIZATION_REQUIRED", "Plan an exact device scope and pass criteria, then reference the approved test plan before recording a passing manual observation. Replan older trials missing this scope.");
        // Operator forms record seconds. Compare at that declared precision so
        // a same-second observation is not rejected because the plan has milliseconds.
        if (Math.floor(Date.parse(data.observedAt) / 1000) < Math.floor(Date.parse(item.createdAt) / 1000))
          throw new DomainError(409, "TRIAL_PLAN_AFTER_OBSERVATION", "A passing manual observation must follow the plan and its agreed pass criteria. Retrospective notes can be recorded without claiming a passed planned test.");
        const plannedAsset = item.plannedAsset as Record<string, unknown> | undefined;
        if (!plannedAsset || ["id", "assetType", "manufacturer", "model", "firmware", "serialReference", "typeApprovalRef"].some(field => (plannedAsset[field] ?? null) !== (asset[field] ?? null)))
          throw new DomainError(409, "TRIAL_CONFIGURATION_CHANGED", "The equipment configuration changed after planning. Plan a new trial for the current item and review its exact authorization scope.");
        if (item.path === "direct_to_cell" && !["android_phone", "iphone"].includes(String(asset.assetType)))
          throw new DomainError(409, "INVALID_CONNECTIVITY_PATH", "A passing direct-to-cell trial must identify the actual handset.");
        const required = item.path === "direct_to_cell"
          ? ["host_agreement", "equipment_approval", "satellite_authorization", "satellite_entitlement"]
          : ["host_agreement", "equipment_approval"];
        if (!data.evidenceIds?.length)
          throw new DomainError(409, "TRIAL_AUTHORIZATION_REQUIRED", "Link accepted evidence for this operator, access path and exact device scope.");
        const evidence = data.evidenceIds.map(id => this.store.get("gates", id));
        for (const entry of evidence) {
          if (entry.state !== "accepted" || !entry.reviewedBy || entry.reviewedBy === entry.submittedBy)
            throw new DomainError(409, "TRIAL_EVIDENCE_NOT_ACCEPTED", "Every linked evidence record needs a current independent acceptance.");
          if (entry.country !== "ZW" || entry.operator !== item.operator || entry.service !== item.path || entry.deviceScope !== item.deviceScope)
            throw new DomainError(409, "TRIAL_EVIDENCE_SCOPE", "Evidence must match Zimbabwe, the operator, the access path and the exact device scope on the trial.");
          const issued = Date.parse(String(entry.issuedAt)), expires = Date.parse(String(entry.expiresAt)), observed = Date.parse(data.observedAt);
          if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > observed || expires <= observed || expires <= Date.now())
            throw new DomainError(409, "TRIAL_EVIDENCE_EXPIRED", "Evidence must have been issued by the observation date and remain valid both then and now.");
        }
        if (required.some(gate => !evidence.some(entry => entry.gate === gate)))
          throw new DomainError(409, "TRIAL_AUTHORIZATION_REQUIRED", "Missing accepted evidence: " + required.filter(gate => !evidence.some(entry => entry.gate === gate)).join(", ") + ".");
        authorizationEvidence = evidence.map(entry => ({
          id: entry.id, revision: entry.revision, gate: entry.gate,
          country: entry.country, operator: entry.operator, service: entry.service, deviceScope: entry.deviceScope,
          evidenceRef: entry.evidenceRef, issuer: entry.issuer, issuedAt: entry.issuedAt, expiresAt: entry.expiresAt,
          reviewedBy: entry.reviewedBy, reviewedAt: entry.reviewedAt,
        }));
      } else if (data.evidenceIds?.length || data.authorizationRef) {
        throw new DomainError(400, "TRIAL_EVIDENCE_NOT_APPLICABLE", "Authorization evidence is linked only to a passing manual observation. Describe blocked, failed or simulated outcomes in the observation.");
      }
      const { revision, ...observation } = data;
      const result = this.store.update(item, revision, {
        ...observation,
        assetSnapshot: {
          id: asset.id, revision: asset.revision, tag: asset.tag, assetType: asset.assetType,
          manufacturer: asset.manufacturer, model: asset.model, firmware: asset.firmware,
          typeApprovalRef: asset.typeApprovalRef ?? null, state: asset.state,
        },
        authorizationEvidence,
        authorizationAssessment: data.source === "lab_simulator" ? "simulation_only" : data.result === "pass" ? "internal_evidence_review" : "not_assessed",
        state: "completed",
        recordedBy: actor.subject,
        networkActionExecuted: false,
      });
      this.store.audit(actor, "trial.result_recorded", id);
      return result;
    });
  }
  submitEvidence(actor: Actor, input: unknown, key: string): RecordItem {
    requirePermission(actor, "readiness.write");
    const data = parse(schemas.evidence, input);
    if (Date.parse(data.expiresAt) <= Date.now())
      throw new DomainError(
        400,
        "EVIDENCE_EXPIRED",
        "Provide evidence with a future review/expiry date.",
      );
    if (
      data.issuedAt > new Date().toISOString().slice(0, 10) ||
      Date.parse(data.issuedAt) >= Date.parse(data.expiresAt)
    )
      throw new DomainError(
        400,
        "INVALID_EVIDENCE_DATES",
        "Evidence must already be issued and expire after its issue date.",
      );
    return this.write(actor, key, "evidence.submit", data, () => {
      const item = this.store.insert("gates", actor.subject, {
        ...data,
        state: "in_review",
        submittedBy: actor.subject,
        reviewedBy: null,
      });
      this.store.audit(actor, "evidence.submitted", item.id);
      return item;
    });
  }
  reviewEvidence(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "readiness.approve");
    const data = parse(schemas.evidenceReview, input);
    return this.write(actor, key, "evidence.review:" + id, data, () => {
      const item = this.store.get("gates", id);
      if (data.decision === "accept" && item.submittedBy === actor.subject)
        throw new DomainError(
          403,
          "SEPARATE_REVIEWER_REQUIRED",
          "A second authorized person must review the evidence.",
        );
      if (
        data.decision === "accept" &&
        Date.parse(String(item.expiresAt)) <= Date.now()
      )
        throw new DomainError(
          409,
          "EVIDENCE_EXPIRED",
          "Expired evidence cannot be accepted.",
        );
      if (item.state !== "in_review" && data.decision !== "revoke")
        throw new DomainError(
          409,
          "EVIDENCE_ALREADY_REVIEWED",
          "Submit a new evidence record for another review.",
        );
      const result = this.store.update(item, data.revision, {
        state: { accept: "accepted", reject: "rejected", revoke: "revoked" }[
          data.decision
        ],
        reviewedBy: actor.subject,
        reviewedAt: new Date().toISOString(),
        reviewReason: data.reason,
      });
      this.store.audit(actor, "evidence." + data.decision, id);
      return result;
    });
  }
  apply(actor: Actor, input: unknown, key: string): RecordItem {
    this.labOnly();
    if (actor.role !== "customer")
      throw new DomainError(
        403,
        "CUSTOMER_REQUIRED",
        "Use a customer account to submit your own pilot application.",
      );
    const data = parse(schemas.application, input);
    return this.write(actor, key, "application.create", data, () => {
      if (
        this.store
          .list("applications", actor.subject)
          .some((a) => a.state !== "declined")
      )
        throw new DomainError(
          409,
          "APPLICATION_EXISTS",
          "An application already exists for this account.",
        );
      const item = this.store.insert("applications", actor.subject, {
        ...data,
        state: "review_required",
        registrationVerified: false,
        provisioningState: "not_requested",
        networkState: "not_provisioned",
        mode: "lab",
      });
      this.store.audit(actor, "application.created", item.id);
      return item;
    });
  }
  reviewApplication(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "subscribers.review");
    this.labOnly();
    const data = parse(schemas.review, input);
    if (data.decision === "ready_for_host" && !data.registrationReference)
      throw new DomainError(
        400,
        "REFERENCE_REQUIRED",
        "Provide a pilot registration-review reference.",
      );
    return this.write(actor, key, "application.review:" + id, data, () => {
      const item = this.store.get("applications", id);
      if (item.state === "declined")
        throw new DomainError(
          409,
          "APPLICATION_CLOSED",
          "This application is closed.",
        );
      const result = this.store.update(item, data.revision, {
        state: {
          request_information: "information_required",
          ready_for_host: "awaiting_host",
          decline: "declined",
        }[data.decision],
        reviewNote: data.note,
        registrationReference: data.registrationReference ?? null,
        reviewedBy: actor.subject,
        registrationVerified: false,
        networkState: "not_provisioned",
      });
      this.store.audit(actor, "application.reviewed", id);
      return result;
    });
  }
  resubmit(actor: Actor, id: string, input: unknown, key: string): RecordItem {
    this.labOnly();
    const data = parse(
      schemas.application.extend({ revision: schemas.review.shape.revision }),
      input,
    );
    return this.write(actor, key, "application.resubmit:" + id, data, () => {
      const item = this.store.get("applications", id);
      if (item.owner !== actor.subject)
        throw new DomainError(
          404,
          "NOT_FOUND",
          "The application is not available.",
        );
      if (
        !["review_required", "information_required"].includes(
          String(item.state),
        )
      )
        throw new DomainError(
          409,
          "APPLICATION_LOCKED",
          "This application has moved to host review or is closed. Contact support to request a change.",
        );
      const { revision, ...patch } = data;
      const result = this.store.update(item, revision, {
        ...patch,
        state: "review_required",
        registrationVerified: false,
        registrationReference: null,
        reviewNote: null,
      });
      this.store.audit(actor, "application.resubmitted", id);
      return result;
    });
  }
  ticket(actor: Actor, input: unknown, key: string): RecordItem {
    const data = parse(schemas.ticket, input);
    return this.write(actor, key, "ticket.create", data, () => {
      const item = this.store.insert("tickets", actor.subject, {
        ...data,
        status: "open",
        assignee: null,
        notes: [],
      });
      this.store.audit(actor, "ticket.created", item.id);
      return item;
    });
  }
  updateTicket(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "support.write");
    const data = parse(schemas.ticketUpdate, input);
    return this.write(actor, key, "ticket.update:" + id, data, () => {
      const item = this.store.get("tickets", id);
      const notes = [
        ...(item.notes as unknown[]),
        {
          text: data.note,
          at: new Date().toISOString(),
          authorRole: actor.role,
        },
      ];
      if (notes.length > 100)
        throw new DomainError(
          409,
          "NOTE_LIMIT",
          "This case reached the pilot note limit. Create a follow-up case.",
        );
      const result = this.store.update(item, data.revision, {
        status: data.status,
        assignee: data.assignee ?? item.assignee,
        notes,
      });
      this.store.audit(actor, "ticket.updated", id);
      return result;
    });
  }
  reply(actor: Actor, id: string, input: unknown, key: string): RecordItem {
    const data = parse(schemas.reply, input);
    return this.write(actor, key, "ticket.reply:" + id, data, () => {
      const item = this.store.get("tickets", id);
      if (item.owner !== actor.subject)
        throw new DomainError(404, "NOT_FOUND", "The case is not available.");
      const notes = [
        ...(item.notes as unknown[]),
        {
          text: data.message,
          at: new Date().toISOString(),
          authorRole: "customer",
        },
      ];
      if (notes.length > 100)
        throw new DomainError(
          409,
          "NOTE_LIMIT",
          "Create a follow-up case for this conversation.",
        );
      const result = this.store.update(item, data.revision, {
        notes,
        status: "open",
      });
      this.store.audit(actor, "ticket.replied", id);
      return result;
    });
  }
  recordPayment(actor: Actor, input: unknown, key: string): RecordItem {
    requirePermission(actor, "billing.write");
    this.labOnly();
    const data = parse(schemas.ledger, input);
    return this.write(actor, key, "ledger.record", data, () => {
      const app = this.store.get("applications", data.applicationId);
      const item = this.store.insert("ledger", app.owner, {
        ...data,
        state: "test_recorded",
        soldBy: actor.subject,
        refunds: [],
        refundedMinor: 0,
        documentType: "test_receipt",
        legalInvoice: false,
        moneyMoved: false,
      });
      this.store.audit(actor, "lab_payment.recorded", item.id);
      return item;
    });
  }
  refund(actor: Actor, id: string, input: unknown, key: string): RecordItem {
    requirePermission(actor, "billing.write");
    this.labOnly();
    if (actor.role === "agent")
      throw new DomainError(
        403,
        "REFUND_APPROVAL_REQUIRED",
        "A finance or administrator role must record a test refund.",
      );
    const data = parse(schemas.refund, input);
    return this.write(actor, key, "ledger.refund:" + id, data, () => {
      const item = this.store.get("ledger", id);
      const total = Number(item.refundedMinor) + data.amountMinor;
      if (total > Number(item.amountMinor))
        throw new DomainError(
          409,
          "REFUND_EXCEEDS_PAYMENT",
          "The total refund cannot exceed the original amount.",
        );
      const refunds = [
        ...(item.refunds as unknown[]),
        {
          amountMinor: data.amountMinor,
          reason: data.reason,
          recordedBy: actor.subject,
          at: new Date().toISOString(),
        },
      ];
      const result = this.store.update(item, data.revision, {
        refundedMinor: total,
        refunds,
        state:
          total === item.amountMinor
            ? "test_refunded"
            : "test_partially_refunded",
      });
      this.store.audit(actor, "lab_payment.refund_recorded", id);
      return result;
    });
  }
  receipt(actor: Actor, id: string): RecordItem {
    const item = this.store.get("ledger", id);
    if (
      item.owner !== actor.subject &&
      !permissions(actor).includes("billing.read") &&
      !(actor.role === "agent" && item.soldBy === actor.subject)
    )
      throw new DomainError(404, "NOT_FOUND", "The document is not available.");
    return item;
  }
  request(actor: Actor, input: unknown, key: string): RecordItem {
    const data = parse(schemas.request, input);
    return this.write(actor, key, "account.request", data, () => {
      const item = this.store.insert("requests", actor.subject, {
        ...data,
        status: "received",
        automaticAction: false,
      });
      this.store.audit(actor, "account.requested", item.id);
      return item;
    });
  }
  resolveRequest(
    actor: Actor,
    id: string,
    input: unknown,
    key: string,
  ): RecordItem {
    requirePermission(actor, "support.write");
    const data = parse(schemas.requestUpdate, input);
    return this.write(actor, key, "account.request_update:" + id, data, () => {
      const item = this.store.get("requests", id);
      if (item.status === "resolved")
        throw new DomainError(
          409,
          "REQUEST_CLOSED",
          "This request has already been resolved.",
        );
      const result = this.store.update(item, data.revision, {
        status: data.status,
        responseNote: data.note,
        handledBy: actor.subject,
        handledAt: new Date().toISOString(),
        automaticAction: false,
      });
      this.store.audit(actor, "account.request_updated", id);
      return result;
    });
  }
  networkOperation(): never {
    throw new DomainError(
      503,
      "PROVIDER_NOT_COMMISSIONED",
      "The host operator and satellite integrations are not commissioned. No SIM, payment, radio or satellite action was executed.",
    );
  }
}
