import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { catalog, DEMO_CONTEXT, demoAccount, health, readiness } from "./fixtures.ts";
import { loadConfig, type ServerConfig } from "./config.ts";

const readResources = new Map<string, unknown>([
  ["/healthz", health],
  ["/v1/catalog", catalog],
  ["/v1/readiness", readiness],
  ["/v1/demo/account", demoAccount],
]);

const blockedResources = new Map([
  ["/v1/activations", "activation"],
  ["/v1/payments", "payments"],
  ["/v1/auth", "identity"],
]);

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const preflightHeaders = new Set(["accept", "content-type"]);

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function reject(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  // Do not read, parse, echo, log or persist request bodies. Close the connection
  // after the response so an unconsumed upload does not remain on a keepalive socket.
  response.shouldKeepAlive = false;
  response.setHeader("Connection", "close");
  sendJson(request, response, status, { ...DEMO_CONTEXT, error: { code, message } });
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Vary", "Origin");

  const origin = request.headers.origin;
  if (origin !== undefined) {
    if (!allowedOrigins.has(origin)) {
      reject(request, response, 403, "ORIGIN_NOT_ALLOWED", "This browser origin is not allowed.");
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
  }

  const target = request.url ?? "";
  if (target.length > 2048) {
    reject(request, response, 414, "REQUEST_TARGET_TOO_LONG", "The request target is too long.");
    return;
  }
  // This small API has exact, static resource paths; it takes no query parameters
  // or encoded identifiers. Validate without URL normalization or logging input.
  if (!/^\/[A-Za-z0-9_/-]*$/.test(target) || target.includes("//")) {
    reject(request, response, 400, "INVALID_REQUEST_TARGET", "Use an exact API path without query parameters or encoded segments.");
    return;
  }

  const method = request.method ?? "";
  const feature = blockedResources.get(target);
  if (feature !== undefined) {
    if (mutationMethods.has(method) || method === "OPTIONS") {
      reject(request, response, 503, "SERVICE_NOT_READY", `${feature} is unavailable in this prelaunch demonstration. Do not submit personal information or payment details.`);
    } else {
      response.setHeader("Allow", "POST, PUT, PATCH, DELETE, OPTIONS");
      reject(request, response, 405, "METHOD_NOT_ALLOWED", "This path only represents an unavailable future operation.");
    }
    return;
  }

  if (!readResources.has(target)) {
    reject(request, response, 404, "NOT_FOUND", "The requested API resource does not exist.");
    return;
  }

  response.setHeader("Allow", "GET, HEAD, OPTIONS");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    reject(request, response, 405, "METHOD_NOT_ALLOWED", "This resource is read-only.");
    return;
  }
  if (request.headers["transfer-encoding"] !== undefined || Number(request.headers["content-length"] ?? 0) !== 0) {
    reject(request, response, 400, "REQUEST_BODY_NOT_ALLOWED", "Read-only resources do not accept request bodies.");
    return;
  }

  if (method === "OPTIONS") {
    const requestedMethod = request.headers["access-control-request-method"];
    if (requestedMethod !== undefined && !["GET", "HEAD"].includes(String(requestedMethod))) {
      reject(request, response, 405, "METHOD_NOT_ALLOWED", "Only read-only cross-origin requests are allowed.");
      return;
    }
    const requestedHeaders = String(request.headers["access-control-request-headers"] ?? "")
      .split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
    if (requestedHeaders.some((header) => !preflightHeaders.has(header))) {
      reject(request, response, 400, "HEADER_NOT_ALLOWED", "The requested cross-origin headers are not allowed.");
      return;
    }
    if (origin !== undefined) {
      response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
    }
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(request, response, 200, readResources.get(target));
}

export function createAppServer(config: ServerConfig = loadConfig()): Server {
  const allowedOrigins = new Set(config.allowedOrigins);
  const server = createServer(
    { maxHeaderSize: 8192 },
    (request, response) => handleRequest(request, response, allowedOrigins),
  );
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}
