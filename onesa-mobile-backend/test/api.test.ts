import assert from "node:assert/strict";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createAppServer } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { catalog as catalogFixture, demoAccount as demoAccountFixture, readiness as readinessFixture } from "../src/fixtures.ts";

interface ErrorEnvelope { error: { code: string; message: string } }

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

describe("read-only prelaunch API", () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = createAppServer(loadConfig({}));
    baseUrl = await listen(server);
  });
  after(async () => { await close(server); });

  it("distinguishes process health from readiness to sell telecom service", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      mode: "demo", serviceStatus: "prelaunch", status: "ok",
      service: "onesa-mobile-backend", productionReady: false,
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  });

  it("returns proposed plans without prices, real quotas or an activation offer", async () => {
    const response = await fetch(`${baseUrl}/v1/catalog`);
    const body = await response.json() as typeof catalogFixture;
    assert.equal(response.status, 200);
    assert.equal(body.mode, "demo");
    assert.deepEqual(body.plans.map((plan: { id: string }) => plan.id), ["everyday", "reach", "family-farm"]);
    for (const plan of body.plans) {
      assert.equal(plan.price, null);
      assert.equal(plan.allowance, null);
      assert.equal(plan.status, "proposed");
      assert.equal(plan.activationAvailable, false);
    }
  });

  it("keeps every production feature unavailable", async () => {
    const body = await (await fetch(`${baseUrl}/v1/readiness`)).json() as typeof readinessFixture;
    assert.equal(body.productionReady, false);
    assert.deepEqual(body.enabledTransports, []);
    assert.deepEqual(Object.keys(body.features).sort(), ["activation", "cellular", "identity", "payments", "satellite"]);
    for (const feature of Object.values(body.features) as { available: boolean; status: string }[]) {
      assert.equal(feature.available, false);
      assert.equal(feature.status, "provider_pending");
    }
  });

  it("labels all account and usage data as fictional and provides no real contact details", async () => {
    const response = await fetch(`${baseUrl}/v1/demo/account`);
    const body = await response.json() as typeof demoAccountFixture;
    assert.equal(response.status, 200);
    assert.equal(body.fictional, true);
    assert.equal(body.account.displayName, "Demo customer");
    assert.equal(body.account.subscriptionStatus, "not_activated");
    assert.equal(body.usage.source, "fictional_fixture");
    assert.equal(body.usage.illustrationOnly, true);
    assert.equal(body.usage.lastUpdated, null);
    assert.equal("email" in body.account, false);
    assert.equal("phone" in body.account, false);
    assert.equal(body.activationAvailable, false);
    assert.equal(body.paymentAvailable, false);
  });

  for (const path of ["/v1/activations", "/v1/payments", "/v1/auth"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      it(`rejects ${method} ${path} before interpreting any submitted body`, async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: '{"unparsed_sentinel": "DO_NOT_ECHO_THIS", this is invalid JSON',
        });
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("connection"), "close");
        const text = await response.text();
        assert.equal(text.includes("DO_NOT_ECHO_THIS"), false);
        assert.equal(JSON.parse(text).error.code, "SERVICE_NOT_READY");
      });
    }
  }

  it("allows only the exact configured browser origin without credentials or wildcard CORS", async () => {
    const allowed = await fetch(`${baseUrl}/v1/catalog`, { headers: { Origin: "http://localhost:5173" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(allowed.headers.get("access-control-allow-credentials"), null);
    assert.equal(allowed.headers.get("vary"), "Origin");

    for (const origin of ["https://unknown.example", "http://localhost:5173.evil.example", "null", "http://127.0.0.1:5173"]) {
      const denied = await fetch(`${baseUrl}/v1/catalog`, { headers: { Origin: origin } });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
      assert.equal((await denied.json() as ErrorEnvelope).error.code, "ORIGIN_NOT_ALLOWED");
    }
    const serverRequest = await fetch(`${baseUrl}/v1/catalog`);
    assert.equal(serverRequest.status, 200);
    assert.equal(serverRequest.headers.get("access-control-allow-origin"), null);
  });

  it("accepts only a valid read-only CORS preflight", async () => {
    const response = await fetch(`${baseUrl}/v1/catalog`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "accept, content-type" },
    });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");

    const wrongMethod = await fetch(`${baseUrl}/v1/catalog`, {
      method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(wrongMethod.status, 405);

    const wrongHeader = await fetch(`${baseUrl}/v1/catalog`, {
      method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Headers": "authorization" },
    });
    assert.equal(wrongHeader.status, 400);
    assert.equal((await wrongHeader.json() as ErrorEnvelope).error.code, "HEADER_NOT_ALLOWED");
  });

  it("does not advertise a usable activation preflight", async () => {
    const response = await fetch(`${baseUrl}/v1/activations`, {
      method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("access-control-allow-methods"), null);
  });

  it("routes unsupported methods and unknown paths distinctly", async () => {
    const readonly = await fetch(`${baseUrl}/v1/catalog`, { method: "POST", body: "ignored" });
    assert.equal(readonly.status, 405);
    assert.equal(readonly.headers.get("allow"), "GET, HEAD, OPTIONS");
    const missing = await fetch(`${baseUrl}/v1/not-a-resource`);
    assert.equal(missing.status, 404);
    const blockedRead = await fetch(`${baseUrl}/v1/payments`);
    assert.equal(blockedRead.status, 405);
  });

  it("supports HEAD without returning the fixture body", async () => {
    const response = await fetch(`${baseUrl}/v1/catalog`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get("content-length")) > 0);
    assert.equal(await response.text(), "");
  });

  it("rejects query strings, encoded paths and overlong request targets", async () => {
    for (const path of ["/v1/catalog?secret=should-not-be-accepted", "/v1/%63atalog", "/v1//catalog"]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.equal(body.includes("should-not-be-accepted"), false);
      assert.equal(JSON.parse(body).error.code, "INVALID_REQUEST_TARGET");
    }
    const tooLong = await fetch(`${baseUrl}/${"a".repeat(2048)}`);
    assert.equal(tooLong.status, 414);
  });

  it("rejects a body on a read-only HTTP request", async () => {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest(`${baseUrl}/v1/catalog`, { method: "GET", headers: { "Content-Length": "4" } }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      });
      request.on("error", reject);
      request.end("test");
    });
    assert.equal(result.status, 400);
    assert.equal(JSON.parse(result.body).error.code, "REQUEST_BODY_NOT_ALLOWED");
  });
});

