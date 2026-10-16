// GET /api/health → setup check: which settings are filled in (never their values) and the Callback URL to register.
const A = require("../lib/atlassian");
const { send } = require("../lib/http");

module.exports = async (req, res) => {
  const set = (k) => Boolean(process.env[k] && String(process.env[k]).trim());
  let site = "", callback = "", err = "";
  try { site = A.appUrl(req); callback = A.redirectUri(req); } catch (e) { err = e.message; }
  const secretOk = set("SESSION_SECRET") && String(process.env.SESSION_SECRET).length >= 32;
  const ok = set("ATLASSIAN_CLIENT_ID") && set("ATLASSIAN_CLIENT_SECRET") && secretOk && !err;
  send(res, 200, {
    ok,
    settings: {
      ATLASSIAN_CLIENT_ID: set("ATLASSIAN_CLIENT_ID") ? "set" : "MISSING",
      ATLASSIAN_CLIENT_SECRET: set("ATLASSIAN_CLIENT_SECRET") ? "set" : "MISSING",
      SESSION_SECRET: !set("SESSION_SECRET") ? "MISSING" : secretOk ? "set" : "TOO SHORT (needs 32+ characters)",
      APP_URL: set("APP_URL") ? "set" : "not set (optional – using the address you opened)",
    },
    siteAddress: site || err,
    callbackUrlToRegisterInAtlassian: callback || err,
    confluencePage: A.PAGE_URL,
  });
};
