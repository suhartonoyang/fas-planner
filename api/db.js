// GET  /api/db → planner data from the Confluence page (as the signed-in user)
// POST /api/db → save: version check, then update the Confluence page (as the signed-in user)
const A = require("../lib/atlassian");
const { readSession, writeSession } = require("../lib/session");
const { send, body, sameOrigin } = require("../lib/http");

module.exports = async (req, res) => {
  if (!sameOrigin(req)) return send(res, 403, { error: "forbidden" });
  let sess;
  try { sess = readSession(req); } catch (e) { return send(res, 500, { error: e.message, code: "config" }); }
  if (!sess || !sess.at) return send(res, 401, { error: "Sign in with your Atlassian account.", code: "no_login" });

  try {
    if (await A.ensureFresh(sess)) writeSession(res, sess);

    if (req.method === "GET") {
      const p = await A.getPage(sess);
      const storage = ((p.body || {}).storage || {}).value || "";
      return send(res, 200, { state: A.parseState(storage), version: (p.version || {}).number, title: p.title, pageUrl: A.PAGE_URL, me: sess.name, email: sess.email });
    }

    if (req.method === "POST") {
      let b;
      try { b = await body(req); } catch (e) { return send(res, 400, { error: "Invalid request", code: "bad_request" }); }
      const state = b && b.state;
      if (!state || typeof state !== "object" || !state.years) return send(res, 400, { error: "Invalid planner data", code: "bad_request" });
      const p = await A.getPage(sess);
      const cur = (p.version || {}).number;
      let hasState = true;
      try { hasState = A.parseState(((p.body || {}).storage || {}).value || "") !== null; } catch (e) { hasState = true; }
      const base = b.baseVersion === undefined ? null : b.baseVersion;
      if ((base === null && hasState) || (base !== null && base !== cur)) return send(res, 409, { error: "Someone saved to Confluence first.", code: "conflict", version: cur });
      const r = await A.putPage(sess, p.title, cur + 1, A.buildBody(b.summary, state), b.message);
      if (r.status === 409) return send(res, 409, { error: "Someone saved to Confluence first.", code: "conflict" });
      if (r.status !== 200 && r.status !== 201) throw (r.status === 401 || r.status === 403 || r.status === 404) ? new A.ApiError(r.status, "Your Atlassian account cannot edit the planner's Confluence page.") : new A.ApiError(502, (r.json && r.json.message) || `Confluence error HTTP ${r.status}`);
      return send(res, 200, { ok: true, version: ((r.json || {}).version || {}).number || cur + 1 });
    }

    send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    if (e.code === "no_login" || e.code === "auth") writeSession(res, null);
    send(res, e.status || 502, { error: e.message || "Could not reach Confluence", code: e.code || "network" });
  }
};
