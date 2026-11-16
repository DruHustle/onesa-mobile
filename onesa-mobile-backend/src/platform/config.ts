import { resolve } from "node:path";
import { isIP } from "node:net";
import { loadConfig, type ServerConfig } from "../config.ts";

export interface PlatformConfig extends ServerConfig {
  mode: "lab" | "production";
  databasePath: string;
  publicOrigin: string;
  encryptionKey?: string;
  trustedProxyIps: readonly string[];
  onesa?: {
    audience?: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}
export function loadPlatformConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlatformConfig {
  if (env.NODE_ENV === "production" && !env.APP_MODE)
    throw Error("Set APP_MODE explicitly for a production process. Lab authentication must never be selected by omission.");
  const base = loadConfig({
      ...env,
      CORS_ALLOWED_ORIGINS:
        env.CORS_ALLOWED_ORIGINS ??
        (env.APP_MODE === "production" ? "" : undefined),
    }),
    mode = env.APP_MODE ?? "lab";
  if (mode !== "lab" && mode !== "production")
    throw Error("APP_MODE must be lab or production.");
  const publicOrigin = env.PUBLIC_ORIGIN ?? "http://localhost:5173",
    url = new URL(publicOrigin);
  if (
    url.origin !== publicOrigin ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error("PUBLIC_ORIGIN must be an exact HTTP(S) origin.");
  if (mode === "production" && url.protocol !== "https:")
    throw Error("Production requires an HTTPS public origin.");
  const databasePath = resolve(env.DATABASE_PATH ?? "var/onesa-mobile.sqlite");
  const encryptionKey = env.AUTH_ENCRYPTION_KEY;
  if (encryptionKey !== undefined && !/^[a-fA-F0-9]{64}$/.test(encryptionKey))
    throw Error("AUTH_ENCRYPTION_KEY must contain 64 hex characters.");
  if (mode === "production" && !encryptionKey)
    throw Error(
      "Production requires AUTH_ENCRYPTION_KEY from a secret manager.",
    );
  const values = [
    env.ONESA_ISSUER,
    env.ONESA_CLIENT_ID,
    env.ONESA_CLIENT_SECRET,
  ];
  if (env.ONESA_MOBILE_API_AUDIENCE && !values.every(Boolean)) throw Error("Managed Mobile audience requires a configured Onesa client.");
  if (values.some(Boolean) && !values.every(Boolean))
    throw Error("Set all three ONESA identity values together.");
  let onesa: PlatformConfig["onesa"];
  if (values.every(Boolean)) {
    const issuer = new URL(env.ONESA_ISSUER!);
    if (
      issuer.protocol !== "https:" ||
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash
    )
      throw Error("ONESA_ISSUER must be an HTTPS issuer URL.");
    onesa = {
      ...(env.ONESA_MOBILE_API_AUDIENCE ? {audience:env.ONESA_MOBILE_API_AUDIENCE} : {}),
      issuer: env.ONESA_ISSUER!,
      clientId: env.ONESA_CLIENT_ID!,
      clientSecret: env.ONESA_CLIENT_SECRET!,
      redirectUri: publicOrigin + "/api/v1/auth/onesa/callback",
    };
  }
  if (mode === "production" && !onesa)
    throw Error(
      "Production requires a registered Onesa Mobile identity client.",
    );
  const trustedProxyIps = (env.TRUST_PROXY_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustedProxyIps.some((ip) => !isIP(ip)))
    throw Error(
      "TRUST_PROXY_IPS must contain exact IP addresses, not CIDRs or wildcards.",
    );
  return {
    ...base,
    mode,
    databasePath,
    publicOrigin,
    trustedProxyIps,
    allowedOrigins: [...new Set([...base.allowedOrigins, publicOrigin])],
    ...(encryptionKey ? { encryptionKey } : {}),
    ...(onesa ? { onesa } : {}),
  };
}
