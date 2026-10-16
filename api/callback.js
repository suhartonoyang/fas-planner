// GET /api/callback?code=…&state=… → Atlassian sends the user back here after sign-in.
const { startSession } = require("../lib/atlassian");
const { parseCookies, writeSession, addCookies, cookie } = require("../lib/session");
const { redirect, query } = require("../lib/http");

const page = (title, msg) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FAS Planner</title>` +
  `<div style="font:15px system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 16px"><h2>${title}</h2><p>${msg}</p><p><a href="/">Back to the planner</a></p></div>`;
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

module.exports = async (req, res) => {
  const q = query(req);
  const expected = parseCookies(req).fas_state;
  addCookies(res, [cookie("fas_state", "", 0)]);
  const fail = (status, title, msg) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(page(esc(title), esc(msg)));
  };
  if (q.error) return fail(400, "Sign-in cancelled", q.error_description || q.error);
  if (!q.code || !q.state || !expected || q.state !== expected) return fail(400, "Sign-in expired", "Please start the sign-in again from the planner.");
  try {
    const sess = await startSession(q.code, req);
    writeSession(res, sess);
    redirect(res, "/");
  } catch (e) {
    fail(e.status || 500, "Could not sign in", e.message);
  }
};
