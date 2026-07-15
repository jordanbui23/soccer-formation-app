---
name: matchday-supabase-security
description: The security backbone of the Match-day Board app - Postgres Row Level Security, SECURITY DEFINER RPCs, the safe public_rsvps view, and CSPRNG edit-token hashing. Use when writing or reviewing a Supabase migration under supabase/migrations/, adding/changing an RLS policy, writing a SECURITY DEFINER function, exposing any RSVP data publicly, touching edit tokens, or reasoning about "can anon see/do X". Triggers on 'migration', 'RLS', 'row level security', 'policy', 'SECURITY DEFINER', 'RPC', 'public_rsvps', 'edit token', 'grant', 'search_path', 'anon can', 'supabase/migrations'. Do NOT use for adding a client-side Repository method with no SQL change (use matchday-data-layer) or lineup/formation logic (use matchday-lineup-formations).
---

# Match-day Board: Supabase Security Model

The trust boundary is the database. The client only holds the public **anon** key; the service-role key is never referenced. Every guarantee below is enforced in [supabase/migrations/0001_init.sql](../../supabase/migrations/0001_init.sql). Read it before changing anything here.

## Threat model in one paragraph

Anyone with a public game link is an untrusted `anon` client. They may read game details and a name/status projection of RSVPs, and may create/edit exactly ONE RSVP they hold the secret token for. They must never read another player's edit token, write an arbitrary RSVP row, bypass the game-open check, or touch a game they do not own. Admins (`authenticated`) own their games and everything under them, scoped by RLS.

## The five load-bearing mechanisms

1. **RLS on every table** (`games`, `rsvps`, `lineups`). `anon` gets SELECT on `games` only. `anon` has NO direct access to `rsvps`. Admin access is gated by `owner_id = auth.uid()` (directly on `games`, transitively via an `exists (... games g where g.owner_id = auth.uid())` subquery on `rsvps`/`lineups`).

2. **`public_rsvps` view** projects only `id, game_id, name, status, created_at` - **never `edit_token_hash`**. It is `security_invoker = false` (runs as owner) so anon can read the projection without table access. Anon is granted SELECT on the view, not the table.

3. **SECURITY DEFINER RPCs** are the only public write path: `create_rsvp`, `get_rsvp_for_edit`, `update_rsvp`. Because the DB generates the token inside `create_rsvp`, a client can neither submit an arbitrary hash nor skip the `is_open` check. `update_rsvp`/`get_rsvp_for_edit` re-hash the supplied token and match server-side.

4. **Token hygiene.** 32 CSPRNG bytes generated server-side (`extensions.gen_random_bytes(32)`), only the SHA-256 hash (`extensions.digest(..., 'sha256')`) is stored, plaintext returned exactly once. Client-side mirror lives in [src/crypto.ts](../../src/crypto.ts) (`generateEditToken`, `hashToken`, `timingSafeEqual`) for demo mode. The token travels in the URL `#fragment`, which browsers never send to servers.

5. **Least-privilege grants.** Every object does `revoke all ... from public/anon/authenticated` then grants back the minimum. RPCs `revoke all ... from public` then `grant execute ... to anon, authenticated`.

## Hard rules for any new migration or function

- **Every `SECURITY DEFINER` function MUST set `search_path = ''`** and fully-qualify every reference (`public.rsvps`, `extensions.digest`, ...). Omitting this is a privilege-escalation hole (search-path hijack). Triggers use `security invoker` + `search_path = ''`.
- **Validate inside the function**, do not trust the client: re-check name length (1-40), `status in ('yes','maybe','no')`, and the game `is_open` state - exactly as `create_rsvp`/`update_rsvp` do. Raise with `using message = '...'` so the client sees a clean message.
- **Never expose `edit_token_hash`** through a view, RPC return, RLS-readable column, or log. If you add a public read, project explicit columns - never `select *` from `rsvps`.
- **Grant, then re-check.** New table/view/function: `revoke all` from `public, anon, authenticated`, then grant the minimum. New RSVP-adjacent write for anon MUST go through a DEFINER RPC, never a direct table grant.
- **Preserve ownership scoping.** Any new admin table referencing a game gets an RLS policy of the `exists (select 1 from public.games g where g.id = <t>.game_id and g.owner_id = auth.uid())` form, for the specific commands needed.
- **New migrations are additive and numbered** (`0003_*.sql`, ...). See [0002_add_team_color.sql](../../supabase/migrations/0002_add_team_color.sql) for the pattern of altering an existing table. Do not edit shipped migrations.

## Review checklist (use when auditing a migration diff)

- [ ] Every new `SECURITY DEFINER` fn sets `search_path = ''` and fully-qualifies all names.
- [ ] No path returns or selects `edit_token_hash`.
- [ ] RLS enabled on any new table; policies scope to `auth.uid()` (direct or via `games`).
- [ ] Grants follow revoke-all-then-minimum; anon writes only via DEFINER RPC.
- [ ] Input re-validated server-side (name length, status enum, `is_open`).
- [ ] Numbered new file; shipped migrations untouched.

## Cross-links

- The client calls these RPCs/tables from `SupabaseRepository`; keep return shapes in sync with the mappers (matchday-data-layer skill).
- Demo mode reproduces the token flow client-side via `src/crypto.ts` - it makes NO security guarantees and is a sandbox only.
