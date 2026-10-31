# AGENTS.md — Developer & Feature Agent Guide

Operating manual for automated AI coding agents and developers working on this codebase: architecture, hard constraints, subsystem mechanics, conventions, and the verification workflow. Historical context (what was tried, when, and why it changed) lives in local agent notes, not here — this file keeps only current rules.

---

## 1. Project Overview & Design Philosophy

This project is a static, frontend-only personal portfolio site styled after **Tron: Legacy (2010)**.

- **Primary Metaphor**: The visitor is the Light Cycle rider exploring an open 3D Grid arena.
- **Dual Views**:
  1. **Ride view**: Fullscreen, real-time 3D WebGL arena built with Three.js, React Three Fiber (R3F), and post-processing bloom. Free-roam driving, powerslide drifting, dynamic ribbon light trails, procedural sound synthesis, spatial station monuments, and interactive terminal dialogs.
  2. **Read view** (internal name "Simple"): Semantic, single-column HTML/CSS document view with a canvas-projected perspective grid floor (`src/simple/GridFloor.tsx`, drawn once on resize — no WebGL, no per-frame cost). Uses the exact same station components without importing Three.js. Default for first visits, `prefers-reduced-motion`, and non-WebGL environments.
- **Visual Doctrine (`DESIGN.md`)**: Near-black void (`#03070d`), razor-thin cyan lines (`#35e4ff`), white-hot core headings (`#eafcff`), ember outbound links (`#ff8a1f`), 10px chamfered corners with 14px ticks, Syncopate display headers, and Saira body typography.

---

## 2. Hard Constraints (Must Never Be Broken)

1. **Static Only**: `npm run build` outputs a pure static `docs/` directory (GitHub Pages branch deploys only serve `/ (root)` or `/docs` — the build folder is named `docs` and committed; the site deploys from `main` / `/docs`). No server, database, API, CMS, analytics, or runtime network requests. **Sole exception — Grid Battle**: the opt-in P2P duel mode (§4.8) uses the PeerJS public cloud broker for the WebRTC handshake and a browser-to-browser data channel for gameplay. `peerjs` is only ever dynamically imported inside `src/lib/battleNet.ts`, so every other ride and the Read view stay 100% offline.
2. **Host-Neutral**: Vite `base: './'` and hash deep linking (`#about`, `#projects`). Never use browser history API pushState routing that requires server rewrites. The build must run from root domains and any sub-path (e.g. `example.com/portfolio/`).
3. **Zero External Runtime Assets / No CDNs**:
   - Fonts are self-hosted via `@fontsource` packages.
   - Audio is 100% procedurally synthesized in real time via the browser's native Web Audio API (`AudioContext`). **Do NOT add audio files (.mp3, .wav, .ogg)**.
   - 3D models and textures live locally under `public/models/`.
4. **Data-Driven Architecture**:
   - All personal content lives strictly under `src/data/`.
   - **Never hardcode personal facts in components.** Adding a project must mean adding one object to an array in `src/data/projects.ts` and nothing else.
5. **No Invented Personal Information**:
   - Never invent personal facts. If a piece of content is missing, leave it out entirely rather than fabricate it.
6. **Simple View Independence**:
   - `SimpleView.tsx` must never import Three.js, R3F, or heavy 3D modules. Initial JS bundle before the lazy 3D chunk must stay ≤ 120 KB gzipped.
7. **Accessibility (WCAG AA)**:
   - "Skip the ride" must remain the first focusable element.
   - Visible 2px ember focus ring on every interactive element (`:focus-visible`).
   - Contrast ratio ≥ 4.5:1 against backdrops.
   - Modal dialogs must trap focus, handle Escape and Enter, and support keyboard scrolling (ArrowUp/ArrowDown).

---

## 3. Repository Structure & Code Map

```
portfolio/
├── public/
│   ├── models/                    # 3D assets & textures
│   │   ├── light_cycle_with_rider.obj
│   │   └── textures/             # 1:1 UV textures (flipY = false)
│   └── robots.txt
├── src/
│   ├── data/
│   │   ├── types.ts              # Core TypeScript interfaces
│   │   ├── profile.ts            # Profile & social links
│   │   ├── projects.ts           # Project card array
│   │   ├── skills.ts             # Skill groups
│   │   ├── experience.ts         # Career timeline
│   │   ├── stations.ts           # Station sequence definition
│   │   └── data.test.ts          # Vitest data integrity suite
│   ├── stations/
│   │   ├── registry.ts           # StationKind -> React component registry
│   │   ├── Intro.tsx             # Large display hero header
│   │   ├── About.tsx             # Bio paragraphs
│   │   ├── Skills.tsx            # Definition-list skill matrix
│   │   ├── Experience.tsx        # Vertical timeline with dates
│   │   ├── Projects.tsx          # Project card stack
│   │   └── Links.tsx             # Outbound links station
│   ├── ride/                     # Lazy-loaded 3D chunk
│   │   ├── RideView.tsx          # 3D ride coordinator & keyboard/event bus
│   │   ├── RideScene.tsx         # R3F Canvas, physics loop, scene composition
│   │   ├── Cycle.tsx             # 2nd Gen Light Cycle & Sam Flynn model & animation
│   │   ├── vehicleProto.ts       # Parse-once OBJ proto cache (+ warmVehicle)
│   │   ├── vehicleStatus.ts      # Build/maps/ladder status for gates & the veil
│   │   ├── Trail.tsx             # Multi-ribbon light wall boost emission
│   │   ├── SkidMarks.tsx         # Glowing drift tyre skid mark meshes
│   │   ├── StationBillboards.tsx # Spatial terminal pedestals, billboards & beacon lines
│   │   ├── BattleTerminalMarker.tsx # Orange cross-marked battle terminal (link creation)
│   │   ├── BattleAlley.tsx       # Corridor + chamber geometry outside the south wall
│   │   ├── Boosters.tsx          # Grid Battle fuel canister pickups
│   │   ├── GridFloor.tsx         # Snapping dual-grid GLSL shader plane
│   │   ├── ArenaBoundary.tsx     # 240x240 energy perimeter boundary walls
│   │   ├── DistantBeams.tsx      # Exterior parallax scale pillars
│   │   ├── CameraRig.tsx         # Chase camera, orbit drag, wheel zoom, auto-reset
│   │   ├── Effects.tsx           # Post-processing Bloom & Vignette
│   │   ├── FoeNavArrow.tsx       # Battle nav arrow (camera-parented, spectrum-tinted)
│   │   └── TronNavArrow.ts       # Vendored nav-arrow mesh + mini OBJ parser
│   ├── simple/
│   │   ├── SimpleView.tsx        # Single-column CSS-only perspective grid view
│   │   └── GridFloor.tsx         # Canvas-projected perspective grid (drawn once on resize)
│   ├── hud/                      # Overlays & controls
│   │   ├── Radar.tsx             # 2D Tron minimap with station blips & heading cone
│   │   ├── StationPrompt.tsx     # "Station Detected: Press Enter" HUD banner
│   │   ├── StationInspector.tsx  # Modal terminal reader dialog with keyboard scroll
│   │   ├── BattleHud.tsx         # Grid Battle dialog, countdown, duel strip, result overlay
│   │   ├── MobileControls.tsx    # On-screen touch steer/drive/brake pedals
│   │   ├── ModeToggle.tsx        # Switch between Ride & Read view
│   │   ├── AudioToggle.tsx       # Procedural audio mute/unmute toggle
│   │   ├── Panel.tsx             # Chamfered container with corner ticks
│   │   ├── ProjectCard.tsx       # Project display with outbound links
│   │   ├── ProjectGlyph.tsx      # Deterministic SVG glyph generator
│   │   ├── HelpDialog.tsx        # How-to-Play terminal (? toggle / challenge screen / result dialog)
│   │   ├── TerminalDialog.tsx    # Shared terminal-dialog shell (StationInspector + HelpDialog)
│   │   ├── OverlayScrollbar.tsx  # Shared page/dialog scrollbar (flexible thumb)
│   │   ├── StationNav.tsx        # Read-view station nav (hides inside the battle alley)
│   │   ├── FadeImg.tsx           # Fade-once image (module-level everLoaded cache)
│   │   ├── TronFrame.tsx         # Cast-tile SVG photo frame (Intro portrait)
│   │   ├── Materializing.tsx     # Identity-disc loading spinner (shared Suspense fallback)
│   │   └── SpeedStreaks.tsx      # High-speed edge streaks
│   ├── lib/
│   │   ├── arena.ts              # Arena dimensions (240x240) & station coordinates
│   │   ├── cyclePhysics.ts       # 2D vehicle kinematics, drift dynamics, boundaries
│   │   ├── cyclePhysics.test.ts  # Physics unit tests (27, incl. duel-mode guard)
│   │   ├── soundEngine.ts        # Procedural Web Audio API sound synthesizer
│   │   ├── store.ts              # Zustand global application state
│   │   ├── track.ts              # Curve calculation utilities
│   │   ├── battle.ts             # Grid Battle pure rules (fuel, crashes, spawns, boosters)
│   │   ├── battleStore.ts        # Battle zustand state + mutable 60fps runtime
│   │   ├── battleNet.ts          # PeerJS/WebRTC P2P session (lazy `import('peerjs')`)
│   │   ├── battle.test.ts        # Battle rules unit tests
│   │   ├── battleStore.test.ts   # Battle store unit tests
│   │   ├── tap.ts                # Tap-vs-scroll gesture helper (+ tap.test.ts)
│   │   └── hashSync.ts           # URL hash synchronization (+ #battle= invite links)
│   ├── App.tsx                   # Top-level view router & "Skip the ride" button
│   ├── main.tsx                  # React DOM root mounting
│   └── index.css                 # Tailwind v4 theme, tokens & chamfer utility classes
├── DESIGN.md                     # Visual & interaction specification
└── package.json
```