describe("configuration boundaries", () => {
  it("defaults to loopback and exactly one local browser origin", () => {
    assert.deepEqual(loadConfig({}), { host: "127.0.0.1", port: 4000, allowedOrigins: ["http://localhost:5173"] });
  });

  it("rejects malformed port and CORS configuration", () => {
    for (const port of ["0", "65536", "1.5", "-1", "4000junk", ""]) {
      assert.throws(() => loadConfig({ PORT: port }), /PORT/);
    }
    for (const origin of ["*", "null", "https://example.com/path", "https://example.com/", "https://user:pass@example.com", "file://example.com", "https://good.example,"]) {
      assert.throws(() => loadConfig({ CORS_ALLOWED_ORIGINS: origin }), /CORS_ALLOWED_ORIGINS/);
    }
  });

  it("allows an explicit origin allowlist or disables all browser origins", () => {
    assert.deepEqual(loadConfig({ CORS_ALLOWED_ORIGINS: "https://app.example,https://app.example" }).allowedOrigins, ["https://app.example"]);
    assert.deepEqual(loadConfig({ CORS_ALLOWED_ORIGINS: "" }).allowedOrigins, []);
  });

  it("has no environment flag that enables a real or pretend production provider", async () => {
    const config = loadConfig({
      NODE_ENV: "production", ACTIVATION_ENABLED: "true", PAYMENTS_ENABLED: "true",
      STARLINK_ENABLED: "true", ENABLE_LIVE_SERVICE: "true",
    });
    assert.deepEqual(Object.keys(config).sort(), ["allowedOrigins", "host", "port"]);
    const server = createAppServer(config);
    const baseUrl = await listen(server);
    try {
      const readiness = await (await fetch(`${baseUrl}/v1/readiness`)).json() as typeof readinessFixture;
      assert.equal(readiness.productionReady, false);
      assert.equal(readiness.features.satellite.available, false);
      assert.equal((await fetch(`${baseUrl}/v1/payments`, { method: "POST" })).status, 503);
    } finally {
      await close(server);
    }
  });
});
