# Push Notifications Setup — Handoff Note

## Status: In Progress — External ID association still unresolved

---

## What's Been Decided

- **Firebase/FCM credentials are NOT required for OneSignal web push.**
- **Integration type is "Custom Code"** — SDK is wired into `src/layouts/BaseLayout.astro`.
- **OneSignal App ID `aa130f13-2b68-4874-96bb-02db7d514eae` is real and correct** in `wrangler.jsonc`.
- **`ONESIGNAL_API_KEY`** is set as a Cloudflare Worker secret (write-only, can't be read back).

---

## What's Done

- OneSignal app "Commontime App" created and configured for Web Push (Custom Code).
- `ONESIGNAL_APP_ID` confirmed correct in `wrangler.jsonc` (both production and preview entries).
- `ONESIGNAL_API_KEY` set as a Cloudflare secret for the production worker.
- `autoResubscribe: true` added to `OneSignal.init()` in `BaseLayout.astro`.
  - **Why:** Without it, fresh browsers create a placeholder with `token: ""`, the API returns 400,
    the operation queue pauses, and the notification banner never renders.
- Ernie IS subscribed in OneSignal (ID `c25cb3bc-1795-4118-be14-73320d80b98d`, subscription active).
- `/api/link-push.ts` created to set External ID server-side using `ONESIGNAL_API_KEY` (deployed
  as commit `c27afb7` but see "What's Blocked" below — it didn't work due to a second bug).

---

## What's Blocked

### External ID still not set after two fix attempts

**Root cause chain:**

1. `autoResubscribe: true` triggers during `init()` and creates the OneSignal user (c25cb3bc)
   WITHOUT external_id (the user's Commontime ID isn't known at that stage of the SDK).

2. `login("1")` is then called. Internally, the SDK's `Ns()` function creates a **new local UUID**
   for the identity model and sets `externalId="1"` locally. This is persisted to IndexedDB.

3. The SDK queues a `login-user` operation to PATCH `external_id="1"` onto the server user. This
   fails due to OneSignal issue #1185 (race condition: subscription not yet propagated on the
   server). The PATCH returns an error, the operation fails, and the local identity model is NEVER
   updated to the server's onesignal_id (c25cb3bc).

4. The identity model in IndexedDB is now stuck as:
   `{ onesignal_id: "local-<uuid>", external_id: "1" }`

5. **Short-circuit bug:** On every subsequent page load, `login()` sees `externalId="1"` in local
   state and returns immediately without making any API call. The External ID is never set on
   the server.

6. **Our server-side `link-push` fix also failed** because it uses
   `OneSignal.User.onesignalId` as the identifier. That getter returns `undefined` when the
   identity model has a local UUID. The `if (onesignalId)` guard in the client code prevents the
   fetch from being called at all — no request is ever sent to `/api/link-push`.

**What IS reliably available despite the broken state:**
- `OneSignal.User.PushSubscription.token` — the full FCM endpoint URL (confirmed working)
- `OneSignal.User.PushSubscription.optedIn` — true
- The push subscription itself is correctly registered in OneSignal

**Next fix (not yet implemented):**

Switch from `onesignalId` to the push **token** as the identifier. The OneSignal REST API's
`POST /apps/{appId}/users` endpoint accepts both `identity.external_id` AND a subscription token
in the same request. Per the docs: "If any subscriptions already exist with any subscription
identifiers in the request, those subscriptions will be linked to the new user." This means:
- Send `token = OneSignal.User.PushSubscription.token` to `/api/link-push`
- Server calls `POST /apps/{appId}/users` with `{ identity: { external_id: "1" }, subscriptions: [{ type: "ChromePush", token }] }`
- OneSignal finds the existing subscription by token, associates it with external_id="1"

Changes needed:
1. `BaseLayout.astro` and `poll/[token].astro`: send `token` instead of `onesignalId`
2. `link-push.ts`: change PATCH to POST /users with subscription array

---

## Code Infrastructure

- `public/OneSignalSDKWorker.js` — serves the OneSignal service worker
- `src/layouts/BaseLayout.astro` — init with `autoResubscribe: true`, calls `/api/link-push`
- `src/pages/api/link-push.ts` — server-side identity link (currently uses wrong identifier)
- `src/pages/poll/[token].astro:1758` — "Get notified" button, calls `/api/link-push` after subscribe
- `src/lib/onesignal.ts` — `sendPushToUsers()` sends via REST API using `include_external_user_ids`
- `src/actions/polls.ts` / `src/actions/votes.ts` — fire `sendPushToUsers()` on poll events

---

## Gotchas

- **`wrangler secret get` does not work** — secrets are write-only via Wrangler.
- **Push banner only appears on `commontime.app`**, not on preview deployments (line 1758).
- **User ID for Ernie is `1`** in both production and preview databases.
- **Preview environment** uses a separate worker (`commontime-preview`) — push not configured there.
- **`autoResubscribe: true` is required.** Without it, fresh browsers get stuck with `token: ""`
  and the notification banner never renders.
- **OneSignal SDK v16.6.3 has known bugs in `login()`.** Issue #1185 (race condition on
  subscription sync) is unfixed. `login()` cannot be relied on to set External ID.
- **`OneSignal.User.onesignalId` is unreliable** — returns `undefined` when the identity model
  in IndexedDB contains a local UUID from a failed `Ns()` call. Use the push token instead.
