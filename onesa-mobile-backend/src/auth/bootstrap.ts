import { existsSync, mkdirSync, openSync, closeSync, ftruncateSync, fsyncSync, writeSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AuthService, type LabCredentials } from "./service.ts";
import type { Role } from "./types.ts";

const { values } = parseArgs({
  options: {
    database: { type: "string", default: process.env.DATABASE_PATH ?? "./var/onesa-mobile.sqlite" },
    output: { type: "string", default: "./var/lab-credentials.json" },
    origin: { type: "string", default: process.env.PUBLIC_ORIGIN ?? "http://localhost:5173" },
    "all-roles": { type: "boolean", default: false },
    "second-customer": { type: "boolean", default: false },
  },
  strict: true,
  allowPositionals: false,
});
if (process.env.APP_MODE === "production" || process.env.DEPLOYMENT_MODE === "production" || process.env.AUTH_MODE === "production") {
  throw new Error("Lab bootstrap is disabled in production.");
}
const databasePath = resolve(values.database!), output = resolve(values.output!);
if (databasePath === output || databasePath + ".authkey" === output || existsSync(output)) {
  throw new Error("Choose a new, separate credentials output file. Existing credentials are never overwritten.");
}
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const auth = new AuthService({ mode: "lab", databasePath, publicOrigin: values.origin!, allowedOrigins: [values.origin!] });
const accountRoles: Role[] = values["all-roles"] ? ["admin", "operations", "support", "finance", "agent", "auditor", "customer"] : ["admin", "customer"];
const inputs: { username: string; displayName: string; role: Role }[] = accountRoles.map((role) => ({ username: role, displayName: "Lab " + role, role }));
if (values["second-customer"]) inputs.push({ username: "customer-two", displayName: "Lab second customer", role: "customer" });
let destination: number | undefined;
let created = 0;
try {
  if (inputs.some((input) => auth.store.userByName(input.username))) throw new Error("One or more requested lab users already exist. No credentials were replaced.");
  destination = openSync(output, "wx", 0o600);
  const credentials: LabCredentials[] = [];
  for (const input of inputs) {
    credentials.push(await auth.createLabUser(input));
    created += 1;
    // Persist after each account to preserve its generated credentials if a later create fails.
    ftruncateSync(destination, 0);
    writeSync(destination, JSON.stringify({ mode: "lab", warning: "Private lab credentials. Store securely. Do not commit or upload.", accounts: credentials }, null, 2) + "\n", 0, "utf8");
    fsyncSync(destination);
  }
  closeSync(destination); destination = undefined;
  console.info("Created " + credentials.length + " lab accounts. Private credentials saved to " + output + ".");
  console.info("Staff require their authenticator code. No live service or provider account was created.");
} catch (error) {
  if (destination !== undefined) { closeSync(destination); if (created === 0) unlinkSync(output); }
  console.error(error instanceof Error && error.message.includes("already exist") ? error.message : "Lab bootstrap did not complete. Inspect the protected credentials file and local database before retrying.");
  process.exitCode = 1;
} finally {
  auth.close();
}