---

## 4. Key Subsystems & Modification Guides

### 4.1 Content Customization

Adding content never touches rendering logic:

- **New Project**: Add an object to `src/data/projects.ts` conforming to `Project` in `types.ts`.
- **New Skill Group**: Add an entry to `src/data/skills.ts`.
- **New Job / Role**: Add an entry to `src/data/experience.ts`.
- **New Station Kind**:
  1. Add kind string to `StationKind` in `src/data/types.ts`.
  2. Create component in `src/stations/<Name>.tsx`.
  3. Register in `src/stations/registry.ts`.
  4. Add to `stations` in `src/data/stations.ts`.
  5. Add spatial arena coordinates in `src/lib/arena.ts`.

### 4.2 Light Cycle Model & Hierarchy (`src/ride/Cycle.tsx`)

- **Model File** (third-party — extracted from the defunct official Tron: Legacy (2010) website, NOT ours to license; LICENSE carves `public/models/` out): `light_cycle_with_rider.obj` ships as `.obj.gz` (1.0MB vs 4.4MB raw); `Cycle.tsx` fetches the `.gz`, decompresses via stdlib `DecompressionStream` and runs the SAME `OBJLoader.parse` path. A reply carrying `Content-Encoding: gzip` (Vite dev / some CDNs) was already decompressed by the transport; pre-`DecompressionStream` browsers fall back to the raw `.obj`. Keep both files in sync: `gzip -9 -k public/models/light_cycle_with_rider.obj`. The OBJ parses ONCE per page (`loadVehicleProto` module cache); every mount (foe bike, StrictMode remount) clones the proto — `Object3D.clone` shares geometry buffers EXCEPT the three `brake_*` meshes, which clone their geometry too (their bbox-measure-then-center routine mutates shared buffers; a second consumer would collapse every hinge to the origin).
- **Textures**: `public/models/textures/`. Always set `texture.flipY = false` for proper UV alignment. Color/emissive maps MUST set `texture.colorSpace = THREE.SRGBColorSpace` (default NoColorSpace double-encodes at output and washes the art out — the "assets look better than the game" bug); normal maps stay linear. All maps set `anisotropy = 16` desktop / `8` touch (`MAX_ANISO`). Color maps are JPEG (q92, subsampling=0 so the cyan circuit lines stay crisp); normals stay lossless PNG. Bike and rider ship 2048² RGB maps — always export RGB, never palette-quantized PNGs (they band). Unused ORANGE variants (`LightCycleSam_color_ORANGE_dark_2.jpg`, `sam_color_ORANGE_dark_110.jpg`) are staged for a future orange-bike mode; pristine source PNGs live in `textures/originals/` (nothing references them, build-only weight).
- **Hierarchy Invariant**: Everything must be parented under a single `THREE.Group` named `vehicleRoot`.
- **Wheel Axle Pivots**:
  - Front wheel pivot: `(0.000, 0.4065, -0.948)`
  - Rear wheel pivot: `(0.0038, 0.4355, 0.912)`
  - In `useFrame`, wheel rotation spins around local X-axis: `wheelPivot.rotation.x -= (speed / radius) * delta`.
- **Air Brakes**:
  - `brake_center`, `brake_left`, `brake_right` must have their geometries centered to their local hinge positions and rotated during drift/braking: `brake.rotation.x = THREE.MathUtils.lerp(..., -brakePitch, delta * 12)`.
- **Banking Lean**:
  - Lean angle rolls `vehicleRoot.rotation.z` (keeping `vehicleRoot.rotation.y = 0`).
  - Lean lift: `leanLiftFor(lean)` interpolates `LEAN_LIFT_TABLE` — the REAR tyre's measured per-vertex support profile (lift that puts the tyre's lowest surface point exactly on the floor at each lean: 0 below ~14°, 0.0117 at 20°, 0.0286 at 28°). Never replace with a width-based formula: the tyre's rounded profile rolls up far less than its bbox width (both width attempts floated the wheel 8–12 cm on every turn).
  - Lean authority is speed-capped by the physics (§4.3) — a parked bike neither yaws nor leans; burnouts are the deliberate exception.
