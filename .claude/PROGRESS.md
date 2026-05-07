# Push Notifications Setup — Handoff Note

## Status: In Progress — External ID association unresolved

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
- `autoResubscribe: true` added to `OneSignal.init()` in `BaseLayout.astro` (commit `b1b8645`).
  - **Why:** Without this, on a fresh browser (cleared IndexedDB), `login()` runs before a push
    subscription exists. It creates a placeholder with `token: ""`, the OneSignal API returns 400,
    the operation queue pauses, and the deferred callback queue stalls — so the notification banner
    never renders. With `autoResubscribe: true`, `init()` establishes a real push subscription
    before `login()` is called.
- Ernie (user ID `1`) IS now appearing in the OneSignal dashboard as a subscribed user
  (OneSignal ID `c25cb3bc-1795-4118-be14-73320d80b98d`, Chrome push channel active).
- Code infrastructure is complete:
  - `public/OneSignalSDKWorker.js` — serves the OneSignal service worker
  - `src/layouts/BaseLayout.astro` — initializes SDK with `autoResubscribe: true`, calls `OneSignal.login(userId)`
  - `src/pages/poll/[token].astro:1745` — "Get notified" button, only shown on `commontime.app`
  - `src/lib/onesignal.ts` — `sendPushToUsers()` sends via OneSignal REST API using `include_external_user_ids`
  - `src/actions/polls.ts` and `src/actions/votes.ts` — call `sendPushToUsers()` on confirm, cancel, reopen events

---

## What's Blocked

### External ID not being set in OneSignal

`sendPushToUsers()` targets users via `include_external_user_ids` (Commontime user ID as a string).
The OneSignal SDK's `login("1")` call is supposed to associate External ID `"1"` with the subscribed
user, but the OneSignal dashboard shows External ID is blank after multiple page refreshes.

**Observed state in browser console:**
```
externalId: 1       ← SDK has it locally
onesignalId: undefined  ← identity not yet synced with OneSignal server
optedIn: true
token: https://fcm.googleapis.com/fcm/send/...  ← real token, subscription active
```

**What's happening:** `OneSignal.login("1")` calls `Ns()` internally which creates a new local
identity UUID and sets `externalId="1"` locally. It then queues a `login-user` operation that
should PATCH `external_id="1"` onto the server user record via:
`PATCH api.onesignal.com/apps/{appId}/users/by/onesignal_id/{id}/identity`

The PATCH appears to be failing or not completing. The local state showing `externalId: 1` but
`onesignalId: undefined` means `Ns()` ran but the server sync didn't succeed. Worse: subsequent
page loads see `externalId: 1` already set locally and skip the login entirely — so it never retries.

**Next diagnostic step in progress:** Fetch interceptor to capture the actual API calls and
status codes. The user was asked to run:
```js
const _fetch = fetch;
window.fetch = function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
  if (url?.includes('onesignal')) {
    console.log('→', args[1]?.method || 'GET', url);
    return _fetch.apply(this, args).then(r => {
      console.log('←', r.status, url);
      return r;
    });
  }
  return _fetch.apply(this, args);
};
// then reload
```

---

## What's Next

1. Get the fetch interceptor output — identify what HTTP status the PATCH is returning.
2. Fix whatever is blocking the External ID association.
3. End-to-end test: trigger a poll confirmation/cancellation and verify Ernie receives the push.

---

## Gotchas

- **`wrangler secret get` does not work** — secrets are write-only via Wrangler.
- **"Notifications on" in the UI ≠ subscribed in OneSignal.** The UI reflects `Notification.permission` only.
- **Push banner only appears on `commontime.app`**, not on preview deployments (intentional, line 1745).
- **User ID for Ernie is `1`** in both production and preview databases.
- **Preview environment** uses a separate worker (`commontime-preview`) — push notifications not configured there.
- **`autoResubscribe: true` is required.** Without it, fresh browsers (cleared IndexedDB) get stuck with `token: ""` and the notification banner never shows.
- **The `login()` short-circuit bug:** Once `Ns()` sets `externalId` locally (even if the server PATCH fails), subsequent page loads see it as already set and skip login. If the External ID association is broken, it won't self-heal across reloads without a code fix.
