# Push Notifications Setup — Handoff Note

## Status: In Progress

---

## What's Been Decided

- **Firebase/FCM credentials are NOT required for OneSignal web push.** They are only needed for native Android apps distributed via the Play Store. Do not go down that path again.
- **The existing `ONESIGNAL_APP_ID` in `wrangler.jsonc` is invalid.** It was hallucinated by a previous Claude session. There is no matching app in the OneSignal dashboard.
- **The entire OneSignal setup must be done from scratch** using the real dashboard.
- **Integration type should be "Custom Code"** — the SDK is already wired into `src/layouts/BaseLayout.astro`.

---

## What's Done

- Firebase project "Commontime" was created and a service account private key was downloaded — **this is not needed and can be ignored**.
- The existing code infrastructure is correct and complete:
  - `public/OneSignalSDKWorker.js` — serves the OneSignal service worker
  - `src/layouts/BaseLayout.astro` — initializes OneSignal SDK and calls `OneSignal.login(userId)`
  - `src/pages/poll/[token].astro:1745` — "Get notified" button triggers `requestPermission()`, only shown on `commontime.app`
  - `src/lib/onesignal.ts` — `sendPushToUsers()` sends via OneSignal REST API
  - `src/actions/polls.ts` and `src/actions/votes.ts` — call `sendPushToUsers()` on confirm, cancel, reopen events
- `CLAUDE.md` updated globally with:
  - Proof-required rule before any UI instructions
  - Never fabricate credentials or external service IDs
- Memory saved about the hallucinated App ID

---

## What's Next

1. **Create a new OneSignal app**
   - Go to [app.onesignal.com](https://app.onesignal.com)
   - Click **"New App/Website"**
   - Name it "CommonTime", select **Web Push**, integration type **Custom Code**
   - Site URL: `https://commontime.app` (must match exactly)

2. **Get the real credentials**
   - After setup go to **Settings → Keys & IDs**
   - Copy the **App ID** and **REST API Key**

3. **Update the code**
   - Replace `ONESIGNAL_APP_ID` in `wrangler.jsonc` (both production and preview entries) with the real App ID

4. **Update the Cloudflare secret**
   ```bash
   npx wrangler secret put ONESIGNAL_API_KEY --name commontime
   # paste the REST API Key when prompted
   ```

5. **Deploy and test**
   - Push to `main` to trigger a production deploy
   - Visit [commontime.app](https://commontime.app), open any poll page while logged in
   - Click **"Get notified"** and allow the browser permission prompt
   - Check OneSignal dashboard → Audience → Subscriptions — you should appear as a subscriber
   - Send a test notification from the OneSignal dashboard to confirm delivery

---

## Gotchas

- **`wrangler secret get` does not work** — secrets are write-only via Wrangler. Retrieve API keys from the service dashboard directly.
- **"Notifications on" in the UI ≠ subscribed in OneSignal.** The UI reflects browser permission only (`Notification.permission`). A OneSignal subscriber is only created after the SDK successfully registers a push subscription — which requires a valid App ID.
- **The push banner only appears on `commontime.app`**, not on preview deployments. This is intentional (line 1745 in `poll/[token].astro`).
- **User ID for Ernie is `1`** in both production and preview databases.
- **The OneSignal REST API Key** is stored as a Cloudflare Worker secret named `ONESIGNAL_API_KEY`. After creating the new OneSignal app, this secret must be updated or pushes will fail silently.
- **Preview environment** uses a separate worker (`commontime-preview`) — if you want push notifications on preview too, a second OneSignal app would be needed (not required now).