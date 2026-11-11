import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { get } from "node:http";
import { test } from "node:test";
import { OnesaIdentity } from "../src/auth/onesa.ts";
import { AuthError } from "../src/auth/service.ts";
import { createPlatformServer } from "../src/platform/http.ts";

test("interactive sign-in failures offer workspace recovery without exposing handoff data", async t => {
  const publicOrigin = "https://mobile.example.invalid";
  const { server } = createPlatformServer({
    mode: "production", databasePath: ":memory:", host: "127.0.0.1", port: 0,
    publicOrigin, allowedOrigins: [publicOrigin], trustedProxyIps: [],
    encryptionKey: randomBytes(32).toString("hex"),
    onesa: {
      issuer: "https://account.example.invalid/api/v1/identity",
      clientId: "synthetic_mobile_client", clientSecret: randomBytes(32).toString("hex"),
      redirectUri: publicOrigin + "/api/v1/auth/onesa/callback",
    },
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  async function navigate(path: string, headers: Record<string, string> = {}) {
    const reply = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      get(base + path, { headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Sec-Fetch-Mode": "navigate", ...headers } }, resolve)
        .on("error", reject);
    });
    const body = await reply.setEncoding("utf8").toArray();
    return { status: reply.statusCode, headers: reply.headers, body: body.join("") };
  }
  const start = "/v1/auth/onesa/start";
  const callback = "/v1/auth/onesa/callback";
  const authorization = t.mock.method(OnesaIdentity.prototype, "authorization", async ({ state }: { state: string }) =>
    "https://account.example.invalid/auth?state=" + state);
  t.mock.method(OnesaIdentity.prototype, "exchange", async () => { throw new AuthError(401, "AUTH_CALLBACK_REJECTED"); });
  const nativeState = randomBytes(32).toString("base64url");
  const begin = await navigate(start + "?surface=customer&state=" + nativeState + "&codeChallenge=" + randomBytes(32).toString("base64url"));
  assert.equal(begin.status, 302);
  const state = new URL(begin.headers.location!).searchParams.get("state")!;
  const sent = new URLSearchParams({ state, error: "access_denied", error_description: "private-provider-detail", returnTo: "https://external.invalid" });
  const denied = await navigate(callback + "?" + sent, { Cookie: begin.headers["set-cookie"]![0]!.split(";")[0]! });
  assert.equal(denied.status, 401);
  assert.match(denied.headers["content-type"]!, /text\/html/);
  assert.equal(denied.headers["referrer-policy"], "no-referrer");
  assert.equal(denied.headers["cache-control"], "no-store");
  assert.match(String(denied.headers["content-security-policy"]), /default-src 'none'/);
  assert.match(denied.body, /href="\/account\/"/);
  assert.match(denied.body, /href="\/internal\/"/);
  assert.match(denied.body, /return to the app/);
  assert.doesNotMatch(denied.body, /private-provider-detail|external\.invalid|onesamobile:\/\/|<script/i);
  assert.ok(!denied.body.includes(state) && !denied.body.includes(nativeState));
  assert.equal(denied.headers.location, undefined);
  assert.equal(denied.headers["set-cookie"], undefined);
  const replay = await navigate(callback + "?" + sent, { Accept: "application/json", Cookie: begin.headers["set-cookie"]![0]!.split(";")[0]! });
  assert.equal(replay.status, 400);
  assert.equal(JSON.parse(replay.body).error.code, "AUTH_FLOW_INVALID");
  authorization.mock.mockImplementation(async () => { throw new AuthError(503, "AUTH_PROVIDER_UNAVAILABLE"); });
  const unavailable = await navigate(start + "?surface=staff");
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.body, /try again later/);
  const api = await navigate(start, { Accept: "*/*" });
  assert.equal(JSON.parse(api.body).error.code, "AUTH_PROVIDER_UNAVAILABLE");
  const other = await navigate("/v1/me");
  assert.match(other.headers["content-type"]!, /application\/json/);
});
