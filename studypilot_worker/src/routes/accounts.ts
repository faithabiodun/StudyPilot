// Port of apps/accounts/views.py.

import { Hono } from "hono";
import type { Sql } from "../db";
import type { Env } from "../env";
import { Validator, failure, readJson, str, success } from "../http";
import { blacklist, decode, isBlacklisted, accessFor, tokensFor, TokenError } from "../auth/jwt";
import { checkPassword, hashPassword } from "../auth/password";
import { SuiVerificationError, verifyPersonalMessage } from "../auth/sui";
import {
  createUser,
  requireUser,
  serializeUser,
  unusablePassword,
  userByEmail,
  userById,
  type AppEnv,
  type User,
} from "../auth/users";
import { charField, emailField, required, smallPositiveInt, urlField } from "../lib/fields";
import { recordActivity, recordLogin } from "../services/activity";

const SUI_CHALLENGE_TTL_SECONDS = 300;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;
// Reserved so a handle can never be mistaken for one of our own routes.
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "studypilot", "support", "help", "api",
  "login", "logout", "register", "signup", "signin", "me", "profile",
  "dashboard", "settings", "student", "null", "undefined", "system",
]);

/** The exact text the wallet signs. Must match on both sides byte for byte. */
export function suiChallengeMessage(nonce: string): string {
  return (
    "Sign in to StudyPilot\n\n" +
    "This signature proves you own this wallet. " +
    "It is free and does not create a transaction.\n\n" +
    `Nonce: ${nonce}`
  );
}

/** Shared rules so the register form and the set-username endpoint agree. Returns an error or "". */
async function usernameProblem(sql: Sql, value: unknown): Promise<string> {
  const handle = str(value).trim();
  if (!USERNAME_PATTERN.test(handle)) {
    return "Username must be 3 to 30 characters and use only letters, numbers, or underscores.";
  }
  if (RESERVED_USERNAMES.has(handle.toLowerCase())) return "That username is reserved. Please choose another.";
  // Case-insensitive so Faith and faith cannot both be taken.
  const taken = await sql`select 1 from accounts_user where lower(username) = lower(${handle}) limit 1`;
  return taken.length ? "That username is already taken." : "";
}

async function authPayload(env: Env, sql: Sql, user: User) {
  return { ...(await tokensFor(env, sql, user.id)), user: serializeUser(user) };
}

const accounts = new Hono<AppEnv>({ strict: false });

accounts.post("/register", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const v = new Validator();

  const fullName = required(v, "full_name", body.full_name) ? charField(v, "full_name", body.full_name, { maxLength: 255 }) : undefined;
  let username = required(v, "username", body.username) ? charField(v, "username", body.username, { maxLength: 30 }) : undefined;
  if (username !== undefined) {
    const problem = await usernameProblem(sql, username);
    if (problem) v.add("username", problem);
    else username = username.trim();
  }
  let email = emailField(v, "email", body.email);
  if (email !== undefined) {
    if (await userByEmail(sql, email)) v.add("email", "Email already exists.");
    email = email.toLowerCase();
  }
  const password = required(v, "password", body.password) ? str(body.password) : undefined;
  if (password === "" ) v.add("password", "This field may not be blank.");
  const confirm = required(v, "confirm_password", body.confirm_password) ? str(body.confirm_password) : undefined;
  if (confirm === "") v.add("confirm_password", "This field may not be blank.");
  // The Django serializer took `role` from the request, so anyone could sign up
  // as an admin. Accounts are always created as students; admins are promoted
  // in the database.
  if (!v.ok) return failure("Registration failed", v.errors);

  if (password !== confirm) return failure("Registration failed", { confirm_password: ["Password mismatch."] });

  const hashed = await hashPassword(c.env, password!, { email: email!, username: username!, full_name: fullName! });
  if (hashed.errors?.length || !hashed.hash) {
    return failure("Registration failed", { non_field_errors: hashed.errors?.length ? hashed.errors : ["Password could not be set."] });
  }
  let user: User;
  try {
    user = await createUser(sql, { email: email!, password: hashed.hash, full_name: fullName!, username: username! });
  } catch {
    // The unique indexes decide races the checks above cannot.
    return failure("Registration failed", { email: ["Email or username already exists."] });
  }
  return success("Registration successful", await authPayload(c.env, sql, user), 201);
});

