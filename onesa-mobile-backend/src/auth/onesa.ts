import type { DatabaseSync } from "node:sqlite";
import { ManagedAccess } from "./managed-access.ts";
import * as oidc from "openid-client";
import { AuthError, isRole, isStaff, type AuthPrincipal, type OnesaConfig, type Surface } from "./types.ts";

const MAX_RESPONSE = 65_536;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 32 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 80);
}

/** This validates a live Portal /session assertion, not a locally decoded JWT. */
export function validateOnesaAssertion(value: unknown, config: OnesaConfig, now: number): AuthPrincipal | null {
  if (!record(value)) throw new AuthError(503, "AUTH_PROVIDER_RESPONSE");
  if (value.active === false) return null;
  if (value.active !== true || value.iss !== config.issuer || value.aud !== config.clientId ||
      typeof value.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sub) ||
      value.email_verified !== true || typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 200 ||
      !Number.isSafeInteger(value.exp) || !Number.isSafeInteger(value.auth_time) ||
      (value.exp as number) <= now || (value.exp as number) > now + 28_800 ||
      (value.auth_time as number) <= 0 || (value.auth_time as number) > now ||
      now - (value.auth_time as number) >= 28_800 ||
      !stringList(value.amr) || !stringList(value.onesa_applications) || !value.onesa_applications.includes("mobile") ||
      !stringList(value.onesa_roles) || !record(value.onesa_product_roles) || !isRole(value.onesa_product_roles.mobile)) {
    throw new AuthError(401, "AUTH_PROVIDER_ASSERTION", "Your current Mobile access could not be verified.");
  }
  const role = value.onesa_product_roles.mobile;
  const mfa = value.amr.some((method) => method === "otp" || method === "mfa");
  if (isStaff(role) && !mfa) throw new AuthError(403, "MFA_REQUIRED", "Staff access requires authenticator verification.");
  return {
    subject: value.sub,
    displayName: value.name,
    role,
    source: "onesa",
    authenticatedAt: value.auth_time as number,
    mfa,
    expiresAt: value.exp as number,
  };
}

