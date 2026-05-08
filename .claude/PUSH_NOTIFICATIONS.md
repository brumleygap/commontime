# Push Notifications

## Status

| Platform | Status |
|---|---|
| Mac Chrome | Working ✅ |
| Android Chrome (Pixel 8) | Working ✅ |
| Android PWA (Pixel 8) | Working ✅ |
| iOS/iPadOS PWA | Working ✅ |
| iOS/iPadOS browser (Safari) | Not supported (Apple limitation) |

Poll events that trigger pushes: date confirmed, poll cancelled, poll reopened, new dates posted, someone voted ✅

**OneSignal has been removed entirely.** Delivery is now direct Web Push Protocol (RFC 8291 + RFC 8292) using our own VAPID keys. Subscriptions are stored in D1.

---

## Architecture

### Subscribe button
Lives on the **Scheduling Polls page** (`src/pages/index.astro`) — future plan to keep it there since subscriptions are user-level, not poll-level.

Button behaviour (IIFE, no SDK dependency):
1. Checks `pushManager.getSubscription()` on `/push-sw.js` registration → shows "Notifications on" or "Get notified"
2. On click: fetches VAPID public key from `/api/push-config`, calls `Notification.requestPermission()`, then `pushManager.subscribe()` with the key
3. Sends `{ token, web_p256, web_auth, old_token }` to `POST /api/link-push`
4. Shows "Subscribing…" → "✓ Subscribed" (+ 50ms vibrate on Android) → settles to "Notifications on"

On iOS browser (not PWA), shows message: *"On iOS, install as app first: Safari → Add to Home Screen."*

### Service worker (`public/push-sw.js`)
- Registered from `BaseLayout.astro` on every page load
- On load, BaseLayout evicts any old OneSignal SW before registering ours
- `install` event: `skipWaiting()` — activates immediately, no waiting
- `activate` event: `clients.claim()` — takes over all open pages
- `push` event: parses JSON payload `{ title, body, url }`, calls `showNotification`
- `notificationclick` event: focuses existing window or opens new one at `data.url`
- `pushsubscriptionchange` event: auto-resubscribes and re-links via `/api/link-push`

### Server endpoints

**`GET /api/push-config`** (auth required)
Returns `{ vapidPublicKey }` from `env.VAPID_PUBLIC_KEY`. Client uses this to call `pushManager.subscribe()` without depending on SDK state.

**`POST /api/link-push`** (auth required)
Accepts `{ token, web_p256, web_auth, old_token? }`.
- Deletes old subscription from D1 if `old_token` is present
- Upserts new subscription into `push_subscriptions` table

**`src/lib/webpush.ts`**
Implements Web Push Protocol from scratch using Web Crypto API (Workers-compatible, no Buffer):
- `sendPushToUsers(userIds, title, body, url, db, vapid)` — queries D1 for subscriptions, sends to each
- `sendOne(sub, payload, vapid)` — encrypts payload (RFC 8291 aes128gcm) and sends with VAPID auth (RFC 8292)
- Returns `true` if push service responds 410/404 (subscription expired) → caller deletes from D1
- Encryption: ECDH key agreement → two-stage HKDF → AES-128-GCM, all via `crypto.subtle`
- VAPID: ES256 JWT signed with our private key, audience = push endpoint origin

### D1 schema (`migrations/0014_push_subscriptions.sql`)
```sql
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Cloudflare config
- **Secret** `VAPID_PRIVATE_KEY`: base64url-encoded P-256 private key (set via `wrangler secret put`)
- **Var** `VAPID_PUBLIC_KEY`: `BK8QaMA__Heb7Dw2q8Os_XhCaHV0Eb-eHXSR_OJ4q9R5FOr0N0Os19-xzAs2uYLu-T6lnFRj0RjSlVkyJASc1g8`
- **Var** `VAPID_SUBJECT`: `mailto:ernie.braganza@gmail.com`

---

## iOS / iPadOS

Push notifications **only work when installed as a PWA** (iOS 16.4+). Safari browser does not support web push.

To subscribe on iPhone/iPad:
1. Open `commontime.app` in Safari
2. Share button → **Add to Home Screen**
3. Open from the home screen icon
4. Go to Scheduling Polls and tap **Get notified**

Key iOS gotchas discovered during implementation:
- **Service worker must be the active SW** — if a stale SW is in "waiting" state, the push event goes to the old SW which can't parse our payload. `skipWaiting()` in the install event fixes this; BaseLayout also evicts old OneSignal SWs explicitly.
- **Subscription must be created under the active SW** — subscribing while the old SW is still active creates a subscription that gets orphaned when the SW changes. Users must re-subscribe after a major SW transition.
- **iOS PWA requires background** — notifications show on lock screen and notification center. They don't show as banners when the PWA is in foreground.
- **Apple returns 201** even for some failed deliveries — 201 = accepted by Apple servers, not guaranteed delivery to device.
- **Icon must be RGB PNG** (no alpha channel) — even a fully-opaque RGBA PNG is rendered black on black on the iOS home screen. Use Pillow with `.convert("RGB")` when generating icons.

---

## Stale subscription cleanup

Subscriptions go stale when:
- The service worker changes significantly (user must re-subscribe)
- The browser clears storage
- The OS rotates push credentials

Automatic cleanup:
1. **410/404 on delivery** → `sendOne` returns `true` → `sendPushToUsers` deletes endpoint from D1
2. **`pushsubscriptionchange`** in push-sw.js → browser re-subscribes and re-links automatically

Manual fallback: user taps the subscribe button again to re-register.

---

## Key gotchas

- **OneSignal can't deliver to iOS 16.4+ web push endpoints**: `ChromePush` routes via FCM (can't reach `web.push.apple.com`). `SafariPush` is for legacy macOS APNS-cert push, not VAPID. Neither type works. Solution: bypass OneSignal for delivery entirely.

- **VAPID key from SDK is unreliable**: `window.OneSignal?.config?.vapidPublicKey` is SDK-internal state, never populated on Android or iOS. Fetch `/api/push-config` instead.

- **Uint8Array must be `Uint8Array<ArrayBuffer>`** in Workers: `Uint8Array.from(...)` returns `Uint8Array<ArrayBufferLike>` which is rejected by Web Crypto. Use `new Uint8Array(n)` + manual fill, or `new Uint8Array(arrayBuffer)` to wrap results.

- **Push banner only on `commontime.app`** — hostname check in the subscribe script prevents it from running on preview deployments.

- **Preview environment has no push configured** — `VAPID_PRIVATE_KEY` is not set in preview; `sendPushToUsers` will find no subscriptions in the preview DB anyway.

- **Bedtime mode on Android** silences all notifications. Not a code issue.