accounts.post("/login", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const email = emailField(v, "email", body.email);
  if (required(v, "password", body.password) && !str(body.password)) v.add("password", "This field may not be blank.");
  if (!v.ok) return failure("Invalid login payload", v.errors);

  const user = await userByEmail(sql, email!.toLowerCase());
  if (!user || !(await checkPassword(c.env, str(body.password), user.password))) {
    return failure("Invalid login credentials", {}, 401);
  }
  if (!user.is_active) return failure("User account is disabled", {}, 403);
  await recordLogin(c.env, sql, user.id);
  return success("Login successful", await authPayload(c.env, sql, user));
});

accounts.post("/google", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const token = str(body.credential || body.id_token);
  if (!token) return failure("Google token invalid", { non_field_errors: ["Google credential or id_token is required."] });
  if (!c.env.GOOGLE_CLIENT_ID) return failure("GOOGLE_CLIENT_ID is not configured", {}, 500);

  // Google's tokeninfo endpoint checks the signature and expiry for us.
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
  const payload = (await response.json().catch(() => ({}))) as Record<string, string>;
  const issuerOk = ["accounts.google.com", "https://accounts.google.com"].includes(payload.iss);
  if (!response.ok || payload.aud !== c.env.GOOGLE_CLIENT_ID || !issuerOk) {
    return failure("Google token invalid", {}, 401);
  }
  const email = (payload.email || "").toLowerCase();
  const googleId = payload.sub;
  if (!email || !googleId) return failure("Google token missing required profile data", {}, 400);

  let user = await userByEmail(sql, email);
  if (!user) {
    user = await createUser(sql, {
      email,
      password: unusablePassword(),
      full_name: payload.name || email.split("@")[0],
      avatar: payload.picture || "",
      google_id: googleId,
      is_google_account: true,
    });
  } else {
    [user] = (await sql`
      update accounts_user set google_id = ${user.google_id || googleId}, avatar = ${payload.picture || user.avatar},
        is_google_account = true, updated_at = ${new Date()}
      where id = ${user.id} returning *
    `) as unknown as User[];
  }
  await recordLogin(c.env, sql, user.id);
  return success("Google login successful", await authPayload(c.env, sql, user));
});

accounts.post("/supabase-google", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const accessToken = str(body.access_token);
  if (!accessToken) return failure("Supabase access token is required", { access_token: ["This field is required."] });
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_ANON_KEY) return failure("Supabase Auth is not configured", {}, 500);

  let response: Response;
  try {
    response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: c.env.SUPABASE_ANON_KEY },
    });
  } catch {
    return failure("Unable to verify Supabase user", {}, 503);
  }
  if (response.status !== 200) return failure("Invalid Supabase session token.", {}, 401);

  const payload = (await response.json()) as { email?: string; id?: string; user_metadata?: Record<string, string> };
  const email = (payload.email || "").toLowerCase();
  const supabaseUserId = payload.id || "";
  const metadata = payload.user_metadata || {};
  const fullName = metadata.full_name || metadata.name || metadata.display_name || (email ? email.split("@")[0] : "");
  const avatar = metadata.avatar_url || metadata.picture || "";
  if (!email || !supabaseUserId) return failure("Supabase user is missing required profile data", {}, 400);

  let user = await userByEmail(sql, email);
  if (!user) {
    user = await createUser(sql, {
      email,
      password: unusablePassword(),
      full_name: fullName,
      avatar,
      supabase_user_id: supabaseUserId,
      is_google_account: true,
    });
  } else {
    [user] = (await sql`
      update accounts_user set
        full_name = ${!user.full_name && fullName ? fullName : user.full_name},
        avatar = ${avatar && user.avatar !== avatar ? avatar : user.avatar},
        supabase_user_id = ${supabaseUserId},
        is_google_account = true,
        updated_at = ${new Date()}
      where id = ${user.id} returning *
    `) as unknown as User[];
  }
  await recordLogin(c.env, sql, user.id);
  return success("Google login successful", await authPayload(c.env, sql, user));
});

accounts.post("/sui/challenge", async (c) => {
  const sql = c.get("sql");
  // Opportunistically drop expired rows so the table cannot grow forever.
  const cutoff = new Date(Date.now() - SUI_CHALLENGE_TTL_SECONDS * 4 * 1000);
  await sql`delete from accounts_suiloginchallenge where created_at < ${cutoff}`;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  await sql`insert into accounts_suiloginchallenge (nonce, created_at) values (${nonce}, ${new Date()})`;
  return success("Sui challenge issued", { nonce, message: suiChallengeMessage(nonce), expires_in: SUI_CHALLENGE_TTL_SECONDS });
});

