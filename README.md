# Hygge · Three years together

A warm, presentation-style celebration with live voting, an exact one-award-per-person allocation, and personalized SVG/PNG badges. No database, dependencies, accounts, fonts, analytics, or external assets.

## Run

Use Node.js 22 or newer:

```sh
npm start
```

Open http://localhost:3000. No `npm install` is needed. Set `PORT` if required.

For phones or other computers, deploy first (recommended), or use your computer's LAN address on a trusted shared network. A `localhost` invitation only works on the same computer.

## Manual deployment: enderyuksel.github.io/hygge3/

Use **GitHub Pages for the website** and **one free Render web service for live voting**. This bundle is prepared for that split: relative asset/invitation paths, a configurable relay origin, and restricted cross-origin requests. No database is needed. Nothing has been published for you.

### 1. Create a new GitHub repository

Create a **public** repository named **hygge3**, owned by **enderyuksel**, with default branch **main**. Upload the *contents* of this extracted folder, not the ZIP or its enclosing folder. [package.json](./package.json), [server.mjs](./server.mjs), [public/](./public/), and [.github/](./.github/) must be at the repository root.

Do **not** change the existing `enderyuksel.github.io` repository. This new project repository produces the `/hygge3/` URL separately. The source includes your team members' names and will be public.

If uploading through GitHub's web interface, make sure [.github/workflows/pages.yml](./.github/workflows/pages.yml) is included. On macOS, Command+Shift+Period shows hidden folders in Finder. Alternatively, use **Add file > Create new file** on GitHub, enter `.github/workflows/pages.yml`, and paste that file's contents.

### 2. Create the free Render relay

