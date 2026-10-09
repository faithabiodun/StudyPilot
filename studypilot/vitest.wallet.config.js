import { fileURLToPath } from "node:url";
import { defineConfig } from "../studypilot_worker/node_modules/vitest/dist/config.js";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "jsdom", environmentOptions: { jsdom: { url: "https://studypilot.test/" } }, include: ["src/components/auth/SuiSignInButton.test.jsx"] },
});