accounts.post("/sui", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const address = required(v, "address", body.address) ? charField(v, "address", body.address, { maxLength: 66 }) : undefined;
  const signature = required(v, "signature", body.signature) ? charField(v, "signature", body.signature, { maxLength: 10000 }) : undefined;
  const nonce = required(v, "nonce", body.nonce) ? charField(v, "nonce", body.nonce, { maxLength: 64 }) : undefined;
  if (!v.ok) return failure("Sui login failed", v.errors);

  // Claim the nonce atomically so two concurrent requests cannot spend the same
  // challenge and a captured signature cannot be replayed.
  const now = new Date();
  const claimed = await sql`
    update accounts_suiloginchallenge set used_at = ${now}
    where nonce = ${nonce!} and used_at is null
    returning id, created_at
  `;
  if (!claimed.length) {
    return failure("This sign-in request has already been used. Please try again.", {}, 400);
  }
  if (now.getTime() - (claimed[0].created_at as Date).getTime() > SUI_CHALLENGE_TTL_SECONDS * 1000) {
    await sql`delete from accounts_suiloginchallenge where id = ${claimed[0].id as number}`;
    return failure("This sign-in request expired. Please try again.", {}, 400);
  }

  let verified: string;
  try {
    verified = await verifyPersonalMessage(suiChallengeMessage(nonce!), signature!, address!);
  } catch (error) {
    if (error instanceof SuiVerificationError) return failure(error.message, {}, 401);
    throw error;
  }

  const [existing] = (await sql`select * from accounts_user where sui_address = ${verified}`) as unknown as User[];
  let user = existing;
  let created = false;
  if (!user) {
    // A wallet carries no email or name, so stand in placeholders and let the
    // Academic Passport onboarding collect the real details.
    const short = `${verified.slice(0, 6)}...${verified.slice(-4)}`;
    user = await createUser(sql, {
      email: `${verified}@sui.studypilot.local`,
      password: unusablePassword(),
      full_name: `Sui Wallet ${short}`,
      sui_address: verified,
    });
    created = true;
  }
  await recordLogin(c.env, sql, user.id);
  return success("Sui login successful", { ...(await authPayload(c.env, sql, user)), created, sui_address: verified });
});

accounts.get("/username/available", async (c) => {
  const handle = (c.req.query("username") || "").trim();
  const reason = await usernameProblem(c.get("sql"), handle);
  return success("Username checked", { username: handle, available: !reason, reason });
});

accounts.post("/token/refresh", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const refresh = str(body.refresh);
  if (!refresh) return Response.json({ refresh: ["This field is required."] }, { status: 400 });
  const invalid = (detail = "Token is invalid or expired") =>
    Response.json({ detail, code: "token_not_valid" }, { status: 401 });
  let payload;
  try {
    payload = await decode(refresh, c.env.SECRET_KEY, "refresh");
  } catch (error) {
    return invalid(error instanceof TokenError ? error.message : undefined);
  }
  if (await isBlacklisted(sql, payload.jti)) return invalid("Token is blacklisted");
  const user = await userById(sql, Number(payload.user_id));
  if (!user || !user.is_active) {
    return Response.json({ detail: "No active account found for the given token.", code: "no_active_account" }, { status: 401 });
  }
  // ROTATE_REFRESH_TOKENS is off, so only a new access token comes back, bare,
  // exactly like SimpleJWT's TokenRefreshView.
  return Response.json({ access: await accessFor(c.env, user.id) });
});

// Everything below needs a signed-in user.
accounts.use("/username", requireUser);
accounts.use("/logout", requireUser);
accounts.use("/me", requireUser);
accounts.use("/profile", requireUser);
accounts.use("/delete-account", requireUser);
accounts.use("/complete-onboarding", requireUser);

/**
 * Claim a username after signing in with a wallet or Google. Those flows have
 * no username to borrow, so the client sends the user here before anything else.
 */
accounts.post("/username", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  if (user.username) return failure("You already have a username.", {}, 400);
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const raw = required(v, "username", body.username) ? charField(v, "username", body.username, { maxLength: 30 }) : undefined;
  if (raw !== undefined) {
    const problem = await usernameProblem(sql, raw);
    if (problem) v.add("username", problem);
  }
  if (!v.ok) return failure("Could not set username", v.errors);

  const handle = raw!.trim();
  // The greeting reads full_name, so replace the wallet placeholder with the
  // handle the student actually picked.
  const placeholder = !user.full_name || user.full_name.startsWith("Sui Wallet ");
  try {
    const [updated] = (await sql`
      update accounts_user set username = ${handle},
        full_name = ${placeholder ? handle : user.full_name}, updated_at = ${new Date()}
      where id = ${user.id} returning *
    `) as unknown as User[];
    return success("Username set", serializeUser(updated));
  } catch {
    // Two people can pass validation at once; the unique index decides.
    return failure("That username was just taken. Please choose another.", {}, 409);
  }
});

