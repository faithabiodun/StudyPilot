// Port of apps/resources/views.py.

import { Hono } from "hono";
import { failure, notFound, readJson, str, success } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { cleanSafeString } from "../lib/text";
import { rememberMaterial } from "../memory/services";
import { recordActivity } from "../services/activity";
import { combinedRecommendations, normalizeType } from "../services/resources";

function serializeSaved(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    resource_type: row.resource_type,
    description: row.description,
    url: row.url,
    course_title: row.course_title,
    source_name: row.source_name,
    author_or_channel: row.author_or_channel,
    published_date: row.published_date,
    thumbnail: row.thumbnail,
    is_saved: row.is_saved,
    created_at: row.created_at,
  };
}

const resources = new Hono<AppEnv>({ strict: false });
resources.use("*", requireUser);

resources.get("/recommendations", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const query = cleanSafeString(c.req.query("q") || c.req.query("topic") || c.req.query("course_title") || "", "", 220);
  const type = normalizeType(c.req.query("type") || "all");
  const data = await combinedRecommendations(c.env, query, type);
  await recordActivity(c.env, sql, user.id, "resource_search", "Searched Resource Hub", `You searched ${type} resources for ${query || "study resources"}.`, {
    query,
    type,
    results_count: data.count,
  });
  // Only worth remembering if the student typed something real and it found
  // matches; partial words on the way to a query are noise.
  if (query.length >= 3 && data.count > 0) {
    await rememberMaterial(c.env, user.id, {
      sourceType: "search",
      title: `Looked for ${type} resources on ${query}`,
      topic: query,
      summary: `${data.count} results`,
    });
  }
  return success("Resources fetched successfully", data);
});

resources.post("/save", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  if (!str(body.title) || !str(body.resource_type)) {
    const errors: Record<string, string[]> = {};
    if (!str(body.title)) errors.title = [body.title === undefined ? "This field is required." : "This field may not be blank."];
    if (!str(body.resource_type)) errors.resource_type = [body.resource_type === undefined ? "This field is required." : "This field may not be blank."];
    return failure("Resource save failed", errors);
  }
  const cleaned = {
    title: cleanSafeString(body.title, "Saved Resource", 220),
    resource_type: cleanSafeString(body.resource_type, "link", 20),
    description: cleanSafeString(body.description),
    url: cleanSafeString(body.url, "", 500),
    course_title: cleanSafeString(body.course_title, "", 180),
    source_name: cleanSafeString(body.source_name, "", 120),
    author_or_channel: cleanSafeString(body.author_or_channel, "", 220),
    published_date: cleanSafeString(body.published_date, "", 80),
    thumbnail: cleanSafeString(body.thumbnail, "", 500),
    is_saved: true,
  };
  // update_or_create keyed on (user, url).
  const [existing] = await sql`select id from resources_savedresource where user_id = ${user.id} and url = ${cleaned.url} limit 1`;
  let row;
  if (existing) {
    [row] = await sql`update resources_savedresource set ${sql(cleaned as never)} where id = ${existing.id as number} returning *`;
  } else {
    [row] = await sql`insert into resources_savedresource ${sql({ ...cleaned, user_id: user.id, created_at: new Date() } as never)} returning *`;
  }
  await recordActivity(c.env, sql, user.id, "resource_saved", "Saved Resource", `You saved ${cleaned.title}.`, {
    url: cleaned.url,
    resource_type: cleaned.resource_type,
  });
  await rememberMaterial(c.env, user.id, {
    sourceType: "saved",
    title: cleaned.title,
    topic: cleaned.course_title || cleaned.title,
    summary: cleaned.description.slice(0, 200),
    reference: cleaned.url,
  });
  return success("Resource saved", serializeSaved(row), existing ? 200 : 201);
});

resources.post("/track-open", async (c) => {
  const body = await readJson(c.req.raw);
  const title = cleanSafeString(body.title, "Learning resource", 220);
  const resourceType = cleanSafeString(body.resource_type, "link", 40);
  const url = cleanSafeString(body.url, "", 500);
  const sourceName = cleanSafeString(body.source_name, "", 120);
  if (!url) return failure("Resource tracking failed", { url: "Resource URL is required." }, 400);
  const user = c.get("user");
  await recordActivity(c.env, c.get("sql"), user.id, "resource_opened", "Opened Resource", `You opened ${title}.`, {
    url,
    resource_type: resourceType,
    source_name: sourceName,
  });
  await rememberMaterial(c.env, user.id, {
    sourceType: "opened",
    title,
    summary: sourceName ? `${resourceType} from ${sourceName}` : resourceType,
    reference: url,
  });
  return success("Resource open tracked", { tracked: true });
});

resources.get("/saved", async (c) => {
  const rows = await c.get("sql")`
    select * from resources_savedresource where user_id = ${c.get("user").id} and is_saved = true order by created_at desc
  `;
  return success("Saved resources fetched", rows.map(serializeSaved));
});

resources.delete("/saved/:id{[0-9]+}", async (c) => {
  const deleted = await c.get("sql")`
    delete from resources_savedresource where id = ${Number(c.req.param("id"))} and user_id = ${c.get("user").id} returning id
  `;
  if (!deleted.length) throw notFound("SavedResource");
  return success("Saved resource deleted");
});

export default resources;
