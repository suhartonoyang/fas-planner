// Small request / response helpers that work on Vercel and in plain Node.
function send(res, status, obj, headers) {
  const data = Buffer.from(JSON.stringify(obj));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const k in headers || {}) res.setHeader(k, headers[k]);
  res.end(data);
}

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function query(req) {
  return Object.fromEntries(new URL(req.url, "http://x").searchParams);
}

async function body(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const t = Buffer.concat(chunks).toString("utf8");
  return t ? JSON.parse(t) : {};
}

// API calls must come from the planner page itself: custom header (forces a CORS preflight that is never
// approved) and, when the browser sends one, an Origin equal to APP_URL.
function sameOrigin(req) {
  if (req.headers["x-fas-planner"] !== "1") return false;
  const o = req.headers.origin;
  if (!o) return true;
  let app = "";
  try { app = require("./atlassian").appUrl(req); } catch (e) { return false; }
  return o === app;
}

module.exports = { send, redirect, query, body, sameOrigin };
