---
name: matchday-lineup-formations
description: The pure-function lineup and formation domain of the Match-day Board app - the starting XI / substitutes model, RSVP-to-lineup reconciliation, formation presets, and position-compatibility slot assignment. Use when changing src/lineup.ts, src/formations.ts, or src/types.ts LineupState; adding or editing a formation; changing how Yes RSVPs become bench players; touching starter limits, slot swaps, custom drag positions, or the Vitest tests for this logic. Triggers on 'formation', 'lineup', 'starting XI', 'starters', 'substitutes', 'reconcileLineup', 'assignSlots', 'slotOverrides', 'position', 'add a formation', '4-4-2', 'MAX_STARTERS', 'tactics board logic'. Do NOT use for the data layer/persistence (use matchday-data-layer), the SQL/security model (use matchday-supabase-security), or the SVG/PNG/PDF export rendering.
---

# Match-day Board: Lineup & Formations

This domain is **pure, framework-free, side-effect-free TypeScript** and is the most heavily tested part of the app. It lives in three files:

- [src/types.ts](../../src/types.ts) - `LineupState`, `LineupPlayer`, `Coord`, `emptyLineup()`.
- [src/lineup.ts](../../src/lineup.ts) - all state transitions on a lineup.
- [src/formations.ts](../../src/formations.ts) - the 8 presets, position taxonomy, and `assignSlots`.

Tests: [test/lineup.test.ts](../../test/lineup.test.ts), [test/formations.test.ts](../../test/formations.test.ts). Run with `npm test`.

## The immutability contract (non-negotiable)

Every function in `lineup.ts` that changes state takes a `LineupState` and **returns a new `LineupState`** - it never mutates the input. The mechanism is the private `cloneState()` (deep-copies `players`, `customPositions`, `slotOverrides`). Any new transition function MUST:

1. Start with `const next = cloneState(state)`.
2. Mutate only `next`.
3. Return `next` (or return the original `state` unchanged on a no-op / invalid input - see `addManualPlayer`, `toggleStarter`, `changePosition`).

This is what lets the UI diff/re-render predictably and what the tests assume. Mutating the argument is a bug even if tests pass by luck.

## LineupState shape

```ts
interface LineupState {
  formation: string;                          // key into FORMATIONS
  players: LineupPlayer[];                     // starters + subs, both live here
  customPositions: Record<playerId, Coord>;    // drag-nudged pixel overrides
  slotOverrides: Record<playerId, slotIndex>;  // manual slot assignment (swaps)
}
```

- A `LineupPlayer` is a starter iff `player.starter === true`; subs are the rest. Use `getStarters`/`getSubs`/`countStarters`, never re-derive.
- `manual: true` = admin-added by hand (id `manual-<uuid>`, `rsvpId: null`). `manual: false` = came from a Yes RSVP (id `rsvp-<rsvpId>`, `rsvpId` set).
- **When a player leaves the starting XI or is removed, clear their placement** via `forgetPlayerPlacement` (deletes both `customPositions[id]` and `slotOverrides[id]`). Existing functions already do this; preserve it.

## reconcileLineup: the RSVP <-> lineup bridge

`reconcileLineup(state, yesRsvps)` is the only link between RSVP data and the lineup. Its contract (locked by tests):

- A Yes RSVP is added **once** as an unassigned bench player (`starter:false`, `manual:false`).
- If an RSVP-linked player's RSVP is no longer Yes/present, the player is **removed and their placement cleared**.
- Manually added players (`manual:true`, `rsvpId:null`) are **never touched**.
- If a linked RSVP's name changed, the player's `name` is **updated in place** (`{ ...player, name: rsvp.name }`).

Do not add starter-promotion, re-ordering, or de-dup logic here without updating the tests - the "added once / removed on un-Yes / manual untouched" invariants are the spec.

## Adding or editing a formation

Formations are fixed presets in `FORMATIONS` (`src/formations.ts`), each `{ positions: string[], coords: [number,number][] }` of length 11, on a `FIELD_WIDTH x FIELD_HEIGHT` (560 x 780) pitch. To add one:

1. Add the entry to `FORMATIONS`; `FORMATION_NAMES` derives automatically.
2. `positions[i]` and `coords[i]` must line up 1:1, all 11 entries, using existing position codes from `ALL_POSITIONS`.
3. Every position code you use must exist in `POSITION_GROUPS` and `POSITION_COMPATIBILITY`; add a mapping if you introduce a new code (also update `ALL_POSITIONS` and the color group).
4. Coords: `[x, y]`, GK near the bottom (`y` large), forwards near the top (`y` small), inside the pitch bounds.
5. Add/extend a case in `test/formations.test.ts`.

## Slot assignment (assignSlots)

`assignSlots(formationName, starters, slotOverrides)` maps each starter to a formation slot in three passes: (1) honor `slotOverrides` when the target slot is free, (2) fill by `POSITION_COMPATIBILITY` (e.g. `CM` fits `CM`/`CDM`/`CAM`), (3) drop remaining players into any free slot. Unknown formation falls back to `4-4-2`. `swapSlots` records reciprocal overrides and clears the two players' custom pixel positions. Keep the fallback and the three-pass order - callers (board + export) rely on it being total (every starter gets a slot).

## Constraints

- `MAX_STARTERS = 11`, enforced in `toggleStarter` and `addManualPlayer` (a manual add only becomes a starter if there is room; otherwise it lands on the bench).
- Names: `normalizeName` collapses whitespace + trims; `isValidName` enforces 1-40 chars. Reuse these; do not re-implement validation.

## Verify

```bash
npm test          # pure logic - fast, deterministic, no DOM/network
npm run typecheck
```

New behavior in this domain is not done until it has a Vitest case asserting the invariant (immutability, "added once", starter cap, etc.), because nothing else guards these pure functions.
