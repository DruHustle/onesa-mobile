import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { AuthStore, type HandoffRow, type SessionRow } from "./store.ts";
import { constantEqual, digest, hashPassword, newTotpSecret, randomToken, seal, totpStep, unseal, verifyPassword } from "./crypto.ts";
import { OnesaIdentity, validateOnesaConfig } from "./onesa.ts";
import { AuthError, isRole, isStaff, type AuthConfig, type AuthIssue, type AuthPrincipal, type AuthSession, type Role, type Surface } from "./types.ts";
export { AuthError, roles, type AuthConfig, type AuthIssue, type AuthPrincipal, type AuthSession, type Role, type Surface } from "./types.ts";

const SESSION_SECONDS = 28_800;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const nowSeconds = () => Math.floor(Date.now() / 1000);

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  if (header.length > 8192) throw new AuthError(400, "AUTH_HEADER_INVALID");
  const values = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(name + "="));
  if (values.length > 1) throw new AuthError(400, "AUTH_HEADER_INVALID");
  const value = values[0]?.slice(name.length + 1);
  return value !== undefined && tokenPattern.test(value) ? value : null;
}
function origin(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value || url.username || url.password) throw new Error("Authentication requires exact origins.");
  return url;
}
function surfaceMatches(role: Role, surface: Surface): boolean {
  return surface !== "staff" || isStaff(role);
}

export interface LabUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
  readonly password?: string;
  readonly totpSecret?: string;
}
export interface LabCredentials {
  readonly subject: string;
  readonly username: string;
  readonly role: Role;
  readonly password: string;
  readonly totpSecret?: string;
  readonly otpAuthUri?: string;
}
const workspaceSections: Record<Surface, readonly string[]> = {
  customer: ["application", "payments", "help", "account"],
  staff: ["hardware", "trials", "readiness", "applications", "support", "billing", "audit"],
};

export interface OidcStart {
  readonly surface: Surface;
  readonly returnTo?: "/account/" | "/internal/";
  readonly section?: string;
  readonly native?: { readonly codeChallenge: string; readonly state: string };
}
export interface AuthCompletion extends AuthIssue {
  readonly returnTo: string;
  readonly clearFlowCookie: string;
  readonly nativeRedirect?: string;
}

