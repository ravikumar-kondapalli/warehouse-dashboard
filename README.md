# BaleTrack 3D — Warehouse 15-1 monitoring dashboard

A single-file React component (`src/WarehouseDashboard.jsx`) that renders an interactive
3D digital twin of a bale warehouse, with inventory search, live KPIs and a per-bale
journey timeline. Everything runs on embedded static data — no backend.

**Live demo:** https://ravikumar-kondapalli.github.io/warehouse-dashboard/

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages via
`.github/workflows/deploy.yml` (repo **Settings → Pages → Source: GitHub Actions**).
Production builds use the base path `/warehouse-dashboard/` (see `vite.config.js`);
change it there if the repository is renamed.

## Use the component in another project

1. Copy `src/WarehouseDashboard.jsx`.
2. Install the only runtime deps: `npm install react react-dom three` (three r160+).
3. Tailwind must use **class-based dark mode** — the component puts `.dark` on its own root:
   - Tailwind v4: `@custom-variant dark (&:where(.dark, .dark *));` (see `src/index.css`)
   - Tailwind v3: `darkMode: 'class'` in `tailwind.config.js`
4. `import WarehouseDashboard from './WarehouseDashboard.jsx'` and render it full-page.

Fonts (Inter + JetBrains Mono) are loaded in `index.html`; system fonts are the fallback.

## What's inside

| Area | Highlights |
|---|---|
| **Top bar** | Capacity, filled, available, occupancy (meter + hoverable trend), in-transit; live clock; Live/Pause for the event stream; light/dark toggle |
| **Left — inventory** | Search by bale ID / location / lot / grade (`/` to focus, ↑↓ to step, Enter to locate); status + watchlist filters; sort; cards fly the camera to the bale |
| **Center — 3D** | Lanes L-1…L-7 (north) and L-42…L-48 (south) on 5-level racks with 1.9 m forklift access aisles, main drive aisle with markings, green **Entry E-1** / red **Exit X-1**, receiving bay and dispatch staging pallets, trucks, working forklifts. Filled slots = textured bales, empty slots = outlined wireframes on grey decks. Selected bale gets a floating pin, light beam, x-ray outline and an animated route. Presets: **2D Blueprint** (1), **3D Isometric** (2), **Aisle Focus** (3); `F` flies to the selection. Colour by status / grade / dwell age; per-shelf visibility toggles; hover tooltips; click a truck to list its bales |
| **Details drawer** | No fixed right column — the 3D view takes the space. Clicking a bale or incident (or the **Details** button) slides a drawer over the right of the 3D view with Command (incident checklist), Bale journey (location, lead/transit/dwell, route strip, lifecycle timeline, quality spec) and Sensors. Close with ✕ or `Esc` |
| **Forklifts** | Three turret trucks pick bales off the receiving-bay pallets, carry them down the 1.9 m access aisles and set them in the slot (the slot fills only when the bale is down); dispatches are lifted out of the rack and parked on the dispatch-staging pallets, where they stay until the dock loader carries them out through Exit X-1 onto the outbound truck (after ~25 s, or sooner when 4+ are waiting). One truck at a time works in each bay lane |
| **Lane monitors** | Filled / free count and a 7-row × 5-shelf slot map above each lane; a slot that was just filled or emptied glows for 3 s with a +1 / −1 tag, and the map mirrors to match the side of the lane you are looking from (R1 / R7 marked) |

## Risk & safety command (OPTIMON)

| Hazard | What is modelled |
|---|---|
| **Fire & thermal** | Rack thermal cameras (core temp, 45 °C watch / 55 °C critical), laser-beam smoke detectors per zone, water-mist / sprinkler state (Standby · Active · Triggered with mist animation), RH zones (< 30 % static, > 85 % mould), CV-camera aisle / exit blockage with hydrant routes |
| **Pests** | 24 IoT traps on walls and rack bases (armed / triggered / IR activity / low battery), nesting risk next to high-value fibre lots (Egyptian ELS cotton cage HV-1, silk SL-1, wool WL-1) |
| **Security** | RFID/BLE tag loss outside working hours with no work order, IR laser curtain around HV-1, dock RFID portal mismatches, forklift / AGV fleet with work orders |
| **Stacks** | Micro-gyro tilt per 5-level stack (leaning stacks visibly tilt), strap strain gauges |

- **3D**: glowing auras (red fire, purple theft, yellow pest, orange stack) and floating risk badges; presets
  *Overview 3D*, *2D Blueprint*, *Aisle Focus*, *Hazard Heatmap* (thermal / humidity / risk index) and
  *Evacuation Routes* (escape routes, blocked aisle, exits, hydrants, assembly points). Keys `1`–`5`.
- **Left**: tabs All Inventory · Fire & Temp · Security & Theft · Rodent Traps · Stack Safety, with search
  (bale ID, bay such as `L-46`, incident) and Critical / Warning / Info filters plus live-system summaries.
- **Right**: Incident command (live sensor reading, response checklist, acknowledge / escalate / resolve,
  audit trail), bale details, and a 24 h sensor log with time-stamped telemetry.
- **Top bar**: capacity vs filled, in-transit, thermal warnings, security breaches, active traps and the
  Facility Health Index (each category starts at 100; open incidents subtract points).

Ticking every checklist step enables **Resolve**, which clears the hazard in 3D and raises the health index.
Racks are now 5 levels × 7 rows (490 slots), so three tracked bales moved: 411252007 → L-1/E/R7,
411266781 → L-45/E/R6, 411279964 → L-4/B/R6. The UI starts in light mode.

## Data

`WAREHOUSE_DATA` at the top of the component holds the layout and **16 fully tracked bales**
(stored, QC hold, in-transit, receiving, dispatched, relocated) with grade, weight, HVI quality,
`grid: { bayX, shelfY, rowZ }` and full `history[]`. To make the floor look real, the rest of the
slots are filled deterministically from a seeded RNG up to `targetFilledSlots` (342 of 504).

- `rebaseToLiveClock: true` shifts every timestamp by *(now − snapshotAt)* so the replay always
  looks current. Set it to `false` to show the JSON timestamps exactly.
- With **Live** on, a generated bale arrives, is put away or is dispatched every 4.5–8 s.
  The 16 tracked bales are never changed by the simulation.
