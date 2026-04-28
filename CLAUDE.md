# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build     # build to ./dist/ for Cloudflare Workers
```

There is no test suite or lint script. All testing is done on Cloudflare preview deployments — never locally.

## Environments

Two deployed environments:

| Environment | Worker | D1 Database | When deployed |
|---|---|---|---|
| **production** | `commontime` | `commontime-db` | push to `main` |
| **preview** | `commontime-preview` | `commontime-db-preview` | any PR targeting `main` |

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:
- **typecheck** — `tsc --noEmit` (always)
- **migrate + deploy preview** — on pull requests; targets `commontime-db-preview` and `commontime-preview` worker
- **migrate + deploy production** — on push to `main`; targets `commontime-db` and `commontime` worker

Requires two GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` (D1 + Workers Edit) and `CLOUDFLARE_ACCOUNT_ID`.

If a migration must be applied manually:
```bash
# Production
npx wrangler d1 migrations apply commontime-db --remote

# Preview
npx wrangler d1 migrations apply commontime-db-preview --remote -e preview
```

Always use `--remote`. There is no local database.

## Architecture

**CommonTime** is a Doodle-style scheduling poll app. It is a fully server-rendered Astro 5 app (`output: "server"`) deployed as a Cloudflare Worker via `@astrojs/cloudflare`.

### Data layer

The database is **Cloudflare D1** (SQLite), bound as `DB` in `wrangler.jsonc`. The schema lives in `migrations/`:

- `users` — one row per email address; created on first magic-link request
- `magic_tokens` — short-lived (15 min), single-use tokens emailed to users for login
- `sessions` — 7-day session tokens stored in an HttpOnly cookie named `session`
- `polls` — a poll with a public `token`, title, description, timezone, and optional `creator_id`
- `poll_options` — the candidate date/time slots for a poll
- `participants` — people who vote; each gets a private `edit_token`
- `votes` — one row per (participant, option) pair, with a **tristate `availability` field**: `0` = busy, `1` = yes, `2` = maybe

The D1 binding is accessed differently depending on context:
- In Astro pages: `Astro.locals.runtime.env.DB`
- In Astro Actions: `context.locals.runtime.env.DB`

`src/db/d1.ts` is currently empty (a placeholder).

### Authentication

Magic link flow: user submits email on `/login` → `sendMagicLink` action finds-or-creates the user, inserts a `magic_tokens` row, sends an email via `src/lib/email.ts` → user clicks the link → `/auth/verify` validates the token, marks it used, creates a session, sets an HttpOnly cookie, redirects to `/`.

`src/middleware.ts` runs on every request: reads the `session` cookie, joins `sessions` → `users`, and populates `locals.user = { id, email }` if valid.

The `EMAIL` binding is a **Service binding** to the `commontime-email-sender` Worker (which holds the actual `send_email` binding). Cloudflare Pages does not support `send_email` bindings directly. It is configured in the Cloudflare Pages dashboard (Settings → Bindings → Service binding) and typed as `Fetcher` in `src/env.d.ts`.

### Routing and pages

File-based routing under `src/pages/`:

| Route | File | Purpose |
|---|---|---|
| `/` | `index.astro` | Landing page |
| `/login` | `login.astro` | Magic link request form |
| `/auth/verify` | `auth/verify.ts` | Magic link callback; sets session cookie |
| `/create` | `create.astro` | Poll creation form; redirects to `/poll/<token>` on success |
| `/poll/[token]` | `poll/[token].astro` | Poll view and voting; queries D1 directly in the frontmatter |

`src/pages/api/polls/create.ts` is an older prototype API route that does not write to the database — it only validates and echoes form data. It is not wired into the UI.

### Mutations via Astro Actions

