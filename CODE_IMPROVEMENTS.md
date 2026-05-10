# Code Improvements

Findings from periodic code reviews. Each item includes the file/line reference and why it matters.

---

## Review 1 — 2026-05-09

### High priority

- [x] **#1 Sequential vote inserts** (`src/actions/votes.ts:113`) — `await` inside a `for` loop sends N serial D1 round-trips and leaves the participant with partial votes if any insert fails mid-loop. Fix: `db.batch([...])` is atomic and one round-trip. ✅ Fixed 2026-05-09
- [ ] **#2 Split poll finalization state** (`src/actions/polls.ts`, `src/actions/votes.ts:57`) — `chosen_option_id` (legacy) and `chosen_poll_options` junction table coexist with no single authoritative `isPollLocked()` check. A diverged state creates polls that appear open in some code paths and closed in others.
- [ ] **#3 No DB transactions on multi-step mutations** (`src/actions/polls.ts:255, 22`) — `inviteParticipants` and `createPoll` do sequential inserts with no transaction. Partial failure leaves ghost rows (e.g. a participant with no invite token).

### Medium priority

- [ ] **#4 4× duplicated recipient query** (`src/actions/polls.ts:187, 346, 407, 466`) — Identical 10-line `SELECT COALESCE(u.email, pa.email)` pasted into `lockPoll`, `cancelPoll`, `uncancelPoll`, `unlockPoll`. Extract to a shared helper.
- [x] **#5 Dead API route** (`src/pages/api/polls/create.ts`) — Prototype scaffold that echoes input and writes nothing to the database. Misleads anyone trying to understand poll creation. ✅ Fixed 2026-05-09
- [ ] **#6 Admin email hardcoded in source** (`src/actions/admin.ts:6`) — `ADMIN_EMAIL = "ernie.braganza@gmail.com"` in source. Should be `env.ADMIN_EMAIL` so it can change without a code deploy.

### Low-medium priority

- [ ] **#7 `makeToken()` modulo bias** (`src/lib/tokens.ts:5`) — Alphabet is 57 chars; `b % 57` on a 0–255 byte gives indices 0–27 a ~25% higher hit rate. Fix: rejection sampling (discard bytes ≥ 228).
- [ ] **#8 Sessions never rotated** (`src/pages/auth/verify.ts`, `src/pages/auth/passkey-authenticate.ts`) — Session token issued at login lives 7 days with no rotation. A stolen cookie is valid for the full window.

### Low priority

- [ ] **#9 `toBase64url` spread risk** (`src/lib/webpush.ts:15`) — `String.fromCharCode(...buf)` spreads all bytes as function args; hits V8 arg-count limit on large buffers. Use a loop instead.
- [ ] **#10 Dead code `onesignal.ts`** (`src/lib/onesignal.ts`) — Deprecated, not imported. Delete it.
- [ ] **#11 `VAPID_SUBJECT` unvalidated** (`src/lib/webpush.ts:129`) — Must be a `mailto:` or `https://` URI per spec; misconfiguration causes silent push failures.

### Awareness (no action required now)

- [ ] **#12 Middleware DB hit on every request** (`src/middleware.ts:14`) — Session join query on every request. Unavoidable without KV-backed sessions; revisit if latency becomes an issue.

---

*Add new review sections above this line as reviews are conducted.*
