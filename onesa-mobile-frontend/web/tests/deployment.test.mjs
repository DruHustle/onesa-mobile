import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import unavailable from "../api/unavailable.mjs";

import { accountRoutes, config as deployedConfiguration } from "../vercel.mjs";

const configuration = { ...deployedConfiguration, rewrites: deployedConfiguration.rewrites.filter(rule => !rule.has) };
// The selected sources are literal paths and regular-expression groups only;
// they deliberately contain no named parameters, substitutions or host rules.
const matches = (source, path) => new RegExp(`^(?:${source})$`).test(path);
const rewrite = (path) =>
  configuration.rewrites.find((rule) => matches(rule.source, path))?.destination;
function headers(path) {
  const result = new Headers();
  for (const rule of configuration.headers) {
    if (matches(rule.source, path)) {
      for (const header of rule.headers) result.set(header.key, header.value);
    }
  }
  return result;
}

test("API reads, health, authentication and mutations fail closed without a backend", async () => {
  for (const [method, path] of [
    ["GET", "/api"],
    ["GET", "/api/healthz"],
    ["GET", "/api/v1/session"],
    ["GET", "/api/v1/auth/onesa/callback?code=private-code&state=private-state"],
    ["POST", "/api/v1/session/login"],
    ["POST", "/api/v1/applications"],
    ["PUT", "/api/v1/ops/assets/example"],
    ["PATCH", "/api/v1/ops/assets/example"],
    ["DELETE", "/api/v1/account"],
    ["OPTIONS", "/api/v1/session"],
  ]) {
    const response = unavailable.fetch(new Request(`https://mobile.onesa.eu${path}`, { method }));
    assert.equal(response.status, 503, `${method} ${path}`);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    const value = await response.json();
    assert.equal(value.error.code, "BACKEND_NOT_CONNECTED");
    assert.match(value.error.message, /not connected/);
    assert.deepEqual(Object.keys(value), ["error"]);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"])
      assert.match(response.headers.get(name), /no-store/);
  }
});

test("HEAD reports the same unavailability without a body", async () => {
  const response = unavailable.fetch(new Request("https://mobile.onesa.eu/api/healthz", { method: "HEAD" }));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("the holding function does not inspect credentials, query strings or bodies", async (t) => {
  const forward = t.mock.method(globalThis, "fetch", () => { throw Error("No upstream request is permitted"); });
  const request = new Proxy({ method: "POST" }, {
    get(target, key) {
      if (key !== "method") throw Error(`Request property must not be read: ${String(key)}`);
      return target.method;
    },
  });
  const response = unavailable.fetch(request);
  assert.equal(response.status, 503);
  assert.equal(forward.mock.callCount(), 0);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal((await response.json()).error.code, "BACKEND_NOT_CONNECTED");
});

test("API paths resolve to the holding function and never to an HTML shell", () => {
  for (const path of ["/api", "/api/", "/api/healthz", "/api/v1/status", "/api/v1/session", "/api/v1/auth/onesa/start", "/api/v1/auth/onesa/callback", "/api/v1/documents/example.pdf", "/api/unavailable"])
    assert.equal(rewrite(path), "/api/unavailable", path);
  for (const path of ["/account", "/account/", "/account/profile", "/internal", "/internal/", "/internal/hardware", "/preview", "/preview/", "/preview/internal/"])
    assert.equal(rewrite(path), "/index.html", path);
  for (const path of ["/", "/index.html", "/assets/app.js", "/apiary", "/accounting", "/missing-page"])
    assert.equal(rewrite(path), undefined, path);
  assert.ok(configuration.rewrites.every((rule) => rule.destination.startsWith("/") && !rule.destination.startsWith("//")));
});

test("only a configured production domain forwards account requests to its Mobile gateway", () => {
  const gateway = "https://mobile-gateway.onesa.eu";
  assert.deepEqual(accountRoutes({ VERCEL_ENV: "production" }), []);
  for (const environment of ["preview", "development", undefined]) {
    assert.deepEqual(accountRoutes({ VERCEL_ENV: environment, MOBILE_ACCOUNT_GATEWAY_ORIGIN: gateway }), []);
  }
  const rules = accountRoutes({ VERCEL_ENV: "production", MOBILE_ACCOUNT_GATEWAY_ORIGIN: gateway + "/" });
  assert.deepEqual(rules, [
    { source: "/api", has: [{ type: "host", value: { eq: "mobile.onesa.eu" } }], destination: gateway + "/api/" },
    { source: "/api/:path(.*)", has: [{ type: "host", value: { eq: "mobile.onesa.eu" } }], destination: gateway + "/api/:path" },
  ]);
  for (const invalid of ["https://mobile.onesa.eu", "http://mobile-gateway.onesa.eu", "https://wrong.example",
    "https://onesa.eu.wrong.example", gateway + ":8443", gateway + "/api", gateway + "/?next=1",
    gateway + "/#test", "https://user@mobile-gateway.onesa.eu"]) {
    assert.throws(() => accountRoutes({ VERCEL_ENV: "production", MOBILE_ACCOUNT_GATEWAY_ORIGIN: invalid }));
  }
});

test("private shells and API responses cannot be cached or indexed; hashed assets stay cacheable", () => {
  for (const path of ["/account", "/account/", "/internal", "/internal/", "/preview", "/preview/internal/", "/api", "/api/v1/session"])
    assert.match(headers(path).get("x-robots-tag"), /noindex/);
  for (const path of ["/", "/index.html", "/account/", "/internal/", "/preview/internal/", "/api/healthz"])
    for (const name of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"])
      assert.match(headers(path).get(name), /no-store/, `${path}: ${name}`);
  const asset = headers("/assets/index-123abc.js");
  assert.match(asset.get("cache-control"), /immutable/);
  assert.equal(asset.has("cdn-cache-control"), false);
  assert.equal(asset.has("vercel-cdn-cache-control"), false);
  assert.equal(headers("/").has("x-robots-tag"), false);
  for (const path of ["/", "/account/", "/api/healthz", "/assets/index-123abc.js"]) {
    const selected = headers(path);
    assert.equal(selected.get("x-content-type-options"), "nosniff");
    assert.equal(selected.get("x-frame-options"), "DENY");
    assert.match(selected.get("content-security-policy"), /connect-src 'self'/);
    assert.match(selected.get("content-security-policy"), /frame-ancestors 'none'/);
  }
});

test("public metadata names the exact Mobile domain without implying a live network", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /rel="canonical" href="https:\/\/mobile\.onesa\.eu\/"/);
  assert.match(html, /property="og:url" content="https:\/\/mobile\.onesa\.eu\/"/);
  assert.match(html, /Development preview only\./);
  assert.equal(configuration.framework, "vite");
  assert.equal(configuration.outputDirectory, "dist");
});
