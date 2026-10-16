# FAS Planner – Web (Vercel + Confluence)

The team opens one URL and signs in with their **Atlassian account**. The planner reads and saves its data on the Confluence page **[0] FAS Planner Database** using each person's own Confluence permissions.

- Vercel only hosts the page and passes requests through. It stores no planner data.
- Only people who can open the Confluence page can see the plan, and only people who can edit it can save.
- "Updated … by" shows the real name of whoever saved last, taken from their Atlassian account.

```
upload-to-github/    → the web app (index.html, api/, lib/, vercel.json, package.json). Upload ALL of it.
first-time-data/     → fas_planner_seed.json = the FAS 2026 data from 14 Oct 2026. NEVER upload it anywhere.
```

Setup takes about 30 minutes and is done once, by the planner admin.

---

## 1. Atlassian – create the sign-in app (OAuth 2.0)

1. Open https://developer.atlassian.com/console/myapp, signed in with your **work** Atlassian account → **Create → OAuth 2.0 integration** → name `FAS Planner` → Create.
2. **Permissions**:
   - **Confluence API** → Add → Configure → **Granular scopes** → add `read:page:confluence` and `write:page:confluence`.
   - **User identity API** → Add (`read:me`).
3. **Authorization** → OAuth 2.0 (3LO) → **Callback URL**: `https://YOUR-APP.vercel.app/api/callback`. Use the real URL after step 3. You can come back and change it.
4. **Distribution** → Edit → turn **Sharing** on so colleagues can sign in. Without this, only you can sign in. Fill in the vendor name (GDN) and a privacy-policy link (an internal Confluence page is fine).
5. **Settings** → copy the **Client ID** and **Secret**.

> If your organization restricts third-party apps, a Confluence/Atlassian admin may need to allow "FAS Planner" the first time someone signs in.

## 2. GitHub – store the app

1. Create a **Private** repository named `fas-planner` on GitHub (use your work account).
2. Click **uploading an existing file**, drag in **everything inside** `upload-to-github/` (the `api` and `lib` folders, `index.html`, `vercel.json`, `package.json`), then **Commit**.

## 3. Vercel – put it online

1. On https://vercel.com, click **Continue with GitHub** → **Add New → Project** → import `fas-planner`. Framework: **Other**. Leave the build settings empty.
2. Under **Environment Variables**, add these four:

   | Name | Value |
   |---|---|
   | `ATLASSIAN_CLIENT_ID` | Client ID from step 1 |
   | `ATLASSIAN_CLIENT_SECRET` | Secret from step 1 |
   | `SESSION_SECRET` | A random string of 40+ characters (e.g. from a password generator). Keep it secret. |
   | `APP_URL` | Your site address, e.g. `https://fas-planner.vercel.app` (no slash at the end) |

   Optional: `ALLOWED_EMAIL_DOMAINS` = `gdn-commerce.com` to refuse any other email domain.
3. **Deploy**. If the final URL differs from what you used, update `APP_URL` (Vercel → Settings → Environment Variables → Redeploy) and the Callback URL in step 1.3.

> **Plan note:** Vercel's free Hobby plan is for personal, non-commercial use. A company tool may need the Pro plan; check with your manager.

## 4. First time only – load the data

If the Confluence page has no planner data yet, the planner says **"The planner database is empty"**:

1. Click **Choose data file…** → pick `first-time-data/fas_planner_seed.json`.
2. Check the plan, then press **Save changes**. The data is now on the Confluence page.
3. Delete `fas_planner_seed.json` from your computer.

Skip this step if someone already saved from the desktop (Python) version, because the data is then already on the page.

## 5. Control who can see the plan

On the Confluence page **[0] FAS Planner Database**, click the 🔒 **Restrictions** icon and allow only your team. This decides who can view the planner (view permission) and who can save (edit permission).

---

## Daily use

- Open the URL → **Sign in with Atlassian** (first time: approve access) → edit → **Save changes**.
- If someone saved after you opened the page, you are asked to reload. Your edits are kept as a draft you can restore.
- If your session expires while editing, you are asked to sign in again. Your edits stay as a draft.
- **⚙ Settings**: theme, language, Excel export/import, the Confluence page link, and **Sign out**.
- The desktop (Python) version still works with the same Confluence page, so both versions can be used side by side.

## Updating the app

When you get a new `index.html` (or other files), upload them to the GitHub repo (**Add file → Upload files → Commit**). Vercel deploys automatically within about a minute.

## How it stays secure

- **Sign-in:** Atlassian OAuth. The app never sees passwords.
- **Session:** Atlassian tokens are kept in an encrypted, HttpOnly session cookie. Page scripts cannot read it, and it lasts up to 30 days or until Sign out.
- **Confluence access:** every call to Confluence uses the signed-in person's own token, so Confluence permissions apply.
- **No data on the website:** the website files contain no planner data. Data appears only after sign-in.
- **Vercel location:** Vercel functions run in Singapore (`sin1`) and keep nothing.
