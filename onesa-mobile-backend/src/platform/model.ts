import { z } from "zod";

export const roles = [
  "admin",
  "operations",
  "support",
  "finance",
  "agent",
  "auditor",
  "customer",
] as const;
export type Role = (typeof roles)[number];
export interface Actor {
  subject: string;
  displayName: string;
  role: Role;
}
export type Kind =
  | "sites"
  | "assets"
  | "trials"
  | "gates"
  | "applications"
  | "tickets"
  | "ledger"
  | "requests";
export interface RecordItem {
  id: string;
  kind: Kind;
  owner: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}
export class DomainError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) => !/[\u0000-\u001f\u007f]/.test(s),
      "Control characters are not allowed",
    );
const note = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine(
    (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s),
    "Control characters other than line breaks and tabs are not allowed",
  );
const ref = text(160).refine(
  (s) =>
    !/(?:https?:\/\/[^/\s]*@|-----BEGIN|\bBearer\s|\b(?:ghp_|github_pat_|sk_live_))/i.test(
      s,
    ),
  "Use a non-secret evidence reference",
);
export const id = z.string().uuid();
export const revision = z.number().int().positive();
export const planIds = ["everyday", "reach", "family-farm"] as const;
export const assetKinds = [
  "android_phone",
  "iphone",
  "router",
  "access_point",
  "switch",
  "ups",
  "satellite_terminal",
  "test_sim",
  "workstation",
  "tablet",
  "other",
] as const;
export const commissioningKeys = [
  "asset_label",
  "power",
  "firmware",
  "management_security",
  "equipment_approval",
  "connectivity",
  "recovery",
] as const;
export const gateLabels = {
  telecom_licence: "Telecommunications licence",
  host_agreement: "Host operator agreement",
  subscriber_registration: "Subscriber registration process",
  data_protection: "Data protection and hosting",
  equipment_approval: "Equipment and spectrum approval",
  approved_tariff: "Approved tariffs",
  numbering_interconnect: "Numbering and interconnection",
  emergency_services: "Emergency service responsibilities",
  satellite_authorization: "Zimbabwe satellite authorization",
  satellite_entitlement: "Satellite wholesale entitlement",
  device_acceptance: "Device and service acceptance",
  operational_acceptance: "Operational acceptance",
} as const;
export const gateKeys = Object.keys(gateLabels) as [
  keyof typeof gateLabels,
  ...(keyof typeof gateLabels)[],
];
export const schemas = {
  site: z
    .object({
      name: text(80),
      area: text(100),
      purpose: z.enum(["device_bench", "wifi_backhaul", "field_trial"]),
    })
    .strict(),
  asset: z
    .object({
      siteId: id,
      tag: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/),
      assetType: z.enum(assetKinds),
      manufacturer: text(60),
      model: text(100),
      firmware: text(80).default("Not recorded"),
      powerWatts: z.number().min(0).max(10000).nullable().default(null),
      typeApprovalRef: ref.optional(),
      custodian: text(80).optional(),
      serialReference: ref.optional(),
      supplierReference: ref.optional(),
    })
    .strict(),
  assetUpdate: z
    .object({
      revision,
      state: z.enum(["planned", "received", "faulty", "retired"]).optional(),
      firmware: text(80).optional(),
      powerWatts: z.number().min(0).max(10000).nullable().optional(),
      typeApprovalRef: ref.optional(),
      custodian: text(80).optional(),
      serialReference: ref.optional(),
      supplierReference: ref.optional(),
    })
    .strict(),
  check: z
    .object({
      revision,
      check: z.enum(commissioningKeys),
      result: z.enum(["pass", "fail", "not_applicable"]),
      evidenceRef: ref,
      note: note.optional(),
    })
    .strict(),
  trial: z
    .object({
      siteId: id,
      assetId: id,
      path: z.enum(["terrestrial", "direct_to_cell", "dish_wifi"]),
      scenario: text(160),
      operator: text(80),
      deviceScope: ref.optional(),
      acceptanceCriteria: note.optional(),
      service: z.enum([
        "sms",
        "app_data",
        "app_voice",
        "native_voice",
        "internet",
      ]),
      plannedFor: z.iso.date().optional(),
    })
    .strict(),
  trialResult: z
    .object({
      revision,
      result: z.enum(["pass", "fail", "blocked"]),
      evidenceRef: ref,
      observation: note,
      observedAt: z.iso.datetime(),
      source: z.enum(["manual_field_record", "lab_simulator"]),
      authorizationRef: ref.optional(),
      evidenceIds: z.array(id).max(12).refine(ids => new Set(ids).size === ids.length, "Evidence references must be unique").optional(),
      latencyMs: z.number().min(0).max(60000).optional(),
      downloadMbps: z.number().min(0).max(10000).optional(),
    })
    .strict(),
  evidence: z
    .object({
      gate: z.enum(gateKeys),
      country: z.literal("ZW"),
      operator: text(80),
      service: z.enum(["terrestrial", "direct_to_cell", "dish_wifi"]),
      deviceScope: text(160),
      evidenceRef: ref,
      issuer: text(100),
      issuedAt: z.iso.date(),
      expiresAt: z.iso.datetime(),
      summary: note,
    })
    .strict(),
  evidenceReview: z
    .object({
      revision,
      decision: z.enum(["accept", "reject", "revoke"]),
      reason: note,
    })
    .strict(),
  application: z
    .object({
      displayName: text(80),
      area: text(100),
      planId: z.enum(planIds),
      simFormat: z.enum(["physical", "esim"]),
      deviceModel: text(100),
      consentToPilot: z.literal(true),
    })
    .strict(),
  review: z
    .object({
      revision,
      decision: z.enum(["request_information", "ready_for_host", "decline"]),
      note,
      registrationReference: ref.optional(),
    })
    .strict(),
  ticket: z
    .object({
      category: z.enum(["registration", "sim", "coverage", "billing", "other"]),
      subject: text(100),
      message: note,
    })
    .strict(),
  ticketUpdate: z
    .object({
      revision,
      status: z.enum(["open", "in_progress", "resolved"]),
      assignee: text(80).optional(),
      note,
    })
    .strict(),
  ledger: z
    .object({
      applicationId: id,
      amountMinor: z.number().int().min(1).max(10000000),
      currency: z.literal("USD"),
      method: z.enum(["cash_test", "card_test", "mobile_money_test"]),
      reference: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/),
      description: text(140),
    })
    .strict(),
  refund: z
    .object({
      revision,
      amountMinor: z.number().int().min(1).max(10000000),
      reason: note,
    })
    .strict(),
  request: z
    .object({
      type: z.enum([
        "account_closure",
        "data_correction",
        "sim_replacement",
        "number_porting",
      ]),
      detail: note,
    })
    .strict(),
  reply: z.object({ revision, message: note }).strict(),
  requestUpdate: z
    .object({ revision, status: z.enum(["in_progress", "resolved"]), note })
    .strict(),
};
export type Permission =
  | "hardware.read"
  | "hardware.write"
  | "readiness.read"
  | "readiness.write"
  | "readiness.approve"
  | "subscribers.read"
  | "subscribers.review"
  | "support.read"
  | "support.write"
  | "billing.read"
  | "billing.write"
  | "audit.read";