accounts.post("/logout", async (c) => {
  const body = await readJson(c.req.raw);
  const refresh = str(body.refresh);
  if (!refresh) return failure("Refresh token is required");
  try {
    const payload = await decode(refresh, c.env.SECRET_KEY, "refresh");
    await blacklist(c.get("sql"), refresh, payload);
  } catch {
    return failure("Invalid refresh token", {}, 400);
  }
  return success("Logout successful");
});

accounts.get("/me", (c) => success("Current user fetched", serializeUser(c.get("user"))));

type ProfileField = "string" | "json" | "int" | "url";

const PROFILE_FIELDS: Record<string, [ProfileField, number]> = {
  full_name: ["string", 255],
  matric_number: ["string", 80],
  institution: ["string", 160],
  faculty: ["string", 160],
  department: ["string", 120],
  level: ["string", 50],
  semester: ["string", 80],
  current_courses: ["json", 0],
  academic_goal: ["json", 0],
  weak_courses: ["json", 0],
  preferred_learning_style: ["string", 120],
  preferred_resource_types: ["json", 0],
  study_hours_per_week: ["int", 0],
  exam_preparation_focus: ["string", 255],
  career_interest: ["string", 255],
  avatar: ["url", 200],
};

/** Coerce the submitted subset of profile fields (a DRF partial update). */
function profileUpdates(body: Record<string, unknown>, allowed: string[], v: Validator) {
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (!(field in body)) continue;
    const [kind, maxLength] = PROFILE_FIELDS[field];
    const value = body[field];
    let coerced: unknown;
    if (kind === "string") coerced = charField(v, field, value, { maxLength, allowBlank: field !== "full_name" });
    else if (kind === "url") coerced = urlField(v, field, value, maxLength);
    else if (kind === "int") coerced = smallPositiveInt(v, field, value);
    else coerced = value;
    if (coerced !== undefined) updates[field] = coerced;
  }
  return updates;
}

function cleanCourses(value: unknown, v: Validator): unknown[] | undefined {
  if (value === null || value === "") return [];
  if (!Array.isArray(value)) {
    v.add("current_courses", "Current courses must be a list.");
    return undefined;
  }
  const cleaned: { code: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    let code = "";
    let title = "";
    if (typeof item === "string") title = item.trim();
    else if (item && typeof item === "object" && !Array.isArray(item)) {
      code = str((item as Record<string, unknown>).code).trim().toUpperCase();
      title = str((item as Record<string, unknown>).title).trim();
    } else {
      v.add("current_courses", "Each course must be an object with code and title.");
      return undefined;
    }
    if (!title) {
      v.add("current_courses", "Course title cannot be empty.");
      return undefined;
    }
    const key = (code || title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ code, title });
  }
  return cleaned;
}

async function saveUserFields(sql: Sql, userId: number, updates: Record<string, unknown>): Promise<User> {
  const row: Record<string, unknown> = { ...updates, updated_at: new Date() };
  for (const key of ["current_courses", "academic_goal", "weak_courses", "preferred_resource_types"]) {
    if (key in row) row[key] = sql.json((row[key] ?? null) as never);
  }
  const [updated] = (await sql`
    update accounts_user set ${sql(row as never, Object.keys(row) as never)} where id = ${userId} returning *
  `) as unknown as User[];
  return updated;
}

function courseKey(course: unknown): string {
  if (course && typeof course === "object") {
    const c = course as Record<string, unknown>;
    return str(c.code || c.title).trim().toLowerCase();
  }
  return str(course).trim().toLowerCase();
}

