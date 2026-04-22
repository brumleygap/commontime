# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build     # build to ./dist/ for Cloudflare Workers
```

Migrations are applied automatically by CI on merge to `main`. To apply manually against production:
```bash
npx wrangler d1 migrations apply commontime-db
```

There is no test suite or lint script configured. Testing is done by deploying to Cloudflare preview.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:
- **typecheck** — `tsc --noEmit` on all branches
- **migrate** — `wrangler d1 migrations apply commontime-db` on merge to `main` only, after typecheck passes

Requires two GitHub Actions secrets: `CLOUDFLARE_API_TOKEN` (D1 + Workers Edit) and `CLOUDFLARE_ACCOUNT_ID`.

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
- `votes` — one row per (participant, option) pair, with a binary `availability` field

The D1 binding is accessed differently depending on context:
- In Astro pages: `Astro.locals.runtime.env.DB`
- In Astro Actions: `context.locals.runtime.env.DB`

`src/db/d1.ts` is currently empty (a placeholder).

### Authentication

Magic link flow: user submits email on `/login` → `sendMagicLink` action finds-or-creates the user, inserts a `magic_tokens` row, sends an email via `src/lib/email.ts` → user clicks the link → `/auth/verify` validates the token, marks it used, creates a session, sets an HttpOnly cookie, redirects to `/`.

`src/middleware.ts` runs on every request: reads the `session` cookie, joins `sessions` → `users`, and populates `locals.user = { id, email }` if valid.

The `EMAIL` binding (Cloudflare Email Service) is declared in `wrangler.jsonc` and typed as `SendEmail` in `src/env.d.ts`.

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
- `votes.ts` → `submitVoteDebug` — inserts a participant and their vote rows
- `auth.ts` → `sendMagicLink` — find-or-create user, generate token, send email
- `schemas/` — Zod schemas for polls and votes actions

Actions are exported from `src/actions/index.ts` as `server`, which Astro picks up automatically.

### Form quirk: datetime options on `/create`

Astro's form handling doesn't reliably collect multiple `<input>` elements with the same `name`. The create form works around this with a client-side `submit` listener (inline `<script>` in `create.astro`) that serializes all `.datetime-option` values into a JSON array and writes it into a single hidden `<input name="options">` before submission. `CreatePollSchema` then parses that JSON string back into an array.