- **No Pitch Dynamics**: the light cycle stays flat on the floor at all times — no wheelies, no brake dive. Never rotate `vehicleRoot.rotation.x` or lift either wheel (lean lift is the only approved vertical offset).

### 4.3 Vehicle Physics & Drift Mechanics (`src/lib/cyclePhysics.ts`)

- **State Model**: `CycleState` tracks `x, z, vx, vz, yaw, speed, lean, isDrifting, isBurnout, isAutopilot`.
- **Lean-Driven Steering** (bike-game standard): steer input commands a LEAN angle, never yaw directly. The lean target is `steerDir · min(maxLean, atan(v²/(R_MIN·CORNER_G)))` — slow bikes barely lean (parking-lot rule) — and it ROLLS in under a rate cap (`LEAN_RATE` 2.2 rad/s ≈ 0.16s to full bank; a charged drift flicks in ~1.8× faster). Yaw then FOLLOWS lean and speed: `ω = min(CORNER_G·tan(|lean|)/v, v/R_MIN)`. `CORNER_G` 92 is an arcade-scaled cornering gravity; the `R_MIN` 4 floor keeps low-speed (<~10 u/s) steering direct and tight. Resulting radii: r ≈ 4 below ~11 u/s, ≈ 20 at 26 u/s, ≈ 48 at boost 40 — turn radius WIDENS with speed. Entries roll in; exits trail out (yaw keeps following the decaying lean — no kart-style instant stop). **Never revert to a constant-yaw-rate model** — it reads "fake and effortless", worst on mobile.
- **Speed Tiers**: Normal max 26.0, Boost 40.0, Reverse max −8.0. Releasing boost while still on throttle glides speed back down to the normal cap at coast-drag rate (never floats above the current top speed).
- **Spawn & Terminal Parking**:
  - The bike spawns in front of the Intro terminal (`getStationFrontPosition('intro')` in `src/lib/arena.ts`), facing the billboard — never inside it.
  - Autopilot targets the terminal front parking point (`TERMINAL_PARK_DISTANCE = 5.8` in front of each billboard), decelerates proportionally on approach, and docks within `DOCK_RADIUS = 1.2`, snapping `yaw` to face the billboard squarely.
- **Drift Powerslide**:
  - Triggered by `inputs.brake` (`Space`) while moving forward and steering. All slide effects blend on a `driftCharge` accumulator (~0.3s ease in/out): lean target 20°→28°, yaw multiplier 1.0→1.35x, roll-in rate 1.0→1.8x, grip lerp 14→3.5/s, brake bleed 1.5x→0.22x — nothing may snap in a single frame.
  - Deepens the lean to 28.0° (vs 20.0° normal) and steps the rear out with a modest 1.35x yaw multiplier ON TOP of the lean-driven arc (≈ r 10 at 26 u/s — a real powerslide arc; never restore a high steer-driven multiplier, that is a 300°/s pirouette). Bleeds speed gradually (`BRAKE_DECEL * 0.22 * dt`).
  - Crossing the 3 u/s burnout gate under brake+steer has a deliberate rate kink (lean model above, pivot model below — reads as the rear breaking loose); blend if it ever reads bad.
  - Velocity vector `(vx, vz)` maintains lateral inertia before catching up with the new yaw angle.
- **Burnout**:
  - Holding throttle/boost + brake below `3.0 u/s` revs the engine in place: the bike holds its position (`state.isBurnout`), the rear wheel spins at throttle speed while the braked front wheel stays planted, and drift lean/air brakes/tyre screech engage.
  - Steering during a burnout pivots the rear around the planted front wheel (0.948 ahead of center), tracing skid-mark circles — the only way to yaw at zero speed. The pivot rate EASES IN over ~1s (`state.burnoutSpin`, quadratic) to the full 2.1 rad/s and decays on steer release — an instant max-rate spin reads as fake. `standstill` carries a speed-fading floor (`max(spin², |speed|/3)`) so crossing the 3 u/s gate is rate-continuous at any approach speed.
  - Audio: `soundEngine.update(..., revSpeed)` feeds engine/motor-whine layers a virtual rev speed (26 normal / 40 boost) while wind rush stays keyed to real road speed. A boost burnout (`Shift`+`Space`) revs ~25% higher and slightly louder, with the boost thruster firing despite standing still.
- **Arena Boundaries**:
  - Arena size is 240×240 ($[-120, 120]$ on X and Z).
  - Bounding limits calculate exact bike extents from `yaw` (half-dimensions measured from the model bbox):
    $$\text{extent}_X = |\sin(\text{yaw})| \times 1.36 + |\cos(\text{yaw})| \times 0.55$$
    $$\text{extent}_Z = |\cos(\text{yaw})| \times 1.36 + |\sin(\text{yaw})| \times 0.55$$
  - When reaching boundaries, position clamps with zero space against the wall and velocity is dampened.
- **Terminal Markers (Flat)**:
  - Stations have **no raised platform** — the marker is a flat landing pad on the grid: a floor-level disc (`#040b13`, roughness 0.5 / metalness 0.4) with three concentric glowing rings on top (perimeter r 8.85–9.05 cyan, circuit r 5.85–6.0 cyan 50%, target r 2.85–3.0 ice 60%), and pylons/billboard standing directly on the floor.
  - There is deliberately **no elevation function** — bike, trail, and skid marks all use a constant floor height. Raised platforms were tried and reverted (unreadable slope at speed / black-surface contrast); do not re-add platform elevation.

### 4.4 Multi-Trail System (`src/ride/Trail.tsx`)

