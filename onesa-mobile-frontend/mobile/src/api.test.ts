import test from "node:test";
import assert from "node:assert/strict";
import {
  apiBase,
  base64Url,
  callbackParameters,
  compactCache,
  request,
} from "./api.ts";
test("production API configuration refuses cleartext, credentials and arbitrary paths", () => {
  assert.equal(apiBase(undefined, false), null);
  assert.equal(
    apiBase("https://mobile.example.test/api/", false),
    "https://mobile.example.test/api",
  );
  for (const url of [
    "http://mobile.example.test/api",
    "https://user:secret@example.test/api",
    "https://example.test/other",
    "https://example.test/api?token=secret",
  ])
    assert.throws(() => apiBase(url, false));
  assert.equal(
    apiBase("http://192.168.1.20:4000", true),
    "http://192.168.1.20:4000",
  );
  assert.throws(() => apiBase("http://192.168.1.20:4000", false));
});
test("native sign-in validates exact callback, random state and single code", () => {
  const state = "s".repeat(43),
    code = "c".repeat(43),
    url = `onesamobile://auth/callback?state=${state}&code=${code}`;
  assert.deepEqual(callbackParameters(url, state), { state, code });
  assert.throws(() => callbackParameters(url, "other"));
  assert.throws(() => callbackParameters(url + "&code=" + code, state));
  assert.throws(() =>
    callbackParameters(url.replace("onesamobile:", "https:"), state),
  );
  for (const invalid of [
    url.replace("//auth", "//user@auth"),
    url.replace("//auth", "//auth:444"),
    url + "&extra=value",
  ])
    assert.throws(() => callbackParameters(invalid, state));
  for (const n of [1, 2, 3, 32, 65]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => i);
    assert.equal(base64Url(bytes), Buffer.from(bytes).toString("base64url"));
  }
});
test("offline cache excludes support text, payments and account secrets", () => {
  const cached = compactCache({
    profile: { subject: "test", displayName: "Test" },
    applications: [],
    tickets: [
      {
        id: "x",
        revision: 1,
        createdAt: "test",
        message: "private support text",
      },
    ],
    ledger: [],
    requests: [],
    network: { state: "not_provisioned", usage: null, lastMeasuredAt: null },
    status: {
      mode: "lab",
      productionReady: false,
      commercialSalesEnabled: false,
    },
  });
  assert.equal(JSON.stringify(cached).includes("private support text"), false);
  assert.ok("savedAt" in cached);
});
test("client reports provider errors and does not convert failures into success", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "PROVIDER_NOT_COMMISSIONED",
            message: "No service activated",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    await assert.rejects(request("https://example.test", "/v1/activations"), {
      code: "PROVIDER_NOT_COMMISSIONED",
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("development cleartext permission is limited to actual private IPs, not similarly named domains", () => {
  for (const host of [
    "10.attacker.example",
    "192.168.attacker.example",
    "172.16.attacker.example",
  ])
    assert.throws(() => apiBase("http://" + host, true));
  assert.equal(
    apiBase("http://10.20.30.40:4000", true),
    "http://10.20.30.40:4000",
  );
});
