# CLAUDE.md

CommonTime is a Doodle-style scheduling poll app: users create a poll with date/time options, share a link, and participants vote yes/maybe/busy on each slot.

## Commands

```bash
npm run build     # build to ./dist/ for Cloudflare Workers
```

No test suite or lint script. All testing on Cloudflare preview deployments — never locally.

## Environments

| Environment | Worker | D1 Database | When deployed |
|---|---|---|---|
| **production** | `commontime` | `commontime-db` | push to `main` |
| **preview** | `commontime-preview` | `commontime-db-preview` | any PR targeting `main` |

## CI

`.github/workflows/ci.yml`: typecheck always; migrate + deploy preview on PRs; migrate + deploy production on push to `main`. Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

**CI handles migrations automatically** — never include manual migration steps in PR descriptions or test plans.

Emergency manual migration only:
```bash
npx wrangler d1 migrations apply commontime-db --remote            # production
npx wrangler d1 migrations apply commontime-db-preview --remote -e preview  # preview
```

Always `--remote`. There is no local database.

## Further reading

- [Cloudflare Workers constraints](.claude/workers_constraints.md) — no Buffer, Uint8Array types, compatibility flags, rpId derivation
- [Architecture](.claude/architecture.md) — data layer, auth, routing, voting workflow, form quirks, design system