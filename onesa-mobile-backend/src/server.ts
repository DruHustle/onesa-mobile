import { createPlatformServer } from "./platform/http.ts";
import { loadPlatformConfig } from "./platform/config.ts";

const config = loadPlatformConfig();
const { server } = createPlatformServer(config);

server.listen(config.port, config.host, () => {
  console.info(
    `Onesa Mobile ${config.mode} control plane listening on port ${config.port}. Commercial telecom integrations are not commissioned.`,
  );
});

server.on("error", (error: NodeJS.ErrnoException) => {
  // No credentials, tokens, raw requests or arbitrary error objects in output.
  console.error(`API startup failed (${error.code ?? "UNKNOWN"}).`);
  process.exitCode = 1;
});

let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    process.exitCode = 1;
  }, 5_000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
  });
  server.closeIdleConnections();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
