export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
}

/** These are the only environment settings this demonstration reads. */
export function loadConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ServerConfig {
  const portText = environment.PORT ?? "4000";
  if (!/^[0-9]+$/.test(portText)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const port = Number(portText);
  if (port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const host = environment.HOST ?? "127.0.0.1";
  if (host.trim().length === 0 || /\s/.test(host)) {
    throw new Error("HOST must be a nonempty hostname or IP address.");
  }

  const originText = environment.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173";
  const allowedOrigins = originText === ""
    ? []
    : originText.split(",").map((value) => {
      const origin = value.trim();
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error("CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
      }
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.origin !== origin ||
        parsed.username !== "" ||
        parsed.password !== ""
      ) {
        throw new Error("CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or credentials.");
      }
      return origin;
    });

  return Object.freeze({
    host,
    port,
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
  });
}
