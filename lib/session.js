// Encrypted session cookie (AES-256-GCM). The Atlassian tokens never reach the browser's JavaScript:
// the cookie is HttpOnly and its content is encrypted with SESSION_SECRET.
const crypto = require("crypto");

const NAME = "fas_s";
const CHUNK = 3800; // stay below the 4 KB per-cookie browser limit
const MAX_CHUNKS = 6;
const MAX_AGE = 30 * 24 * 3600;

function key() {
  const s = process.env.SESSION_SECRET || "";
  if (s.length < 32) throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  return crypto.createHash("sha256").update(s).digest();
}

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

function unseal(s) {
  try {
    const b = Buffer.from(s, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function addCookies(res, list) {
  const prev = res.getHeader("Set-Cookie");
  const arr = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  res.setHeader("Set-Cookie", arr.concat(list));
}

function readSession(req) {
  const c = parseCookies(req);
  let s = "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const v = c[NAME + i];
    if (!v) break;
    s += v;
  }
  return s ? unseal(s) : null;
}

function writeSession(res, obj) {
  const v = obj ? seal(obj) : "";
  const parts = [];
  for (let i = 0; i < v.length; i += CHUNK) parts.push(v.slice(i, i + CHUNK));
  if (parts.length > MAX_CHUNKS) throw new Error("Session too large");
  const list = [];
  for (let i = 0; i < MAX_CHUNKS; i++) list.push(i < parts.length ? cookie(NAME + i, parts[i], MAX_AGE) : cookie(NAME + i, "", 0));
  addCookies(res, list);
}

module.exports = { readSession, writeSession, parseCookies, addCookies, cookie };