export class AuthService {
  readonly config: AuthConfig;
  readonly store: AuthStore;
  readonly cookieName: string;
  readonly flowCookieName: string;
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly secure: boolean;
  private readonly identity: OnesaIdentity | undefined;
  private readonly dummyHash: Promise<string>;
  constructor(config: AuthConfig) {
    const publicUrl = origin(config.publicOrigin);
    if (config.mode !== "lab" && config.mode !== "production") throw new Error("Authentication mode must be explicit.");
    if (config.mode === "production" && publicUrl.protocol !== "https:") throw new Error("Production authentication requires HTTPS.");
    const origins = config.allowedOrigins.map((value) => {
      const parsed = origin(value);
      const isolated = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(parsed.hostname) || /\.(test|invalid)$/.test(parsed.hostname);
      if (config.mode === "lab" && !isolated)
        throw new Error("All public Onesa Mobile hosts require Company Portal authentication.");
      if (config.mode === "production" && parsed.protocol !== "https:") throw new Error("Production origins must use HTTPS.");
      return value;
    });
    if (!origins.includes(config.publicOrigin)) throw new Error("PUBLIC_ORIGIN must be an allowed authentication origin.");
    if (config.onesa) validateOnesaConfig(config.onesa, config.publicOrigin);
    if (config.mode === "production" && !config.onesa) throw new Error("Production authentication requires an explicitly configured Onesa Mobile client.");
    this.config = config;
    this.secure = publicUrl.protocol === "https:";
    this.cookieName = this.secure ? "__Host-onesa_mobile_session" : "onesa_mobile_lab_session";
    this.flowCookieName = this.secure ? "__Host-onesa_mobile_flow" : "onesa_mobile_lab_flow";
    this.allowedOrigins = new Set(origins);
    this.store = new AuthStore(config);
    this.identity = config.onesa ? new OnesaIdentity(config.onesa, this.store.db) : undefined;
    this.dummyHash = hashPassword(randomToken());
  }
  close(): void { this.store.close(); }
  cookie(token: string, expiresAt = nowSeconds() + SESSION_SECONDS): string {
    if (!tokenPattern.test(token)) throw new Error("Invalid session token.");
    return this.cookieName + "=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.max(0, Math.min(SESSION_SECONDS, expiresAt - nowSeconds())) + (this.secure ? "; Secure" : "");
  }
  clearCookie(): string { return this.cookieName + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (this.secure ? "; Secure" : ""); }
  clearFlowCookie(): string { return this.flowCookieName + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + (this.secure ? "; Secure" : ""); }
  publicSession(session: AuthSession): AuthPrincipal & { csrfToken: string } {
    const { subject, displayName, role, source, authenticatedAt, mfa, expiresAt, csrfToken } = session;
    return { subject, displayName, role, source, authenticatedAt, mfa, expiresAt, csrfToken };
  }
  assertOrigin(value: string | undefined): void {
    if (!value || !this.allowedOrigins.has(value)) throw new AuthError(403, "ORIGIN_NOT_ALLOWED", "This request origin is not allowed.");
  }
  assertMutation(session: AuthSession, csrfHeader: string | undefined, requestOrigin: string | undefined): void {
    if (session.transport === "bearer") {
      if (requestOrigin !== undefined && !this.allowedOrigins.has(requestOrigin)) throw new AuthError(403, "ORIGIN_NOT_ALLOWED");
      return;
    }
    this.assertOrigin(requestOrigin);
    if (!csrfHeader || !constantEqual(session.csrfToken, csrfHeader)) throw new AuthError(403, "CSRF_INVALID", "Refresh your account before retrying.");
  }
  requireFresh(session: AuthSession, seconds = 300): void {
    const age = nowSeconds() - session.authenticatedAt;
    if (age < 0 || age > seconds || (isStaff(session.role) && !session.mfa)) throw new AuthError(403, "REAUTHENTICATION_REQUIRED", "Sign in again to confirm this sensitive action.");
  }
  async createLabUser(input: LabUserInput): Promise<LabCredentials> {
    if (this.config.mode !== "lab") throw new AuthError(503, "LAB_AUTH_DISABLED");
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username) || !isRole(input.role) ||
        input.displayName.trim().length < 1 || input.displayName.length > 120) throw new AuthError(400, "LAB_USER_INVALID");
    const password = input.password ?? randomToken();
    const passwordHash = await hashPassword(password);
    const secret = isStaff(input.role) ? input.totpSecret ?? newTotpSecret() : undefined;
    if (secret && !/^[A-Z2-7]{32}$/.test(secret)) throw new AuthError(400, "LAB_USER_INVALID");
    const id = randomUUID();
    this.store.transaction(() => {
      if (this.store.userByName(username)) throw new AuthError(409, "LAB_USER_EXISTS", "This lab username already exists. Credentials were not replaced.");
      this.store.db.prepare("INSERT INTO mobile_auth_users(id,username,display_name,role,password_hash,totp_secret) VALUES(?,?,?,?,?,?)").run(
        id, username, input.displayName.trim(), input.role, passwordHash, secret ? seal(secret, this.store.key) : null);
      this.store.record(id, "lab.user.created", "success");
    });
    return {
      subject: id, username, role: input.role, password,
      ...(secret ? { totpSecret: secret, otpAuthUri: "otpauth://totp/" + encodeURIComponent("Onesa Mobile Lab:" + username) + "?secret=" + secret + "&issuer=Onesa%20Mobile%20Lab&algorithm=SHA1&digits=6&period=30" } : {}),
    };
  }
  /** Operator-only recovery: explicitly review the existing role, replace credentials
   * and enable this one identity. No public route exposes this method. */
  async reissueLabUser(usernameInput: string, expectedRole: Role, persist?: (credentials: LabCredentials) => void): Promise<LabCredentials> {
    if (this.config.mode !== "lab") throw new AuthError(503, "LAB_AUTH_DISABLED");
    const username = usernameInput.trim().toLowerCase(), user = this.store.userByName(username);
    if (!user) throw new AuthError(404, "LAB_USER_NOT_FOUND");
    if (!isRole(expectedRole) || user.role !== expectedRole) throw new AuthError(409, "LAB_ROLE_REVIEW_REQUIRED", "The expected role does not match. Reconcile current authorization before reissuing this account.");
    const password = randomToken(), passwordHash = await hashPassword(password);
    const secret = isStaff(user.role) ? newTotpSecret() : undefined;
    const credentials: LabCredentials = { subject: user.id, username: user.username, role: user.role, password,
      ...(secret ? { totpSecret: secret, otpAuthUri: "otpauth://totp/" + encodeURIComponent("Onesa Mobile Lab:" + user.username) + "?secret=" + secret + "&issuer=Onesa%20Mobile%20Lab&algorithm=SHA1&digits=6&period=30" } : {}) };
    return this.store.transaction(() => {
      const current = this.store.userById(user.id);
      if (!current || current.revision !== user.revision || current.role !== expectedRole) throw new AuthError(409, "LAB_ROLE_REVIEW_REQUIRED", "The account changed while credentials were prepared. Review it again.");
      // A CLI persists the protected file before the SQL commit. Failure rolls back identity changes.
      persist?.(credentials);
      this.store.db.prepare("UPDATE mobile_auth_users SET password_hash=?,totp_secret=?,last_totp_counter=-1,disabled=0,revision=revision+1 WHERE id=?").run(passwordHash, secret ? seal(secret, this.store.key) : null, user.id);
      this.store.db.prepare("DELETE FROM mobile_auth_sessions WHERE subject=?").run(user.id);
      this.store.db.prepare("DELETE FROM mobile_auth_limits WHERE key_hash=?").run(digest("login-user:" + username));
      this.store.record(user.id, "lab.user.credentials_reissued", "success");
      return credentials;
    });
  }
  updateLabUserAccess(subject: string, update: { role?: Role; disabled?: boolean }): void {
    if (this.config.mode !== "lab") throw new AuthError(503, "LAB_AUTH_DISABLED");
    this.store.transaction(() => {
      const user = this.store.userById(subject);
      if (!user) throw new AuthError(404, "LAB_USER_NOT_FOUND");
      const role = update.role ?? user.role;
      if (!isRole(role) || (isStaff(role) && !user.totp_secret)) throw new AuthError(409, "MFA_ENROLLMENT_REQUIRED");
      this.store.db.prepare("UPDATE mobile_auth_users SET role=?,disabled=?,revision=revision+1 WHERE id=?").run(role, update.disabled === undefined ? user.disabled : Number(update.disabled), subject);
      this.store.db.prepare("DELETE FROM mobile_auth_sessions WHERE subject=?").run(subject);
      this.store.record(subject, "lab.user.access_changed", "success");
    });
  }
  private issue(principal: AuthPrincipal, surface: Surface, userRevision: number | null, onesaAccessToken: string | null): AuthIssue {
    const token = randomToken(), id = randomUUID(), csrfToken = randomToken();
    const expiresAt = Math.min(principal.expiresAt, principal.authenticatedAt + SESSION_SECONDS);
    this.store.cleanup(nowSeconds());
    this.store.addSession({
      id, token_hash: digest(token), subject: principal.subject, source: principal.source, csrf: csrfToken,
      authenticated_at: principal.authenticatedAt, expires_at: expiresAt, user_revision: userRevision,
      onesa_access_token: onesaAccessToken ? seal(onesaAccessToken, this.store.key) : null, surface,
    });
    this.store.record(principal.subject, "session.created", "success");
    return { token, session: { ...principal, expiresAt, id, csrfToken, transport: "cookie" } };
  }
  async loginLab(input: { username: string; password: string; totp?: string | undefined; surface?: Surface | undefined }, rateKey: string): Promise<AuthIssue> {
    if (this.config.mode !== "lab") throw new AuthError(503, "LAB_AUTH_DISABLED", "Local lab sign-in is disabled.");
    const instant = nowSeconds();
    this.store.consumeLimit("login-address:" + rateKey.slice(0, 256), 40, 300, instant);
    const username = input.username.trim().toLowerCase().slice(0, 80);
    this.store.consumeLimit("login-user:" + username, 10, 900, instant);
    const user = this.store.userByName(username);
    const encoded = user?.password_hash ?? await this.dummyHash;
    const valid = await verifyPassword(input.password, encoded);
    const surface = input.surface ?? (user && isStaff(user.role) ? "staff" : "customer");
    if (!valid || !user || user.disabled || !["customer", "staff"].includes(surface) || !surfaceMatches(user.role, surface)) {
      this.store.record(null, "lab.login", "denied");
      throw new AuthError(401, "INVALID_CREDENTIALS", "Check your lab credentials and authenticator code.");
    }
    let step: number | null = null;
    if (isStaff(user.role)) {
      step = user.totp_secret ? totpStep(unseal(user.totp_secret, this.store.key), input.totp ?? "", instant, user.last_totp_counter) : null;
      if (step === null) {
        this.store.record(user.id, "lab.login", "denied");
        throw new AuthError(401, "INVALID_CREDENTIALS", "Check your lab credentials and authenticator code.");
      }
    }
    return this.store.transaction(() => {
      const current = this.store.userById(user.id);
      if (!current || current.disabled || current.revision !== user.revision) throw new AuthError(401, "INVALID_CREDENTIALS");
      if (step !== null) {
        const changed = this.store.db.prepare("UPDATE mobile_auth_users SET last_totp_counter=? WHERE id=? AND last_totp_counter<?").run(step, user.id, step);
        if (Number(changed.changes) !== 1) throw new AuthError(401, "INVALID_CREDENTIALS", "Use a fresh authenticator code.");
      }
      return this.issue({
        subject: user.id, displayName: user.display_name, role: user.role, source: "lab",
        authenticatedAt: instant, mfa: isStaff(user.role), expiresAt: instant + SESSION_SECONDS,
      }, surface, user.revision, null);
    });
  }
  private credential(headers: { authorization?: string | undefined; cookie?: string | undefined }): { token: string | null; transport: "cookie" | "bearer" } {
    const cookie = cookieValue(headers.cookie, this.cookieName);
    let token: string | null = null, transport: "cookie" | "bearer" = "cookie";
    if (headers.authorization !== undefined) {
      if (cookie || !/^Bearer [A-Za-z0-9_-]{43}$/.test(headers.authorization)) throw new AuthError(400, "AUTH_HEADER_INVALID");
      token = headers.authorization.slice(7); transport = "bearer";
    } else token = cookie;
    return { token, transport };
  }
  async authenticate(headers: { authorization?: string | undefined; cookie?: string | undefined }): Promise<AuthSession | null> {
    const { token, transport } = this.credential(headers);
    if (!token) return null;
    const row = this.store.sessionByHash(digest(token));
    const instant = nowSeconds();
    if (!row || row.expires_at <= instant) { if (row) this.store.deleteSession(row.id); return null; }
    let principal: AuthPrincipal | null;
    if (row.source === "lab") {
      if (this.config.mode !== "lab") return null;
      const user = this.store.userById(row.subject);
      if (!user || user.disabled || user.revision !== row.user_revision) { this.store.deleteSession(row.id); return null; }
      principal = {
        subject: user.id, displayName: user.display_name, role: user.role, source: "lab",
        authenticatedAt: row.authenticated_at, mfa: isStaff(user.role), expiresAt: row.expires_at,
      };
    } else {
      if (!this.identity || !row.onesa_access_token) throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE");
      principal = await this.identity.inspect(unseal(row.onesa_access_token, this.store.key));
      if (!principal || principal.subject !== row.subject || principal.authenticatedAt !== row.authenticated_at) { this.store.deleteSession(row.id); return null; }
      // Inspection is asynchronous. Logout or expiry may have destroyed the local
      // capability while Portal was responding; its older assertion cannot revive it.
      const current = this.store.sessionByHash(row.token_hash);
      if (!current || current.id !== row.id || current.expires_at <= nowSeconds()) {
        if (current?.id === row.id) this.store.deleteSession(row.id);
        return null;
      }
    }
    if (!surfaceMatches(principal.role, row.surface) || (isStaff(principal.role) && !principal.mfa)) { this.store.deleteSession(row.id); return null; }
    return { ...principal, expiresAt: Math.min(row.expires_at, principal.expiresAt), id: row.id, csrfToken: row.csrf, transport };
  }
  private async destroySession(row: SessionRow | undefined): Promise<{ centralRevocation: "confirmed" | "unavailable" | "not_applicable" }> {
    if (!row) return { centralRevocation: "not_applicable" };
    this.store.deleteSession(row.id);
    this.store.record(row.subject, "session.signed_out", "success");
    if (row.source === "onesa" && row.onesa_access_token && this.identity) {
      if(this.config.onesa?.audience) return {centralRevocation:"not_applicable"};
      try { await this.identity.revoke(unseal(row.onesa_access_token, this.store.key)); return { centralRevocation: "confirmed" }; }
      catch { return { centralRevocation: "unavailable" }; }
    }
    return { centralRevocation: "not_applicable" };
  }
  async logout(session: AuthSession): Promise<{ centralRevocation: "confirmed" | "unavailable" | "not_applicable" }> {
    const row = this.store.db.prepare("SELECT * FROM mobile_auth_sessions WHERE id=?").get(session.id) as SessionRow | undefined;
    return this.destroySession(row);
  }
  /** Local capability destruction must remain possible when the issuer is unavailable.
   * This method never returns a principal or authorizes any business operation. */
  async logoutPresented(headers: { authorization?: string | undefined; cookie?: string | undefined }, input: { csrfToken?: string | undefined; origin?: string | undefined }): Promise<{ centralRevocation: "confirmed" | "unavailable" | "not_applicable" }> {
    const { token, transport } = this.credential(headers);
    if (transport === "cookie") this.assertOrigin(input.origin);
    else if (input.origin !== undefined) this.assertOrigin(input.origin);
    const row = token ? this.store.sessionByHash(digest(token)) : undefined;
    if (row && transport === "cookie" && (!input.csrfToken || !constantEqual(row.csrf, input.csrfToken))) throw new AuthError(403, "CSRF_INVALID");
    return this.destroySession(row);
  }
  async beginOnesa(input: OidcStart): Promise<{ redirectUrl: string; flowCookie: string }> {
    if (!this.identity) throw new AuthError(503, "AUTH_NOT_CONFIGURED", "Onesa sign-in has not been configured for Mobile.");
    if (!["customer", "staff"].includes(input.surface)) throw new AuthError(400, "AUTH_SURFACE_INVALID");
    const base = input.returnTo ?? (input.surface === "staff" ? "/internal/" : "/account/");
    if ((input.surface === "staff" && base !== "/internal/") || (input.surface === "customer" && base !== "/account/")) throw new AuthError(400, "AUTH_RETURN_INVALID");
    if (input.section !== undefined && (input.native || !workspaceSections[input.surface].includes(input.section))) {
      throw new AuthError(400, "AUTH_RETURN_INVALID");
    }
    const returnTo = input.section ? base + "#" + input.section : base;
    if (input.native && (input.surface !== "customer" || !tokenPattern.test(input.native.codeChallenge) || !tokenPattern.test(input.native.state))) throw new AuthError(400, "AUTH_NATIVE_INVALID");
    const state = randomToken(), nonce = randomToken(), verifier = randomToken(), cookie = randomToken();
    const redirectUrl = await this.identity.authorization({ state, nonce, verifier, surface: input.surface });
    this.store.cleanup(nowSeconds());
    this.store.db.prepare("INSERT INTO mobile_auth_flows VALUES(?,?,?,?,?,?,?,?,?)").run(
      digest(state), digest(cookie), seal(verifier, this.store.key), nonce, input.surface, returnTo, nowSeconds() + 600,
      input.native?.codeChallenge ?? null, input.native?.state ?? null);
    return { redirectUrl, flowCookie: this.flowCookieName + "=" + cookie + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" + (this.secure ? "; Secure" : "") };
  }
  async completeOnesa(input: { url: URL; flowCookie?: string | undefined }): Promise<AuthCompletion> {
    if (!this.identity || !this.config.onesa) throw new AuthError(503, "AUTH_NOT_CONFIGURED");
    const expected = new URL(this.config.onesa.redirectUri);
    if (input.url.origin !== expected.origin || input.url.pathname !== expected.pathname || input.url.hash) throw new AuthError(400, "AUTH_CALLBACK_INVALID");
    const state = input.url.searchParams.get("state"), cookie = cookieValue(input.flowCookie, this.flowCookieName);
    if (!state || !tokenPattern.test(state) || !cookie) throw new AuthError(400, "AUTH_FLOW_INVALID", "Start a new sign-in from this browser.");
    const flow = this.store.takeFlow(digest(state), digest(cookie), nowSeconds());
    if (!flow) throw new AuthError(400, "AUTH_FLOW_INVALID", "This sign-in has expired or was already used.");
    const { accessToken, subject } = await this.identity.exchange({
      url: input.url, state, nonce: flow.nonce, verifier: unseal(flow.verifier, this.store.key), surface: flow.surface,
    });
    const principal = await this.identity.inspect(accessToken);
    if (!principal || principal.subject !== subject || !surfaceMatches(principal.role, flow.surface)) throw new AuthError(403, "PRODUCT_ACCESS_REQUIRED");
    if (flow.surface === "staff" && (!principal.mfa || nowSeconds() - principal.authenticatedAt > 300)) throw new AuthError(403, "MFA_REQUIRED");
    const issue = this.issue(principal, flow.surface, null, accessToken);
    if (flow.native_challenge && flow.native_state) {
      const code = randomToken();
      this.store.db.prepare("INSERT INTO mobile_auth_handoffs VALUES(?,?,?,?,?)").run(digest(code), flow.native_challenge, flow.native_state, seal(issue.token, this.store.key), nowSeconds() + 60);
      const destination = new URL("onesamobile://auth/callback");
      destination.searchParams.set("code", code); destination.searchParams.set("state", flow.native_state);
      return { ...issue, returnTo: flow.return_to, clearFlowCookie: this.clearFlowCookie(), nativeRedirect: destination.href };
    }
    return { ...issue, returnTo: flow.return_to, clearFlowCookie: this.clearFlowCookie() };
  }
  async exchangeNative(input: { code: string; state: string; verifier: string }): Promise<AuthIssue> {
    if (!tokenPattern.test(input.code) || !tokenPattern.test(input.state) || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier)) throw new AuthError(400, "AUTH_NATIVE_INVALID");
    const hash = digest(input.code);
    const challenge = createHash("sha256").update(input.verifier).digest("base64url");
    const row = this.store.transaction(() => {
      const handoff = this.store.db.prepare("SELECT * FROM mobile_auth_handoffs WHERE code_hash=? AND expires_at>?").get(hash, nowSeconds()) as HandoffRow | undefined;
      if (!handoff || !constantEqual(handoff.challenge, challenge) || !constantEqual(handoff.state, input.state)) throw new AuthError(400, "AUTH_NATIVE_INVALID");
      this.store.db.prepare("DELETE FROM mobile_auth_handoffs WHERE code_hash=?").run(hash);
      return handoff;
    });
    const token = unseal(row.token, this.store.key);
    const session = await this.authenticate({ authorization: "Bearer " + token });
    if (!session) throw new AuthError(401, "SESSION_EXPIRED");
    return { token, session };
  }
}