export function validateOnesaConfig(config: OnesaConfig, publicOrigin: string): void {
  const issuer = new URL(config.issuer), redirect = new URL(config.redirectUri);
  const validIssuer = config.audience === undefined
    ? issuer.pathname === "/api/v1/identity" && config.issuer === issuer.origin + issuer.pathname
    : config.issuer === issuer.origin + "/" && config.audience === "https://api.mobile.onesa.eu";
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash ||
      !validIssuer ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(config.clientId) || config.clientSecret.length < 48 || config.clientSecret.length > 256 ||
      redirect.protocol !== "https:" || redirect.origin !== publicOrigin || redirect.username || redirect.password || redirect.search || redirect.hash ||
      redirect.pathname !== "/api/v1/auth/onesa/callback") {
    throw new Error("Onesa identity configuration rejected.");
  }
}
async function bounded(response: Response): Promise<Response> {
  if (response.status >= 300 && response.status < 400) throw new AuthError(503, "AUTH_PROVIDER_REDIRECT");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE) throw new AuthError(503, "AUTH_PROVIDER_RESPONSE");
  const reader = response.body?.getReader();
  if (!reader) return response;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE) { await reader.cancel(); throw new AuthError(503, "AUTH_PROVIDER_RESPONSE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
}
export class OnesaIdentity {
  readonly config: OnesaConfig;
  private clientPromise: Promise<oidc.Configuration> | undefined;
  private readonly managed: ManagedAccess | undefined;
  constructor(config: OnesaConfig, db?: DatabaseSync) {
    this.config = config;
    if(config.audience) {
      if(!db) throw new Error("Managed Mobile access needs the product key cache.");
      this.managed=new ManagedAccess(config,db,async()=>bounded(await fetch(config.issuer+".well-known/jwks.json",{redirect:"error",signal:AbortSignal.timeout(5000)})));
    }
  }
  private endpoint(legacy:string,managed:string) {
    return this.config.audience ? new URL(managed,this.config.issuer).href : this.config.issuer+legacy;
  }
  private readonly safeFetch: oidc.CustomFetch = async (url, options) => {
    const allowed = [this.endpoint("/.well-known/openid-configuration",".well-known/openid-configuration"),this.endpoint("/token","oauth/token"),this.endpoint("/jwks",".well-known/jwks.json")];
    if (!allowed.includes(url)) throw new AuthError(503, "AUTH_PROVIDER_ENDPOINT");
    const { body, ...request } = options;
    return bounded(await fetch(url, { ...request, ...(body === undefined ? {} : { body }), redirect: "error", signal: options.signal ?? AbortSignal.timeout(5000) }));
  };
  async client(): Promise<oidc.Configuration> {
    if (!this.clientPromise) {
      this.clientPromise = oidc.discovery(
        new URL(this.config.issuer),
        this.config.clientId,
        { client_secret: this.config.clientSecret, id_token_signed_response_alg: "RS256" },
        oidc.ClientSecretBasic(this.config.clientSecret),
        { [oidc.customFetch]: this.safeFetch, timeout: 5, execute: [oidc.enableNonRepudiationChecks] },
      ).then((client) => {
        const metadata = client.serverMetadata();
        if (metadata.issuer !== this.config.issuer ||
            metadata.authorization_endpoint !== this.endpoint("/auth","authorize") ||
            metadata.token_endpoint !== this.endpoint("/token","oauth/token") ||
            metadata.jwks_uri !== this.endpoint("/jwks",".well-known/jwks.json") ||
            !metadata.code_challenge_methods_supported?.includes("S256") ||
            !metadata.token_endpoint_auth_methods_supported?.includes("client_secret_basic") ||
            !metadata.id_token_signing_alg_values_supported?.includes("RS256")) {
          throw new AuthError(503, "AUTH_PROVIDER_METADATA");
        }
        return client;
      }).catch(() => {
        this.clientPromise = undefined;
        throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "Onesa sign-in is temporarily unavailable.");
      });
    }
    return this.clientPromise;
  }
  async authorization(input: { state: string; nonce: string; verifier: string; surface: Surface }): Promise<string> {
    const client = await this.client();
    const parameters: Record<string, string> = {
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.managed ? "openid profile" : "openid email profile onesa",
      ...(this.config.audience ? {audience:this.config.audience}:{}),
      code_challenge: await oidc.calculatePKCECodeChallenge(input.verifier),
      code_challenge_method: "S256",
      state: input.state,
      nonce: input.nonce,
    };
    if (input.surface === "staff") { parameters.acr_values = this.managed ? "http://schemas.openid.net/pape/policies/2007/06/multi-factor" : "urn:onesa:mfa"; parameters.max_age = "300"; }
    return oidc.buildAuthorizationUrl(client, parameters).href;
  }
  async exchange(input: { url: URL; state: string; nonce: string; verifier: string; surface: Surface }): Promise<{ accessToken: string; subject: string }> {
    try {
      const tokens = await oidc.authorizationCodeGrant(await this.client(), input.url, {
        pkceCodeVerifier: input.verifier, expectedState: input.state, expectedNonce: input.nonce,
        idTokenExpected: true, ...(input.surface === "staff" ? { maxAge: 300 } : {}),
      });
      const claims = tokens.claims();
      if (!tokens.access_token || tokens.access_token.length < 16 || tokens.access_token.length > (this.managed ? 16_384 : 2048) ||
          tokens.token_type.toLowerCase() !== "bearer" || !claims?.sub) throw new Error("Token response rejected.");
      const subject=this.managed ? (await this.managed.verify(tokens.access_token,claims.sub)).subject : claims.sub;
      return { accessToken: tokens.access_token, subject };
    } catch {
      throw new AuthError(401, "AUTH_CALLBACK_REJECTED", "Onesa sign-in could not be completed. Start again.");
    }
  }
  private async request(path: "/session" | "/revoke", token: string): Promise<unknown> {
    try {
      const formComponent = (value: string) => new URLSearchParams({ value }).toString().slice(6);
      const authorization = "Basic " + Buffer.from(formComponent(this.config.clientId) + ":" + formComponent(this.config.clientSecret)).toString("base64");
      const response = await bounded(await fetch(this.config.issuer + path, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token }),
      }));
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Assertion unavailable.");
      return await response.json();
    } catch {
      throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "Current Onesa access cannot be verified. Try again later.");
    }
  }
  async inspect(token: string): Promise<AuthPrincipal | null> {
    if(this.managed) return this.managed.verify(token);
    return validateOnesaAssertion(await this.request("/session", token), this.config, Math.floor(Date.now() / 1000));
  }
  async revoke(token: string): Promise<void> {
    const result = await this.request("/revoke", token);
    if (!record(result) || result.ok !== true) throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE");
  }
}
