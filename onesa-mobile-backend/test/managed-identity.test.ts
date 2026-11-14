import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SignJWT, type JWTPayload } from "jose";
import { AuthService, type AuthConfig } from "../src/auth/service.ts";
import { ManagedAccess } from "../src/auth/managed-access.ts";

const issuer = "https://authority.example.test/";
const origin = "https://mobile.example.test";
const audience = "https://api.mobile.onesa.eu";
const scope = "https://onesa.eu/claims/";
const config = {
  issuer,
  audience,
  clientId: "synthetic_mobile_client",
  clientSecret: randomBytes(48).toString("hex"),
  redirectUri: origin + "/api/v1/auth/onesa/callback",
};
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = {
  keys: [
    {
      ...keys.publicKey.export({ format: "jwk" }),
      kid: "fixture",
      alg: "RS256",
      use: "sig",
    },
  ],
};
const uid = randomUUID(),
  subject = "provider|controlled-test";
const jwt = (payload: JWTPayload) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .sign(keys.privateKey);
const access = (extra: JWTPayload = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt({
    iss: issuer,
    aud: audience,
    sub: subject,
    iat: now,
    exp: now + 180,
    [scope + "user_id"]: uid,
    [scope + "roles"]: ["customer"],
    [scope + "products"]: ["mobile"],
    ...extra,
  });
};
test("managed Mobile web callback returns to its section, retains the stable account and reads its session after an offline API restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "onesa-mobile-oidc-"));
  const options: AuthConfig = {
    mode: "production",
    publicOrigin: origin,
    allowedOrigins: [origin],
    encryptionKey: randomBytes(32).toString("hex"),
    databasePath: join(root, "accounts.sqlite"),
    onesa: config,
  };
  let auth = new AuthService(options),
    online = true,
    query = new URLSearchParams();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (!online) throw new Error("Synthetic issuer offline");
    const url = new URL(String(input));
    if (url.pathname === "/.well-known/openid-configuration")
      return Response.json({
        issuer,
        authorization_endpoint: issuer + "authorize",
        token_endpoint: issuer + "oauth/token",
        jwks_uri: issuer + ".well-known/jwks.json",
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
      });
    if (url.pathname === "/.well-known/jwks.json") return Response.json(jwks);
    assert.equal(url.pathname, "/oauth/token");
    assert.match(String(init?.body), /code_verifier=/);
    const now = Math.floor(Date.now() / 1000);
    const id = await jwt({
      iss: issuer,
      aud: config.clientId,
      sub: subject,
      nonce: query.get("nonce"),
      iat: now,
      exp: now + 180,
    });
    return Response.json({
      token_type: "Bearer",
      id_token: id,
      access_token: await access(),
    });
  };
  try {
    const start = await auth.beginOnesa({
      surface: "customer",
      section: "help",
    });
    query = new URL(start.redirectUrl).searchParams;
    assert.equal(new URL(start.redirectUrl).pathname, "/authorize");
    assert.equal(query.get("audience"), audience);
    assert.equal(query.get("code_challenge_method"), "S256");
    const callback = new URL(config.redirectUri);
    callback.search = new URLSearchParams({
      code: "controlled",
      state: query.get("state")!,
    }).toString();
    const result = await auth.completeOnesa({
      url: callback,
      flowCookie: start.flowCookie,
    });
    assert.equal(result.returnTo, "/account/#help");
    assert.equal(result.session.subject, uid);
    const verifier = randomBytes(32).toString("base64url"),
      nativeState = randomBytes(32).toString("base64url");
    const handoff = await auth.beginOnesa({
      surface: "customer",
      native: {
        state: nativeState,
        codeChallenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      },
    });
    query = new URL(handoff.redirectUrl).searchParams;
    callback.search = new URLSearchParams({
      code: "synthetic-native",
      state: query.get("state")!,
    }).toString();
    const finished = await auth.completeOnesa({
      url: callback,
      flowCookie: handoff.flowCookie,
    });
    const redirect = new URL(finished.nativeRedirect!);
    assert.equal(redirect.protocol, "onesamobile:");
    const code = redirect.searchParams.get("code")!;
    const nativeSession = await auth.exchangeNative({
      code,
      state: nativeState,
      verifier,
    });
    assert.equal(nativeSession.session.subject, uid);
    await assert.rejects(
      auth.exchangeNative({ code, state: nativeState, verifier }),
    );
    auth.close();
    online = false;
    auth = new AuthService(options);
    const session = await auth.authenticate({
      cookie: "__Host-onesa_mobile_session=" + result.token,
    });
    assert.equal(session?.subject, uid);
    assert.equal(session?.role, "customer");
    await assert.rejects(
      auth.beginOnesa({ surface: "staff" }),
      (e: unknown) => (e as { status: number }).status === 503,
    );
    assert.equal(
      (await auth.logout(session!)).centralRevocation,
      "not_applicable",
    );
    assert.equal(
      await auth.authenticate({
        cookie: "__Host-onesa_mobile_session=" + result.token,
      }),
      null,
    );
  } finally {
    globalThis.fetch = original;
    auth.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("managed Mobile checks its dedicated audience, stable subject, factor proof, expiry and requested surface", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const service = new ManagedAccess(config, db, async () =>
      Response.json(jwks),
    );
    const now = Math.floor(Date.now() / 1000);
    for (const invalid of [
      { aud: "other" },
      { sub: "wrong" },
      { exp: now - 1 },
      { exp: now + 2000 },
      { [scope + "roles"]: ["viewer"] },
      { [scope + "user_id"]: "email@example.test" },
      { [scope + "products"]: ["farmer"] },
    ])
      await assert.rejects(service.verify(await access(invalid), subject));
    await assert.rejects(
      service.verify(await access({ [scope + "roles"]: ["support"] })),
      (e: unknown) => (e as { status: number }).status === 403,
    );
    const support = await service.verify(
      await access({
        [scope + "roles"]: ["support"],
        [scope + "mfa_time"]: now - 12,
      }),
    );
    assert.equal(support.mfa, true);
    assert.equal(support.authenticatedAt, now - 12);
    assert.equal(support.subject, uid);
  } finally {
    db.close();
  }
});
