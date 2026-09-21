// Port of apps/academics/views.py.

import { Hono } from "hono";
import { Validator, failure, readJson, success } from "../http";
import { requireUser, type AppEnv } from "../auth/users";
import { charField } from "../lib/fields";

const academics = new Hono<AppEnv>({ strict: false });
academics.use("*", requireUser);

const serialize = (row: Record<string, unknown>) => ({
  id: row.id,
  code: row.code,
  title: row.title,
  department: row.department,
  level: row.level,
  description: row.description,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

academics.get("/courses", async (c) => {
  const rows = await c.get("sql")`select * from academics_course order by code`;
  return success("Courses fetched", rows.map(serialize));
});

academics.post("/courses", async (c) => {
  if (c.get("user").role !== "admin") return failure("Permission denied", {}, 403);
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const code = body.code === undefined ? (v.add("code", "This field is required."), undefined) : charField(v, "code", body.code, { maxLength: 30 });
  const title = body.title === undefined ? (v.add("title", "This field is required."), undefined) : charField(v, "title", body.title, { maxLength: 180 });
  const department = body.department === undefined ? "" : charField(v, "department", body.department, { maxLength: 120, allowBlank: true });
  const level = body.level === undefined ? "" : charField(v, "level", body.level, { maxLength: 50, allowBlank: true });
  const description = body.description === undefined ? "" : charField(v, "description", body.description, { maxLength: 100000, allowBlank: true });
  if (code !== undefined && (await sql`select 1 from academics_course where code = ${code}`).length) {
    v.add("code", "course with this code already exists.");
  }
  if (!v.ok) return failure("Course creation failed", v.errors);
  const now = new Date();
  const [row] = await sql`
    insert into academics_course (code, title, department, level, description, created_at, updated_at)
    values (${code!}, ${title!}, ${department ?? ""}, ${level ?? ""}, ${description ?? ""}, ${now}, ${now})
    returning *
  `;
  return success("Course created", serialize(row), 201);
});

export default academics;