- **Height**: Fixed at `RIBBON_HEIGHT = 0.84` units to match the top of the rear wheel.
- **Emission Gate**: `boost held && actual velocity > 0.2 && NOT (wall contact within 200ms && velocity < 10)`. Never gate on the `speed` scalar alone: boosting into a wall or own trail pins the bike while `speed` stays deceptively high. Contact alone does not cut the ribbon — only a contact that actually **stalls** the bike (real velocity under `GRIND_STALL_SPEED = 10`) closes emission; fast grazes keep laying trail. **Drifting while boosting LAYS RIBBON** (the brake does not cut emission; a boost-drift carves a curved wall). Only a stall or releasing boost closes a ribbon.
- **Multi-Ribbon Buffer**: multiple concurrent ribbons; releasing `Shift` dissolves the trail smoothly tail-first; a new boost starts a new independent ribbon without touching previous fading ones; quads are indexed per ribbon (single draw call, no overlapping triangles).
- **Banked Walls**: each point stores the bike's lean at emission (`ribbon.leans`, index-aligned); the wall top edge offsets by `tan(lean) × RIBBON_HEIGHT` along left-of-travel (`trailTopLeanOffset` in `src/lib/track.ts`). A ribbon is born as two identical points — the FIRST segment must REPLACE that duplicate instead of appending (or point 0's zero-length direction renders a permanent vertical stub at the trail's start). On the birth frames a zero-length travel direction must fall back to the bike's CURRENT heading, never a zero vector (the 'vertical first-glimpse' bug).
- **Rigid Anchor Segment**: emission records at the rear wheel edge (1.35 behind center); every emitting ribbon renders one extra synthetic point at 1.13 behind center (inside the bike). The segment between 1.35 and 1.13 takes the bike's CURRENT yaw and lean each frame — rigid with the bike's body — so the wall crosses the rear wheel at its vertical center from the chase cam. The anchor exists only in tessellation: collision (`resolveTrailWalls`) and dissipation see only real points, and it vanishes when emission stops.
- **Ribbon Bend Limit (drift cut)**: a wall can only curve so far before it snaps. THREE cut demands gate emission, because each alone misses cases the others catch — crossing any threshold cuts emission like a stall:
  1. **Tip clearance (the exact condition)** — the bike's two rear footprint corners (±0.55 lateral, 1.36 back) vs the newest `TIP_SEGMENTS` (10 ≈ 2m) wall segments of the emitting ribbon; cuts when the nearest segment comes inside `RIBBON_TIP_CLEARANCE` (0.26m) — BEFORE the rear wheel's tip runs into its own wall. Covers slow-speed curls and mixed-input cases where the proxies lag.
  2. **Slip** — the angle between the bike's heading and its actual velocity; normal turns run ≤~5°, a hard powerslide 25–35°. Cuts above `RIBBON_CUT_SLIP` (50°).
  3. **Curvature** — direction change per laid unit at the emitter (EMA ~0.1s); catches the slow coil a bled-out drift or burnout pivot traces. Cuts above `RIBBON_CUT_CURVATURE` (0.21 ≈ radius 4.8).
     A fresh ribbon is born only when slip and curvature relax under the resume thresholds (`RIBBON_RESUME_SLIP` 42°, `RIBBON_RESUME_CURVATURE` 0.16, hysteresis) after `RIBBON_CUT_MIN_HOLD` (0.35s — without the hold, boundary oscillation strobes a chain of tiny wall nubs).
- **Dev Debug**: `window.__trailDebug` (dev builds only) exposes `ribbonsRef`, `cycleStateRef`, and the mesh for CDP buffer readbacks.

### 4.5 Drift Tyre Skid Marks (`src/ride/SkidMarks.tsx`)

- Tracks tyre center: `rearX = cycle.x + sin(yaw) * 0.912`, `rearZ = cycle.z + cos(yaw) * 0.912`.
- Generates twin tread strips across `TYRE_HALF_WIDTH = 0.271`; fades out segments over ~5.5 seconds.
- **Contact-edge footprint (blended)**: the strip migrates from the full-width centered twin strip at 0° lean to the GROUNDED tyre edge at max drift lean — `shift = ±TYRE_HALF_WIDTH·cos(lean)·k`, `halfWidth = TYRE_HALF_WIDTH·(1−|sin(lean)|·k)` with `k = min(1, |sin(lean)|/0.469)`. Never snap the strip to the edge at any nonzero lean, and never ignore lean (a bright edge under the airborne rim reads as marks from the wrong side of the wheel).

### 4.6 Procedural Audio Engine (`src/lib/soundEngine.ts`)

