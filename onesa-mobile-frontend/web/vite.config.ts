import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { accountRoutes, publicMobileHostname } from "./vercel.mjs";

// Local development and the container gateway proxy status on the current host.
const statusHostname = process.env.VERCEL_ENV
  ? (accountRoutes(process.env).length > 0 ? publicMobileHostname : null)
  : "";

export default defineConfig({
  plugins: [react()],
  define: {
    __MOBILE_STATUS_HOSTNAME__: JSON.stringify(statusHostname),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
