import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { once } from "node:events";
import { z } from "zod";
import { AuthService, AuthError } from "../auth/service.ts";
import { catalog, readiness, demoAccount } from "../fixtures.ts";
import { DomainError, parse, type Actor, type RecordItem } from "./model.ts";
import { Store } from "./store.ts";
import { Platform } from "./service.ts";
import { receiptPdf } from "./documents.ts";
import type { PlatformConfig } from "./config.ts";

const loginSchema = z
  .object({
    username: z.string().min(1).max(254),
    password: z.string().min(1).max(256),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    surface: z.enum(["customer", "staff"]).default("customer"),
    transport: z.enum(["cookie", "bearer"]).default("cookie"),
  })
  .strict();
const allowedHeaders = new Set([
  "accept",
  "authorization",
  "content-type",
  "idempotency-key",
  "x-csrf-token",
]);
export function createPlatformServer(config: PlatformConfig) {
  const store = new Store(config.databasePath),
    platform = new Platform(store, config.mode);
  const auth = new AuthService({
    mode: config.mode,
    databasePath: config.databasePath,
    publicOrigin: config.publicOrigin,
    allowedOrigins: config.allowedOrigins,
    ...(config.encryptionKey ? { encryptionKey: config.encryptionKey } : {}),
    ...(config.onesa ? { onesa: config.onesa } : {}),
  });
  const origins = new Set([...config.allowedOrigins, config.publicOrigin]);
  const rate = new Map<string, { start: number; count: number }>();
  function json(
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    data: unknown,
  ): void {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(req.method === "HEAD" ? undefined : body);
  }
  function fail(
    req: IncomingMessage,
    res: ServerResponse,
    status: number,
    code: string,
    message: string,
  ): void {
    res.shouldKeepAlive = false;
    res.setHeader("Connection", "close");
    json(req, res, status, {
      error: { code, message },
      requestId: res.getHeader("X-Request-Id"),
    });
  }
  async function body(req: IncomingMessage): Promise<unknown> {
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        req.headers["content-type"] ?? "",
      )
    )
      throw new DomainError(415, "JSON_REQUIRED", "Use application/json.");
    if (Number(req.headers["content-length"] ?? 0) > 16384)
      throw new DomainError(
        413,
        "BODY_TOO_LARGE",
        "This request exceeds the 16 KB limit.",
      );
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of req) {
      const chunk = Buffer.from(part);
      size += chunk.length;
      if (size > 16384)
        throw new DomainError(
          413,
          "BODY_TOO_LARGE",
          "This request exceeds the 16 KB limit.",
        );
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new DomainError(
        400,
        "INVALID_JSON",
        "The request body is not valid JSON.",
      );
    }
  }
  const route = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader("Vary", "Origin");
    if (config.mode === "production")
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    const origin = req.headers.origin;
    if (origin !== undefined && !origins.has(origin))
      throw new DomainError(
        403,
        "ORIGIN_NOT_ALLOWED",
        "This origin is not allowed.",
      );
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    const target = req.url ?? "",
      method = req.method ?? "";
    if (target.length > 4096)
      throw new DomainError(
        414,
        "TARGET_TOO_LONG",
        "The request target is too long.",
      );
    const rawPath = target.split("?")[0]!;
    if (
      !target.startsWith("/") ||
      target.startsWith("//") ||
      rawPath.includes("..") ||
      rawPath.includes("\\") ||
      /%2f|%5c|%00/i.test(rawPath)
    )
      throw new DomainError(400, "INVALID_PATH", "Invalid API path.");
    const url = new URL(target, config.publicOrigin),
      path = url.pathname;
    if (!/^\/[A-Za-z0-9_./-]*$/.test(path) || path.includes(".."))
      throw new DomainError(400, "INVALID_PATH", "Invalid API path.");
    if (
      url.search &&
      !path.startsWith("/v1/auth/onesa/") &&
      !/^\/v1\/(ops|me)\/records\/[a-zA-Z]+$/.test(path)
    )
      throw new DomainError(
        400,
        "QUERY_NOT_ALLOWED",
        "This endpoint does not accept query parameters.",
      );
    const socketPeer = (req.socket.remoteAddress ?? "unknown").replace(
      /^::ffff:/,
      "",
    );
    const forwarded = req.headers["x-forwarded-for"];
    const peer =
        config.trustedProxyIps.includes(socketPeer) &&
        typeof forwarded === "string" &&
        isIP(forwarded)
          ? forwarded
          : socketPeer,
      now = Date.now();
    if (rate.size >= 10000)
      for (const [key, value] of rate)
        if (now - value.start > 60000) rate.delete(key);
    const slot = rate.get(peer);
    if (!slot && rate.size >= 10000)
      throw new DomainError(
        429,
        "RATE_LIMITED",
        "The service is busy. Retry later.",
      );
    if (!slot || now - slot.start > 60000)
      rate.set(peer, { start: now, count: 1 });
    else if (++slot.count > 600) {
      res.setHeader("Retry-After", "60");
      throw new DomainError(
        429,
        "RATE_LIMITED",
        "Too many requests. Retry in one minute.",
      );
    }
    if (method === "OPTIONS") {
      const wanted = String(
        req.headers["access-control-request-method"] ?? "GET",
      );
      if (!["GET", "HEAD", "POST", "PATCH"].includes(wanted))
        throw new DomainError(405, "METHOD_NOT_ALLOWED", "Unsupported method.");
      if (
        String(req.headers["access-control-request-headers"] ?? "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean)
          .some((x) => !allowedHeaders.has(x))
      )
        throw new DomainError(
          400,
          "HEADER_NOT_ALLOWED",
          "Unsupported request header.",
        );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, PATCH, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Accept, Authorization, Content-Type, Idempotency-Key, X-CSRF-Token",
      );
      res.writeHead(204);
      res.end();
      return;
    }
    if (
      ["GET", "HEAD"].includes(method) &&
      (req.headers["transfer-encoding"] !== undefined ||
        Number(req.headers["content-length"] ?? 0) !== 0)
    )
      throw new DomainError(
        400,
        "BODY_NOT_ALLOWED",
        "Read requests cannot contain a body.",
      );
    if (["GET", "HEAD"].includes(method)) {
      if (path === "/healthz") {
        json(req, res, 200, {
          status: "ok",
          mode: config.mode,
          serviceStatus: "prelaunch",
          networkConnected: false,
        });
        return;
      }
      if (path === "/v1/status") {
        json(req, res, 200, platform.status());
        return;
      }
      if (path === "/v1/catalog") {
        json(req, res, 200, catalog);
        return;
      }
      // Compatibility endpoints remain explicitly fictional and never share authenticated data.
      if (path === "/v1/readiness") {
        json(req, res, 200, readiness);
        return;
      }
      if (path === "/v1/demo/account") {
        json(req, res, 200, demoAccount);
        return;
      }
    }
    if (method === "GET" && path === "/v1/auth/onesa/start") {
      const surface = url.searchParams.get("surface") ?? "customer";
      if (!["customer", "staff"].includes(surface))
        throw new DomainError(
          400,
          "INVALID_SURFACE",
          "Choose customer or staff.",
        );
      const codeChallenge = url.searchParams.get("codeChallenge"),
        state = url.searchParams.get("state");
      if ((codeChallenge === null) !== (state === null))
        throw new DomainError(
          400,
          "INVALID_NATIVE_FLOW",
          "Native sign-in requires both state and code challenge.",
        );
      const flow = await auth.beginOnesa({
        surface: surface as "customer" | "staff",
        returnTo: surface === "staff" ? "/internal/" : "/account/",
        ...(codeChallenge && state ? { native: { codeChallenge, state } } : {}),
      });
      res.setHeader("Set-Cookie", flow.flowCookie);
      res.writeHead(302, { Location: flow.redirectUrl });
      res.end();
      return;
    }
    if (method === "GET" && path === "/v1/auth/onesa/callback") {
      const callback = new URL(
        config.onesa?.redirectUri ?? "/api/v1/auth/onesa/callback",
        config.publicOrigin,
      );
      callback.search = url.search;
      const issued = await auth.completeOnesa({
        url: callback,
        ...(req.headers.cookie ? { flowCookie: req.headers.cookie } : {}),
      });
      res.setHeader(
        "Set-Cookie",
        issued.nativeRedirect
          ? [issued.clearFlowCookie]
          : [
              auth.cookie(issued.token, issued.session.expiresAt),
              issued.clearFlowCookie,
            ],
      );
      res.writeHead(302, {
        Location: issued.nativeRedirect ?? issued.returnTo,
      });
      res.end();
      return;
    }
    if (method === "POST" && path === "/v1/auth/onesa/native/exchange") {
      const input = parse(
        z
          .object({
            code: z.string().max(128),
            state: z.string().max(128),
            verifier: z.string().max(128),
          })
          .strict(),
        await body(req),
      );
      const issued = await auth.exchangeNative(input);
      json(req, res, 200, {
        authenticated: true,
        mode: config.mode,
        user: auth.publicSession(issued.session),
        token: issued.token,
      });
      return;
    }
    if (method === "POST" && path === "/v1/session/login") {
      const input = parse(loginSchema, await body(req));
      if (input.transport === "cookie") auth.assertOrigin(origin);
      const issued = await auth.loginLab(
        {
          username: input.username,
          password: input.password,
          surface: input.surface,
          ...(input.totp ? { totp: input.totp } : {}),
        },
        peer,
      );
      if (input.transport === "cookie")
        res.setHeader("Set-Cookie", auth.cookie(issued.token));
      json(req, res, 200, {
        authenticated: true,
        mode: config.mode,
        user: auth.publicSession(issued.session),
        csrfToken: issued.session.csrfToken,
        ...(input.transport === "bearer" ? { token: issued.token } : {}),
      });
      return;
    }
    const presented = {
      ...(req.headers.authorization
        ? { authorization: req.headers.authorization }
        : {}),
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    };
    if (method === "POST" && path === "/v1/session/logout") {
      const result = await auth.logoutPresented(presented, {
        csrfToken: req.headers["x-csrf-token"] as string | undefined,
        origin,
      });
      res.setHeader("Set-Cookie", auth.clearCookie());
      json(req, res, 200, { signedOut: true, ...result });
      return;
    }
    const session = await auth.authenticate(presented);
    if (method === "GET" && path === "/v1/session") {
      json(req, res, 200, {
        authenticated: !!session,
        mode: config.mode,
        authMode: config.mode === "lab" ? "lab" : "onesa",
        ssoAvailable: !!config.onesa,
        user: session ? auth.publicSession(session) : null,
        csrfToken: session?.csrfToken ?? null,
      });
      return;
    }
    if (!session)
      throw new DomainError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Sign in to continue.",
      );
    const actor: Actor = session;
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method))
      auth.assertMutation(
        session,
        req.headers["x-csrf-token"] as string | undefined,
        origin,
      );
    if (method === "GET" && path === "/v1/me") {
      json(req, res, 200, platform.me(actor));
      return;
    }
    if (method === "GET" && path === "/v1/me/export") {
      store.audit(actor, "account.exported", actor.subject);
      const snapshot = store.exportSnapshot(actor.subject),
        controller = new AbortController();
      res.on("close", () => controller.abort());
      res.setTimeout(30000, () => res.destroy());
      const send = async (value: string) => {
        if (res.destroyed) throw new Error("Export disconnected");
        if (!res.write(value))
          await once(res, "drain", { signal: controller.signal });
      };
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="onesa-mobile-account.json"',
      });
      try {
        await send(
          '{"exportedAt":' +
            JSON.stringify(new Date().toISOString()) +
            ',"profile":' +
            JSON.stringify({
              subject: actor.subject,
              displayName: actor.displayName,
            }),
        );
        for (const kind of [
          "applications",
          "tickets",
          "ledger",
          "requests",
        ] as const) {
          await send("," + JSON.stringify(kind) + ":[");
          let first = true;
          for (const row of snapshot.rows(kind)) {
            await send((first ? "" : ",") + JSON.stringify(row));
            first = false;
          }
          await send("]");
        }
        await send("}");
        res.end();
      } finally {
        snapshot.close();
      }
      return;
    }
    if (method === "GET" && path === "/v1/ops/snapshot") {
      json(req, res, 200, platform.snapshot(actor));
      return;
    }
    const collection =
      /^\/v1\/(ops|me)\/records\/([a-zA-Z]+)(?:\/([a-f0-9-]{36}))?$/.exec(path);
    if (method === "GET" && collection) {
      if (collection[3]) {
        json(
          req,
          res,
          200,
          platform.record(
            actor,
            collection[1] === "me",
            collection[2]!,
            collection[3],
          ),
        );
        return;
      }
      if (
        [...url.searchParams.keys()].some(
          (k) => !["cursor", "limit"].includes(k),
        ) ||
        url.searchParams.getAll("cursor").length > 1 ||
        url.searchParams.getAll("limit").length > 1
      )
        throw new DomainError(
          400,
          "INVALID_PAGE",
          "Use a single cursor and limit.",
        );
      const rawLimit = url.searchParams.get("limit") ?? "50";
      if (!/^[0-9]{1,3}$/.test(rawLimit))
        throw new DomainError(400, "INVALID_PAGE", "Page size must be 1–50.");
      json(
        req,
        res,
        200,
        platform.page(
          actor,
          collection[1] === "me",
          collection[2]!,
          Number(rawLimit),
          url.searchParams.get("cursor") ?? undefined,
        ),
      );
      return;
    }
    const document = /^\/v1\/documents\/([a-f0-9-]{36})\.pdf$/.exec(path);
    if (method === "GET" && document) {
      const data = await receiptPdf(platform.receipt(actor, document[1]!));
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="onesa-mobile-test-receipt.pdf"',
        "Content-Length": data.length,
      });
      res.end(data);
      return;
    }
    if (
      [
        "/v1/activations",
        "/v1/payments",
        "/v1/provisioning",
        "/v1/satellite/attach",
      ].includes(path)
    ) {
      platform.networkOperation();
    }
    const postHandlers: Record<
      string,
      (input: unknown, key: string) => unknown
    > = {
      "/v1/ops/sites": (input, key) => platform.createSite(actor, input, key),
      "/v1/ops/assets": (input, key) => platform.createAsset(actor, input, key),
      "/v1/ops/trials": (input, key) => platform.createTrial(actor, input, key),
      "/v1/ops/evidence": (input, key) =>
        platform.submitEvidence(actor, input, key),
      "/v1/applications": (input, key) => platform.apply(actor, input, key),
      "/v1/support/tickets": (input, key) => platform.ticket(actor, input, key),
      "/v1/ops/ledger": (input, key) =>
        platform.recordPayment(actor, input, key),
      "/v1/account/requests": (input, key) =>
        platform.request(actor, input, key),
    };
    const key = String(req.headers["idempotency-key"] ?? "");
    if (method === "POST" && postHandlers[path]) {
      const result = postHandlers[path](await body(req), key);
      json(req, res, 201, result);
      return;
    }
    const ownApplication = /^\/v1\/applications\/([a-f0-9-]{36})$/.exec(path);
    if (method === "PATCH" && ownApplication) {
      json(
        req,
        res,
        200,
        platform.resubmit(actor, ownApplication[1]!, await body(req), key),
      );
      return;
    }
    const ticketReply =
      /^\/v1\/support\/tickets\/([a-f0-9-]{36})\/replies$/.exec(path);
    if (method === "POST" && ticketReply) {
      json(
        req,
        res,
        200,
        platform.reply(actor, ticketReply[1]!, await body(req), key),
      );
      return;
    }
    const requestUpdate = /^\/v1\/ops\/requests\/([a-f0-9-]{36})$/.exec(path);
    if (method === "PATCH" && requestUpdate) {
      json(
        req,
        res,
        200,
        platform.resolveRequest(actor, requestUpdate[1]!, await body(req), key),
      );
      return;
    }
    const match =
      /^\/v1\/(ops\/(assets|trials|evidence|applications|ledger)|support\/tickets)\/([a-f0-9-]{36})(?:\/(checks|results|review|refunds))?$/.exec(
        path,
      );
    if (match) {
      const resource = match[2] ?? "tickets",
        id = match[3]!,
        action = match[4] ?? "";
      let result: RecordItem | undefined;
      if (
        method === "POST" &&
        ((resource === "evidence" && action === "review") ||
          (resource === "ledger" && action === "refunds"))
      )
        auth.requireFresh(session);
      if (method === "PATCH" && resource === "assets" && !action)
        result = platform.updateAsset(actor, id, await body(req), key);
      else if (
        method === "POST" &&
        resource === "assets" &&
        action === "checks"
      )
        result = platform.commission(actor, id, await body(req), key);
      else if (
        method === "POST" &&
        resource === "trials" &&
        action === "results"
      )
        result = platform.recordTrial(actor, id, await body(req), key);
      else if (
        method === "POST" &&
        resource === "evidence" &&
        action === "review"
      )
        result = platform.reviewEvidence(actor, id, await body(req), key);
      else if (
        method === "POST" &&
        resource === "applications" &&
        action === "review"
      )
        result = platform.reviewApplication(actor, id, await body(req), key);
      else if (
        method === "POST" &&
        resource === "ledger" &&
        action === "refunds"
      )
        result = platform.refund(actor, id, await body(req), key);
      else if (method === "PATCH" && resource === "tickets" && !action)
        result = platform.updateTicket(actor, id, await body(req), key);
      if (result) {
        json(req, res, 200, result);
        return;
      }
    }
    throw new DomainError(
      404,
      "NOT_FOUND",
      "The API resource is not available.",
    );
  };
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    void route(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof DomainError || error instanceof AuthError) {
        fail(req, res, error.status, error.code, error.message);
        return;
      }
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId: res.getHeader("X-Request-Id"),
        }),
      );
      fail(
        req,
        res,
        500,
        "INTERNAL_ERROR",
        "The request could not be completed. Please retry safely.",
      );
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on("close", () => {
    store.close();
    auth.close();
  });
  return { server, store, platform, auth };
}
