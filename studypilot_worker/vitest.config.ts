import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The frontend imports the shared text/context modules through this alias, and
// the PDF parity test imports the frontend's reader, so the alias has to resolve
// here too.
export default defineConfig({
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./src/lib", import.meta.url)) },
  },
  test: {
    testTimeout: 60000,
  },
});
