export interface Profile {
  subject: string;
  displayName: string;
  role: string;
  source: "lab" | "onesa";
  expiresAt: number;
}
export interface Credential {
  token: string;
  user: Profile;
}
export interface Item {
  id: string;
  revision: number;
  createdAt: string;
  [key: string]: unknown;
}
export interface Account {
  profile: { subject: string; displayName: string };
  applications: Item[];
  tickets: Item[];
  ledger: Item[];
  requests: Item[];
  network: { state: string; usage: null; lastMeasuredAt: null };
  status: {
    mode: string;
    productionReady: boolean;
    commercialSalesEnabled: boolean;
  };
  pageLimit?: number;
  counts?: Record<string, number>;
  cursors?: Record<string, string | null>;
}
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function apiBase(
  value: string | undefined,
  development: boolean,
): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes("..") ||
    !["/", "/api", "/api/"].includes(url.pathname)
  )
    throw Error("The application API address is invalid.");
  const ipv4 =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) &&
    url.hostname.split(".").every((part) => Number(part) <= 255);
  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "10.0.2.2" ||
    (ipv4 &&
      (/^192\.168\./.test(url.hostname) ||
        /^10\./.test(url.hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(url.hostname)));
  if (
    url.protocol !== "https:" &&
    !(development && url.protocol === "http:" && local)
  )
    throw Error("The account service requires HTTPS.");
  return url.href.replace(/\/$/, "");
}
export function base64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    output += alphabet[(n >>> 18) & 63]! + alphabet[(n >>> 12) & 63]!;
    if (i + 1 < bytes.length) output += alphabet[(n >>> 6) & 63]!;
    if (i + 2 < bytes.length) output += alphabet[n & 63]!;
  }
  return output;
}
export function callbackParameters(
  value: string,
  expectedState: string,
): { code: string; state: string } {
  const url = new URL(value);
  if (
    url.protocol !== "onesamobile:" ||
    url.host !== "auth" ||
    url.username ||
    url.password ||
    url.pathname !== "/callback" ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => !["code", "state"].includes(key))
  )
    throw Error("Unexpected sign-in destination.");
  const code = url.searchParams.get("code"),
    state = url.searchParams.get("state");
  if (
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.getAll("state").length !== 1 ||
    state !== expectedState ||
    !code ||
    !/^[A-Za-z0-9_-]{43}$/.test(code)
  )
    throw Error("This sign-in does not match the request on this device.");
  return { code, state };
}
export function compactCache(account: Account): object {
  return {
    subject: account.profile.subject,
    displayName: account.profile.displayName,
    savedAt: new Date().toISOString(),
    applications: account.applications
      .slice(0, 3)
      .map((a) => ({ id: a.id, state: a.state, planId: a.planId })),
    networkState: account.network.state,
  };
}
export async function request<T>(
  base: string,
  path: string,
  options: {
    token?: string;
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
    query?: { cursor?: string; limit?: number };
  } = {},
): Promise<T> {
  if (!/^\/v1\/[A-Za-z0-9_/-]+$/.test(path))
    throw Error("Invalid API operation.");
  const url = new URL(base + path);
  if (options.query) {
    if (
      !/^\/v1\/me\/records\/(applications|tickets|ledger|requests)$/.test(path)
    )
      throw Error("Invalid page operation.");
    if (options.query.cursor)
      url.searchParams.set("cursor", options.query.cursor);
    if (options.query.limit)
      url.searchParams.set("limit", String(options.query.limit));
  }
  const controller = new AbortController(),
    abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  if (options.signal?.aborted) abort();
  try {
    const response = await fetch(url.href, {
      method: options.method ?? "GET",
      credentials: "omit",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(options.token ? { Authorization: "Bearer " + options.token } : {}),
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(
        response.status,
        "INVALID_RESPONSE",
        "The service returned an unexpected response.",
      );
    const data = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        data.error?.code ?? "REQUEST_FAILED",
        data.error?.message ?? "The request could not be completed.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        0,
        "CONNECTION_TIMEOUT",
        "The connection timed out. Check your connection, then retry.",
      );
    throw new ApiError(
      0,
      "CONNECTION_UNAVAILABLE",
      "The account service could not be reached. Your phone may still have other connectivity.",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
