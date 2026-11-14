import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { DatabaseSync } from "node:sqlite";
import {
  AuthError,
  isRole,
  isStaff,
  type AuthPrincipal,
  type OnesaConfig,
} from "./types.ts";

const namespace = "https://onesa.eu/claims/";
const MAX_CACHE_AGE = 86_400;
const stableId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type CachedKeys = { keys: JSONWebKeySet; updated: number };

// One issuer-bound, bounded, persisted public-key cache per API instance.
export class ManagedAccess {
  private readonly config: OnesaConfig;
  private readonly db: DatabaseSync;
  private readonly loadKeys: () => Promise<Response>;
  private cache: CachedKeys | undefined;
  private attempt = -Infinity;
  private pending: Promise<boolean> | undefined;
  constructor(
    config: OnesaConfig,
    db: DatabaseSync,
    loadKeys: () => Promise<Response>,
  ) {
    this.config = config;
    this.db = db;
    this.loadKeys = loadKeys;
    db.exec(
      "CREATE TABLE IF NOT EXISTS mobile_provider_keys (issuer TEXT PRIMARY KEY, jwks TEXT NOT NULL, updated INTEGER NOT NULL) STRICT",
    );
    const row = db
      .prepare("SELECT jwks,updated FROM mobile_provider_keys WHERE issuer=?")
      .get(config.issuer);
    if (typeof row?.jwks === "string" && typeof row.updated === "number") {
      this.cache = { keys: JSON.parse(row.jwks), updated: row.updated };
    }
  }
  private async refresh(now: number) {
    if (this.pending) return this.pending;
    if (now - this.attempt < 5) return false;
    this.attempt = now;
    this.pending = (async () => {
      try {
        const response = await this.loadKeys();
        if (!response.ok) return false;
        const data = (await response.json()) as JSONWebKeySet;
        if (!Array.isArray(data.keys) || data.keys.length > 64) return false;
        const keys = {
          keys: data.keys.filter(
            (k) =>
              k.kty === "RSA" &&
              (!k.use || k.use === "sig") &&
              (!k.alg || k.alg === "RS256") &&
              typeof k.kid === "string" &&
              !k.d,
          ),
        };
        this.db
          .prepare(
            "INSERT INTO mobile_provider_keys VALUES(?,?,?) ON CONFLICT(issuer) DO UPDATE SET jwks=excluded.jwks,updated=excluded.updated",
          )
          .run(this.config.issuer, JSON.stringify(keys), now);
        this.cache = { keys, updated: now };
        return true;
      } catch {
        return false;
      }
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  async verify(
    token: string,
    expectedSubject?: string,
  ): Promise<AuthPrincipal> {
    const now = Math.floor(Date.now() / 1000);
    if (token.length > 16_384)
      throw new AuthError(401, "AUTH_PROVIDER_ASSERTION");
    if (!this.cache || now - this.cache.updated >= 300) await this.refresh(now);
    const verify = async () => {
      const cached = this.cache;
      if (
        !cached ||
        now < cached.updated ||
        now - cached.updated >= MAX_CACHE_AGE
      )
        throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE");
      return jwtVerify(token, createLocalJWKSet(cached.keys), {
        issuer: this.config.issuer,
        audience: this.config.audience!,
        algorithms: ["RS256"],
        requiredClaims: ["sub", "exp", "iat"],
      });
    };
    try {
      let result;
      try {
        result = await verify();
      } catch (error) {
        if (
          (error as { code?: string }).code !== "ERR_JWKS_NO_MATCHING_KEY" ||
          !(await this.refresh(now))
        )
          throw error;
        result = await verify();
      }
      const p = result.payload,
        uid = p[namespace + "user_id"],
        products = p[namespace + "products"],
        roles = p[namespace + "roles"];
      if (
        !p.sub ||
        (expectedSubject !== undefined && p.sub !== expectedSubject) ||
        typeof uid !== "string" ||
        !stableId.test(uid) ||
        !Array.isArray(products) ||
        !products.includes("mobile") ||
        !Array.isArray(roles) ||
        roles.length !== 1 ||
        !isRole(roles[0]) ||
        !Number.isSafeInteger(p.exp) ||
        !Number.isSafeInteger(p.iat) ||
        p.iat! > now ||
        p.exp! <= p.iat! ||
        p.exp! - p.iat! > 300
      )
        throw new AuthError(401, "AUTH_PROVIDER_ASSERTION");
      const factor = p[namespace + "mfa_time"];
      const mfa =
        typeof factor === "number" &&
        Number.isSafeInteger(factor) &&
        factor > 0 &&
        factor <= now;
      if (isStaff(roles[0]) && !mfa) throw new AuthError(403, "MFA_REQUIRED");
      return {
        subject: uid,
        displayName: "Onesa account",
        source: "onesa",
        role: roles[0],
        authenticatedAt: mfa ? factor : p.iat!,
        mfa,
        expiresAt: p.exp!,
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(401, "AUTH_PROVIDER_ASSERTION");
    }
  }
}
