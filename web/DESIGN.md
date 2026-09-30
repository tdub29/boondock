# DESIGN.md — Boondock

A dark, instrument-grade UI that sits underneath a topographic map. Surfaces are
green-tinted near-blacks; the single brand accent is a warm amber. Land-agency
colors and verdict colors are **functional** (data + status), not brand decoration.

## Color strategy

**Restrained**, leaning Committed on the verdict surface. Tinted-dark neutrals carry
the chrome; one amber accent (≤10%) drives primary actions; semantic green/amber/red
own the verdict; agency hues are a fixed functional palette used only for map data
and its legend.

All values OKLCH. Never `#000`/`#fff`; every neutral tinted toward the forest hue (h≈150).

### Neutrals (surface, green-tinted)
- `--bg`        oklch(0.17 0.012 150)   app/map letterbox
- `--surface`   oklch(0.22 0.014 150)   sheets, toolbar
- `--surface-2` oklch(0.27 0.015 150)   inset rows, chips
- `--surface-hi`oklch(0.33 0.016 150)   hover, switch track
- `--line`      oklch(0.40 0.02 150 / 0.35) hairline borders

### Ink
- `--ink`       oklch(0.95 0.01 150)    primary text
- `--ink-dim`   oklch(0.78 0.012 150)   secondary
- `--ink-faint` oklch(0.62 0.012 150)   meta/labels

### Accent (amber — campfire/lantern; the only brand color)
- `--accent`    oklch(0.80 0.13 75)
- `--accent-ink`oklch(0.20 0.03 75)

### Verdict (status — the hero of the verdict card)
- `--green`  oklch(0.74 0.15 150)  likely OK
- `--yellow` oklch(0.80 0.13 85)   verify
- `--red`    oklch(0.66 0.18 27)   no camping
- `--blue`   oklch(0.66 0.13 245)  GPS / tracks (cool, distinct from warm chrome)

### Agency data palette (map + legend only — fixed, functional)
BLM gold, USFS forest green, NPS teal, USFWS rust, State blue, Reclamation cyan,
DOD violet, Tribal brown, Private/other gray. Tuned for distinguishability on a
topo basemap, not for brand. (Defined in `src/map/managers.ts`.)

## Typography

System sans (`-apple-system, Segoe UI, Roboto, …`). Hierarchy via scale + weight,
≥1.25 step ratio. Coordinates, distances, sizes use `font-variant-numeric: tabular-nums`.
- Title (verdict / panel): 17–18px / 700
- Body: 13.5–14.5px / 400–500
- Meta / labels: 11–12px / 600, uppercase tracking on section labels only.

## Elevation & shape

- Radius: 16px sheets, 10px chips/buttons, 999px pills.
- Shadow: soft, low — `0 8px 30px oklch(0 0 0 / 0.45)`. One elevation level; sheets float over the map, nothing nests.
- Hairline tinted borders instead of heavy strokes. No side-stripe accents.

## Motion

- Sheets/cards enter with `slideUp` + fade, ease-out-expo (`cubic-bezier(0.16,1,0.3,1)`), ~220ms.
- Toggles/switches: 180ms ease-out.
- No bounce, no elastic, never animate layout (transform/opacity only).
- The recording tool pulses; the busy indicator spins. Map easings (flyTo/easeTo) are MapLibre defaults.

## Components

- **Bottom toolbar**: 5 tools, icon + 10.5px label, active = amber, recording = red pulse. Floating rounded bar on desktop.
- **Bottom sheets** (Layers / Trips / Offline): one pattern, slide up, hairline-divided rows, iOS-style switches (amber when on).
- **Verdict card**: color-led. Status pill (tinted bg + solid icon chip), title/subtitle, coordinates (tabular), nearest-route chip, bulleted reasoning, collapsible rules, amber caveat block, two actions. A thin top border in the verdict color.
- **Legend**: swatch grid for agencies + line samples for routes.
- Pills for status (Online/Offline). Buttons: primary (amber), ghost (surface-2), danger (red).
