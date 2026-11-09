export const roles = ["admin", "operations", "support", "finance", "agent", "auditor", "customer"] as const;
export type Role = (typeof roles)[number];
export type Surface = "customer" | "staff";
export type AuthSource = "lab" | "onesa";

export interface AuthPrincipal {
  readonly subject: string;
  readonly displayName: string;
  readonly role: Role;
  readonly source: AuthSource;
  readonly authenticatedAt: number;
  readonly mfa: boolean;
  readonly expiresAt: number;
}
export interface AuthSession extends AuthPrincipal {
  readonly id: string;
  readonly csrfToken: string;
  readonly transport: "cookie" | "bearer";
}
export interface AuthIssue {
  readonly token: string;
  readonly session: AuthSession;
}
export interface OnesaConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}
export interface AuthConfig {
  readonly mode: "lab" | "production";
  readonly databasePath: string;
  readonly publicOrigin: string;
  readonly allowedOrigins: readonly string[];
  readonly encryptionKey?: string | undefined;
  readonly onesa?: OnesaConfig | undefined;
}
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message = "Authentication could not be completed.") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}
export function isStaff(role: Role): boolean { return role !== "customer"; }
