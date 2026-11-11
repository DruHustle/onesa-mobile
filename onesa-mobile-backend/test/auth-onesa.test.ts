import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { AuthService, AuthError, type AuthConfig } from "../src/auth/service.ts";
import { OnesaIdentity, validateOnesaAssertion, validateOnesaConfig } from "../src/auth/onesa.ts";
import type { OnesaConfig, Role, Surface } from "../src/auth/types.ts";

import { createPlatformServer } from "../src/platform/http.ts";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://account.example.invalid/api/v1/identity";
const publicOrigin = "https://mobile.example.invalid";
const client: OnesaConfig = { issuer, clientId: "synthetic_mobile_client", clientSecret: "synthetic-" + randomBytes(32).toString("hex") + "+%", redirectUri: publicOrigin + "/api/v1/auth/onesa/callback" };
const config = (): AuthConfig => ({ mode: "production", databasePath: ":memory:", publicOrigin, allowedOrigins: [publicOrigin], encryptionKey: randomBytes(32).toString("hex"), onesa: client });
const status = (value: number, code?: string) => (error: unknown) => error instanceof AuthError && error.status === value && (!code || error.code === code);
const token = () => randomBytes(32).toString("base64url");
function assertion(role: Role = "customer") {
  const now = Math.floor(Date.now() / 1000);
  return { active: true, iss: issuer, aud: client.clientId, sub: randomUUID(), email: "synthetic@example.invalid", email_verified: true, name: "Synthetic account", exp: now + 3600, auth_time: now, amr: role === "customer" ? ["pwd"] : ["pwd", "otp"], onesa_roles: [], onesa_applications: ["mobile"], onesa_product_roles: { mobile: role }, onesa_memberships: [] };
}
function metadata() {
  return { issuer, authorization_endpoint: issuer + "/auth", token_endpoint: issuer + "/token", jwks_uri: issuer + "/jwks", response_types_supported: ["code"], subject_types_supported: ["public"], grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["client_secret_basic"], id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] };
}
function jwt(payload: Record<string, unknown>, signatureKey = keys.privateKey): string {
  const encoded = Buffer.from(JSON.stringify({ alg: "RS256", kid: "synthetic_test_key", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + sign("RSA-SHA256", Buffer.from(encoded), signatureKey).toString("base64url");
}
async function mockProvider(role: Role, operation: (fixture: ReturnType<typeof setup>) => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const fixture = setup(role);
  globalThis.fetch = fixture.fetch;
  try { await operation(fixture); } finally { globalThis.fetch = original; fixture.auth.close(); }
}
function setup(role: Role) {
  const auth = new AuthService(config());
  const initial = assertion(role);
  const fixture = {
    auth, active: initial as Record<string, unknown>, query: new URLSearchParams(), accessToken: token(), sessionCalls: 0, tokenCalls: 0, revoked: false,
    invalidSignature: false, wrongNonce: false, unavailable: false, metadata: metadata(),
    fetch: async (input: string | URL | Request, options?: RequestInit): Promise<Response> => {
      const url = String(input);
      assert.equal(options?.redirect, "error");
      if (url === issuer + "/.well-known/openid-configuration") return Response.json(fixture.metadata);
      if (url === issuer + "/jwks") return Response.json({ keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "synthetic_test_key", alg: "RS256", use: "sig" }] });
      const headers = new Headers(options?.headers);
      const authorization = headers.get("authorization")!;
      assert.ok(authorization.startsWith("Basic "));
      assert.deepEqual(Buffer.from(authorization.slice(6), "base64").toString("utf8").split(":").map((value) => decodeURIComponent(value.replace(/\+/g, " "))), [client.clientId, client.clientSecret]);
      if (url === issuer + "/token") {
        fixture.tokenCalls++;
        const body = new URLSearchParams(options?.body as string);
        assert.equal(body.get("grant_type"), "authorization_code");
        assert.equal(body.get("redirect_uri"), client.redirectUri);
        assert.equal(createHash("sha256").update(body.get("code_verifier")!).digest("base64url"), fixture.query.get("code_challenge"));
        const idToken = jwt({ iss: issuer, aud: client.clientId, sub: initial.sub, iat: initial.auth_time, exp: initial.exp, auth_time: initial.auth_time, nonce: fixture.wrongNonce ? token() : fixture.query.get("nonce") }, fixture.invalidSignature ? generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey : keys.privateKey);
        return Response.json({ access_token: fixture.accessToken, token_type: "Bearer", expires_in: 3600, id_token: idToken });
      }
      assert.deepEqual(JSON.parse(String(options?.body)), { token: fixture.accessToken });
      if (url === issuer + "/session") {
        fixture.sessionCalls++;
        if (fixture.unavailable) return new Response("unavailable", { status: 503 });
        return Response.json(fixture.active);
      }
      if (url === issuer + "/revoke") { if (fixture.unavailable) return new Response("unavailable", { status: 503 }); fixture.revoked = true; return Response.json({ ok: true, all_sessions_revoked: false }); }
      throw new Error("Unexpected identity endpoint " + url);
    },
    start: async (surface: Surface = role === "customer" ? "customer" : "staff", native?: { codeChallenge: string; state: string }) => {
      const start = await auth.beginOnesa({ surface, ...(native ? { native } : {}) });
      fixture.query = new URL(start.redirectUrl).searchParams;
      const callback = new URL(client.redirectUri);
      callback.searchParams.set("code", "synthetic-authorization-code");
      callback.searchParams.set("state", fixture.query.get("state")!);
      return { ...start, callback };
    },
  };
  return fixture;
}

test("live Portal assertions reject other products, malformed scope, missing staff MFA and stale source time", () => {
  const valid = assertion(), now = Math.floor(Date.now() / 1000);
  assert.equal(validateOnesaAssertion(valid, client, now)?.role, "customer");
  assert.equal(validateOnesaAssertion({ active: false }, client, now), null);
  for (const overrides of [
    { iss: issuer + "/wrong" }, { aud: "another-client" }, { sub: "not-a-uuid" }, { email_verified: false },
    { onesa_applications: ["ai"] }, { onesa_product_roles: { ai: "admin" } }, { onesa_product_roles: { mobile: "owner" } },
    { exp: now }, { exp: now + 28801 }, { auth_time: now + 1 }, { auth_time: now - 28800 }, { amr: "otp" },
    { onesa_product_roles: { mobile: "finance" }, amr: ["pwd"] },
  ]) assert.throws(() => validateOnesaAssertion({ ...valid, ...overrides }, client, now), AuthError);
  assert.throws(() => validateOnesaAssertion("invalid", client, now), status(503));
  for (const invalid of [{ ...client, issuer: issuer + "/" }, { ...client, redirectUri: "https://other.example.invalid/api/v1/auth/onesa/callback" }, { ...client, clientId: "short" }, { ...client, clientSecret: "short" }]) assert.throws(() => validateOnesaConfig(invalid, publicOrigin));
});
test("actual OIDC code exchange validates signed identity and PKCE; access revalidates live grant each time", async () => {
  await mockProvider("operations", async (fixture) => {
    const start = await fixture.start();
    assert.equal(fixture.query.get("code_challenge_method"), "S256");
    assert.equal(fixture.query.get("acr_values"), "urn:onesa:mfa");
    assert.equal(fixture.query.get("max_age"), "300");
    assert.match(start.flowCookie, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const issue = await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    assert.equal(issue.session.role, "operations");
    assert.equal(issue.session.source, "onesa");
    assert.equal(issue.session.mfa, true);
    assert.equal(fixture.sessionCalls, 1);
    const stored = fixture.auth.store.sessionByHash(createHash("sha256").update(issue.token).digest("hex"))!;
    assert.equal(stored.onesa_access_token!.includes(fixture.accessToken), false);
    const headers = { authorization: "Bearer " + issue.token };
    assert.equal((await fixture.auth.authenticate(headers))?.role, "operations");
    fixture.active.onesa_product_roles = { mobile: "auditor" };
    assert.equal((await fixture.auth.authenticate(headers))?.role, "auditor");
    assert.equal(fixture.sessionCalls, 3);
    fixture.unavailable = true;
    await assert.rejects(fixture.auth.authenticate(headers), status(503));
    fixture.unavailable = false;
    fixture.active = { active: false };
    assert.equal(await fixture.auth.authenticate(headers), null);
    assert.equal(await fixture.auth.authenticate(headers), null);
  });
});
test("OIDC callbacks bind browser cookie and state, consume a flow once and reject nonce or signature changes", async () => {
  await mockProvider("customer", async (fixture) => {
    const start = await fixture.start();
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback }), status(400));
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback, flowCookie: fixture.auth.flowCookieName + "=" + token() }), status(400));
    assert.equal(fixture.tokenCalls, 0);
    await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie }), status(400));
    assert.equal(fixture.tokenCalls, 1);
  });
  for (const corrupt of ["wrongNonce", "invalidSignature"] as const) await mockProvider("customer", async (fixture) => {
    const start = await fixture.start(); fixture[corrupt] = true;
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie }), status(401, "AUTH_CALLBACK_REJECTED"));
    assert.equal(fixture.sessionCalls, 0);
    assert.equal(fixture.auth.store.db.prepare("SELECT count(*) AS n FROM mobile_auth_sessions").get()!.n, 0);
  });
});
test("expired flow, foreign metadata endpoint and absent Mobile access cannot issue a session", async () => {
  await mockProvider("customer", async (fixture) => {
    const start = await fixture.start();
    fixture.auth.store.db.exec("UPDATE mobile_auth_flows SET expires_at=0");
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie }), status(400));
  });
  await mockProvider("customer", async (fixture) => {
    fixture.metadata.token_endpoint = "https://foreign.example.invalid/token";
    await assert.rejects(fixture.start(), status(503));
  });
  await mockProvider("customer", async (fixture) => {
    const start = await fixture.start(); fixture.active.onesa_applications = ["ai"];
    await assert.rejects(fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie }), status(401));
  });
});
test("native authorization handoff exposes only a one-time code bound to native state and verifier", async () => {
  await mockProvider("customer", async (fixture) => {
    const verifier = token(), nativeState = token(), codeChallenge = createHash("sha256").update(verifier).digest("base64url");
    const start = await fixture.start("customer", { codeChallenge, state: nativeState });
    const issued = await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    const destination = new URL(issued.nativeRedirect!);
    assert.equal(destination.origin, "null");
    assert.equal(destination.protocol, "onesamobile:");
    assert.equal(destination.host, "auth");
    assert.equal(destination.pathname, "/callback");
    assert.equal(destination.href.includes(issued.token), false);
    assert.equal(destination.searchParams.get("state"), nativeState);
    const code = destination.searchParams.get("code")!;
    await assert.rejects(fixture.auth.exchangeNative({ code, state: nativeState, verifier: token() }), status(400));
    await assert.rejects(fixture.auth.exchangeNative({ code, state: token(), verifier }), status(400));
    const exchange = await fixture.auth.exchangeNative({ code, state: nativeState, verifier });
    assert.equal(exchange.token, issued.token);
    assert.equal(exchange.session.transport, "bearer");
    await assert.rejects(fixture.auth.exchangeNative({ code, state: nativeState, verifier }), status(400));
    const next = await fixture.start("customer", { codeChallenge, state: nativeState });
    const nextIssue = await fixture.auth.completeOnesa({ url: next.callback, flowCookie: next.flowCookie });
    fixture.auth.store.db.exec("UPDATE mobile_auth_handoffs SET expires_at=0");
    await assert.rejects(fixture.auth.exchangeNative({ code: new URL(nextIssue.nativeRedirect!).searchParams.get("code")!, state: nativeState, verifier }), status(400));
  });
});
test("central sign-out destroys local capability immediately and reports actual token revocation", async () => {
  await mockProvider("customer", async (fixture) => {
    const start = await fixture.start();
    const issued = await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    assert.deepEqual(await fixture.auth.logout(issued.session), { centralRevocation: "confirmed" });
    assert.equal(fixture.revoked, true);
    assert.equal(await fixture.auth.authenticate({ authorization: "Bearer " + issued.token }), null);
  });
});
test("a delayed Portal assertion cannot authorize a locally revoked session", async () => {
  await mockProvider("operations", async (fixture) => {
    const start = await fixture.start();
    const issued = await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    const headers = { authorization: "Bearer " + issued.token };
    let release!: () => void, inspected!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { inspected = resolve; });
    globalThis.fetch = async (input, options) => {
      const response = await fixture.fetch(input, options);
      if (String(input) === issuer + "/session") { inspected(); await held; }
      return response;
    };
    const pending = fixture.auth.authenticate(headers);
    await started;
    try {
      assert.deepEqual(await fixture.auth.logoutPresented(headers, {}), { centralRevocation: "confirmed" });
    } finally { release(); }
    assert.equal(await pending, null, "a positive assertion started before logout must not revive a deleted capability");
    assert.equal(await fixture.auth.authenticate(headers), null);
  });
});
test("Portal inspection enforces response size and timeout transport options", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, options) => {
    assert.equal(options?.redirect, "error"); assert.ok(options?.signal);
    return new Response("x".repeat(65537), { headers: { "Content-Type": "application/json" } });
  };
  try { await assert.rejects(new OnesaIdentity(client).inspect(token()), status(503)); } finally { globalThis.fetch = original; }
});


