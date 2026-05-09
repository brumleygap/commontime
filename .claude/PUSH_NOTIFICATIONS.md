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
Lives on the **Scheduling Polls page** (`src/pages/index.astro`).

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
- `push` event: parses JSON payload `{ title, body, url, image?, actions? }`, calls `showNotification`
- `notificationclick` event: if an action button was tapped, opens that button's URL; otherwise opens `data.url`; focuses existing window or opens new one
- `pushsubscriptionchange` event: auto-resubscribes and re-links via `/api/link-push`

### Server endpoints

**`GET /api/push-config`** (auth required)
Returns `{ vapidPublicKey }` from `env.VAPID_PUBLIC_KEY`.

**`POST /api/link-push`** (auth required)
Accepts `{ token, web_p256, web_auth, old_token? }`.
- Deletes old subscription from D1 if `old_token` is present
- Upserts new subscription into `push_subscriptions` table

**`src/lib/webpush.ts`**
Implements Web Push Protocol from scratch using Web Crypto API (Workers-compatible, no Buffer):
- `sendPushToUsers(userIds, title, body, url, db, vapid, image?, actions?)` — queries D1 for subscriptions, sends to each
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

## Admin push notifications

Accessible at `commontime.app/admin/push` (admin email only). Linked from the site header when logged in as `ernie.braganza@gmail.com`. Server-side redirect to `/` for anyone else.

### Form fields
- **Title** and **Message** — required
- **Link URL** — optional, defaults to `/`
- **Image** — file upload (JPEG/PNG/GIF/WebP, stored in R2) or paste a URL; shown on Android/Chrome only, iOS silently ignores it
- **Audience** — three modes:
  - *All subscribers* — everyone with a push subscription
  - *Specific poll* — all subscribers who are participants on a chosen poll; dropdown shows subscriber count
  - *Non-responders* — subscribers on a chosen poll who have cast zero votes; dropdown shows "X/Y responding" so you can see urgency at a glance
- **Action buttons** — up to 2 optional rows (label + URL each); appear as tappable buttons on Android/Chrome; iOS silently ignores them

### Audience: Non-responders
A non-responder has `user_id` set (logged-in) and no rows in `votes` for that poll — they haven't touched a single slot. Anonymous participants are excluded (no `user_id`, unreachable). The X/Y count is relative to participants who have push subscriptions.

### Image upload flow
1. User selects a file → JS POSTs to `/api/admin/upload-image`
2. Server stores in R2 as `push/{timestamp}-{uuid}.ext`
3. Returns a URL via the `/api/admin/media/[...key]` proxy endpoint (bucket is private; proxy adds 1-year cache header)
4. URL is written into the hidden `image` form field and passed through to the push payload

### Action buttons
Stored as `PushAction[]` (`{ action, title, url }`) in the payload. The SW routes `notificationclick` to the tapped button's URL, falling back to the notification's main URL. iOS silently ignores them.

### Admin files

| File | Purpose |
|---|---|
| `src/pages/admin/push.astro` | Compose UI — audience radios, poll dropdown, image upload, action buttons |
| `src/pages/api/admin/upload-image.ts` | R2 upload endpoint |
| `src/pages/api/admin/media/[...key].ts` | R2 proxy/serve endpoint |
| `src/actions/admin.ts` | `sendAdminPush` Astro action — audience queries, action button assembly |
| `src/components/AppHeader.astro` | Admin nav link (admin email only) |
| `wrangler.jsonc` | `MEDIA` R2 binding (both envs) |
| `src/env.d.ts` | `MEDIA: R2Bucket` added to Env |

**R2 bucket:** `commontime-media` — created 2026-05-09, ENAM region.

---

## What web push can and can't do

**Can control:**
- Title, body text, URL on click
- Large image below text (Chrome/Android only; iOS silently ignores)
- Action buttons (up to 2, Android/Chrome only) — each opens a specific URL
- Tag — replace/update an existing notification silently
- Vibration (Android only)

**Cannot control:**
- Notification size or layout (OS-controlled)
- Custom HTML inside the notification
- True interactive input (e.g. text reply) within the notification
- Guaranteed delivery timing

---

## iOS / iPadOS

Push notifications **only work when installed as a PWA** (iOS 16.4+). Safari browser does not support web push.

To subscribe on iPhone/iPad:
1. Open `commontime.app` in Safari
2. Share button → **Add to Home Screen**
3. Open from the home screen icon
4. Go to Scheduling Polls and tap **Get notified**

**Any change to `public/push-sw.js` orphans existing iOS subscriptions.** iOS ties the subscription to the specific SW script. Users must tap the subscribe button again to re-subscribe. Android and Mac Chrome handle SW updates without losing the subscription. Avoid touching `push-sw.js` unnecessarily.

Key iOS gotchas:
- **Service worker must be the active SW** — `skipWaiting()` in the install event fixes stale SW issues; BaseLayout also evicts old OneSignal SWs explicitly
- **Subscription must be created under the active SW** — users must re-subscribe after a major SW transition
- **iOS PWA requires background** — notifications show on lock screen and notification center, not as banners when the PWA is in foreground
- **Apple returns 201** even for some failed deliveries — 201 = accepted by Apple servers, not guaranteed delivery to device
- **Icon must be RGB PNG** (no alpha channel) — even fully-opaque RGBA renders black on black on the iOS home screen

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

- **OneSignal can't deliver to iOS 16.4+ web push endpoints**: `ChromePush` routes via FCM (can't reach `web.push.apple.com`). `SafariPush` is for legacy macOS APNS-cert push, not VAPID. Neither type works.

- **VAPID key from SDK is unreliable**: `window.OneSignal?.config?.vapidPublicKey` is SDK-internal state, never populated on Android or iOS. Fetch `/api/push-config` instead.

- **Uint8Array must be `Uint8Array<ArrayBuffer>`** in Workers: `Uint8Array.from(...)` returns `Uint8Array<ArrayBufferLike>` which is rejected by Web Crypto. Use `new Uint8Array(n)` + manual fill, or `new Uint8Array(arrayBuffer)` to wrap results.

- **`body` is a reserved Astro action field name** — use `message` instead, both in the Zod schema and the form.

- **Zod `.optional()` receives null from form fields** — use `.nullish().transform(v => v || undefined)` for optional fields in `accept: "form"` actions.

- **Push banner only on `commontime.app`** — hostname check in the subscribe script prevents it from running on preview deployments.

- **Preview environment has no push configured** — `VAPID_PRIVATE_KEY` is not set in preview; `sendPushToUsers` will find no subscriptions in the preview DB anyway.

- **Bedtime mode on Android** silences all notifications. Not a code issue.

---

## Future ideas
- Rate limiting (e.g. max 3 sends per day)
- Send history / audit log
- Schedule a push for a future time