accounts.patch("/profile", async (c) => {
  const sql = c.get("sql");
  const user = c.get("user");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const updates = profileUpdates(body, Object.keys(PROFILE_FIELDS), v);
  if ("current_courses" in updates) {
    const courses = cleanCourses(updates.current_courses, v);
    if (courses === undefined) delete updates.current_courses;
    else updates.current_courses = courses;
  }
  if (!v.ok) return failure("Profile update failed", v.errors);

  const before = Array.isArray(user.current_courses) ? user.current_courses : [];
  const updated = await saveUserFields(sql, user.id, updates);
  const after = Array.isArray(updated.current_courses) ? updated.current_courses : [];

  const beforeKeys = new Map(before.filter(courseKey).map((course) => [courseKey(course), course]));
  const afterKeys = new Map(after.filter(courseKey).map((course) => [courseKey(course), course]));
  const label = (course: unknown) =>
    course && typeof course === "object" ? str((course as Record<string, unknown>).title) : str(course);
  for (const [key, course] of afterKeys) {
    if (!beforeKeys.has(key)) {
      await recordActivity(c.env, sql, user.id, "course_added", "Added Course", `You added ${label(course)} to your Academic Passport.`, { course });
    }
  }
  for (const [key, course] of beforeKeys) {
    if (!afterKeys.has(key)) {
      await recordActivity(c.env, sql, user.id, "course_deleted", "Deleted Course", `You removed ${label(course)} from your Academic Passport.`, { course });
    }
  }
  const submittedCourses = body.current_courses;
  if (!submittedCourses || (Array.isArray(submittedCourses) && !submittedCourses.length)) {
    await recordActivity(c.env, sql, user.id, "profile_updated", "Updated Profile", "You updated your Academic Passport.");
  }
  return success("Profile updated", serializeUser(updated));
});

accounts.delete("/delete-account", async (c) => {
  const userId = c.get("user").id;
  // Django emulated ON DELETE CASCADE in Python, so the database constraints do
  // not cascade. Children go first, in dependency order, in one transaction.
  await c.get("sql").begin(async (tx) => {
    await tx`delete from advisor_chatmessage where session_id in (select id from advisor_chatsession where user_id = ${userId})`;
    await tx`delete from advisor_chatsession where user_id = ${userId}`;
    await tx`delete from dashboard_activitylog where user_id = ${userId}`;
    await tx`delete from dashboard_loginactivity where user_id = ${userId}`;
    await tx`delete from dashboard_usersessionactivity where user_id = ${userId}`;
    await tx`delete from documents_documentchunk where user_id = ${userId}`;
    await tx`delete from flashcards_flashcard where deck_id in (select id from flashcards_flashcarddeck where user_id = ${userId})`;
    await tx`delete from flashcards_flashcarddeck where user_id = ${userId}`;
    await tx`delete from quizzes_quizoption where question_id in (select q.id from quizzes_quizquestion q join quizzes_quiz z on z.id = q.quiz_id where z.user_id = ${userId})`;
    await tx`delete from quizzes_quizquestion where quiz_id in (select id from quizzes_quiz where user_id = ${userId})`;
    await tx`delete from quizzes_quiz where user_id = ${userId}`;
    // Other users' decks or quizzes never point at this user's documents, but
    // SET_NULL is what Django would do, so mirror it before the delete.
    await tx`update flashcards_flashcarddeck set document_id = null where document_id in (select id from documents_document where user_id = ${userId})`;
    await tx`update quizzes_quiz set document_id = null where document_id in (select id from documents_document where user_id = ${userId})`;
    await tx`delete from documents_documentchunk where document_id in (select id from documents_document where user_id = ${userId})`;
    await tx`delete from documents_document where user_id = ${userId}`;
    await tx`delete from resources_savedresource where user_id = ${userId}`;
    await tx`update token_blacklist_outstandingtoken set user_id = null where user_id = ${userId}`;
    await tx`delete from accounts_user_groups where user_id = ${userId}`;
    await tx`delete from accounts_user_user_permissions where user_id = ${userId}`;
    await tx`delete from django_admin_log where user_id = ${userId}`;
    await tx`delete from accounts_user where id = ${userId}`;
  });
  return success("Account deleted successfully.");
});

const ONBOARDING_FIELDS = [
  "matric_number", "institution", "faculty", "department", "level", "semester",
  "current_courses", "academic_goal", "weak_courses", "preferred_learning_style",
  "preferred_resource_types", "study_hours_per_week", "exam_preparation_focus", "career_interest",
];
const ONBOARDING_REQUIRED = [
  "institution", "department", "level", "semester", "current_courses",
  "academic_goal", "preferred_learning_style", "preferred_resource_types",
];

accounts.post("/complete-onboarding", async (c) => {
  const sql = c.get("sql");
  const body = await readJson(c.req.raw);
  const v = new Validator();
  const updates = profileUpdates(body, ONBOARDING_FIELDS, v);
  if (v.ok) {
    for (const field of ONBOARDING_REQUIRED) {
      const value = updates[field];
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
        v.add(field, "This field is required.");
      }
    }
  }
  if (!v.ok) return failure("Academic Passport setup failed", v.errors);
  const updated = await saveUserFields(sql, c.get("user").id, { ...updates, profile_completed: true });
  return success("Academic Passport completed", serializeUser(updated));
});

export default accounts;
