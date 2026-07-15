---
name: matchday-build-deploy
description: The build, backend-selection, and Cloudflare Pages deploy surface of the Match-day Board app - the Vite build + tsc typecheck, the demo-vs-Supabase runtime switch driven by VITE_SUPABASE_* env vars, and the static hosting artifacts (public/_redirects SPA fallback, public/_headers security headers). Use when changing build/test scripts, vite.config.ts, the env-var backend selection (src/data/config.ts, index.ts, supabaseClient.ts), .env handling, the Cloudflare Pages setup, the SPA redirect or security headers, or reasoning about "which backend runs" / "why is it in demo mode" / deploy + rollback. Triggers on 'build', 'npm run build', 'tsc', 'vite', 'deploy', 'Cloudflare Pages', '_redirects', '_headers', 'SPA fallback', 'security headers', 'env var', 'VITE_SUPABASE_URL', 'demo mode', 'hasSupabase', 'MIGRATION.md', 'rollback'. Do NOT use for SQL migrations/RLS (use matchday-supabase-security), repository logic (use matchday-data-layer), or view/route code (use matchday-ui-rendering).
---

# Match-day Board: Build, Backend Selection & Deploy

A static Vite single-page app with a client-side backend chosen at runtime. No server of our own - Cloudflare Pages serves `dist/`, and the app talks to Supabase (or fakes it in demo mode) straight from the browser.

## Scripts (from [package.json](../../package.json))

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server. |
| `npm run build` | `tsc --noEmit && vite build` - **typecheck gates the build**; a type error fails the build. Output to `dist/`. |
| `npm run preview` | Serve the built `dist/`. |
| `npm test` | `vitest run` (node env, `test/**/*.test.ts`). |
| `npm run typecheck` | `tsc --noEmit` alone. |

`build` runs the typechecker first, so `npm run typecheck` is the fast inner-loop check; a green `build` implies a green typecheck. Vitest is configured inside [vite.config.ts](../../vite.config.ts) (`environment: 'node'`, `setupFiles: ['test/setup.ts']`) - there is **no jsdom**, so only pure logic is unit-tested (see the lineup/data/export skills for what has coverage).

## The backend switch (demo vs Supabase)

The app auto-selects its backend at startup - there is no build flag, only environment:

- [src/data/config.ts](../../src/data/config.ts) `readConfig()` reads `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, **trims** them, and sets `hasSupabase = both are non-empty`.
- [src/data/index.ts](../../src/data/index.ts) `getRepository()` (lazy singleton) returns `new SupabaseRepository(createSupabaseClient(config))` when `hasSupabase`, else `new DemoRepository()`.

Consequences to remember:

- **Both vars must be set and non-empty** to get production. Either one missing/blank silently drops to the demo sandbox (localStorage, seeded data, **no security guarantees**). "Why is it in demo mode in the deploy?" is almost always an unset/typo'd Pages env var.
- `VITE_`-prefixed vars are **inlined into the client bundle at build time** by Vite. Only the public **anon** key belongs here; the service-role key must never appear in any `VITE_*` var or client code. Changing env vars requires a **rebuild/redeploy**, not just a restart.
- The Supabase client ([src/data/supabaseClient.ts](../../src/data/supabaseClient.ts)) uses `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` (the latter matters because our own edit token rides in the URL fragment - see matchday-ui-rendering / matchday-supabase-security). Keep these unless you know why.

`.env` is git-ignored; [.env.example](../../.env.example) documents the two vars. To develop against real Supabase, copy it to `.env` and fill both in.

## Static hosting artifacts (copied verbatim from `public/` into `dist/`)

- [public/_redirects](../../public/_redirects) - `/*  /index.html  200`. This is the **SPA fallback**: without it, a hard refresh or shared deep link to `/game/:slug` or `/admin/games/:id` 404s, because those paths only exist in the client router ([src/main.ts](../../src/main.ts)). Any new top-level route depends on this rule; you do not add per-route entries, the wildcard covers all.
- [public/_headers](../../public/_headers) - security headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. `X-Frame-Options: DENY` blocks click-jacking; keep it unless a real embedding need appears.

Vite copies everything in `public/` into `dist/` untouched, so Cloudflare Pages picks these up with **no dashboard config**. Do not move this logic into a platform-specific config file (that was the point of the Netlify->Pages migration).

## Cloudflare Pages deploy

- **Build command:** `npm run build` · **Build output directory:** `dist`.
- Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for **both Production and Preview** to ship production; leave them unset to publish the demo sandbox.
- Full cutover + rollback record (and why hosting is the ONLY thing that changed vs the old Netlify setup) is in [MIGRATION.md](../../MIGRATION.md). Because it is a plain static SPA, rollback is redeploying the previous build; no data migration is involved.

## Verify

```bash
npm run build       # tsc + vite; must exit 0 before any deploy
npm run preview     # smoke-test the actual built artifact, not just dev
```

For a backend-selection change, verify **both** modes: run once with `.env` unset (expect demo: seeded coach login) and once with both vars set (expect real auth). A deploy issue that only reproduces in one mode is usually the env-var gate, not the code.
