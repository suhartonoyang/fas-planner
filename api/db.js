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
      const att = await A.getAttachment(sess);
      let state, version, source;
      if (att) { state = await A.downloadAttachment(sess, att); version = att.version; source = "attachment"; }
      else { // older format: JSON inside the page – it moves to the attachment on the next save
        const p = await A.getPage(sess);
        state = A.parseState(((p.body || {}).storage || {}).value || ""); version = null; source = "page";
      }
      return send(res, 200, { state, version, source, pageUrl: A.PAGE_URL, me: sess.name, email: sess.email });
    }

    if (req.method === "POST") {
      let b;
      try { b = await body(req); } catch (e) { return send(res, 400, { error: "Invalid request", code: "bad_request" }); }
      const state = b && b.state;
      if (!state || typeof state !== "object" || !state.years) return send(res, 400, { error: "Invalid planner data", code: "bad_request" });
      const att = await A.getAttachment(sess);
      const cur = att ? att.version : null;
      const base = b.baseVersion === undefined ? null : b.baseVersion;
      if (base !== cur) return send(res, 409, { error: "Someone saved to Confluence first.", code: "conflict", version: cur });
      const msg = String(b.message || "Saved from FAS Planner").slice(0, 250);
      const newV = await A.uploadAttachment(sess, state, msg);
      let warning = "";
      try { // refresh the readable summary on the page – the data itself is already saved
        const p = await A.getPageMeta(sess);
        const r = await A.putPage(sess, p.title, ((p.version || {}).number || 0) + 1, A.buildBody(b.summary, newV), msg);
        if (r.status !== 200 && r.status !== 201) warning = `Data saved, but the summary on the Confluence page could not be refreshed (HTTP ${r.status}).`;
      } catch (e) { warning = "Data saved, but the summary on the Confluence page could not be refreshed."; }
      return send(res, 200, { ok: true, version: newV, warning });
    }

    send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    if (e.code === "no_login" || e.code === "auth") writeSession(res, null);
    send(res, e.status || 502, { error: e.message || "Could not reach Confluence", code: e.code || "network" });
  }
};
