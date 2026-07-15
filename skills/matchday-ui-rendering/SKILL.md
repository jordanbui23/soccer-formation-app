---
name: matchday-ui-rendering
description: The view layer of the Match-day Board app - the framework-free DOM builder, History-API router, page controllers, shared components, toasts, the interactive tactics-board editor (src/lineupEditor.ts), and the accessibility + XSS conventions. Use when changing src/dom.ts, src/router.ts, src/main.ts, src/lineupEditor.ts, or anything under src/pages/ or src/ui/; adding a route, wiring a page/component, the on-screen board interaction, rendering RSVP/roster data into the DOM, handling a form submit, or aria/focus behavior. Triggers on 'el(', 'render(', 'router', 'route', 'navigate', 'data-link', 'page', 'component', 'toast', 'innerHTML', 'XSS', 'aria', 'form submit', 'LineupEditor', 'tactics board', 'drag token', 'keyboard nudge', 'src/pages', 'src/ui'. Do NOT use for the pure lineup/formation state functions (use matchday-lineup-formations), the data layer (use matchday-data-layer), the SQL/security model (use matchday-supabase-security), or PNG/PDF/SVG export rendering (use matchday-export-rendering).
---

# Match-day Board: UI Rendering & Routing

There is **no framework**. The whole view layer is hand-rolled vanilla TypeScript over the DOM, built from a handful of primitives. Learn these before adding UI.

- [src/dom.ts](../../src/dom.ts) - the `el()` element builder, `mount`/`clear`/`setText`, `formatMatchDateTime`.
- [src/router.ts](../../src/router.ts) - the History-API `Router`, `navigate()`.
- [src/main.ts](../../src/main.ts) - the route table (the single source of truth for URLs).
- [src/ui/components.ts](../../src/ui/components.ts) - `render()`, `topbar`, `matchTicket`, `statusPill`, `loadingView`, `errorView`.
- [src/ui/toast.ts](../../src/ui/toast.ts) - `notify()` and `errorMessage()`.
- [src/pages/](../../src/pages) - one async controller per route (`admin`, `adminGameDetail`, `publicGame`, `editRsvp`).

## The one rule that must never break (XSS)

**Player names and all user-supplied strings go into the DOM as text nodes, NEVER interpolated into `innerHTML`.**

`el(tag, attrs, children)` already does this: a string child becomes `document.createTextNode(...)`. So the safe path is simply to pass user data as a child string, e.g. `el('span', {}, [rsvp.name])`. The ONLY `innerHTML` in the app is `pitchMarkupSvgInner()` - a hardcoded, data-free SVG constant. If you ever reach for `.innerHTML =`, stop: it must contain zero interpolated runtime data. Never build markup by concatenating strings that include a name, opponent, venue, or any RSVP field.

## The `el()` builder contract

`el(tag, attrs, children)` returns a correctly-typed `HTMLElementTagNameMap[K]`. Rules baked into [src/dom.ts](../../src/dom.ts):

- `attrs` values that are `undefined | null | false` are **skipped** - this is how you do conditional attributes (`{ disabled: isFull || undefined }`).
- `class` sets `className`; `style` sets the `style` attribute as a string.
- Other keys are set as a **property** when the key exists on the node (so `value`, `checked`, `disabled`, `href`, `type` work as properties), otherwise as an attribute (this is how `aria-*`, `role`, `data-*`, `for` land).
- `children` may be `Node | string | null | undefined | false`; falsy children are skipped, so `cond && el(...)` and `cond ? node : false` both work inline.

Prefer `el(...)` over `document.createElement`. To replace a container's contents use `node.replaceChildren(...)`, `clear(node)`, `mount(root, ...)`, or the page-level `render(...)` (which also `scrollTo(0,0)`). Never assemble HTML as a string.

## Adding or changing a route

Routes are declared **only** in [src/main.ts](../../src/main.ts) on the shared `router`:

1. `router.add('/path/:param', (ctx) => pageController(ctx.params.param))`. Patterns support `:name` params and a trailing-slash-tolerant match; unmatched routes hit `setNotFound`.
2. Route params arrive URL-decoded in `ctx.params`. The **edit token is read from the URL fragment** via `ctx.hashParams.get('token')` - it lives in `#token=...` precisely because browsers never send the fragment to the server (see matchday-supabase-security).
3. In-app links are plain `<a href="/..." data-link="true">`. The router's global click handler intercepts same-origin `data-link` anchors and calls `pushState`; links without `data-link`, external (`http...`), or modified clicks (cmd/ctrl/shift/alt/middle) fall through to the browser. For programmatic navigation call `navigate('/path')`.
4. Any new path segment must also resolve as a deep link on Cloudflare Pages - that is what `public/_redirects` guarantees (see matchday-build-deploy). No server route changes are needed.

