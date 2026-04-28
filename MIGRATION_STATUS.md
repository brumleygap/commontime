# Astro 6 / Tailwind 4 Migration — COMPLETE

**Completed:** 2026-04-27

---

## What Was Done

- Astro 5 → 6.1.9, `@astrojs/cloudflare` v12 → v13.2.1, Tailwind 3 → 4.2.4
- TypeScript added as explicit devDep
- Tailwind 4 via `@tailwindcss/vite` Vite plugin; `tailwind.config.mjs` and `postcss.config.mjs` deleted
- `z.string().email()` → `z.email()` (Zod 4)
- All `locals.runtime.env` accesses migrated to `import { env } from "cloudflare:workers"`
- Deployment migrated from Cloudflare Pages CI → GitHub Actions `wrangler deploy`
- `scripts/patch-deploy-config.mjs` strips auto-injected SESSION KV + IMAGES from deploy config
- EMAIL service binding moved into `wrangler.jsonc`
- `disable_nodejs_process_v2` compatibility flag added (see below)

---

## The Bug That Caused [object Object]

**Root cause:** `nodejs_compat` + `compatibility_date >= 2025-09-15` causes Astro's `isNode` detection to run in a dependency chunk that evaluates *before* the compat polyfill. It sees `process v2`, thinks it's Node.js, and returns async iterable responses. `workerd` doesn't support async iterables → body serializes to `[object Object]`.

**Fix:** `"disable_nodejs_process_v2"` in `wrangler.jsonc` compatibility flags.

Ref: https://github.com/withastro/astro/issues/14511
