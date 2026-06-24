# Soccer Formation Builder

A simple browser-based tool for creating soccer formations, managing rosters, and exporting lineup sheets as PNG or PDF.

**Live demo:** [https://jordanbui23.github.io/soccer-formations/](https://jordanbui23.github.io/soccer-formations/)

## Features

- **8 formation presets** — 4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 4-5-1, 3-4-3, 4-1-4-1, 4-4-1-1
- **Smart position snapping** — Players automatically snap to the correct formation slot based on their position (e.g. RCB → CB slot, LW → left wing slot)
- **Drag & drop with swap** — Drag players on the field; drop near another player to swap their positions
- **Flexible roster** — Add as many players as you want, toggle between starter and sub
- **Inline position editing** — Change any player's position after adding them via dropdown
- **Subs grouped by position** — Substitutes are organized by position type (GK/DEF/MID/FWD)
- **Color-coded tokens** — Orange = GK, Blue = DEF, Green = MID, Red = FWD
- **Export to PNG/PDF** — Generates a clean lineup sheet with field diagram, starters table (grouped by position), and subs table
- **Save/Load rosters** — Save multiple rosters by name to localStorage; persists between sessions

## How to Run

No build step, no dependencies, no server required.

1. Download or clone this repo
2. Open `index.html` in any modern browser

```bash
git clone https://github.com/jordanbui23/soccer-formations.git
open soccer-formations/index.html
```

Or just visit the [live demo](https://jordanbui23.github.io/soccer-formations/).

## Usage

1. **Select a formation** from the dropdown
2. **Add players** — type a name, pick a position, hit Enter or click "Add Player"
3. **First 11 players** are automatically starters; additional players go to subs
4. **Move players** — drag on the field to reposition; drop near another player to swap
5. **Change position** — use the dropdown next to any player's name in the roster
6. **Toggle starter/sub** — click →Sub or →Start buttons
7. **Save your roster** — type a name and click Save; load it anytime
8. **Export** — click Export PNG or Export PDF to download your lineup sheet

## Positions Available

GK, CB, LCB, RCB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST

## Tech Stack

- Single HTML file, vanilla JavaScript, no framework
- SVG for the field rendering
- [jsPDF](https://github.com/parallax/jsPDF) (CDN) for PDF export
- [html-to-image](https://github.com/bubkoo/html-to-image) (CDN) for PNG capture
- localStorage for persistence
