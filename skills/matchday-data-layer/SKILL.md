---
name: matchday-data-layer
description: How to add or change any backend/data operation in the Match-day Board app (games, RSVPs, lineups, auth). Use whenever touching the data layer under src/data/ - adding a Repository method, changing a query, adding a table column, mapping DB rows to domain types, or wiring a new persisted feature. The app has TWO repository implementations (DemoRepository over localStorage, SupabaseRepository over Postgres) behind one Repository interface, and BOTH must stay in sync. Triggers on 'add a repository method', 'save/load X', 'new data operation', 'DemoRepository', 'SupabaseRepository', 'Repository interface', 'persist', 'src/data'. Do NOT use for the SQL migration/RLS/RPC security rules (use matchday-supabase-security) or the pure lineup/formation logic (use matchday-lineup-formations).
---

# Match-day Board: Data Layer

All persistence goes through one interface, [`Repository`](../../src/data/repository.ts), with two implementations selected at startup by [`getRepository()`](../../src/data/index.ts) based on whether `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set:

- **`SupabaseRepository`** ([src/data/supabaseRepository.ts](../../src/data/supabaseRepository.ts)) - production, Postgres + Supabase auth.
- **`DemoRepository`** ([src/data/demoRepository.ts](../../src/data/demoRepository.ts)) - zero-config sandbox over `localStorage`, seeded data.

Domain types live in [src/types.ts](../../src/types.ts). Repo instance is a lazy singleton; callers use `getRepository()`, never `new`.

## The one rule that breaks everything if ignored

**Every data operation exists in THREE places and all three must agree:**

1. The method signature on the `Repository` interface (`repository.ts`).
2. The `SupabaseRepository` implementation.
3. The `DemoRepository` implementation.

Adding a method to only one implementation compiles against the interface only if the interface is also updated - and then the other implementation fails `tsc --noEmit`. Adding to the interface but forgetting an implementation is caught by `npm run typecheck`. **Always run `npm run typecheck` after any data-layer change** - it is the safety net.

## When to use

- Adding a new persisted feature (a method on `Repository`).
- Changing an existing query, filter, or ordering.
- Adding a column to a table and threading it through row -> domain mapping.
- Introducing a new `RepositoryError` code.

## How to add a Repository method

1. **Declare it on the interface** in [repository.ts](../../src/data/repository.ts) with domain types (from `types.ts`), returning a `Promise`.
2. **Implement in `SupabaseRepository`.** Follow the existing shape:
   - Use the shared column-list constants (`GAME_COLUMNS`, `RSVP_COLUMNS`) - never `select('*')`.
   - Map rows with a `toGame`/`toRsvp`-style function (snake_case DB -> camelCase domain). Add a `*Row` interface for the raw shape.
   - Validate user input with `validate(...)` / `isValidName` / `normalizeName` before writing.
   - On error, call `fail('<code>', error?.message)` (never throw a bare `Error`).
   - `.single()` when a row must exist, `.maybeSingle()` when it may not (returns `null`).
3. **Implement in `DemoRepository`** with identical observable behavior against its in-memory/localStorage store. Same validation, same `RepositoryError` codes, same null-vs-throw semantics.
4. **Run `npm run typecheck`**, then `npm test` if the change touches tested logic.

## Row <-> domain mapping (Supabase)

- DB columns are `snake_case` and nullable; domain types are `camelCase` and mostly non-null. The `toGame`/`toRsvp` mappers coalesce nulls to `''` (e.g. `match_time ?? ''`, `venue ?? ''`) and normalize color via `normalizeHexColor`.
- **New column checklist:** add to the `*Row` interface, the column-list constant, the mapper, the insert/update payload, the domain type in `types.ts`, AND a migration (see matchday-supabase-security). Then mirror the field in `DemoRepository`.

## Errors: `RepositoryError`

Throw `RepositoryError(code, userMessage)` (defined in [repository.ts](../../src/data/repository.ts)) for anything the UI may show. `code` is a stable machine string (`invalid_name`, `game_closed`, `create_rsvp_failed`, ...); `message` is user-facing. In `SupabaseRepository`, `fail(code, msg)` wraps this and defaults the message. Keep codes identical across both implementations so UI handling is backend-agnostic.

## Public vs admin read paths (do not confuse)

- **Public** (anon, no auth): `listPublicRsvps` reads the `public_rsvps` view (id/name/status only); RSVP create/read/edit go through RPCs. Never read the raw `rsvps` table on a public path.
- **Admin** (authenticated): `listRsvps`/`updateRsvpAdmin`/`deleteRsvpAdmin` hit the `rsvps` table directly, gated by RLS ownership.

The exact SQL-side guarantees behind this split are in the matchday-supabase-security skill.

## Verify

```bash
npm run typecheck   # both implementations satisfy the interface
npm test            # pure logic still green
```

Data-layer changes are not "done" until `typecheck` passes with both implementations updated.
