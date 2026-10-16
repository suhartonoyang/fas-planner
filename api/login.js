// GET /api/login → send the user to Atlassian to sign in and approve access.
const crypto = require("crypto");
const { authorizeUrl } = require("../lib/atlassian");
const { addCookies, cookie } = require("../lib/session");
const { redirect, send } = require("../lib/http");

module.exports = async (req, res) => {
  try {
    const state = crypto.randomBytes(24).toString("base64url");
    addCookies(res, [cookie("fas_state", state, 600)]);
    redirect(res, authorizeUrl(state, req));
  } catch (e) {
    send(res, 500, { error: e.message, code: e.code || "config" });
  }
};
