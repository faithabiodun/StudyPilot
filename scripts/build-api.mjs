// Bundle the API into one self-contained file for Vercel.
//
// The Hono app lives in studypilot_worker/, outside api/, and Vercel compiles
// function sources itself. Rather than depend on how it handles TypeScript from
// a sibling directory, the whole app is bundled here at build time and the
// function becomes a two-line import of the result.
//
// The output is api/_bundle.mjs: files in api/ that start with an underscore
// are not treated as routes.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

await build({
  entryPoints: [fileURLToPath(new URL("api/_entry.ts", root))],
  outfile: fileURLToPath(new URL("api/_bundle.mjs", root)),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // Keep node: built-ins external; everything else is inlined so the function
  // does not depend on node_modules being traced correctly.
  packages: "bundle",
  logLevel: "info",
});
