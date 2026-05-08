# Push Notifications

## Status

| Platform | Status |
|---|---|
| Mac Chrome | Working ✅ |
| Android Chrome (Pixel 8) | Fixed — needs re-subscribe after 2026-05-08 deploy ✅ |
| Android PWA (Pixel 8) | Working ✅ |
| iOS/iPadOS PWA | Implemented — untested |
| iOS/iPadOS browser (Safari) | Not supported (Apple limitation) |

Poll events: confirm, cancel, reopen all trigger pushes ✅

---

## Architecture

### Client side
- `BaseLayout.astro`: loads OneSignal SDK, calls `/api/link-push` on every page load if a push subscription exists (idempotent re-link)
- `poll/[token].astro`: "Get notified" / "Notifications on" button. Runs as an immediate IIFE (no SDK dependency). On click: fetches VAPID key from `/api/push-config`, uses **native Push APIs** to subscribe, then calls `/api/link-push`
- Button state checked via `pushManager.getSubscription()` directly — not via SDK state

### Server side
- `/api/push-config.ts`: GET endpoint (auth required). Calls OneSignal REST API to return the VAPID public key (`chrome_web_key` field). Used so the client never depends on SDK-internal state for the key.
- `/api/link-push.ts`: POST endpoint. Accepts `{ token, web_p256, web_auth }`. Calls `POST /apps/{appId}/users` on OneSignal. Auto-detects subscription type: `SafariPush` for `web.push.apple.com` endpoints (iOS PWA), `ChromePush` for all others.
- `src/lib/onesignal.ts`: `sendPushToUsers(userIds, title, body, url, appId, apiKey)` calls `POST onesignal.com/api/v1/notifications` with `include_external_user_ids: userIds.map(id => "ct_" + id)`

### Cloudflare secrets
- `ONESIGNAL_API_KEY`: REST API key for the Commontime App
- `ONESIGNAL_APP_ID`: `aa130f13-2b68-4874-96bb-02db7d514eae`

---

## iOS / iPadOS

Push notifications on iOS/iPadOS **only work when installed as a PWA** (iOS 16.4+). Safari browser does not support web push.

To subscribe on iPhone/iPad:
1. Open `commontime.app` in Safari
2. Tap the Share button → **Add to Home Screen**
3. Open the app from the home screen icon
4. Navigate to a poll and tap **Get notified**

When a user taps the button in Safari browser (not PWA), the button shows:
*"On iOS, install as app first: Safari share button → Add to Home Screen."*

The subscription type sent to OneSignal is automatically detected:
- `web.push.apple.com` endpoint → `SafariPush`
- FCM endpoint → `ChromePush`

---

## OneSignal app

**Commontime App** — `aa130f13-2b68-4874-96bb-02db7d514eae`

External ID format: `ct_1` (prefixed — bare integers are blocked by OneSignal)

---

## Key gotchas

- **External IDs must be prefixed**: OneSignal blocks bare short integers like `"1"`. Use `"ct_1"` format. Applied in both `link-push.ts` (registration) and `sendPushToUsers` (delivery).

- **Don't use `autoResubscribe: true`**: Causes the SDK to unsubscribe existing push tokens on Android page load when it detects a VAPID key mismatch, then fails to resubscribe (no user gesture). Net result: unsubscribed with nothing created.

- **Don't use `OneSignal.Notifications.requestPermission()` for the button**: It calls `Ae()` which waits for `SDK_INITIALIZED`. On Android, if `init()` fails silently, `Ae()` hangs forever. Use native `Notification.requestPermission()` + `PushManager.subscribe()`.

- **Don't read `window.OneSignal?.config?.vapidPublicKey`**: SDK-internal state, unreliable on Android and iOS. Fetch `/api/push-config` instead, which returns the VAPID key from the OneSignal REST API.

- **Don't rely on `OneSignal.User.PushSubscription.token` for button state**: On Android, always null. Use `pushManager.getSubscription()` directly.

- **`web_p256` and `web_auth` are required**: Without the p256dh/auth encryption keys, OneSignal marks the subscription as "Never Subscribed" and excludes it from send audiences.

- **Bedtime mode on Android**: Silences all notifications. Not a code issue.

- **OneSignal SDK v16.6.3 has unfixed `login()` bugs**: Issue #1185 (race condition, external_id not synced). The entire `login()` path was bypassed in favour of the server-side `/api/link-push` approach.

- **Push banner only appears on `commontime.app`** — not preview deployments (intentional).

- **Preview environment** (`commontime-preview`) has no push notifications configured. A separate OneSignal app would be needed for that.
