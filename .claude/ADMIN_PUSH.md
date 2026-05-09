# Admin Push Notifications

## Status: Implemented — needs preview deploy testing

---

## Requirements

- Only `ernie.braganza@gmail.com` can send (hardcoded admin check)
- Two audience modes: **All subscribers** or **Poll participants** (by poll token)
- Compose: title (required), body (required), URL (optional), image (optional)
- Image: upload file (stored in R2, served via proxy) **or** paste a URL
- Image renders on Chrome/Android; iOS receives the notification but silently ignores the image
- No rate limiting or audit log for MVP

---

## How it works

### UI
`/admin/push` — server-side redirect to `/` for non-admin users.

Form fields:
- **Title** and **Message** — required
- **Link URL** — optional, defaults to `/`
- **Image** — file upload OR URL paste; upload is converted to URL via the upload endpoint before form submit
- **Audience** — radio: All subscribers / Specific poll (reveals poll token field)

### Image upload flow
1. User selects a file → JS POSTs to `/api/admin/upload-image`
2. Server validates type (JPEG/PNG/GIF/WebP), stores in R2 as `push/{timestamp}-{uuid}.ext`
3. Returns `{ url: "https://commontime.app/api/admin/media/push/..." }`
4. URL is written into the hidden `image` form field
5. On form submit, the action receives the URL and passes it through to the push payload

### Image serving
Private R2 bucket. Images served via `/api/admin/media/[...key]` which proxies from R2 with a 1-year cache header. Push notifications reference these URLs — they must be HTTPS and publicly accessible without auth (which they are via the proxy).

### Sending
`sendAdminPush` action in `src/actions/admin.ts` queries the appropriate user IDs and calls `sendPushToUsers` from `src/lib/webpush.ts`. The `image` field is optional throughout.

### Service worker
`public/push-sw.js` includes `image: data.image` in `showNotification` when the payload contains an image URL.

---

## Files

| File | Purpose |
|---|---|
| `src/pages/admin/push.astro` | Compose UI |
| `src/pages/api/admin/upload-image.ts` | R2 upload endpoint |
| `src/pages/api/admin/media/[...key].ts` | R2 proxy/serve endpoint |
| `src/actions/admin.ts` | `sendAdminPush` action |
| `src/lib/webpush.ts` | `sendPushToUsers` — `image?` param added |
| `public/push-sw.js` | `showNotification` — `image` field added |
| `wrangler.jsonc` | `MEDIA` R2 binding (both envs) |
| `src/env.d.ts` | `MEDIA: R2Bucket` added to Env |

## R2 bucket
`commontime-media` — created 2026-05-09, ENAM region.

---

## Future ideas
- Send to specific poll participants (implemented)
- Rate limiting (e.g. max 3 per day)
- Send history / audit log
- Schedule a push for a future time