Form submissions go through [Astro Actions](https://docs.astro.build/en/guides/actions/), not the API route. Actions live in `src/actions/`:

- `polls.ts` → `createPoll` — inserts a poll and its options using `db.batch()`; sets `creator_id` from `locals.user` if logged in
- `votes.ts` → `submitVote` — upserts a participant and their tristate vote rows (replaces all previous votes if the user already has a participant row in this poll)
- `auth.ts` → `sendMagicLink` — find-or-create user, generate token, send email
- `schemas/` — Zod schemas for polls and votes actions

Actions are exported from `src/actions/index.ts` as `server`, which Astro picks up automatically.

### Voting workflow

Votes use a tristate system: **yes** (1), **maybe** (2), **busy** (0). Every time slot gets one of these three values — there is no "no response" state on submission; unset slots default to `0` (busy) when the form is submitted.

**Poll page (`/poll/[token]`)** flow:
1. The frontmatter queries the poll, options, all participants, and all votes, then groups votes into a `Map<participantId, Map<optionId, availability>>`.
2. Each option's score is computed as `yesCount * 2 + maybeCount`. The highest-scoring option is marked as the "winner" and gets a star and green header highlight.
3. Logged-in users have their previous votes pre-loaded into `myVoteMap` and the UI is pre-highlighted on page load. A "welcome back" banner is shown.
4. The vote form renders a row per time slot with three toggle buttons (yes / maybe / busy). Clicking a button updates client-side state and changes the bullet color (green / amber / red).
5. On submit, a client-side script serializes all vote states — including explicit `0` for any unset slot — into a JSON array and writes it to a hidden `#vote-data` field. `SubmitVoteSchema` parses that JSON.
6. `submitVote` action: if the participant already exists for this user+poll, delete all their old votes and insert the new set (upsert). Otherwise create a new participant row (with a UUID-derived `edit_token`) then insert votes.

**Vote display:**
- ✓ green = yes, ~ amber = maybe, ✕ red = busy, — gray = no response (participant hasn't voted yet)
- Participants who haven't responded appear at 40% opacity with a "pending" badge.

### Form quirks

**Datetime options on `/create`:** Astro's form handling doesn't reliably collect multiple `<input>` elements with the same `name`. The create form works around this with a client-side `submit` listener (inline `<script>` in `create.astro`) that serializes all `.datetime-option` values into a JSON array and writes it into a single hidden `<input name="options">` before submission. `CreatePollSchema` then parses that JSON string back into an array.

**Vote data on `/poll/[token]`:** The same pattern applies to votes. A client-side `submit` listener collects the state of every time-slot toggle into `{ optionId, availability }[]`, JSON-serializes it into a hidden `#vote-data` field, and `SubmitVoteSchema` parses it on the server.

### Design system

The UI uses a music-inspired theme. Decorative glyphs (𝄴 ♩ ♪ ♫) are rendered using **Playfair Display**, which includes them.

**Fonts** (loaded from Google Fonts in `BaseLayout.astro`):
- `'Libre Baskerville'` (serif) — body text and UI prose
- `'Playfair Display'` (serif, weights 400/700/900) — headlines and display text
- `'DM Mono'` (monospace) — labels, timestamps, metadata, input fields

**Tailwind** (`tailwind.config.mjs`) extends the default theme with color aliases (`ink`, `cream`, `ct-red`, `staff`, `muted`, `ct-green`, `green-light`) and the three font families above.

**CSS custom properties** (defined in `src/styles/global.css`):

| Variable | Value | Usage |
|---|---|---|
| `--ink` | `#0f0f0e` | Primary text, dark backgrounds |
| `--cream` | `#f5f2ec` | Page background |
| `--red` | `#c8102e` | CTAs, error accents |
| `--staff` | `#d4cfc6` | Borders, dividers |
| `--muted` | `#5c5752` | Secondary text |
| `--green` | `#1a6b3a` | Success |
| `--green-light` | `#e8f5ee` | Success background |
| `--yes` / `--yes-bg` | `#166534` / `#f0fdf4` | "Yes" vote text and background |
| `--maybe` / `--maybe-bg` | `#d97706` / `#fffbeb` | "Maybe" vote accent and background |
| `--busy-bg` | `#fff5f5` | "Busy" vote and error background |
| `--winner` | `#4ade80` | Winner column highlight |
| `--day-bg` | `#f0ede7` | Day-group header row background |

**Shared CSS classes:**
- `.ct-btn` — primary button (red background, white text, underline `::after` decoration)
- `.ct-eyebrow` — label style (DM Mono, 10px, uppercase, muted)
- `.staff-bg` — decorative repeating staff-line background (31px CSS gradient)
