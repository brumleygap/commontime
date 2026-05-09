# Admin Push Notifications — Spec

## Goal

Allow the poll organiser (or an admin) to send a custom push notification targeted at participants of a specific poll, or to all subscribers.

---

## Open questions

- Who can send? Poll organiser only? Or a separate admin role?
- Where does the UI live? Inside the poll page (for the organiser)? A dedicated admin area?
- Should it target all poll participants, or only those who have responded?
- Should it support images? (Chrome/Android yes; iOS uncertain)
- Should there be a message history / log?
- Rate limiting — prevent accidental spam?

---

## What we know

### Data already available
- `push_subscriptions(user_id, endpoint, p256dh, auth)` — who is subscribed
- `participants(poll_id, user_id, email)` — who is on a given poll
- `polls(id, token, title, creator_id)` — poll ownership

### Query to get push targets for a poll
```sql
SELECT ps.user_id
FROM push_subscriptions ps
JOIN participants p ON p.user_id = ps.user_id
WHERE p.poll_id = (SELECT id FROM polls WHERE token = ?)
```

### Sending
`sendPushToUsers(userIds, title, body, url, env.DB, vapid)` in `src/lib/webpush.ts` already handles everything. A custom push just needs a title, body, and optional URL and image.

### Image support
Add `image` to the payload and reference it in push-sw.js `showNotification`:
```js
image: data.image  // full-width image below notification text
```
Chrome/Android renders it. iOS PWA likely silently ignores it (notification still arrives).

---

## Rough implementation plan

1. **New action** in `src/actions/polls.ts` — `sendCustomPush` (organiser only)
2. **UI** — a small "Send update" form on the poll page, visible only to the creator
3. **Payload** — `{ title, body, url?, image? }`
4. **Guard** — only the poll creator can trigger it; rate-limit (e.g. max 3 per poll per day?)
