// POST /api/logout → forget the session in this browser.
const { writeSession } = require("../lib/session");
const { send, sameOrigin } = require("../lib/http");

module.exports = async (req, res) => {
  if (req.method !== "POST" || !sameOrigin(req)) return send(res, 403, { error: "forbidden" });
  writeSession(res, null);
  send(res, 200, { ok: true });
};
