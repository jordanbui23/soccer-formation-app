---
name: matchday-export-rendering
description: The lineup export pipeline of the Match-day Board app - turning a Game + LineupState into a downloadable PNG or PDF, the offscreen SVG pitch render, WCAG contrast-based kit colors, and first-name label disambiguation. Use when changing src/export.ts, src/field.ts, or src/color.ts; touching PNG/PDF download, html-to-image, jsPDF, the exported SVG field, team-color-to-text-color contrast, pitch markup, or the on-field player labels. Triggers on 'export', 'PNG', 'PDF', 'download lineup', 'html-to-image', 'toPng', 'jsPDF', 'jspdf', 'SVG pitch', 'field render', 'team color', 'kit color', 'contrast', 'foregroundFor', 'fieldLabels', 'src/export.ts', 'src/field.ts', 'src/color.ts'. Do NOT use for the on-screen tactics board interaction (drag/keyboard nudge lives in src/lineupEditor.ts - use matchday-ui-rendering), the pure lineup state model (use matchday-lineup-formations), or the data layer (use matchday-data-layer).
---

# Match-day Board: Export Rendering

Exports the current lineup to an image the coach can drop in a group chat. The lineup skill deliberately excludes this; it lives here.

- [src/export.ts](../../src/export.ts) - `exportPng(game, state)`, `exportPdf(game, state)`, and the offscreen render.
- [src/field.ts](../../src/field.ts) - `pitchMarkupSvgInner()` (the pitch line art) + `createPitchSvg()` for the live board.
- [src/color.ts](../../src/color.ts) - hex validation/normalization + WCAG contrast (`foregroundFor`, `isDarkColor`, `relativeLuminance`). Tested in [test/color.test.ts](../../test/color.test.ts).
- Player labels come from `fieldLabels()` in [src/rsvpName.ts](../../src/rsvpName.ts), tested in [test/rsvpName.test.ts](../../test/rsvpName.test.ts).

## How a PNG is produced (the render dance)

`renderPng` builds a **detached, offscreen** DOM subtree and rasterizes it:

1. `buildExportArea(game, state)` builds a self-contained node: an `<h1>` heading, a `<style>` prepended into the area (all export CSS is inline/scoped to `#export-area` - it must not depend on `app.css`), a Starting XI table, the field SVG, and a Substitutes table.
2. The area is appended to `document.body` positioned `fixed`, `top/left:0`, `z-index:-1` so it is laid out (rasterizable) but not visible.
3. Wait ~60ms (`setTimeout`) so layout/paint settles, then `await import('html-to-image')` and `toPng(area, { quality:1, pixelRatio:2, backgroundColor:'#ffffff', skipFonts:true })`.
4. `finally { area.remove() }` - always tear down the offscreen node even on failure.

Keep every load-bearing detail: `pixelRatio:2` (retina-sharp output), `backgroundColor:'#ffffff'` (PNG has no transparency surprise), `skipFonts:true` (avoids embedding/CORS font fetches that make `toPng` hang or reject), the settle delay, and the `finally` cleanup. `html-to-image` and `jspdf` are **dynamic `import()`s** so they stay out of the initial bundle - preserve that.

## PDF is PNG-in-a-page

`exportPdf` calls `renderPng`, loads it into an `Image` to read intrinsic dimensions, then `new jsPDF('p','mm','a4')` and `addImage` at x=10,y=12, width=190mm, height capped at `Math.min(scaledHeight, 265)` to stay on one A4 page. If you change the image aspect ratio, re-check that cap.

## Colors are computed, never guessed

Team kit color is user-supplied and stored per game. Always run it through `normalizeHexColor()` (falls back to `#000000` for anything not `#RRGGBB`) before use.

- **Text on the kit** must come from `foregroundFor(kit)` - a real WCAG relative-luminance contrast pick between black and white, not a hardcoded color. On-field circles, tokens, and swatches all use it so text stays legible on any kit.
- `isDarkColor(kit)` drives the thicker white stroke on dark kits (so a black kit is visible against the green pitch).
- The **goalkeeper is always** `GK_COLOR` (`#e08a1e`) with white text, independent of team color - do not tint the GK with the kit.

If you add a new colored surface, derive its text/stroke from these helpers; never introduce a second contrast heuristic.

## On-field labels: first name, disambiguated

`fieldLabels(fullNames)` returns the labels drawn on the pitch and in the export: **first name only**, but when two starters share a first name it appends a last initial (`Sam K.` / `Sam D.`). Both the live board ([src/lineupEditor.ts](../../src/lineupEditor.ts)) and the export call `fieldLabels` so they stay identical. Do not hand-roll name shortening in the export - reuse `fieldLabels`.

## Coordinates match the live board exactly

`buildFieldSvg` positions starters with the SAME logic the on-screen board uses: `assignSlots(state.formation, starters, state.slotOverrides)` for slot indices, then `state.customPositions[player.id]` overrides the formation base coord when present (drag/nudge results). The viewBox is `0 0 FIELD_WIDTH FIELD_HEIGHT` (from `formations.ts`), circle radius 22. The export is a faithful snapshot of the board - if the board and export ever diverge, the export is wrong. `assignSlots` semantics live in matchday-lineup-formations.

## Filenames

`slugFileName(game)` lowercases the opponent and slugifies to `lineup-<opponent>.png` / `.pdf`, falling back to `lineup` when there is no opponent.

## Verify

```bash
npm test            # color + rsvpName label logic (pure)
npm run typecheck
npm run dev         # then actually click Export PNG and Export PDF in the editor and open both files
```

`color.ts` and `fieldLabels` are unit-tested, but the **rasterization has no automated test** - a change to `export.ts` is not done until you have downloaded a PNG *and* a PDF and eyeballed the pitch, labels, kit contrast, and one-page fit.
