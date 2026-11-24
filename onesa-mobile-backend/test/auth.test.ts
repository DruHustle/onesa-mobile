import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AuthService, AuthError, roles, type AuthConfig, type LabCredentials } from "../src/auth/service.ts";
import { digest, encodeBase32, seal, totpAt, totpStep, unseal } from "../src/auth/crypto.ts";

const labConfig = (): AuthConfig => ({ mode: "lab", databasePath: ":memory:", publicOrigin: "http://localhost:5173", allowedOrigins: ["http://localhost:5173"] });
let auth: AuthService, customer: LabCredentials, staff: LabCredentials;
before(async () => {
  auth = new AuthService(labConfig());
  customer = await auth.createLabUser({ username: "customer", displayName: "Synthetic customer", role: "customer" });
  staff = await auth.createLabUser({ username: "admin", displayName: "Synthetic administrator", role: "admin" });
});
after(() => auth.close());
const status = (value: number, code?: string) => (error: unknown) => error instanceof AuthError && error.status === value && (!code || error.code === code);

test("TOTP matches RFC 6238 SHA-1 vectors and rejects reused time steps", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  for (const [time, expected] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]] as const) {
    assert.equal(totpAt(secret, time), expected);
    assert.equal(totpStep(secret, expected, time, -1), Math.floor(time / 30));
    assert.equal(totpStep(secret, expected, time, Math.floor(time / 30)), null);
  }
});
test("encrypted authentication state rejects corruption or another key", () => {
  const key = randomBytes(32), encoded = seal("synthetic bearer value", key);
  assert.equal(unseal(encoded, key), "synthetic bearer value");
  assert.throws(() => unseal(encoded, randomBytes(32)));
  assert.throws(() => unseal(encoded.slice(0, -5), key));
});
test("customer login stores only a token hash and returns distinct sessions", async () => {
  const one = await auth.loginLab({ username: customer.username, password: customer.password }, "login-one");
  const two = await auth.loginLab({ username: customer.username, password: customer.password }, "login-two");
  assert.notEqual(one.token, two.token);
  assert.notEqual(one.session.csrfToken, two.session.csrfToken);
  const stored = auth.store.sessionByHash(digest(one.token));
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).includes(one.token), false);
  assert.equal(one.session.role, "customer");
  assert.equal(one.session.source, "lab");
  assert.equal(one.session.mfa, false);
  assert.equal(Object.hasOwn(auth.publicSession(one.session), "id"), false);
  assert.equal(Object.hasOwn(auth.publicSession(one.session), "token"), false);
});
test("staff password alone fails and a TOTP code is consumed once", async () => {
  await assert.rejects(auth.loginLab({ username: staff.username, password: staff.password }, "staff"), status(401));
  const code = totpAt(staff.totpSecret!, Math.floor(Date.now() / 1000));
  const result = await auth.loginLab({ username: staff.username, password: staff.password, totp: code, surface: "staff" }, "staff");
  assert.equal(result.session.mfa, true);
  assert.equal(result.session.role, "admin");
  await assert.rejects(auth.loginLab({ username: staff.username, password: staff.password, totp: code }, "staff"), status(401));
});
test("all staff roles require authenticator enrolment; customer role cannot enter staff surface", async () => {
  for (const role of roles.filter((role) => role !== "customer" && role !== "admin")) {
    const credentials = await auth.createLabUser({ username: role, displayName: "Synthetic " + role, role });
    assert.ok(credentials.totpSecret);
    await assert.rejects(auth.loginLab({ username: role, password: credentials.password }, role), status(401));
  }
  await assert.rejects(auth.loginLab({ username: customer.username, password: customer.password, surface: "staff" }, "customer-staff"), status(401));
});
test("cookie mutations require exact allowed Origin and CSRF, bearer requests reject foreign Origin", async () => {
  const issue = await auth.loginLab({ username: customer.username, password: customer.password }, "csrf");
  const session = await auth.authenticate({ cookie: auth.cookie(issue.token) });
  assert.ok(session);
  assert.throws(() => auth.assertMutation(session, session.csrfToken, undefined), status(403));
  assert.throws(() => auth.assertMutation(session, undefined, "http://localhost:5173"), status(403));
  assert.throws(() => auth.assertMutation(session, session.csrfToken, "http://localhost:5173.evil.invalid"), status(403));
  auth.assertMutation(session, session.csrfToken, "http://localhost:5173");
  const bearer = await auth.authenticate({ authorization: "Bearer " + issue.token });
  assert.ok(bearer);
  auth.assertMutation(bearer, undefined, undefined);
  assert.throws(() => auth.assertMutation(bearer, undefined, "https://foreign.invalid"), status(403));
});
test("ambiguous credentials and malformed bearer headers are rejected", async () => {
  const issue = await auth.loginLab({ username: customer.username, password: customer.password }, "headers");
  const cookie = auth.cookieName + "=" + issue.token;
  await assert.rejects(auth.authenticate({ authorization: "Bearer " + issue.token, cookie }), status(400));
  await assert.rejects(auth.authenticate({ cookie: cookie + ";" + cookie }), status(400));
  await assert.rejects(auth.authenticate({ authorization: "Bearer truncated" }), status(400));
  assert.equal(await auth.authenticate({ cookie: "unrelated=value" }), null);
});
test("logout and expiry revoke opaque sessions", async () => {
  const issue = await auth.loginLab({ username: customer.username, password: customer.password }, "logout");
  await auth.logout(issue.session);
  assert.equal(await auth.authenticate({ authorization: "Bearer " + issue.token }), null);
  const next = await auth.loginLab({ username: customer.username, password: customer.password }, "expiry");
  auth.store.db.prepare("UPDATE mobile_auth_sessions SET expires_at=0 WHERE id=?").run(next.session.id);
  assert.equal(await auth.authenticate({ authorization: "Bearer " + next.token }), null);
});
test("role revision and disabling a local user invalidate existing sessions", async () => {
  const user = await auth.createLabUser({ username: "disabled-user", displayName: "Synthetic user", role: "customer" });
  const issue = await auth.loginLab({ username: user.username, password: user.password }, "disabled");
  auth.updateLabUserAccess(user.subject, { disabled: true });
  assert.equal(await auth.authenticate({ authorization: "Bearer " + issue.token }), null);
  await assert.rejects(auth.loginLab({ username: user.username, password: user.password }, "disabled"), status(401));
  assert.throws(() => auth.updateLabUserAccess(customer.subject, { role: "admin" }), status(409, "MFA_ENROLLMENT_REQUIRED"));
});
test("failed login attempts are rate limited and duplicate bootstrap never resets a password", async () => {
  for (let attempt = 0; attempt < 10; attempt++) await assert.rejects(auth.loginLab({ username: "unknown-person", password: "synthetic wrong password" }, "rate-test"), status(401));
  await assert.rejects(auth.loginLab({ username: "unknown-person", password: "synthetic wrong password" }, "rate-test"), status(429));
  await assert.rejects(auth.createLabUser({ username: customer.username, displayName: "Overwrite", role: "admin" }), status(409));
});
test("fresh authentication checks reject an old proof without minting a new auth time", async () => {
  const issue = await auth.loginLab({ username: "disabled-user", password: "not the right password" }, "fresh").catch(() => null);
  assert.equal(issue, null);
  const principal = { subject: "synthetic", displayName: "Synthetic", role: "admin" as const, source: "lab" as const, authenticatedAt: Math.floor(Date.now() / 1000) - 301, mfa: true, expiresAt: Math.floor(Date.now() / 1000) + 600, id: "synthetic", csrfToken: "synthetic", transport: "cookie" as const };
  assert.throws(() => auth.requireFresh(principal), status(403));
  auth.requireFresh({ ...principal, authenticatedAt: Math.floor(Date.now() / 1000) });
});
test("production refuses local configuration, missing central identity and existing lab data", async () => {
  const directory = mkdtempSync(join(tmpdir(), "onesa-auth-isolation-"));
  const databasePath = join(directory, "state.sqlite");
  const local = new AuthService({ ...labConfig(), databasePath });
  try {
    await local.createLabUser({ username: "local-user", displayName: "Synthetic", role: "customer" });
    local.close();
    const config: AuthConfig = {
      mode: "production", databasePath, publicOrigin: "https://mobile.example.invalid", allowedOrigins: ["https://mobile.example.invalid"],
      encryptionKey: randomBytes(32).toString("hex"),
      onesa: { issuer: "https://account.example.invalid/api/v1/identity", clientId: "synthetic_mobile_client", clientSecret: randomBytes(48).toString("hex"), redirectUri: "https://mobile.example.invalid/api/v1/auth/onesa/callback" },
    };
    assert.throws(() => new AuthService(config), /refuses lab identities/);
    assert.throws(() => new AuthService({ ...labConfig(), mode: "production" }), /HTTPS/);
    assert.throws(() => new AuthService({ mode: "production", databasePath: ":memory:", publicOrigin: config.publicOrigin, allowedOrigins: config.allowedOrigins }), /configured Onesa/);
    assert.throws(() => new AuthService({ ...config, databasePath: ":memory:", encryptionKey: undefined }), /AUTH_ENCRYPTION_KEY/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("persistent sessions survive restart; stored TOTP seeds remain encrypted with owner-only key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "onesa-auth-persist-")), databasePath = join(directory, "state.sqlite");
  let first: AuthService | undefined, second: AuthService | undefined;
  try {
    first = new AuthService({ ...labConfig(), databasePath });
    const user = await first.createLabUser({ username: "persistent", displayName: "Synthetic staff", role: "operations" });
    assert.equal(first.store.userById(user.subject)!.totp_secret!.includes(user.totpSecret!), false);
    const issue = await first.loginLab({ username: user.username, password: user.password, totp: totpAt(user.totpSecret!, Math.floor(Date.now() / 1000)) }, "persist");
    first.close(); first = undefined;
    second = new AuthService({ ...labConfig(), databasePath });
    assert.equal((await second.authenticate({ authorization: "Bearer " + issue.token }))?.subject, user.subject);
    assert.equal(statSync(databasePath).mode & 0o777, 0o600);
    assert.equal(statSync(databasePath + ".authkey").mode & 0o777, 0o600);
    assert.equal(readFileSync(databasePath).includes(Buffer.from(issue.token)), false);
  } finally { first?.close(); second?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test("bootstrap CLI writes valid private JSON and refuses overwrite without leaking credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "onesa-auth-bootstrap-")), database = join(directory, "state.sqlite"), output = join(directory, "credentials.json");
  try {
    const args = ["src/auth/bootstrap.ts", "--database", database, "--output", output, "--second-customer"];
    const environment = { ...process.env, APP_MODE: "lab", DEPLOYMENT_MODE: "lab", AUTH_MODE: "lab", PUBLIC_ORIGIN: "http://localhost:5173" };
    const first = spawnSync(process.execPath, args, { encoding: "utf8", env: environment, timeout: 15000 });
    assert.equal(first.status, 0, first.stderr);
    const body = JSON.parse(readFileSync(output, "utf8")) as { mode: string; accounts: LabCredentials[] };
    assert.equal(body.mode, "lab");
    assert.equal(body.accounts.length, 3);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    for (const account of body.accounts) assert.equal((first.stdout + first.stderr).includes(account.password), false);
    const bytes = readFileSync(output);
    const repeat = spawnSync(process.execPath, args, { encoding: "utf8", env: environment, timeout: 15000 });
    assert.notEqual(repeat.status, 0);
    assert.deepEqual(readFileSync(output), bytes);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
