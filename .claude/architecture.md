# Architecture

**CommonTime** is a Doodle-style scheduling poll app. Fully server-rendered Astro 6 (`output: "server"`) with Tailwind 4, deployed as a **Cloudflare Worker** (not Pages) via `@astrojs/cloudflare`.

## Data layer

Database is **Cloudflare D1** (SQLite), bound as `DB` in `wrangler.jsonc`. Schema in `migrations/`:

- `users` — one row per email; created on first magic-link request
- `magic_tokens` — short-lived (15 min), single-use login tokens
- `sessions` — 7-day session tokens in an HttpOnly cookie named `session`
- `polls` — public `token`, title, description, timezone, optional `creator_id`
- `poll_options` — candidate date/time slots for a poll
- `participants` — voters; each gets a private `edit_token`
- `votes` — tristate `availability`: `0` = busy, `1` = yes, `2` = maybe

D1 binding access:
- Astro pages: `Astro.locals.runtime.env.DB`
- Astro Actions: `context.locals.runtime.env.DB`

## Authentication

Magic link flow: `/login` → `sendMagicLink` action finds-or-creates user, inserts `magic_tokens` row, sends email via `src/lib/email.ts` → user clicks link → `/auth/verify` validates token, creates session, sets HttpOnly cookie, redirects to `/`.

`src/middleware.ts`: reads `session` cookie, joins `sessions → users`, populates `locals.user = { id, email }` if valid.

`EMAIL` binding is a Service binding to the `commontime-email-sender` Worker. Configured in `wrangler.jsonc`, typed as `Fetcher` in `src/env.d.ts`.

## Routing

| Route | File | Purpose |
|---|---|---|
| `/` | `index.astro` | Landing page |
| `/login` | `login.astro` | Magic link request form |
| `/auth/verify` | `auth/verify.ts` | Magic link callback |
| `/create` | `create.astro` | Poll creation |
| `/poll/[token]` | `poll/[token].astro` | Poll view and voting |

`src/pages/api/polls/create.ts` is an unused prototype — not wired to the UI.

## Mutations via Astro Actions

Actions in `src/actions/`:
- `polls.ts` → `createPoll` — inserts poll + options via `db.batch()`
- `votes.ts` → `submitVote` — upserts participant and tristate vote rows
- `auth.ts` → `sendMagicLink`
- `schemas/` — Zod schemas

Exported from `src/actions/index.ts` as `server`.

## Voting workflow

Tristate: **yes** (1), **maybe** (2), **busy** (0). Unset slots default to `0` on submit.

Poll page flow:
1. Frontmatter queries poll, options, participants, votes → `Map<participantId, Map<optionId, availability>>`
2. Score = `yesCount * 2 + maybeCount`. Highest = winner (star + green header)
3. Logged-in users get previous votes pre-loaded; "welcome back" banner shown
4. Toggle buttons (yes/maybe/busy) update client-side state
5. Submit: client script serializes all states into JSON → hidden `#vote-data` field → `SubmitVoteSchema` parses it

Vote display: ✓ green = yes, ~ amber = maybe, ✕ red = busy, — gray = no response

## Form quirks

**Create form:** Multiple `<input>` elements with the same `name` aren't reliably collected by Astro. A `submit` listener serializes `.datetime-option` values into JSON → single hidden `<input name="options">`. `CreatePollSchema` parses it back.

**Vote form:** Same pattern — `submit` listener collects toggle state into `{ optionId, availability }[]` → hidden `#vote-data`.

## Design system

Music-inspired theme. Glyphs (𝄴 ♩ ♪ ♫) rendered using **Playfair Display**.

**Fonts** (Google Fonts in `BaseLayout.astro`):
- `'Libre Baskerville'` — body text
- `'Playfair Display'` — headlines (weights 400/700/900)
- `'DM Mono'` — labels, timestamps, inputs

**CSS custom properties** (`src/styles/global.css`):

| Variable | Value | Usage |
|---|---|---|
| `--ink` | `#0f0f0e` | Primary text |
| `--cream` | `#f5f2ec` | Page background |
| `--red` | `#c8102e` | CTAs, errors |
| `--staff` | `#d4cfc6` | Borders, dividers |
| `--muted` | `#5c5752` | Secondary text |
| `--green` | `#1a6b3a` | Success |
| `--green-light` | `#e8f5ee` | Success background |
| `--yes` / `--yes-bg` | `#166534` / `#f0fdf4` | Yes vote |
| `--maybe` / `--maybe-bg` | `#d97706` / `#fffbeb` | Maybe vote |
| `--busy-bg` | `#fff5f5` | Busy/error background |
| `--winner` | `#4ade80` | Winner highlight |
| `--day-bg` | `#f0ede7` | Day-group header |

**Shared CSS classes:**
- `.ct-btn` — primary button (red bg, white text, underline `::after`)
- `.ct-eyebrow` — DM Mono, 10px, uppercase, muted
- `.staff-bg` — repeating staff-line background (31px CSS gradient)