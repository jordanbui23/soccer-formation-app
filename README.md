# Match-day Board

An editorial match-day board for grassroots 11v11 football. Share a public RSVP link
in your team chat, watch replies land in real time, then build the starting XI on a
drag-and-drop tactics board and export it as PNG or PDF.

Built with **Vite + vanilla TypeScript** (no frontend framework), **@supabase/supabase-js**,
**html-to-image**, **jspdf**, and **Vitest**.

## Two ways to run

The app auto-selects its backend at startup:

| Condition | Backend | Notes |
|-----------|---------|-------|
| `VITE_SUPABASE_URL` **and** `VITE_SUPABASE_ANON_KEY` set | Supabase | Production: real auth, row level security, secure RSVP RPCs |
| either missing/empty | Demo | Local-only `localStorage`, seeded data, **not secure** |

### Demo mode (default, zero config)

```bash
npm install
npm run dev
```

Open the printed URL. Demo mode seeds an admin and a sample game, and the login screen
pre-fills the seeded credentials:

- **Email:** `coach@matchday.local`
- **Password:** `matchday-demo`

Everything (games, RSVPs, lineups) persists in your browser's `localStorage`. Public
share links resolve on the same origin, and the private per-RSVP edit link works exactly
as it does in production. Demo mode is a local sandbox and makes **no security guarantees**.

### Production mode (Supabase)

1. Create a Supabase project.
2. Run the migrations in `supabase/migrations/` in order (SQL editor or `supabase db push`):
   - `0001_init.sql` creates the tables, row level security policies, the safe `public_rsvps`
     view, and the `create_rsvp` / `get_rsvp_for_edit` / `update_rsvp` RPCs.
   - `0002_add_team_color.sql` adds the per-game `team_color` column. It is additive and
     non-destructive: existing rows are backfilled with home black (`#000000`) and a regex
     check constrains the value to a strict `#RRGGBB` hex string. The migration is idempotent,
     so re-running it against an already-migrated database is a no-op.
3. Provision an admin: create a user in **Supabase Auth**. Any authenticated user can create
   and own games; ownership is enforced by RLS.
4. Copy `.env.example` to `.env` and fill in:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

Only the public **anon** key is used client-side. The service-role key is never referenced.

## Scripts

```bash
npm run dev        # start the dev server
npm run build      # type-check then production build to dist/
npm run preview    # preview the production build
npm test           # run the Vitest unit suite
```

## Routes

URL routing is handled by the History API, no routing dependency.

| Route | Purpose |
|-------|---------|
| `/` | redirects to `/admin` |
| `/admin` | admin login, or the game list when signed in |
| `/admin/games/:id` | RSVP management + tactics board for one game |
| `/game/:slug` | public game page: match details, roster, RSVP form |
| `/game/:slug/edit/:rsvpId#token=…` | private RSVP edit link |

The edit token travels in the URL **fragment** (`#token=…`), which browsers never send to
the server, so it stays out of request logs. `public/_redirects` provides the SPA fallback so
deep links resolve on Cloudflare Pages.

## How RSVP editing stays private

- Edit tokens are generated with a CSPRNG (32 random bytes).
- Only a **SHA-256 hash** of the token is stored; the plaintext is shown to the player once.
- In Supabase mode, creation is a `SECURITY DEFINER` RPC: the database generates the token,
  so a client can neither submit an arbitrary hash nor bypass the game-open check. Updates go
  through an RPC that re-hashes the supplied token and compares server-side.
- The public only ever reads the `public_rsvps` projection (id, name, first_name, last_name,
  preferred_position, status, created_at). The `edit_token_hash` column is never exposed.
- All `SECURITY DEFINER` functions set `search_path = ''`, fully qualify every reference,
  validate the trimmed name and allowed status, check the game-open state, and are granted
  execute only to `anon`/`authenticated` after revoking the default `PUBLIC` grant.

## Lineup model

Per-game lineup state is stored compactly:

```ts
interface LineupState {
  formation: string;
  players: { id; name; pos; starter; manual; rsvpId }[];
  customPositions: Record<playerId, { x; y }>;
  slotOverrides: Record<playerId, slotIndex>;
}
```

A player who replies **Yes** is added once as an unassigned substitute. Changing away from Yes
removes that player (and clears their placement) without touching manually added players. Admin
name edits flow through to the linked lineup player. All of this lives in pure functions in
`src/lineup.ts` and is covered by the test suite.

## RSVP names and preferred position

An RSVP captures a required **first name**, an optional **last name**, and a required
**preferred position** (one of the fine-grained codes in `ALL_POSITIONS`, e.g. `CB`, `CDM`,
`ST`). The composed full name is stored in `name` (kept authoritative and non-null), with
`first_name` / `last_name` / `preferred_position` as structured columns added additively in
`0003_add_rsvp_name_position.sql`. Rows created before that migration keep their single `name`
with the structured columns left `null`; display falls back to `name` and shows a dash for a
missing position. Rosters render the full name plus position; the tactics board and PNG/PDF
export show **first name only**, disambiguating shared first names with a last initial
(`Sam K.` / `Sam D.`). Preferred position is stored and displayed only; it does not
auto-assign lineup slots. Name/position helpers live in `src/rsvpName.ts` and are covered by
the test suite.

## Formations

All eight preset formations from the original build are preserved with identical coordinates:
`4-4-2`, `4-3-3`, `3-5-2`, `4-2-3-1`, `4-5-1`, `3-4-3`, `4-1-4-1`, `4-4-1-1`. Players snap to
compatible slots, can be dragged to nudge, dropped onto a teammate to swap, or nudged with the
keyboard (focus a token, use the arrow keys). Max 11 starters is enforced.

## Deploy to Cloudflare Pages

Create a Pages project connected to this repository with:

- **Build command:** `npm run build`
- **Build output directory:** `dist`

`public/_redirects` supplies the SPA fallback (`/* /index.html 200`) so History-API deep links
resolve, and `public/_headers` applies the security headers on every response. Both are copied
verbatim into `dist` at build time, so Cloudflare Pages picks them up with no dashboard config.

Set the two `VITE_SUPABASE_*` environment variables (for both **Production** and **Preview**) in
the Pages project settings for production; leave them unset to ship the demo sandbox. See
[`MIGRATION.md`](./MIGRATION.md) for the full Netlify-to-Pages cutover and rollback record.

## Tech notes

- Player names are always written to the DOM as text nodes, never interpolated into `innerHTML`.
- `prefers-reduced-motion` disables animations and spinners.
- Accessible labels, radio groups, visible focus rings, and `aria-busy`/`aria-live` status
  messaging are used throughout.