- **Architecture**: Singleton Web Audio synthesizer with zero external audio assets.
- **Layers**:
  - `Engine`: Sub-bass sine (55Hz) + sub-triangle (27.5Hz) through a 130Hz lowpass. Pitch keeps rising through boost (no plateau at MAX_SPEED); lifts ~25% during a boost burnout.
  - `Motor Whine`: Dual pure sine harmonics (90Hz → 240Hz) through a Butterworth lowpass; climbs through boost.
  - `Wind Rush`: Lowpass filtered procedural noise (180Hz → 1030Hz) scaling with forward speed.
  - `Boost Thruster`: Bandpass noise (650Hz → 900Hz) + 45Hz sub-bass core + turbine tone spooling with speed (170→380Hz).
  - `Drift Sizzle`: Bandpass white noise, pitch scales with speed (1.6→2.05kHz) with a slight wobble; active during powerslides and burnouts.
  - `Foe Bike (spatial, battle only)`: `updateFoe(...)` called from `PhysicsLoop` every frame of a duel — engine sub + whine + boost jet + drift squeal (same voice family as the local bike, slightly quieter) routed through a Web Audio `PannerNode`: `equalpower` stereo pan, `linear` distance rolloff (full within `refDistance` 12, EXACT silence beyond `maxDistance` 110 — the physics-correct `inverse` model asymptotes and never fully fades). The `AudioListener` is the camera (position + `getWorldDirection` forward). Per-frame spatial writes use the `positionX`/`forwardX` params with a `setPosition`/`setOrientation` fallback for old Safari. Silenced by `setReading` (dialog open), `stopContinuous` (tab hidden/unmount), and phase ≠ `running`.
  - `One-Shots`: Terminal open (crystalline arpeggio), terminal close (dissolve sweep), autopilot engage/dock, battle link created (rising two-note confirm), battle arena transform (sub swell + noise sweep + fifth — plays when the countdown starts), wall shield impact (noise thump + electric zap, rate-limited to one per 90ms so wall grinds can't machine-gun), radar proximity ping. All fade in over ~10ms — no click attacks.
- **Reading Mute**: `soundEngine.setReading(true)` immediately silences all continuous vehicle sounds while a terminal modal is open. Hiding the tab also silences continuous layers.

### 4.7 Camera System & Orbit Drag (`src/ride/CameraRig.tsx`)

- True spherical OrbitControls math centered on the bike (`bikeCenter = (cyclePos.x, cyclePos.y + 0.55, cyclePos.z)`).
- **Default Framing**: Distance `4.6` (mobile `3.8`), polar angle `PI/2 - 0.28`, FOV `45.0°`.
- **Interactive Free Orbit**: Left-click & drag rotates `theta` continuously 360° with zero forced angles or snapping; mouse wheel zooms `radius` smoothly between 1.8 and 25.0 with damping.
- **Motion Reset to Ride View**: When the bike begins moving or boosting (`Math.abs(speed) > 0.8`), camera spherical coordinates smoothly damp back to the chase alignment behind the bike.

### 4.8 Grid Battle Mode (P2P Duel)

Opt-in two-player Tron duel over WebRTC (the constraint #1 exception). The normal arena is untouched — battle code activates only via the battle terminal or a `#battle=` invite link.

- **Files**:
  - `src/lib/battle.ts` — pure rules, unit-tested in `battle.test.ts`: `stepFuel` (boosting spends distance; empty locks until 20% regen; base capacity 80), `boosterGain` (+20 capacity AND fuel, no ceiling), crash gate = the contactor's DRIVE SPEED strictly above the normal max 26 (`isRibbonCrash` at every gate: Trail own/foe walls + the owner probe). NEVER gate on the into-wall component vn (a wall born inside the capsule makes |vn| read the full velocity vector → derezzes a cruising foe on a shallow overtake birth). The drive scalar glides down past 26 after boost release — no last-moment dodge; ≤26 always bounces + scores. Hit debounce 0.75s; 240s clock; spawn corners (∓100, ∓100 facing center); dead-reckoning math (`measureSnapshotMotion` + `predictPose`, unit-tested); SECTOR-STRATIFIED boosters (`BOOSTER_COUNT` angular wedges, one per id, respawns re-roll in-wedge — whole-arena coverage by construction; radius ≤ 96 keeps canisters ~24u off the walls — fuel must never force a wall graze); `BOOSTER_RADIUS` 2.2 pickup with a radial-gradient light pool under each canister (`Boosters.tsx` — a lamp marking the exact radius), neutral cyan `#35e4ff` for BOTH riders (no role theming), constant glow.
  - `src/lib/battleStore.ts` — zustand phase machine `idle → waiting → countdown → running → ended` + `battleRuntime`, the mutable 60fps singleton (fuel, timer, crash state) read inside `useFrame` only, never React state.
  - `src/lib/battleNet.ts` — PeerJS host/join, 30Hz `{x,z,yaw,lean,speed,boost,drift,cap,ts,echo}` state sync. Broker handshake retries once (`BROKER_ATTEMPTS 2` via `awaitBrokerOpen`, fresh peer + fresh randomId per attempt). **Remote pose = DEAD RECKONING to TRUE NOW**: each msg carries sender `ts` + echoes the last received `ts` (new echo = RTT) → smoothed `leadMs = RTT/2` (clamp 300ms, EMA 0.2); keep the last 4 snapshots; extrapolate the newest by (age + lead) using velocity measured between snapshots (`measureSnapshotMotion` — position deltas include drift slip; degenerate gaps fall back to heading×speed) + measured yaw rate (`predictPose`, substep 1/30s, dt cap 1s — hidden-tab foes throttle to ~1Hz and keep rolling). Rendered pose = smoothed velocity (chase 12/s; read downstream as `remoteState.vx/vz`) + gentle pull onto the prediction (8/s). NEVER reconcile with a decaying position offset — it cancels forward motion while the foe accelerates. On duel end, freeze at the foe's LAST snapshot, velocity zeroes. Event msgs `start/booster/spawn/hit/wallhit/crash/youcrash/timeout/rematch`; `timeout` carries the SENDER's scores and both machines settle on them. Host is booster authority; trust-based (friends-only). **LIVENESS WATCHDOG**: each msg stamps `lastMsgAt`; a 1s interval ends the duel via `handleFoeLeft` after 6s silence in running/countdown (catches tab kills). **Connection**: cross-network duels NEED TURN (STUN-only hangs on symmetric-NAT/CGNAT/UDP-blocked nets). `peerConfig()` fetches `public/turn.json`, prepends its TURN entries to the STUN fallback (cloudflare+google), degrades to STUN-only if missing. **`turn.json` is CREDENTIALS, never in git**: gitignored at BOTH `public/` and `docs/` (the repo commits docs/; a Pages deploy has no turn.json → STUN-only, by design). **TURN relay**: self-hosted; details live outside this public repo. Connection RULES: never a `?transport=tcp` **STUN** url (freezes Chrome ICE gathering); `iceCandidateTimeout` 10000; 12s broker-handshake timeouts (host + joiner, destroy the failed peer); 20s ICE join watchdog; a pre-open challenger death must not tear down the host's waiting session (`everOpened` in `wireConnection`); the challenge screen stays mounted after a failed join until countdown (`challengeOpen` in `RideView`); the join is single-flight (`joinInFlight` — StrictMode double-mount otherwise races two peers). Bikes collide as capsules (`resolveBikeContact` in `cyclePhysics.ts`, unit-tested; a shove never pushes a rider above their own pre-shove speed / the normal max). Battle clock (countdown, 3-min timer, fuel regen, timeout) runs in `BattleClock` on a wall-clock **interval**, NOT the frame loop (hidden tabs freeze rAF); fuel drain stays per-frame (distance-laid).
- **Flow**: battle terminal (orange, cross-marked) in a chamber at the end of a 7-wide alley OUTSIDE the south wall (`BATTLE_ALLEY_BLOCKS` in `arena.ts`: gate at x≈0/z=120, 220 units south to a chamber at (0, 353); matching wall gap sealed by `AlleyGateDoor` during battles; riders beyond the wall hide from the radar via `isInsideAlley`) → Enter → `#b=<peerId>` link (bare 5-char `randomId()` — typed/read by humans on phones) → joiner opens the link (App forces ride view) OR enters the 5-char code in the launcher's code box (the code IS the battle id; `normalizeBattleCode` also extracts it from a pasted link; Enter inside the code box SUBMITS instead of closing; RideView's window keydown returns early for INPUT targets while the dialog is open; a dead/typo'd code → shared 'Grid Battle not found' toast) → host `hello` → both freeze at opposite corners, 5s countdown → duel.
- **Battle rules**: EVERY rider rides the CYAN bike locally and sees the foe ORANGE (instance-based, not role-based — no UI element themes by role; strip/gauge/joystick/pedal are always cyan). Arena-wall touches SCORE A POINT for the opponent (debounced 0.75s via `reportFoeTrailHit`, never a crash; only ribbons derezz). ANY trail contact strictly ABOVE the normal max drive 26 u/s (own or foe's) crashes the contactor — the bike just stops where it is (no tip-over animation); winner's camera orbits the wreck (`battleRuntime.crashFocus`). Slower foe-trail contacts bounce + zap and score a point for the trail owner (debounced). Timer expiry → most caused hits wins, tie = stalemate; disconnect = opponent wins. **Crash freeze**: the wreck keeps its ribbons on BOTH screens — the crasher's own ribbons freeze on their machine AND the foe's reconstructed ribbons freeze on the winner's (`ribbonCrashFrozen(crashSide, isRemote)` in `battle.ts`, unit-tested: Trail's dissipation loop skips for the crashed side's ribbons — a final snapshot with `boost=0` must not melt the wall from under the wreck). `resetBattleRuntime()` (rematch/exit) clears `crashSide` and resumes dissipation. Rematch (either player) re-runs `start` with fresh boosters.
- **Auto-cruise (anti-camp + mobile simplification)**: during `running` (and during `waiting` as HOST only), `PhysicsLoop` forces `inputs.forward = true` — light cycles NEVER stop or reverse in a duel; live controls are steer/boost/drift only. A LINKING JOINER PARKS (the countdown `placeBikes` moves both bikes to their corners anyway) and keeps NORMAL-ARENA physics (`normalArena`: alley gate passable — the sealed-arena clamp would otherwise yank a bike parked at the battle terminal to the wall); `leaveBattle` never repositions a joiner whose join failed (`joinFailed` guard — a failed code entry leaves the rider where they parked). `updateCycleKinematics` takes a `battle` flag: burnout disabled, brake DRIFT-ONLY (no parking), braking converges speed to `BATTLE_DRIFT_FLOOR` (10 u/s) from ANY side. Guarded by the `duel mode` describe in `cyclePhysics.test.ts`. Mobile: joystick + one cyan Drift pedal; boost = the finger LEAVES the pad — past the rim in the TOP half only (up / up-left / up-right, `rawDy < 0` gate; raw pointer length vs pad radius > 1.04, hysteresis-hold to 0.92; pointer capture keeps steering live outside the element). TOP MARK flares cyan while boosting; the active side mark flares on a steer-boost; the puck is circular (`.joystick-pad-round` carries its own `!important` against the global `*,::before,::after{border-radius:0!important}` reset); BOTTOM mark hidden in duels (reverse is dead).
- **Anti-stall & anti-camp**: stalling costs NO points (wall touches pay them — a wall camper bleeds a point per contact debounce). Two mechanisms:
  (1) **Wall-stall rescue** — real velocity (`hypot(vx,vz)`) under `STALL_SPEED` (5 u/s) accumulates `battleRuntime.stallFor` via `stepStall`. At `STALL_WARN_S` (2s) a centered warning counts "MOVE! STALLING FLIPS YOU IN N" (N = 3→1); at `STALL_FLIP_S` (5s, running AND waiting alike) the bike is FLIPPED 180° with a ≥6 u/s kick so the always-on throttle carries it free. No score, no wire message.
  (2) **Drift heat** — `stepDriftHeat(heat, drifting, dt)` in `battle.ts`: drifting heats the tyres (+1/s), releasing cools them (−`DRIFT_HEAT_COOL` 3/s); saturating `DRIFT_HEAT_MAX_S` (2.5 — one full legal drift circle at the floor speed) locks brake/drift for `DRIFT_LOCK_S` (5s) — `battleRuntime.driftHeat` + `driftLockUntil`, asserted every frame in `PhysicsLoop` (`inp.brake = false`; heat cools during the lock since brake reads false). WHY time not shape: any slow-riding camp REQUIRES the drift key at high duty (staying slow needs braking — auto-cruise pins 26 — and the brake is drift-only), while shape recognition provably could NOT separate legal slides from camps (a real powerslide IS a tight low-displacement circle; a held-Space steer-wiggle crawls at the floor forever without ever "circling"). Duty math: sustained duty above cool/(1+cool) ≈ 75% eventually locks; legal corner slides net-cool every cycle and can NEVER lock (unit-tested). `BattleDriftLock` counts down "DRIFT DISABLED! BACK IN N". **Never rebuild shape-based camp detection.** Resets: `stallWarning` in `startWaiting`/`beginCountdown`/`endBattle`/`resetToIdle`; `stallFor` + `driftHeat` + `driftLockUntil` in `resetBattleRuntime`. **Hidden tabs**: while `document.hidden` (running, or waiting as the HOST), `BattleClock`'s interval simulates the elapsed dt in 0.1s SUB-STEPS of duel-mode `updateCycleKinematics`, and a wall-pinned hidden bike SELF-RESCUES with the flip.
- **Help flow**: `HelpDialog` (`src/hud/HelpDialog.tsx`) is ONE component mounted three ways — the `?` toggle (BATTLE-ONLY; toggle order left→right Help · Audio · View, a ROW on both desktop header and mobile), the joiner's `BattleChallenge` screen, and a link in `BattleResult`. Panel `max-w-2xl` (station-inspector width), `text-base` body, `text-sm` titles; Controls shows ONE column for the CURRENT input mode only (`innerWidth <= 1024` at mount), NO mode label. Copy is action-language, never numbers/km/h; the drift lock is DRIFT HEAT ("leaning on drift too long overheats the tyres"). Title bare "How to Play"; shared `OverlayScrollbar`; opening NEVER pauses the duel (does get terminal open/close sounds + `setReading`). **Challenge screen**: a `#battle=` link NEVER auto-joins — `challengeId` + `BattleChallenge` ("You've been challenged…", cyan `[Enter the Grid]` + ember `[Reject]` + muted `How to play`, Enter = enter) gates `joinBattle`; a failed join keeps the screen up for retry. A SUCCESSFUL enter CONSUMES the invite: `enterChallenge` clears `challengeId` + the `#b=` fragment immediately (never resurrects). Reject = `rejectChallenge`: clears id + `clearUrlHash()` (replaceState — no hashchange) and TELEPORTS to the battle-terminal front (`getStationFrontPosition('battle')`, facing the billboard, motion zeroed, ribbons cleared). Same-document hashchange routes through the same screen. Launcher waiting copy says the challenger "lands on a challenge screen" and the duel starts when they ENTER the grid.
- **Owner-side wall authority**: the foe's client only has a lagged reconstruction of MY ribbons — a wall whipped across their nose a frame before contact could pass through clean over there. `PhysicsLoop` probes the foe's PREDICTED pose (`remoteRefs.cycle` — what this screen renders) against MY REAL ribbons every frame (`foeProbe` scratch state; `rearX/Z = 1e9` so head-skip NEVER skips the freshest segment): into-wall component strictly above `BATTLE_CRASH_SPEED` = `forceFoeCrash` (duel ends 'win' locally + `{t:'youcrash'}` mirrors the teardown on their machine); ≤26 = `reportFoeWallTouch` — a debounced (0.75s) point for the WALL OWNER (`scoreHit('me')` + `{t:'wallhit', vn}` → contactor `scoreHit('foe')` + impact sound), and the probe's push-out nudges the rendered pose so the owner's screen shows the bounce. Trail-bounce SCORING is owner-authoritative (the contactor's lagged reconstruction could score/miss a point the wall owner never saw; the contactor keeps only LOCAL bounce physics + sound). ARENA-wall touches stay contactor-reported (`reportFoeTrailHit` — static geometry is identical on both machines). Every path is phase-gated so the duel ends/scores exactly once regardless of which side detects first. Dev-only handles: `window.__wallProbe`, `window.__battleRemote`, `window.__battleNetDebug`.
- **Trails in battle**: per-ribbon length cap = the rider's fuel capacity (grows with boosters, no trim under cap — unlike the fixed 67.5 arena cap); ribbons only emit while boosting and dissolve tail-first once boost stops for any reason (release, fuel-out lock, crash). Foe ribbons are reconstructed locally from synced bike states — never serialized as point lists. **Dissolved-stub rule**: a DISSOLVING ribbon under `DISSOLVED_MIN_UNITS` (4) remaining units stops colliding entirely — no crash, no bounce, no score — for everyone (`ribbonSolid` inside `resolveTrailWalls` in `cyclePhysics.ts`, the single collision primitive, so own-crash, foe-bounce and the owner-side probe agree by construction; a fading wall's last units are effectively invisible at boost speed and a derezz on it reads as a false crash). EMITTING ribbons are exempt — a newborn wall is solid from its first segment.
- **Countdown waits for materialization**: the joiner's `hello` means "in AND materialized" — sent via `maybeSendHello()` only once `battleRuntime.rideReadyAt > 0`, stamped by `notifyRideReady()` (exported from battleNet, called by RideView) AFTER the cold-entry veil's fade-out completes, or immediately on warm mounts. A host `start` racing an un-lifted veil is stashed as `pendingStart` and applied by `notifyRideReady`. `rideReadyAt` is a per-page fact — NEVER reset in `resetBattleRuntime` (zeroing it would strand the stash).
- **HUD** (`src/hud/BattleHud.tsx`): launcher dialog (create + join-by-code; waiting pane: code box leads, Copy Code / Copy Link, description "Send the code or link to a challenger…", no heading, spawn corners never mentioned), status/error toasts, countdown, in-duel strip (score · clock · fuel gauge `w-36`, written imperatively via refs), result overlay. Launcher gets terminal open/close sounds + `setReading` (wired on `battleDialogOpen` in RideView). Error toasts auto-dismiss after 5s (`.toast-drain` bar, no dismiss button); network error copy sentence case ("Grid unavailable, try again."), cleared on retry. CLICKABLE toasts blink (`animate-pulse`) + end with `›` (Awaiting challenger chip both viewports; station prompt mobile); informative ones never. Compact on mobile (`px-4 py-2`, 10–12px). **HUD zones**: radar top-RIGHT (far from the left-thumb joystick) + Audio/View toggles right-aligned below (RideView); toasts top-CENTER desktop / top-LEFT tablet+phone (`toastPosClass(isMobile)`; desktop = `left-0 right-0 mx-auto w-fit`, NEVER translate-centering — caps wrap at ~50vw), same split in StationPrompt; match strip top-LEFT on BOTH viewports with the BattleLog kill feed under it (cause-tagged `scoreHit(who, cause)` point events + foe drift-lock intel; plain rows, newest bottom, 4s fade, `.battle-log-row` push-up); TOP CENTER belongs to the nav arrow ALONE: `FoeNavArrow` mounts the vendored `TronNavArrow` (`src/ride/TronNavArrow.ts`, mesh `public/models/tron_nav_arrow.obj`, flat 3-tone #649399/#d9d9d9/#ffffff, unlit, own mini OBJ parser) camera-parented (offset (0, 0.40, −1.2), scale 0.026, HUD renderOrder 999, SmoothLookAt damping 6), aimed at the foe each frame, MESH on the distance spectrum (`setSpectrum` lerps tones toward the foe's orange, `FOE_SPECTRUM_FAR/NEAR` in battle.ts; the two whites lerp to a LIGHTENED foe tint); no distance text. GOTCHAS: `scene.add(camera)` in mount (R3F doesn't add the default camera — camera children never render); tip = mesh +Z vs cams looking −Z (dead-ahead = 180° flip, correct). Desktop name/role header hides in battles; dialog padding `p-3 sm:p-6 md:p-6`; controls hint swaps to `[A, D] … to steer` + `Space drift` in battles. Fuel gauge bottom-center, imperatively lifting above the controls on narrow screens (`bottom = innerHeight − minBlockerTop + 8`). Radar swaps station blips for the ember foe blip (same triangle size as the player's), foe ribbons, boosters. Dev: `window.__battleStore`.

### 4.9 Performance, Loading & Mobile Heat

- **Never test ride load through the Vite DEV server on a tunnel** — dev serves ~40 unbundled modules with `cache-control: no-store` and ~1–2s TTFB per request; that waterfall IS the wait (production = one bundled chunk). For phone/tunnel testing: `npm run build && npx vite preview --host`, forward THAT port.
- **Preloads**: `App.tsx` injects `<link rel="preload">` for the obj.gz (as fetch) + ALL FOUR player texture maps (as image) whenever a mount lands DIRECTLY in ride mode (`#battle=` link, stored `grid-mode`, `?mode=ride`). `ModeToggle`'s hover/focus prefetch warms the lazy chunk AND fetches the obj.gz into HTTP cache before the click.
- **Cold-start pipeline** — two mechanisms kill the chopped first-ride entry:
  1. **Read-view background warm** (`App.tsx`, once per page): `import('./ride/RideView')` + `import('./ride/vehicleProto').then(m => m.warmVehicle())` — the proto PARSES while the visitor reads (same module cache the mount uses) and the four texture files drain into HTTP cache. Quiet-window gated: the warm only fires when the page fully loaded + ≥4s since mount + ≥2s since the last pointer/scroll/key input (input listeners with capture; once-per-page guard INSIDE `warm()` — an arm-time guard breaks under StrictMode's double-mount).
  2. **Cold-entry veil** (direct `?mode=ride`/`#battle=` links the warm can't cover): fullscreen `z-[15]` identity-disc spinner (`src/hud/Materializing.tsx`, shared with App's Suspense fallback; "MATERIALIZING GRID" + pulsing dots, `motion-reduce` static) while `RideReadyGate` (in RideScene) waits for bike attached + all 4 player maps (`vehicleStatus.mapsLoaded`, counted onLoad AND onError) + the quality ladder ARMED (`vehicleStatus.ladderArmedAt`, stamped by QualityGate before its prime) + 60 settled frames; 12s failsafe. While held: drive keys swallowed, StationPrompt + MobileControls unmount, StationNav + Radar stay IN the DOM dimmed (`opacity-40`) + `inert` (present-but-unclickable chrome, no layout pop), free camera locks (`veiled` prop joins `parked` behind one `camLocked()` guard), root cursor `cursor-default` + the 3s idle cursor-hide veil-gated; HUD/dialogs (z-20+) stay usable above. Shows ONLY when `vehicleStatus.builtAt === 0` at RideView mount — warm entries and re-toggles skip it. Dev: `window.__vehicleStatus`.
  3. **Audio unlock at App level**: `soundEngine.init()` fires on the FIRST pointerdown/keydown anywhere (Read included) — the ride enters with the engine already alive. Idempotent; RideView keeps its own listener as backup.
  4. **RideView stays MOUNTED across mode switches** (`App` renders it once `rideEverActive`, with `active={mode === 'ride'}`): switching to Read PARKS it (root gets `hidden`, `scenePaused` stops the frame loop, keyboard swallowed, window-level camera/wheel listeners gated via the `parked` prop, inputs cleared on park so no stuck throttle) — the WebGL context (textures, shader programs, composer buffers) survives and switching back resumes with NO re-upload/recompile. Never unmount-remount per switch again.
  5. **FadeImg fades ONCE per src** (`src/hud/FadeImg.tsx`): opacity-only, and a module-level `everLoaded` set makes revisits render immediately with NO animation. The animate decision is captured ONCE at mount — recomputing it after load strips the transition style mid-fade. Ref-attach callback catches cached-but-complete images (onLoad may never fire).
  6. The duel countdown waiting for the joiner to materialize is documented in §4.8 (Countdown waits for materialization).
- **Frame loop pauses when reading**: `frameloop` flips to `never` while a reading modal (station inspector / battle launcher / help) is open in the normal arena (`paused = reading && battle idle`, computed in RideView, passed to RideScene's Canvas). Duels NEVER pause; `dt` is clamped to 0.1s in PhysicsLoop so resuming cannot teleport the bike.
- **Quality ladder v2 — warm-up gate + adaptive resolution in tier 1** (the composer chain's cost is almost pure pixel count, so RESOLUTION is traded before anything else):
  1. **Warm-up gate** (`QualityGate` in RideScene, armed by `vehicleStatus.builtAt` from `src/ride/vehicleStatus.ts` set by Cycle's `buildVehicle`): the PerformanceMonitor does not exist until the bike attached + 120 frames + 3s with a full sample (absolute fallback 20s) — never sample the LOAD STORM (obj.gz parse hitches + texture upload + shader compile), it demotes healthy machines. The gate measures warm-up THROUGHPUT (hitches COUNT; only >2s gaps from a parked frame loop reset the sample) and PRIMES the tier-1 dpr scale from it: `scale = sqrt(fps/55)` rounded up to the next 0.04 step — weak GPUs start AT the resolution they can hold.
  2. **Tier 1 = adaptive resolution, one-way down**: onDecline steps internal dpr 1.0 → 0.6 in 0.04 steps (bloom stays ON, canvas CSS-upscaled); only a decline at the 0.6 floor bumps to tier 2. The scale ladder never climbs back (each flip reallocates render targets; recovery = re-entering the ride re-primes fresh). `PerformanceMonitor` bounds are refresh-RELATIVE (`rr ≤ 100 → [0.78·rr, 0.92·rr]`, else `[0.55·rr, 0.9·rr]`). Live dpr changes resize canvas + composer in place (both track pixelRatio per frame — no composer remount). `onDecline` still NEVER flips the view to Read mid-battle (unmounting RideView concedes the duel; gate is `phase === 'idle'`).
  3. **Tier ladder above tier 1 is one-way**, never re-enters tier 1 (`onIncline` floors at tier 2 — bloom remounting the EffectComposer was the periodic "laggy sometimes" oscillation).
  4. **Tier 2+ has NO EffectComposer at all** (`Effects.tsx` returns null unless tier 1); `RideView` paints the equivalent vignette as a CSS `radial-gradient` overlay for tiers ≥2. Bloom stays tier 1's signature look. (Tier 1 keeps its Vignette INSIDE the composer — @react-three/postprocessing merges all effects into ONE EffectPass, so removing it saves nothing.)
- **Per-frame GPU-transfer and garbage cuts**: `Trail`/`SkidMarks` upload ONLY the written slice via `clearUpdateRanges()` + `addUpdateRange(0, used)` (a bare `needsUpdate` re-uploaded the full ~200KB buffers per trail per frame); stale verts are zeroed only across the SHRINK delta, never before the written region (collapsing live verts to the origin sprays triangles to (0,0,0)). `StationBillboards` sets pylon-frame proximity colors from cached `THREE.Color` constants on the TRANSITION only (never parse hex strings per frame).
- **Touch caps**: DPR cap 1.25 (desktop native 2.0 untouched) and `MAX_ANISO` 8 (desktop 16); phones keep MSAA (`antialias: true`, near-free on tile-based mobile GPUs) for line work instead of raw pixels.

---

## 5. Controls Mapping Reference

| Action                 | Desktop Key                   | Mobile Touch                       |
| ---------------------- | ----------------------------- | ---------------------------------- |
| **Accelerate**         | `W` or `Arrow Up`             | Left Thumb up (pad)                |
| **Reverse / Back**     | `S` or `Arrow Down`           | Left Thumb down (pad)              |
| **Steer Left**         | `A` or `Arrow Left`           | Left Thumb "◀"                     |
| **Steer Right**        | `D` or `Arrow Right`          | Left Thumb "▶"                     |
| **Speed Boost**        | `Shift` (hold)                | Left Thumb up, TOP BAND (hold)     |
| **Brake & Drift**      | `Space` (hold while steering) | "Drift/Brake" pedal while steering |
| **Stationary Burnout** | `W`/`Shift` + `Space` (hold)  | Pad up + Brake pedal held          |

**In a Grid Battle duel everything above simplifies**: the bike auto-cruises forward at all times (no accelerate/reverse/burnout), so the live controls are **steer** (`A`/`D` or joystick), **boost** (`Shift`), and **drift** (`Space` + steer; the mobile pedal relabels to "Drift").

| **Inspect / Close Terminal** | `Enter` | Tap Prompt / Close button |
| **Scroll Terminal Content** | `Arrow Up` / `Arrow Down`, Wheel | Native touch scroll |
| **Orbit Camera** | Left-click + drag | Single-finger drag (when stationary) |
| **Zoom Camera** | Mouse scroll wheel | Two-finger pinch (when stationary) |

---

## 6. Development & Quality Verification Commands

Before committing or concluding any turn, run the complete verification suite:

```bash
# 1. Automatic formatting
npm run format:fix

# 2. Strict static analysis & linting
npm run lint

# 3. Data integrity & contract unit tests
npm test

# 4. TypeScript build + Vite production bundle
npm run build
```

---

## 7. Guidelines for Agentic Development

- **Preserve Clean Commits**: Keep changes minimal, modular, and focused on the stated request.
- **Keep This Manual Current**: every change that adds/removes/renames a file, alters documented behavior (physics constants, subsystem mechanics, HUD placement, any UI string quoted here), or touches the verification workflow must update AGENTS.md in the same change — the §3 code map and every subsystem section must always match the real project. Delete documented entries for deleted code; never leave the manual describing things that no longer exist.
- **Do Not Guess Missing Assets**: All models and textures must reside in `public/models/`. If an external asset is requested, follow procedural generation or ask the user.
- **Ref State Discipline**: R3F components in `src/ride/` must use mutable refs (`useRef`) inside `useFrame` loops for frame-rate animation; never trigger React `useState` updates at 60fps.
- **Maintain Test Suite**: When adding new data requirements or features, update `src/data/data.test.ts` to ensure integrity assertions remain green.
