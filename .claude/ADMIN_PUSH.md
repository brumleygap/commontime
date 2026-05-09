# Admin Push Notifications

## Status: Live on production ✅

Merged to main 2026-05-09. Accessible at `commontime.app/admin/push` (admin email only).
Admin link visible in the site header when logged in as `ernie.braganza@gmail.com`.

---

## Requirements

- Only `ernie.braganza@gmail.com` can send (hardcoded admin check)
- Two audience modes: **All subscribers** or **Poll participants** (dropdown of active polls with subscriber counts)
- Compose: title (required), message (required), URL (optional), image (optional)
- Image: upload file (stored in R2, served via proxy) **or** paste a URL
- Image renders on Chrome/Android; iOS receives the notification but silently ignores the image
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
- **Audience** — radio: All subscribers / Specific poll (reveals dropdown of active polls with subscriber counts)

### Image upload flow
1. User selects a file → JS POSTs to `/api/admin/upload-image`
2. Server validates type (JPEG/PNG/GIF/WebP), stores in R2 as `push/{timestamp}-{uuid}.ext`
3. Returns `{ url: "https://commontime.app/api/admin/media/push/..." }`
4. URL is written into the hidden `image` form field
5. On form submit, the action receives the URL and passes it through to the push payload

### Image serving
Private R2 bucket (`commontime-media`). Images served via `/api/admin/media/[...key]` which proxies from R2 with a 1-year cache header. Push notification image URLs must be HTTPS and publicly accessible without auth (the proxy handles this).

### Sending
`sendAdminPush` action in `src/actions/admin.ts` queries D1 for the appropriate user IDs and calls `sendPushToUsers` from `src/lib/webpush.ts`. The `image` field is optional throughout.

### Service worker
`public/push-sw.js` includes `image: data.image` in `showNotification` when the payload contains an image URL.

---

## Files

| File | Purpose |
|---|---|
| `src/pages/admin/push.astro` | Compose UI with poll dropdown |
| `src/pages/api/admin/upload-image.ts` | R2 upload endpoint |
| `src/pages/api/admin/media/[...key].ts` | R2 proxy/serve endpoint |
| `src/actions/admin.ts` | `sendAdminPush` Astro action |
| `src/lib/webpush.ts` | `sendPushToUsers` — `image?` param added |
| `public/push-sw.js` | `showNotification` — `image` field added |
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
- Action buttons (up to 2) — each opens a specific URL, e.g. "Vote now" deep-linking to a poll
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
- Action buttons on notifications (e.g. "Vote now" → direct poll link)
- Notify only unvoted participants on a specific poll
- Rate limiting (e.g. max 3 sends per day)
- Send history / audit log
- Schedule a push for a future time