## Page controller shape (follow it)

Each `src/pages/*.ts` file exports one `async` function that owns its route end to end:

1. Call `render(loadingView('…'))` first if it will `await` data.
2. `getRepository()` for all data (never `new` a repository; see matchday-data-layer). Redirect to `/admin` when `getSession()` is null on an admin page.
3. Wrap awaited data calls in `try/catch`; on failure `render(errorView(errorMessage(err)))` or `notify(errorMessage(err), 'error')`. A missing entity (`null` game/rsvp) renders `errorView(...)`, it does not throw.
4. Build the tree with `el()` + shared components, then `render(...)` the top-level node.
5. For partial refresh, keep a host element (`const panel = el('div')`) and re-run a local `rebuild()`/`renderX()` that calls `panel.replaceChildren(...)` - the pages use this instead of a diffing framework.

## Forms and async actions

- Forms use `novalidate` and validate in JS on submit; show problems via `notify(msg, 'error')` and re-focus the offending input. Trim text before use/validation.
- During an async action set `btn.setAttribute('aria-busy','true')` + `btn.disabled = true` and always clear both in a `finally`. This is the app-wide busy convention (mirrored by the export buttons in the editor).
- Success: `notify('…')` (info) and/or `navigate(...)`.

## The tactics-board editor (`LineupEditor`)

[src/lineupEditor.ts](../../src/lineupEditor.ts) is the one big stateful **view component** - it renders the pool + pitch and translates user gestures into `LineupState` transitions. It is DOM/interaction glue, NOT lineup rules: every state change goes through a pure function from `src/lineup.ts` (`setFormation`, `toggleStarter`, `addManualPlayer`, `swapSlots`, `setCustomPosition`, ...) - see matchday-lineup-formations for those. Contract to preserve:

- **`commit(next)` is the single write path.** It replaces `this.state`, re-renders pool + field, and `scheduleSave()`s. Never mutate `this.state` in place or re-render without committing.
- **Debounced autosave:** `scheduleSave` waits 500ms then `onSave(state)`; status text goes "Saving…" -> "All changes saved" / "Save failed" (a `role="status"` `aria-live` element). Keep the debounce and the status contract.
- **No-op detection:** several pure functions return the *same* `state` reference on an invalid op (full XI, bad name). The editor compares `next === this.state` and shows a `notify(..., 'error')` instead of committing. Preserve that identity check.
- **Board positioning mirrors the export:** `slotPositions` uses `assignSlots(...)` + `customPositions` overrides, exactly like [src/export.ts](../../src/export.ts). A change to one usually needs the same change in the other (see matchday-export-rendering).
- **Pointer drag** uses `setPointerCapture` and converts client coords to pitch units clamped to `[22, FIELD_WIDTH-22]`; dropping within `SWAP_THRESHOLD` of another token swaps slots, otherwise sets a custom position. **Keyboard nudge** (arrow keys on a focused token) moves by `NUDGE_STEP` and re-focuses the token via `requestAnimationFrame`. Keep both paths - the keyboard path is the accessibility story for the board.

## Accessibility conventions (keep them)

- Status/loading regions use `role="status"` + `aria-live="polite"`; `loadingView`/`errorView`/the toast region already do this. New async status text should too.
- Radio groups get `role="radiogroup"` + `aria-label`; every input has an associated `<label for=...>`.
- Interactive non-button elements that act like buttons get `role="button"` + `tabindex="0"` + keyboard handling (see the tactics-board tokens).
- Purely decorative elements get `aria-hidden="true"`. Give icon-only buttons an `aria-label`.
- Respect `prefers-reduced-motion` in CSS (animations/spinners are disabled there) - do not add motion that ignores it.

## Verify

```bash
npm run typecheck   # el() generic typing catches most wiring mistakes
npm run dev         # then click the actual route + form you changed
```

The view layer has no unit tests (jsdom is not configured; Vitest runs in `node`). **You must exercise a UI change in the browser** - typecheck alone does not prove a page renders or a route resolves.
