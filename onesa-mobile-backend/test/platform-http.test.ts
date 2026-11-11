import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createPlatformServer } from "../src/platform/http.ts";
import { loadPlatformConfig } from "../src/platform/config.ts";
import { totpAt } from "../src/auth/crypto.ts";
import type { LabCredentials } from "../src/auth/service.ts";

const dir = mkdtempSync(join(tmpdir(), "onesa-http-")),
  origin = "http://localhost:5173";
const instance = createPlatformServer(
  loadPlatformConfig({
    APP_MODE: "lab",
    DATABASE_PATH: join(dir, "pilot.sqlite"),
    PUBLIC_ORIGIN: origin,
  }),
);
let base: string;
type Session = {
  cookie?: string;
  token?: string;
  csrf?: string;
  subject: string;
};
let customer: Session, other: Session, admin: Session, finance: Session;
let customerCredentials: LabCredentials;
async function login(
  credentials: LabCredentials,
  transport: "cookie" | "bearer" = "cookie",
): Promise<Session> {
  const response = await fetch(base + "/v1/session/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      transport,
      surface: credentials.role === "customer" ? "customer" : "staff",
      ...(credentials.totpSecret
        ? {
            totp: totpAt(credentials.totpSecret, Math.floor(Date.now() / 1000)),
          }
        : {}),
    }),
  });
  assert.equal(response.status, 200);
  const value = (await response.json()) as {
    token?: string;
    csrfToken: string;
  };
  return {
    subject: credentials.subject,
    ...(transport === "cookie"
      ? {
          cookie: response.headers.get("set-cookie")!.split(";")[0]!,
          csrf: value.csrfToken,
        }
      : { token: value.token! }),
  };
}
async function call(
  path: string,
  session?: Session,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const response = await fetch(base + path, {
    method: options.method ?? "GET",
    headers: {
      ...(session?.cookie
        ? {
            Cookie: session.cookie,
            Origin: origin,
            "X-CSRF-Token": session.csrf!,
          }
        : {}),
      ...(session?.token ? { Authorization: "Bearer " + session.token } : {}),
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.key ? { "Idempotency-Key": options.key } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  return response as Omit<Response, "json"> & {
    json(): Promise<Record<string, any>>;
  };
}
before(async () => {
  await new Promise<void>((resolve) =>
    instance.server.listen(0, "127.0.0.1", resolve),
  );
  const address = instance.server.address();
  assert.ok(address && typeof address === "object");
  base = "http://127.0.0.1:" + address.port;
  customerCredentials = await instance.auth.createLabUser({
    username: "http-customer",
    displayName: "HTTP test customer",
    role: "customer",
  });
  customer = await login(customerCredentials);
  other = await login(
    await instance.auth.createLabUser({
      username: "http-other",
      displayName: "HTTP second customer",
      role: "customer",
    }),
    "bearer",
  );
  admin = await login(
    await instance.auth.createLabUser({
      username: "http-admin",
      displayName: "HTTP test administrator",
      role: "admin",
    }),
  );
  finance = await login(
    await instance.auth.createLabUser({
      username: "http-finance",
      displayName: "HTTP test finance",
      role: "finance",
    }),
  );
});
after(async () => {
  instance.server.closeAllConnections();
  await new Promise<void>((resolve) => instance.server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

test("HTTP protects private routes and uses exact browser origins with anti-CSRF cookies", async () => {
  assert.equal((await call("/v1/me")).status, 401);
  assert.equal((await call("/v1/ops/snapshot", customer)).status, 403);
  assert.equal(
    (
      await call("/v1/session", undefined, {
        headers: { Origin: "https://foreign.example.test" },
      })
    ).status,
    403,
  );
  const publicStatus = await call("/v1/status");
  assert.equal(publicStatus.headers.get("cache-control"), "no-store");
  assert.equal((await publicStatus.json()).networkConnected, false);
  const input = { type: "data_correction", detail: "Synthetic request" };
  const missing = await fetch(base + "/v1/account/requests", {
    method: "POST",
    headers: {
      Cookie: customer.cookie!,
      Origin: origin,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(input),
  });
  assert.equal(missing.status, 403);
  const noOrigin = await fetch(base + "/v1/account/requests", {
    method: "POST",
    headers: {
      Cookie: customer.cookie!,
      "X-CSRF-Token": customer.csrf!,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(input),
  });
  assert.equal(noOrigin.status, 403);
  const response = await call("/v1/account/requests", customer, {
    method: "POST",
    body: input,
    key: randomUUID(),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
});
test("HTTP enforces mutation retry keys, ownership, current revision and role boundaries", async () => {
  const input = {
      category: "coverage",
      subject: "HTTP coverage case",
      message: "A synthetic test message\nwith a second line.",
    },
    key = randomUUID();
  const one = await call("/v1/support/tickets", customer, {
    method: "POST",
    body: input,
    key,
  });
  assert.equal(one.status, 201);
  const ticket = await one.json();
  const two = await call("/v1/support/tickets", customer, {
    method: "POST",
    body: input,
    key,
  });
  assert.equal((await two.json()).id, ticket.id);
  assert.equal(
    (
      await call("/v1/support/tickets", customer, {
        method: "POST",
        body: { ...input, message: "Changed" },
        key,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/v1/support/tickets/" + ticket.id + "/replies", other, {
        method: "POST",
        body: { revision: 1, message: "Another customer" },
        key: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (await call("/v1/me/records/tickets/" + ticket.id, other)).status,
    404,
  );
  const updated = await call("/v1/support/tickets/" + ticket.id, admin, {
    method: "PATCH",
    body: {
      revision: 1,
      status: "resolved",
      note: "Explained pilot limitations",
    },
    key: randomUUID(),
  });
  assert.equal(updated.status, 200);
  const stale = await call(
    "/v1/support/tickets/" + ticket.id + "/replies",
    customer,
    {
      method: "POST",
      body: { revision: 1, message: "Old view" },
      key: randomUUID(),
    },
  );
  assert.equal(stale.status, 409);
  assert.equal(
    (
      await call("/v1/ops/sites", finance, {
        method: "POST",
        body: { name: "Denied", area: "Lab", purpose: "device_bench" },
        key: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal((await call("/v1/ops/records/assets", finance)).status, 403);
});
test("launch interest is owner-scoped, exportable, and visible to subscriber staff", async () => {
  const path = "/v1/account/launch-interest";
  const options = { method: "POST", body: { interested: true, revision: 0 }, key: randomUUID() };
  assert.equal((await call(path, undefined, options)).status, 401);
  assert.equal((await call(path, admin, options)).status, 403);
  assert.equal((await call(path, customer, { ...options, body: { ...options.body, owner: other.subject } })).status, 400);
  const saved = await call(path, customer, options);
  assert.equal(saved.status, 200);
  const record = await saved.json();
  assert.equal(record.owner, customer.subject);
  assert.equal(record.state, "registered");
  assert.deepEqual((await (await call("/v1/me", customer)).json()).launchInterest, record);
  assert.deepEqual((await (await call("/v1/me/export", customer)).json()).launchInterest, record);
  assert.equal((await (await call("/v1/me", other)).json()).launchInterest, null);
  assert.equal((await (await call("/v1/me/export", other)).json()).launchInterest, null);
  const staffList = "/v1/ops/records/launchInterests";
  assert.equal((await call(staffList, other)).status, 403);
  assert.equal((await call(staffList + "/" + record.id, finance)).status, 403);
  assert.deepEqual((await (await call(staffList, admin)).json()).items, [record]);
  const withdrawn = await call(path, customer, {
    method: "POST", body: { interested: false, revision: record.revision }, key: randomUUID(),
  });
  assert.equal(withdrawn.status, 200);
  assert.equal((await withdrawn.json()).state, "withdrawn");
  assert.equal((await (await call("/v1/ops/snapshot", admin)).json()).launchInterests[0].state, "withdrawn");
  assert.deepEqual((await (await call("/v1/ops/snapshot", finance)).json()).launchInterests, []);
});
test("cursor pages reach every older record while protecting owner scope and export completeness", async () => {
  for (let i = 0; i < 205; i++)
    instance.store.insert("tickets", other.subject, {
      category: "other",
      subject: "Synthetic case " + i,
      message: "Pagination fixture",
      status: "open",
      notes: [],
    });
  const first = await (await call("/v1/me", other)).json();
  assert.equal(first.tickets.length, 50);
  assert.equal(first.counts.tickets, 205);
  assert.ok(first.cursors.tickets);
  const ids = new Set<string>(
    first.tickets.map((row: { id: string }) => row.id),
  );
  let cursor = first.cursors.tickets;
  while (cursor) {
    const response = await call(
      "/v1/me/records/tickets?limit=50&cursor=" + cursor,
      other,
    );
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.total, 205);
    assert.ok(page.items.length <= 50);
    for (const item of page.items) {
      assert.equal(item.owner, other.subject);
      assert.equal(ids.has(item.id), false);
      ids.add(item.id);
    }
    cursor = page.nextCursor;
  }
  assert.equal(ids.size, 205);
  const exported = await call("/v1/me/export", other);
  assert.match(exported.headers.get("content-disposition")!, /attachment/);
  const data = await exported.json();
  assert.equal(data.tickets.length, 205);
  assert.ok(
    data.tickets.every(
      (item: { owner: string }) => item.owner === other.subject,
    ),
  );
  const mine = await (await call("/v1/me", customer)).json();
  assert.equal(mine.tickets.length, 1);
  assert.equal(
    (await call("/v1/me/records/tickets?limit=51", other)).status,
    400,
  );
  assert.equal(
    (await call("/v1/me/records/tickets?cursor=not-a-cursor", other)).status,
    400,
  );
  assert.equal(
    (await call("/v1/me/records/tickets?limit=5&limit=10", other)).status,
    400,
  );
  assert.equal((await call("/v1/me/records/assets", other)).status, 403);
});
test("HTTP hardware inventory omits large history from pages but permits an authorized detail read", async () => {
  const site = await (
    await call("/v1/ops/sites", admin, {
      method: "POST",
      body: {
        name: "HTTP bench",
        area: "Synthetic lab",
        purpose: "device_bench",
      },
      key: randomUUID(),
    })
  ).json();
  const created = await (
    await call("/v1/ops/assets", admin, {
      method: "POST",
      body: {
        siteId: site.id,
        tag: "HTTP-PHONE",
        assetType: "android_phone",
        manufacturer: "Test",
        model: "Test phone",
      },
      key: randomUUID(),
    })
  ).json();
  await call("/v1/ops/assets/" + created.id, admin, {
    method: "PATCH",
    body: { revision: 1, state: "received" },
    key: randomUUID(),
  });
  const check = await call("/v1/ops/assets/" + created.id + "/checks", admin, {
    method: "POST",
    body: {
      revision: 2,
      check: "power",
      result: "pass",
      evidenceRef: "HTTP-LAB-POWER",
      note: "Synthetic check",
    },
    key: randomUUID(),
  });
  assert.equal(check.status, 200);
  const list = await (await call("/v1/ops/records/assets", admin)).json();
  assert.equal(list.items[0].commissioningHistory, undefined);
  const detail = await (
    await call("/v1/ops/records/assets/" + created.id, admin)
  ).json();
  assert.equal(detail.commissioningHistory.length, 1);
  assert.equal(detail.telemetry, null);
  assert.equal(
    (await call("/v1/ops/records/assets/" + created.id, customer)).status,
    403,
  );
});
test("test receipts are generated server-side and remain private to the account and authorized finance", async () => {
  const application = await (
    await call("/v1/applications", customer, {
      method: "POST",
      key: randomUUID(),
      body: {
        displayName: "HTTP customer",
        area: "Test lab",
        planId: "everyday",
        simFormat: "physical",
        deviceModel: "Test phone",
        consentToPilot: true,
      },
    })
  ).json();
  const paid = await call("/v1/ops/ledger", finance, {
    method: "POST",
    key: randomUUID(),
    body: {
      applicationId: application.id,
      amountMinor: 500,
      currency: "USD",
      method: "cash_test",
      reference: "HTTP-LAB-0001",
      description: "Synthetic test receipt",
    },
  });
  assert.equal(paid.status, 201);
  const item = await paid.json();
  assert.equal(item.moneyMoved, false);
  assert.equal(
    (await call("/v1/documents/" + item.id + ".pdf", other)).status,
    404,
  );
  const pdf = await call("/v1/documents/" + item.id + ".pdf", customer);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  assert.equal(
    (
      await call("/v1/payments", customer, {
        method: "POST",
        body: {},
        key: randomUUID(),
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await call("/v1/satellite/attach", admin, {
        method: "POST",
        body: {},
        key: randomUUID(),
      })
    ).status,
    503,
  );
});
test("malformed and oversized requests fail with bounded JSON errors", async () => {
  assert.equal((await call("/v1/me?unknown=true", customer)).status, 400);
  assert.equal((await call("/v1/%2Fme", customer)).status, 400);
  const big = await call("/v1/support/tickets", other, {
    method: "POST",
    body: { message: "x".repeat(17000) },
    key: randomUUID(),
  });
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error.code, "BODY_TOO_LARGE");
  const text = await fetch(base + "/v1/support/tickets", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + other.token,
      "Content-Type": "text/plain",
    },
    body: "not json",
  });
  assert.equal(text.status, 415);
});
test("sign-out requires cookie CSRF and then revokes the capability, including native bearer sessions", async () => {
  const cookie = await login(customerCredentials);
  const denied = await fetch(base + "/v1/session/logout", {
    method: "POST",
    headers: { Cookie: cookie.cookie!, Origin: origin },
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (await call("/v1/session/logout", cookie, { method: "POST" })).status,
    200,
  );
  assert.equal((await call("/v1/me", cookie)).status, 401);
  const native = await login(customerCredentials, "bearer");
  assert.equal(
    (await call("/v1/session/logout", native, { method: "POST" })).status,
    200,
  );
  assert.equal((await call("/v1/me", native)).status, 401);
});

test("OIDC query encoding is kept separate from strict path validation", async () => {
  const response = await call(
    "/v1/auth/onesa/callback?code=synthetic&state=synthetic&iss=https%3A%2F%2Fidentity.example.test%2Fapi%2Fv1%2Fidentity",
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "AUTH_NOT_CONFIGURED");
});
