import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Process orchestration only: the packages remain independent and communicate over HTTP.
const root = fileURLToPath(new URL("../", import.meta.url));
const web = join(root, "onesa-mobile-frontend/web");
const vite = join(web, "node_modules/vite/bin/vite.js");
if (!existsSync(vite) || !existsSync(join(root, "onesa-mobile-backend/node_modules/openid-client/package.json"))) {
  console.error(
    "Install backend and web dependencies first: npm ci --prefix onesa-mobile-backend && npm ci --prefix onesa-mobile-frontend/web",
  );
  process.exit(1);
}

const api = spawn(process.execPath, ["src/server.ts"], {
  cwd: join(root, "onesa-mobile-backend"),
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "4000",
    CORS_ALLOWED_ORIGINS:
      process.env.CORS_ALLOWED_ORIGINS ??
      "http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173",
  },
});
const website = spawn(
  process.execPath,
  [vite, "--host", "0.0.0.0", ...process.argv.slice(2)],
  {
    cwd: web,
    stdio: "inherit",
    env: process.env,
  },
);
const children = [api, website];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(`Development process failed: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
