# Admin Push Notifications

## Status: Live on production ✅

Merged to main 2026-05-09. Accessible at `commontime.app/admin/push` (admin email only).
Admin link visible in the site header when logged in as `ernie.braganza@gmail.com`.

---

## Requirements

- Only `ernie.braganza@gmail.com` can send (hardcoded admin check)
- Three audience modes: **All subscribers**, **Specific poll**, or **Non-responders on a poll**
- Compose: title (required), message (required), URL (optional), image (optional)
- Image: upload file (stored in R2, served via proxy) **or** paste a URL
- Image renders on Chrome/Android; iOS receives the notification but silently ignores the image
- Up to 2 action buttons per notification (label + URL each); Android/Chrome only, iOS ignores
- No rate limiting or audit log for MVP

---

## How it works

### UI
`/admin/push` — server-side redirect to `/` for non-admin users.
Linked from the site header (Admin link, visible to admin email only).

Form fields:
- **Title** and **Message** — required
- **Link URL** — optional, defaults to `/`
- **Image** — file upload OR URL paste; upload is converted to URL via the upload endpoint before form submit
- **Audience** — radio with three options:
  - *All subscribers* — everyone with a push subscription
  - *Specific poll* — all subscribers who are participants on a chosen poll; dropdown shows subscriber count
  - *Non-responders* — subscribers on a chosen poll who have cast zero votes; dropdown switches to "X/Y responding" label so you can see urgency at a glance
- **Action buttons** — two optional rows, each with a label and URL; appear as tappable buttons on the notification

### Audience: Non-responders
A non-responder is a participant with `user_id` set (logged-in) and no rows in `votes` for that poll — i.e., they haven't touched a single slot. Anonymous participants are excluded (no `user_id`, unreachable by push). The "X/Y responding" label in the dropdown is relative to participants who have push subscriptions.

### Image upload flow
1. User selects a file → JS POSTs to `/api/admin/upload-image`
2. Server validates type (JPEG/PNG/GIF/WebP), stores in R2 as `push/{timestamp}-{uuid}.ext`
3. Returns `{ url: "https://commontime.app/api/admin/media/push/..." }`
4. URL is written into the hidden `image` form field
5. On form submit, the action receives the URL and passes it through to the push payload

### Image serving
Private R2 bucket (`commontime-media`). Images served via `/api/admin/media/[...key]` which proxies from R2 with a 1-year cache header. Push notification image URLs must be HTTPS and publicly accessible without auth (the proxy handles this).

### Action buttons
Up to 2 buttons, each with a label and URL. Stored as `PushAction[]` in the payload and passed to the service worker. In `notificationclick`, the SW routes to the button's URL if one was tapped, otherwise falls back to the notification's main URL. iOS silently ignores action buttons — the notification still arrives and tapping the body still works.

### Sending
`sendAdminPush` action in `src/actions/admin.ts` queries D1 for the appropriate user IDs and calls `sendPushToUsers` from `src/lib/webpush.ts`.

### Service worker
`public/push-sw.js` handles `image` and `actions` in `showNotification`, and routes `notificationclick` to the correct URL based on which button (if any) was tapped.

---

## Files

| File | Purpose |
|---|---|
| `src/pages/admin/push.astro` | Compose UI — audience radios, poll dropdown, image upload, action buttons |
| `src/pages/api/admin/upload-image.ts` | R2 upload endpoint |
| `src/pages/api/admin/media/[...key].ts` | R2 proxy/serve endpoint |
| `src/actions/admin.ts` | `sendAdminPush` Astro action — audience queries, action button assembly |
| `src/lib/webpush.ts` | `sendPushToUsers` — `image?` and `actions?` params |
| `public/push-sw.js` | `showNotification` with image + actions; `notificationclick` routing |
| `src/components/AppHeader.astro` | Admin nav link (admin email only) |
| `wrangler.jsonc` | `MEDIA` R2 binding (both envs) |
| `src/env.d.ts` | `MEDIA: R2Bucket` added to Env |

## R2 bucket
`commontime-media` — created 2026-05-09, ENAM region.

---

## What web push can and can't do

**Can control:**
- Title, body text, URL on click
- Large image below text (Chrome/Android only; iOS silently ignores)
- Action buttons (up to 2) — each opens a specific URL, e.g. "Vote now" deep-linking to a poll; Android/Chrome only
- Tag — replace/update an existing notification silently
- Vibration (Android only)

**Cannot control:**
- Notification size or layout (OS-controlled)
- Custom HTML inside the notification
- True interactive input (e.g. text reply) within the notification
- Guaranteed delivery timing

**Closest thing to polling users:** Action buttons that deep-link directly to a poll URL.

---

## iOS re-subscribe requirement

Any change to `public/push-sw.js` orphans existing iOS subscriptions — iOS ties the subscription to the specific SW script. Users must tap the **Notifications on** button on the Scheduling Polls page to re-subscribe after a SW change. Android and Mac Chrome handle SW updates without losing the subscription.

**Avoid touching `push-sw.js` unnecessarily.** If you do change it, expect iOS users to need a manual re-subscribe.

---

## Future ideas
- Rate limiting (e.g. max 3 sends per day)
- Send history / audit log
- Schedule a push for a future time