In your regular browser, open the [Render dashboard](https://dashboard.render.com/):

1. Choose **New > Web Service**, then connect `enderyuksel/hygge3`.
2. Select branch **main** and runtime **Node**. Leave **Root Directory** empty.
3. Set **Build Command** to `node --version`.
4. Set **Start Command** to `npm start`.
5. Select the **Free** instance type. Do not add a database, disk, or paid instance.
6. Add environment variable **ALLOWED_ORIGIN** with the exact value `https://enderyuksel.github.io` (no `/hygge3` and no trailing slash).
7. Deploy and copy the service's actual HTTPS URL, such as `https://YOUR-SERVICE.onrender.com`.
8. Visit `https://YOUR-SERVICE.onrender.com/api/health`. It should display `{"ok":true}`. A sleeping service can take about a minute to wake.

You can instead create a Blueprint using [render.yaml](./render.yaml), which already selects the free plan and sets the allowed origin. Use only one instance.

### 3. Point the website at that relay

Edit [public/config.mjs](./public/config.mjs) in GitHub and replace the empty string with the actual Render URL:

```js
export const RELAY_URL = 'https://YOUR-SERVICE.onrender.com';
```

Use HTTPS and the origin only: no `/api`, query string, or fragment. Commit the change to **main**. This is a public service address, not a secret. Do not put API keys, passwords, or invitation credentials in this file.

### 4. Enable GitHub Pages

In `enderyuksel/hygge3`, open **Settings > Pages** and set **Source** to **GitHub Actions**.

Open **Actions > Deploy Hygge to GitHub Pages > Run workflow**, selecting **main**. Wait for a green deployment. An earlier run may have failed because Pages was not yet enabled; rerun it after changing the setting.

Your website will be at **https://enderyuksel.github.io/hygge3/**.

The workflow publishes only [public/](./public/), not the server, tests, or recovery backups. Further commits to **main** deploy automatically. Render may also restart on commits, so finish deploying before creating a real ceremony.

### 5. Rehearse once

1. Open the GitHub Pages URL and click **Let's celebrate**.
2. Open **Host desk**, then open Ender's **Vote** link in another tab. The link must retain `/hygge3/`.
3. Advance to voting, submit a test ballot, confirm closing with one ballot, and reveal all eight awards.
4. Check a badge download. Start a **new** session for the actual celebration.

If the page says the relay is not configured, check [public/config.mjs](./public/config.mjs) and wait for the latest Pages deployment. If requests fail, check the Render health URL and `ALLOWED_ORIGIN`, then refresh. A 404 from Pages usually means the workflow did not deploy or the repository name differs. A custom domain on your existing personal site can change the effective Pages address; in that case use the URL shown in **Settings > Pages** and set Render's `ALLOWED_ORIGIN` to its origin.

## Alternative: the complete site on Render

1. Extract this bundle and upload its contents into your own GitHub repository. Keep the repository root at the level containing [package.json](./package.json).
2. In Render, choose **New > Web Service** and connect the repository.
3. Choose **Node**, build command `node --version`, start command `npm start`, and the **Free** instance type.
4. Leave `RELAY_URL` empty in [public/config.mjs](./public/config.mjs), then visit the HTTPS address Render provides. All invitations use that address automatically.

Alternatively, create a Render Blueprint from the repository using [render.yaml](./render.yaml). No database or environment secrets are needed. Do not scale to multiple instances: sessions belong to a single process.

The relay is a **Node web service**, not a static-only site. GitHub Pages cannot run it. The Node server can serve both the website and Server-Sent Events (SSE), or serve as the relay for the GitHub Pages frontend. Any host supporting a persistent Node process and unbuffered SSE is suitable.

Render's [free-service documentation](https://render.com/docs/free) says idle services sleep after 15 minutes and may take about a minute to wake. Free services have quotas and can restart at any time. Open the site about five minutes before the celebration. Active pages send an HTTP request every 25 seconds, but browser suspension, network loss, or host restarts can interrupt the session. Free-tier terms may change.

## Facilitate a 30-minute session

1. **Before screen sharing:** click **Let's celebrate**, open **Host desk**, and privately send each person their own invitation. Open Ender's voter link in another tab. Keep the host link private.
2. Enable **Presentation view** to hide the host desk, then screen-share this page. Participants follow each chapter automatically on their own devices.
3. **Gather (3 min):** one word from each person, a welcome, and a raised cup.
4. **Remember (5 min):** 30 seconds to think; each person shares a short memory or passes.
5. **Vote (8 min):** all nine participants submit their ballots. Progress shows how many have submitted, never live vote totals. Allow a little time for final revisions.
6. Close voting. This is irreversible; missing ballots require confirmation, and at least one ballot is required.
7. **Celebrate (10 min):** reveal eight awards one at a time. Applaud, then invite a short example of that person's contribution. All eight awards must be revealed before moving on.
8. **Look ahead (4 min):** one wish for the next year and a closing toast. Download badges individually as SVG or 2000 × 1520 PNG, download the complete SVG badge sheet, or print/save the gallery as PDF.

Timers are gentle shared countdowns, not automatic cutoffs. Ender controls every transition.

## Voting and award rules

- Eligible recipients: Anna A., Anna K., Asif, Kanika, Maja, Martina, Stanislav, Tomasz.
- Ender votes but is never an award recipient.
- Self-voting is allowed.
- Each ballot nominates one eligible person in each of all 14 categories. The same person can be nominated in several categories.
- Each personal invitation represents one voter. Resubmitting replaces that ballot; it never creates a second vote.
- All eight eligible members receive exactly one award, using eight distinct categories. Six categories remain unawarded.
- A dynamic-programming maximum-weight matching maximizes the total votes across the eight awarded person/category pairs. It does not pick category winners greedily. Consequently, a recipient need not be that category's individual vote leader.
- Ties are resolved by participant/category orders randomly shuffled once when the room is created, preserved in recovery backups.
- Concentrated votes can force some zero-vote pairings. The guarantee that everyone receives exactly one award takes priority. The interface explains this before voting.

## Recovery, privacy, and limits

**The server stores rooms in RAM only.** A restart loses them. Rooms and backups expire 12 hours after room creation. Up to 100 rooms and 60 open live connections per room are supported.

The host page saves an automatic recovery snapshot in local browser storage after each received update. Use **Download recovery backup** to keep a portable copy. The backup includes submitted ballots, invitation credentials, stage, tie-breaking order, and revealed-award count. Treat it as private. Do not commit or share it.

If the session disappears:

1. On Ender's original host page, choose **Restore latest browser backup**. Alternatively, return to the home page and import a downloaded recovery JSON.
2. Ask participants to reconnect (pages also retry periodically). The original invitation links work again.
3. Any votes received by the server *after* the most recent host snapshot are not in that backup. During voting, affected participants can resubmit their locally saved drafts. After voting has closed, an older backup cannot recover missing ballots; use the most recent copy.

An active session cannot be overwritten by a backup. Expired sessions need a new ceremony.

Ballots are hidden in the UI, but **this is not a cryptographically anonymous election**: Ender can inspect the recovery snapshot. Personal links are bearer credentials. Someone with another person's link can replace that person's ballot. Only share them with the intended person; keep the host page away from untrusted users. SSE requests carry invitation credentials in query strings, so hosting access logs, if enabled, should be protected or configured to redact query strings. The site itself does not log requests or ballots.

Refresh preserves the current stage and submitted ballot while the server is alive. Ballot drafts and host backups stay in the browser until you clear this site's data; there is no automatic deletion of browser backups. Use trusted personal devices. The app reports browser-storage failures; manual backup downloads still work. To retain results beyond the session, download the badges and keep your host backup privately.

## Verify

```sh
npm test
```

Tests cover globally optimal allocation, ties, concentrated votes, exactly one award per eligible member, live updates, ballot replacement, authorization, locking, staged reveals, and restart recovery.
