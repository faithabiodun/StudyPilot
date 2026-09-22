// Source for api/_bundle.mjs (see scripts/build-api.mjs). Not a route itself:
// Vercel ignores files in api/ whose names start with an underscore.
//
// Vercel's Node runtime invokes a function with Node's (req, res), while Hono
// speaks Request/Response, so getRequestListener bridges the two. Hono reads
// configuration from `c.env`, which on Workers is the bindings object; here it
// is process.env.

import { getRequestListener } from "@hono/node-server";
import app from "../studypilot_worker/src/index";

export default getRequestListener((request) => app.fetch(request, process.env as never));