const rolePermissions: Record<Role, Permission[]> = {
  admin: [
    "hardware.read",
    "hardware.write",
    "readiness.read",
    "readiness.write",
    "readiness.approve",
    "subscribers.read",
    "subscribers.review",
    "support.read",
    "support.write",
    "billing.read",
    "billing.write",
    "audit.read",
  ],
  operations: [
    "hardware.read",
    "hardware.write",
    "readiness.read",
    "readiness.write",
    "subscribers.read",
    "subscribers.review",
    "support.read",
    "support.write",
  ],
  support: ["subscribers.read", "support.read", "support.write"],
  finance: ["billing.read", "billing.write"],
  agent: ["billing.write"],
  auditor: [
    "hardware.read",
    "readiness.read",
    "subscribers.read",
    "support.read",
    "billing.read",
    "audit.read",
  ],
  customer: [],
};
export function permissions(actor: Actor): Permission[] {
  return [...rolePermissions[actor.role]];
}
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!rolePermissions[actor.role].includes(permission))
    throw new DomainError(
      403,
      "FORBIDDEN",
      "Your role cannot perform this operation.",
    );
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError(
      400,
      "INVALID_INPUT",
      result.error.issues
        .map((i) => `${i.path.join(".") || "request"}: ${i.message}`)
        .join("; ")
        .slice(0, 600),
    );
  return result.data;
}
