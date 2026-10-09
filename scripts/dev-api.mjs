// Node API for local development; Vite proxies /api to port 8787.
import { context } from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of [".env.local", ".env.vercel"]) {
  const path = fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
mkdirSync(fileURLToPath(new URL("../temp/", import.meta.url)), { recursive: true });
const output = fileURLToPath(new URL("../temp/studypilot-api-dev.mjs", import.meta.url));
const build = await context({
  stdin: { contents: `import {serve} from '@hono/node-server';
    import app from './studypilot_worker/src/index';
    // Local HTTP requests must not inherit the hosted environment marker.
    const env = {...process.env, VERCEL: undefined, SUI_AUTH_ORIGIN: undefined};
    serve({fetch: request => app.fetch(request, env), hostname: '127.0.0.1', port: 8787});
    console.log('StudyPilot API listening on http://127.0.0.1:8787');`, resolveDir: root, loader: "ts" },
  outfile: output, bundle: true, platform: "node", target: "node20", format: "esm",
});
await build.rebuild();
await build.watch();
const child = spawn(process.execPath, ["--watch", output], { cwd: root, stdio: "inherit", windowsHide: true });
const stop = () => { child.kill(); void build.dispose(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.once("exit", async (code) => { await build.dispose(); process.exitCode = code || 0; });
