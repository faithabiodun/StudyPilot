import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Text utilities shared with the Cloudflare Worker (cleaning, study-context
// selection, caption parsing). One implementation, so the browser and the
// server can never disagree about what a document's study context is.
const shared = fileURLToPath(new URL("../studypilot_worker/src/lib", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@shared": shared }
  },
  server: {
    port: 5173,
    // The shared modules live outside this folder.
    fs: { allow: [".", shared] },
    // `wrangler dev` serves the API on 8787 during local development.
    proxy: { "/api": "http://127.0.0.1:8787" }
  }
});