test("local sign-out remains available during issuer outage without bypassing cookie CSRF", async () => {
  await mockProvider("customer", async (fixture) => {
    const start = await fixture.start();
    const issued = await fixture.auth.completeOnesa({ url: start.callback, flowCookie: start.flowCookie });
    fixture.unavailable = true;
    await assert.rejects(fixture.auth.authenticate({ authorization: "Bearer " + issued.token }), status(503));
    const headers = { cookie: fixture.auth.cookie(issued.token) };
    await assert.rejects(fixture.auth.logoutPresented(headers, { origin: publicOrigin }), status(403));
    assert.ok(fixture.auth.store.sessionByHash(createHash("sha256").update(issued.token).digest("hex")));
    assert.deepEqual(await fixture.auth.logoutPresented(headers, { origin: publicOrigin, csrfToken: issued.session.csrfToken }), { centralRevocation: "unavailable" });
    assert.equal(await fixture.auth.authenticate({ authorization: "Bearer " + issued.token }), null);
  });
});


test("verified Portal customer can manage launch interest through production HTTP while provisioning remains held", async () => {
  const localFetch = globalThis.fetch;
  await mockProvider("customer", async fixture => {
    const { server } = createPlatformServer({
      mode: "production", databasePath: ":memory:", publicOrigin, allowedOrigins: [publicOrigin],
      host: "127.0.0.1", port: 0, trustedProxyIps: [], onesa: client,
      encryptionKey: randomBytes(32).toString("hex"),
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const base = "http://127.0.0.1:" + address.port;
      const start = await localFetch(base + "/v1/auth/onesa/start?surface=customer", { redirect: "manual" });
      assert.equal(start.status, 302);
      const authorization = new URL(start.headers.get("location")!);
      assert.equal(authorization.origin + authorization.pathname, issuer + "/auth");
      fixture.query = authorization.searchParams;
      const callbackQuery = new URLSearchParams({ code: "synthetic-code", state: fixture.query.get("state")! });
      const callback = await localFetch(base + "/v1/auth/onesa/callback?" + callbackQuery, {
        redirect: "manual", headers: { Cookie: start.headers.getSetCookie()[0]!.split(";")[0]! },
      });
      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get("location"), "/account/");
      const sessionCookie = callback.headers.getSetCookie().find(cookie => cookie.startsWith("__Host-onesa_mobile_session="));
      assert.ok(sessionCookie);
      assert.match(sessionCookie, /; Secure/);
      const cookie = sessionCookie.split(";")[0]!;
      const session = await localFetch(base + "/v1/session", { headers: { Cookie: cookie } });
      assert.equal(session.status, 200);
      const discovery = z.object({ mode: z.string(), user: z.object({ source: z.string() }), csrfToken: z.string().min(1) }).parse(await session.json());
      assert.equal(discovery.mode, "production");
      assert.equal(discovery.user.source, "onesa");
      const account = async () => {
        const response = await localFetch(base + "/v1/me", { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        return z.object({
          launchInterest: z.object({ state: z.string(), revision: z.number().int().positive() }).nullable(),
          status: z.object({ capabilities: z.object({ launchInterest: z.boolean() }) }),
          network: z.object({ state: z.string() }), applications: z.array(z.unknown()), ledger: z.array(z.unknown()),
        }).parse(await response.json());
      };
      const before = await account();
      assert.equal(before.launchInterest, null);
      assert.equal(before.status.capabilities.launchInterest, true);
      const send = (path: string, body: unknown) => localFetch(base + path, {
        method: "POST", headers: { Cookie: cookie, Origin: publicOrigin, "X-CSRF-Token": discovery.csrfToken,
          "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify(body),
      });
      const registered = await send("/v1/account/launch-interest", { interested: true, revision: 0 });
      assert.equal(registered.status, 200);
      const saved = (await account()).launchInterest;
      assert.ok(saved);
      assert.equal(saved.state, "registered");
      const application = await send("/v1/applications", {});
      assert.equal(application.status, 503);
      assert.deepEqual(z.object({ error: z.object({ code: z.string() }) }).parse(await application.json()).error, { code: "COMMERCIAL_SERVICE_UNAVAILABLE" });
      const withdrawn = await send("/v1/account/launch-interest", { interested: false, revision: saved.revision });
      assert.equal(withdrawn.status, 200);
      const after = await account();
      assert.equal(after.launchInterest?.state, "withdrawn");
      assert.equal(after.network.state, "not_provisioned");
      assert.deepEqual(after.applications, []);
      assert.deepEqual(after.ledger, []);
      fixture.active = { active: false };
      assert.equal((await localFetch(base + "/v1/me", { headers: { Cookie: cookie } })).status, 401);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
