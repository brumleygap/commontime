# Code Improvements

Findings from periodic code reviews. Each item includes the file/line reference and why it matters.

---

## Review 1 — 2026-05-09

### High priority

- [x] **#1 Sequential vote inserts** (`src/actions/votes.ts:113`) — `await` inside a `for` loop sends N serial D1 round-trips and leaves the participant with partial votes if any insert fails mid-loop. Fix: `db.batch([...])` is atomic and one round-trip. ✅ Fixed 2026-05-09
- [x] **#2 Split poll finalization state** (`src/actions/polls.ts`, `src/actions/votes.ts:57`) — `chosen_option_id` (legacy) and `chosen_poll_options` junction table coexist with no single authoritative `isPollLocked()` check. A diverged state creates polls that appear open in some code paths and closed in others. ✅ Fixed 2026-05-12
- [x] **#3 No DB transactions on multi-step mutations** (`src/actions/polls.ts:24, 236`) — `createPoll` and `inviteParticipants` do sequential inserts with no transaction. Partial failure leaves ghost rows (e.g. a participant with no invite token). ✅ Fixed 2026-05-12

### Medium priority

- [x] **#4 4× duplicated recipient query** (`src/actions/polls.ts:187, 346, 407, 466`) — Identical 10-line `SELECT COALESCE(u.email, pa.email)` pasted into `lockPoll`, `cancelPoll`, `uncancelPoll`, `unlockPoll`. Extract to a shared helper. ✅ Fixed 2026-05-12
- [x] **#5 Dead API route** (`src/pages/api/polls/create.ts`) — Prototype scaffold that echoes input and writes nothing to the database. Misleads anyone trying to understand poll creation. ✅ Fixed 2026-05-09
- [x] **#6 Admin email hardcoded in source** (`src/actions/admin.ts:6`, `src/actions/polls.ts:624`) — `ADMIN_EMAIL = "ernie.braganza@gmail.com"` in `admin.ts` and a second independent hardcode in `remindNonResponders` (doesn't even use the constant). Both should read from `env.ADMIN_EMAIL`. ✅ Fixed 2026-05-12

### Low-medium priority

- [ ] **#7 `makeToken()` modulo bias** (`src/lib/tokens.ts:6`) — Alphabet is 57 chars; `b % 57` on a 0–255 byte gives indices 0–27 a ~25% higher hit rate. Fix: rejection sampling (discard bytes ≥ 228).
- [ ] **#8 Sessions never rotated** (`src/pages/auth/verify.ts:30`, `src/pages/auth/passkey-authenticate.ts:85`) — Session token issued at login lives 7 days with no rotation. A stolen cookie is valid for the full window.

### Low priority

- [ ] **#9 `toBase64url` spread risk** (`src/lib/webpush.ts:15`) — `String.fromCharCode(...buf)` spreads all bytes as function args; hits V8 arg-count limit on large buffers. Use a loop instead.
- [x] **#10 Dead code `onesignal.ts`** (`src/lib/onesignal.ts`) — Deprecated, not imported. Delete it. ✅ Fixed 2026-05-12
- [ ] **#11 `VAPID_SUBJECT` unvalidated** (`src/lib/webpush.ts:129`) — `vapid.subject` is passed straight to the JWT `sub` claim; must be a `mailto:` or `https://` URI per spec. Misconfiguration causes silent push failures.

### Awareness (no action required now)

- [ ] **#12 Middleware DB hit on every request** (`src/middleware.ts:15`) — Session join query on every request. Unavoidable without KV-backed sessions; revisit if latency becomes an issue.

---

## Security Review 1 — 2026-05-12

> Context: scheduling app storing name, email, and meeting availability. No financial data, no SSNs. Risk ratings are calibrated accordingly.

### Medium risk

- [ ] **#S1 No rate limiting on magic-link endpoint** (`src/actions/auth.ts:6`) — `sendMagicLink` inserts a token and sends an email with no per-IP or per-email cooldown. Any unauthenticated caller can trigger unlimited emails to an arbitrary address. Fix: track `last_magic_link_at` on the user row and reject requests within a 60-second window.

### Low-medium risk

- [ ] **#S2 No HTTP security headers** (global) — No `Content-Security-Policy`, `X-Frame-Options`, or `X-Content-Type-Options` headers are set anywhere. CSP limits XSS blast radius; `X-Frame-Options: DENY` prevents the vote/confirm pages from being iframed for clickjacking. Fix: add a `_headers` file or set them in the worker response for all HTML routes.

### Low risk

- [x] **#S3 Admin email hardcoded in 4 more files** (`src/components/AppHeader.astro:18`, `src/pages/admin/push.astro:6`, `src/pages/api/admin/upload-image.ts:5`, `src/pages/poll/[token].astro:193`) — #6 fixed `admin.ts` and `polls.ts` but missed these. If the admin email ever changes, these pages silently break (wrong person gets admin UI / upload access denied). ✅ Fixed 2026-05-12

- [ ] **#S4 Account existence oracle via passkey-check** (`src/pages/auth/passkey-check.ts:6`) — `GET /auth/passkey-check?email=...` is unauthenticated and returns `{ hasPasskey: true/false }`, confirming whether any email is a registered user. Low impact for this app but worth knowing; fix by requiring authentication or always returning the same shape without distinguishing non-existent from no-passkey.

- [ ] **#S5 No file size limit on admin image upload** (`src/pages/api/admin/upload-image.ts:12`) — `formData.get("file")` accepts any size. A large upload blocks the Worker for its duration and burns R2 write quota. Fix: check `file.size` before streaming to R2 (e.g. reject > 5 MB).

### Informational

- [ ] **#S6 WebAuthn auth challenge not scoped to credential** (`src/pages/auth/passkey-authenticate.ts:50`) — At authentication time the challenge is selected by `ORDER BY id DESC LIMIT 1` rather than being tied to the authenticating user/device. Two simultaneous auth flows in the same 5-minute window could share a challenge. The 5-minute expiry significantly limits exploitability; no action required unless concurrent auth becomes common.

---

*Add new review sections above this line as reviews are conducted.*
