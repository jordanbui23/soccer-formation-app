# Netlify to Cloudflare Pages Migration

This app was migrated from Netlify to Cloudflare Pages. Hosting is the only thing that
changed: it remains a static Vite single-page app with a client-side Supabase backend. No
application code, routing, environment variable names, or Supabase configuration changed.

## What was removed

| Item | Status |
|------|--------|
| `netlify.toml` | Deleted. Its build settings, SPA redirect, and security headers were re-expressed in the platform-neutral `public/_redirects` and new `public/_headers` files. |
| README "Deploy to Netlify" section | Replaced with "Deploy to Cloudflare Pages". |
| README SPA-fallback note referencing `netlify.toml` / Netlify | Rewritten to reference `public/_redirects` and Cloudflare Pages. |

No Netlify Functions, Edge Functions, Forms, Identity, redirects with rewrites, or
query/country/role conditions were ever used, so nothing else required porting.

## Configuration mapping

The old `netlify.toml` contained exactly three concerns. Each maps to a file that Vite copies
verbatim from `public/` into `dist/`, which Cloudflare Pages reads automatically with no
dashboard configuration.

| `netlify.toml` block | Cloudflare Pages equivalent |
|----------------------|------------------------------|
| `[build] command = "npm run build"` | Pages project setting: **Build command** = `npm run build` |
| `[build] publish = "dist"` | Pages project setting: **Build output directory** = `dist` |
| `[[redirects]] /* -> /index.html 200` | `public/_redirects`: `/*    /index.html   200` (already present; unchanged) |
| `[[headers]] for = "/*"` (three headers) | `public/_headers`: `/*` block with the same three headers |

### Security headers (unchanged values)

Both platforms apply these to static asset responses:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

### SPA fallback

`public/_redirects` holds `/*    /index.html   200`. This is the same syntax Netlify and
Cloudflare Pages both understand, so History-API deep links (`/admin/games/:id`, `/game/:slug`,
`/game/:slug/edit/:rsvpId#token=…`) resolve to the SPA. Cloudflare Pages would also fall back to
`index.html` automatically in the absence of a `404.html`, but the explicit rule is kept so the
behavior is identical across platforms and self-documenting.

## Environment variables

Names are unchanged. Set both in the Pages project under **Settings -> Environment variables**
for **Production** and **Preview**:

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key (safe for client-side) |

When both are set the app runs in Supabase (production) mode; if either is missing it falls back
to the local demo sandbox. Only the public anon key is used client-side; the service-role key is
never referenced. See `.env.example`.

## Cutover procedure

1. Ensure the Supabase migrations are applied in order, including
   `supabase/migrations/0002_add_team_color.sql`, before the new frontend goes live. The build
   selects the `team_color` column, so deploying the code against an un-migrated database makes
   game reads fail.
2. Create a Cloudflare Pages project connected to this Git repository.
3. Set **Build command** = `npm run build` and **Build output directory** = `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview.
5. Trigger a deployment and verify the build succeeds.
6. On the `*.pages.dev` URL, verify:
   - Direct navigation to `/admin`, `/admin/games/:id`, and `/game/:slug` loads the SPA (no 404).
   - A private RSVP edit link (`/game/:slug/edit/:rsvpId#token=…`) resolves and the fragment is preserved.
   - Response headers include `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
   - Supabase auth and reads work (production env vars loaded).
7. Add the custom domain to the Pages project and confirm automatic TLS.
8. Cut the custom domain's DNS over to Cloudflare Pages only after the above passes.

## Rollback

Because this is a hosting-only change, rollback is a DNS operation:

1. Keep the existing Netlify site live until the Pages deployment is verified on `*.pages.dev`
   and, if used, a staging custom domain.
2. If a problem appears after cutover, point the custom domain's DNS back to Netlify. The
   application build is byte-for-byte the same, so no code revert is required.
3. Restoring `netlify.toml` is optional and only needed if you intend to keep deploying on
   Netlify long-term; recover it from Git history (`git log -- netlify.toml`).

Once Cloudflare Pages has been stable in production, the Netlify site and its DNS records can be
removed.
