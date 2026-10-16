// Atlassian OAuth 2.0 (3LO) + Confluence REST v2 helpers. Every call uses the signed-in user's own token,
// so Confluence permissions (who can see / edit the database page) decide what each person can do.
const SITE = (process.env.CONFLUENCE_SITE || "gdncomm.atlassian.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
const PAGE_ID = process.env.PAGE_ID || "2446950561";
const AUTH_BASE = process.env.ATLASSIAN_AUTH_BASE || "https://auth.atlassian.com"; // overridable for tests only
const API_BASE = process.env.ATLASSIAN_API_BASE || "https://api.atlassian.com";
const SCOPES = "read:page:confluence write:page:confluence read:me offline_access";
const PAGE_URL = `https://${SITE}/wiki/spaces/PGM/pages/${PAGE_ID}`;

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || "confluence_" + status;
  }
}

function appUrl() {
  const u = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!u) throw new ApiError(500, "APP_URL is not set", "config");
  return u;
}
const redirectUri = () => appUrl() + "/api/callback";

function authorizeUrl(state) {
  const p = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: process.env.ATLASSIAN_CLIENT_ID || "",
    scope: SCOPES,
    redirect_uri: redirectUri(),
    state,
    response_type: "code",
    prompt: "consent",
  });
  return `${AUTH_BASE}/authorize?${p}`;
}

async function tokenRequest(body) {
  const r = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.ATLASSIAN_CLIENT_ID, client_secret: process.env.ATLASSIAN_CLIENT_SECRET, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(401, j.error_description || j.error || "Atlassian sign-in failed", "auth");
  return j;
}

async function getJson(url, token) {
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.message || "Atlassian request failed");
  return j;
}

// Called once after the user approved access: exchange the code and build the session.
async function startSession(code) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  const sites = await getJson(`${API_BASE}/oauth/token/accessible-resources`, t.access_token);
  const site = (sites || []).find((s) => String(s.url || "").replace(/^https?:\/\//, "").replace(/\/$/, "") === SITE);
  if (!site) throw new ApiError(403, `Your Atlassian account has no access to ${SITE}.`, "no_site");
  const me = await getJson(`${API_BASE}/me`, t.access_token).catch(() => ({}));
  const allowed = String(process.env.ALLOWED_EMAIL_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  const email = String(me.email || "").toLowerCase();
  if (allowed.length && !allowed.includes(email.split("@")[1] || "")) throw new ApiError(403, "This account is not allowed to use the planner.", "not_allowed");
  return {
    at: t.access_token,
    rt: t.refresh_token || null,
    exp: Date.now() + (t.expires_in || 3600) * 1000,
    cloudId: site.id,
    name: me.name || me.nickname || email || "",
    email,
  };
}

// Refresh the access token when it is about to expire. Returns true when the session changed.
async function ensureFresh(sess) {
  if (Date.now() < sess.exp - 60000) return false;
  if (!sess.rt) throw new ApiError(401, "Your session has expired. Please sign in again.", "no_login");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: sess.rt });
  sess.at = t.access_token;
  if (t.refresh_token) sess.rt = t.refresh_token;
  sess.exp = Date.now() + (t.expires_in || 3600) * 1000;
  return true;
}

async function confluence(sess, method, path, body) {
  const r = await fetch(`${API_BASE}/ex/confluence/${sess.cloudId}${path}`, {
    method,
    headers: { Authorization: "Bearer " + sess.at, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let j = {};
  try { j = txt ? JSON.parse(txt) : {}; } catch (e) { j = { message: txt.slice(0, 300) }; }
  return { status: r.status, json: j };
}

function pageError(status, j) {
  let msg = (j && (j.message || (Array.isArray(j.errors) && j.errors[0] && (j.errors[0].title || j.errors[0].detail)))) || "";
  if (status === 401) return new ApiError(401, "Your session has expired. Please sign in again.", "no_login");
  if (status === 403) return new ApiError(403, "Your Atlassian account has no permission for the planner's Confluence page. " + msg);
  if (status === 404) return new ApiError(404, "The planner's Confluence page was not found, or you cannot see it. " + msg);
  return new ApiError(502, msg || `Confluence error HTTP ${status}`);
}

async function getPage(sess) {
  const r = await confluence(sess, "GET", `/wiki/api/v2/pages/${PAGE_ID}?body-format=storage`);
  if (r.status !== 200) throw pageError(r.status, r.json);
  return r.json;
}

async function putPage(sess, title, version, storage, message) {
  return confluence(sess, "PUT", `/wiki/api/v2/pages/${PAGE_ID}`, {
    id: PAGE_ID, status: "current", title,
    body: { representation: "storage", value: storage },
    version: { number: version, message: String(message || "Saved from FAS Planner").slice(0, 250) },
  });
}

// ---- the planner JSON lives in a code block on the page (same format as the desktop version) ----
function parseState(storage) {
  const re = /<ac:plain-text-body>([\s\S]*?)<\/ac:plain-text-body>/g;
  let m;
  while ((m = re.exec(storage || ""))) {
    const parts = [...m[1].matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((x) => x[1]);
    const txt = (parts.length ? parts.join("") : m[1]).trim();
    if (!txt.startsWith("{")) continue;
    let j;
    try { j = JSON.parse(txt); } catch (e) { throw new ApiError(422, "The JSON block on the Confluence page is not valid JSON. Restore an earlier version from the page history.", "bad_json"); }
    if (j && typeof j === "object" && j.years) return j;
  }
  return null;
}

const cdata = (s) => "<![CDATA[" + s.split("]]>").join("]]]]><![CDATA[>") + "]]>";

function buildBody(summary, state) {
  const code = '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter>' +
    "<ac:plain-text-body>" + cdata(JSON.stringify(state)) + "</ac:plain-text-body></ac:structured-macro>";
  const expand = '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">Planner data (JSON) – do not edit</ac:parameter>' +
    "<ac:rich-text-body>" + code + "</ac:rich-text-body></ac:structured-macro>";
  return String(summary || "") + "<h2>Data</h2>" + expand;
}

module.exports = { SITE, PAGE_ID, PAGE_URL, ApiError, authorizeUrl, startSession, ensureFresh, getPage, putPage, parseState, buildBody };
