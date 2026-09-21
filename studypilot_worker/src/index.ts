// StudyPilot on Cloudflare Workers: the Django REST API ported to Hono, served
// from the same Worker as the React frontend. Every path and response envelope
// matches the Django backend, so the frontend only had to change what the
// browser now does itself (reading PDFs, assembling Word files).

import { Hono } from "hono";
import { HttpError } from "./http";
import { database, requireUser, type AppEnv } from "./auth/users";
import accounts from "./routes/accounts";
import academics from "./routes/academics";
import advisor from "./routes/advisor";
import { admin, dashboard, heartbeat } from "./routes/dashboard";
import documents from "./routes/documents";
import flashcards from "./routes/flashcards";
import memory from "./routes/memory";
import quizzes from "./routes/quizzes";
import resources from "./routes/resources";
import youtube from "./routes/youtube";

// Routes are registered without a trailing slash and matched non-strictly, so
// "/api/documents" and "/api/documents/" both work. Django's URLs all ended in
// a slash (APPEND_SLASH redirected the rest), and that is what the frontend
// sends, so both forms have to resolve.
const app = new Hono<AppEnv>({ strict: false });

const api = new Hono<AppEnv>({ strict: false });

api.get("/health", (c) => c.json({ success: true, message: "StudyPilot backend is running", runtime: "cloudflare-workers" }));

// Health checks that touch the database need a connection, so they sit after
// the database middleware; the plain one above stays free of it.
api.use("*", database);

api.get("/health/deployment", async (c) => {
  let database = false;
  try {
    const [row] = await c.get("sql")`select 1 as ok`;
    database = row?.ok === 1;
  } catch (error) {
    console.warn(`Health check database error: ${error instanceof Error ? error.message : error}`);
  }
  return c.json({
    success: true,
    backend: "running",
    runtime: "cloudflare-workers",
    database: database ? "connected" : "unavailable",
    deepseek_configured: Boolean((c.env.DEEPSEEK_API_KEY || "").trim()),
    memwal_enabled: c.env.MEMWAL_ENABLED === "true" && Boolean(c.env.MEMWAL_PRIVATE_KEY),
    password_service_configured: Boolean(c.env.PASSWORD_FN_SECRET),
    // PDFs are read in the browser now; kept so older clients see a sane value.
    upload_limit_mb: 50,
    pdf_extraction: "browser",
  });
});

api.route("/auth", accounts);
api.route("/academics", academics);
api.route("/documents", documents);
api.route("/flashcards", flashcards);
api.route("/quizzes", quizzes);
api.route("/youtube", youtube);
api.route("/resources", resources);
api.route("/advisor", advisor);
api.route("/dashboard", dashboard);
api.route("/memory", memory);
api.route("/admin", admin);
api.post("/activity/heartbeat", requireUser, heartbeat);

// A mounted sub-app's notFound is not used by the parent, so without this an
// unknown /api path would fall through to the React app's index.html.
api.all("*", (c) => c.json({ detail: "Not found." }, 404));

app.route("/api", api);

app.onError((error, c) => {
  if (error instanceof HttpError) return c.json(error.body, error.status as never);
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}: ${error instanceof Error ? error.stack : error}`);
  return c.json({ success: false, message: "Something went wrong on our side. Please try again.", errors: {} }, 500);
});

// Everything that is not the API is the React app. On Workers the assets
// binding serves it (run_worker_first is scoped to /api/*, so this is mostly
// local dev); on Vercel the platform serves the static build and never routes
// these here.
app.all("*", (c) => {
  if (c.env?.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.json({ detail: "Not found." }, 404);
});

export default app;
