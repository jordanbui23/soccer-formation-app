# Soccer Formation Builder

A browser-based tool for creating 11v11 soccer formations, managing rosters, and exporting lineup sheets as PNG or PDF. No install, no accounts, no server — just open and go.

**Live demo:** [https://jordanbui23.github.io/soccer-formation-app/](https://jordanbui23.github.io/soccer-formation-app/)

## How to Run

No build step, no dependencies, no server required. It's a single HTML file.

**Option 1: Live site**

Visit [https://jordanbui23.github.io/soccer-formation-app/](https://jordanbui23.github.io/soccer-formation-app/) in any modern browser.

**Option 2: Run locally**

```bash
git clone https://github.com/jordanbui23/soccer-formation-app.git
open soccer-formation-app/index.html
```

Or just download `index.html` and double-click it.

## Features

### Formations

8 preset formations for 11v11:

| Formation | Shape |
|-----------|-------|
| 4-4-2 | Classic flat four midfield, two strikers |
| 4-3-3 | Three in midfield, front three with wingers |
| 3-5-2 | Three at the back, packed midfield, two strikers |
| 4-2-3-1 | Double pivot, attacking three behind a lone striker |
| 4-5-1 | Five across midfield, lone striker |
| 3-4-3 | Three at back, four midfield, front three |
| 4-1-4-1 | Single holding mid, four attacking midfielders |
| 4-4-1-1 | Flat four midfield, #10 behind a striker |

Select a formation from the dropdown and players snap to the correct positions automatically.

### Roster Management

- **Add players** — Enter a name, select a position, hit Enter. First 11 are automatically starters.
- **Flexible size** — Add as many players as you want. No cap on roster size.
- **Change position anytime** — Every player has an inline dropdown to change their position after being added.
- **Toggle starter/sub** — Click "→Sub" or "→Start" to move players between the starting XI and the bench.
- **Remove players** — Click the × button to remove from the roster entirely.
- **Subs organized by group** — Substitutes are grouped in the sidebar by position type (GK / DEF / MID / FWD).

### Positions Available

| Group | Positions |
|-------|-----------|
| Goalkeeper | GK |
| Defenders | CB, LCB, RCB, LB, RB, LWB, RWB |
| Midfielders | CDM, CM, CAM, LM, RM |
| Forwards | LW, RW, CF, ST |

### Smart Position Snapping

When you add a player, they automatically snap to the correct formation slot based on their position:

- A player listed as **RCB** snaps to a **CB** slot on the right side
- A player listed as **LW** snaps to the **left wing** slot
- A player listed as **CDM** snaps to a **CM/CDM** slot

If no matching slot is available (e.g. you add an LM in a 4-3-3 which has no LM slot), the player fills the next available slot.

Changing a player's position via the dropdown re-snaps them to their new correct slot.

### Drag & Drop

- **Nudge players** — Drag any player token on the field to fine-tune their position.
- **Swap players** — Drag a player close to another player (within ~50 pixels) and they swap formation positions. This lets you quickly rearrange who plays where without editing the roster.
- **Drop in open space** — If you drop a player away from others, they stay at that custom position.

### Color-Coded Tokens

Player tokens on the field are color-coded by position group:

- 🟠 **Orange** — Goalkeeper
- 🔵 **Blue** — Defenders
- 🟢 **Green** — Midfielders
- 🔴 **Red** — Forwards

A legend is displayed below the formation dropdown for reference.

### Export (PNG & PDF)

Click "Export PNG" or "Export PDF" to download a lineup sheet that includes:

1. **Field diagram** — The pitch with all player tokens in position (names visible)
2. **Starting XI table** — Grouped by specific position (e.g. "CM: Player A, Player B" on one row)
3. **Substitutes table** — Same grouping by specific position

The export is designed to be print-friendly on a white background.

### Save & Load Rosters

- **Save** — Type a name in the "Save / Load" section and click Save. Your entire roster, formation selection, and custom player positions are stored.
- **Load** — Click "Load" next to any saved roster to restore it.
- **Delete** — Click × to remove a saved roster.
- **Multiple rosters** — Save as many different lineups as you want (e.g. "Game Day vs Eagles", "Practice 4-3-3", "B Team").

## Data Storage

All data is stored in your browser's **localStorage**. This means:

| Scenario | What happens |
|----------|--------------|
| Close browser and reopen | Saved rosters are still there |
| Restart your computer | Saved rosters are still there |
| Clear browser data / cookies | Rosters are deleted |
| Different browser on same machine | Starts fresh (separate localStorage) |
| Different machine | Starts fresh |
| Use the GitHub Pages live URL | Persists in that browser on that machine |

**There is no cloud sync or server-side storage.** Each browser on each machine has its own independent set of saved rosters. Use the PNG/PDF export to take lineups with you or share them.

**Unsaved work is lost** — if you add players but don't click "Save" before closing the tab, that session's changes are gone. Always save before closing.

## Tech Stack

- **Single HTML file** — no build step, no `npm install`, no bundler
- **Vanilla JavaScript** — no React, Vue, or any framework
- **SVG** — the soccer field is rendered as inline SVG
- **[jsPDF](https://github.com/parallax/jsPDF)** (loaded via CDN) — generates PDF files
- **[html-to-image](https://github.com/bubkoo/html-to-image)** (loaded via CDN) — captures the DOM as a PNG for export
- **localStorage** — browser-native key/value storage for roster persistence

The two CDN dependencies (jsPDF and html-to-image) are loaded automatically when you open the page. An internet connection is needed for the first load; after that, your browser may cache them.

## Browser Support

Works in any modern desktop browser (Chrome, Firefox, Safari, Edge). Not optimized for mobile/tablet — this is designed for laptop use.
