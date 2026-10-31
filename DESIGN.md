# DESIGN.md: The Grid (Tron: Legacy–inspired portfolio)

This is the visual and interaction specification. `AGENTS.md` covers architecture, subsystem mechanics, and acceptance criteria. Where the two overlap on anything visual, this file wins.

Values marked **start** are starting points. Tune them by eye against the principles, not the other way round.

## 1. Intent

The site is a ride through the Grid from Tron: Legacy (2010). The visitor is the cycle. Content waits at stations across the arena.

**The one memorable thing is the ride**: the chase camera, the light trail, the grid rushing underneath, and the speed change when jumping between stations. Everything else stays quiet and disciplined so the ride reads. If a piece of decoration doesn't support the ride or the content, cut it.

Legacy references, in words only (do not copy film assets): a near-black void; razor-thin luminous lines with a white-hot core and a cyan halo; a mirror-dark floor with a fine grid that fades into haze; sharp, chamfered geometry; vertical walls of light left behind moving vehicles; almost no color beyond cyan, white, and a rare orange.

## 2. Color tokens

| Token   | Hex (start) | Use                                                      |
| ------- | ----------- | -------------------------------------------------------- |
| `void`  | `#03070d`   | Page and scene background                                |
| `deep`  | `#071a2b`   | Panel fill (at 70–85% opacity), floor tint               |
| `cyan`  | `#35e4ff`   | Lines, glow, structure, current station                  |
| `core`  | `#eafcff`   | White-hot centre of lines, headings, emphasized text     |
| `ember` | `#ff8a1f`   | Links that leave the site, focus rings, one-off warnings |
| `ice`   | `#c9e8f0`   | Body text                                                |
| `muted` | `#6e95a8`   | Secondary text (about 6:1 on `void`; keep ≥ 4.5:1)       |

Color carries meaning, not mood: **cyan means structure and information, ember means "this leaves the site or needs your attention"**. Do not use ember for decoration. Do not introduce other hues, gradients as decoration, or purple/pink neon.

Glow recipe for UI: `text-shadow: 0 0 6px rgb(53 228 255 / .55)` on key headings only; `box-shadow: 0 0 0 1px cyan/40%, 0 0 18px cyan/15%` on panels. Body text has no glow.

## 3. Typography

- **Display: Syncopate** (wide geometric sans, OFL). Used for the name, station titles, and project titles. Bold 700 for the name; Regular 400 for station titles. Fallbacks in order: Michroma, then `ui-sans-serif`.
- **Text and HUD: Saira** (OFL, condensed-to-normal sans). Used for body, summaries, tags, nav, and small data. Fallbacks: Chakra Petch, then `ui-sans-serif`.
- Self-host with `@fontsource` packages, `font-display: swap`, Latin subset only. Preload the display font used above the fold.

Scale (start, rem): `0.8125` small · `1` body · `1.125` lead · `1.5` panel title · `2.25` station title · `clamp(2.5, 6vw, 5)` name.

Rules:

- Syncopate is designed for wide capitals, so display text may be uppercase. Everything else is sentence case. No tracked-out all-caps eyebrow labels above headings, no "WORD — fragment" labels, no arrows appended to links or buttons.
- Body line length ≤ 70 characters. Body line-height 1.55; display line-height 1.1.
- Headings are plain. Do not accent a single word in color or italic.
- Numbers or dates as markers appear only in the Experience timeline, because that content is a real sequence. Do not number stations, projects, or skills.

## 4. Shape language

- **Chamfered rectangles, not rounded cards.** Panels and chips use a 10px chamfer on two opposite corners (`clip-path: polygon(...)`), with a 1px cyan border drawn as an inset layer so the clip does not cut it.
- Panels have bright corner ticks (short 2px cyan segments, 14px long) at the two unchamfered corners, instead of a full bright border.
- Border radius is `0` everywhere. Hierarchy comes from size, opacity, and line brightness, not from nested boxes.
- Spacing on a 4px base. Panels and dialogs use 24px padding.

## 5. Layout

### 5.1 Ride view, desktop

The 3D scene fills the screen; the cycle rides at screen center under a chase camera. Content is not a persistent side panel — driving up to a station monument opens its content in a centered modal terminal (the station inspector) with keyboard scrolling.

- Name and role sit top-left in small display size; they hide during battles.
- Station nav rail: left edge, vertical line with a node per station. Current node is `core` with a cyan halo; others are `cyan` at 40%. Labels are sentence case, `muted`, `core` when current. Use `aria-current="location"`. Clicking a node autopilots the cycle to that station. The rail hides inside the battle alley.
- Radar top-right; audio/view/help toggles in a column below it. Toasts and the battle strip park top-left. Top-center belongs to the nav arrow during battles.

### 5.2 Ride view, mobile (≤1024px, JS flag)

Name and role hidden. Radar top-right with a toggles row (Help · Audio · View) beneath; toasts and the battle strip top-left. Left thumb drives a joystick (steer; in battles pushing past the top rim boosts), a drift/brake pedal sits by the right thumb. Camera radius tightens to 3.8.

### 5.3 Read view

Single column, max width 44rem, left-aligned. Fixed `void` background with a grid floor at the bottom of the viewport, drawn once onto a 2D canvas (`src/simple/GridFloor.tsx`): every line projected individually with the same `perspective(300px) rotateX(55deg)` geometry the old transformed pattern had, rendered as 1px ink-normalized hairlines that thin and fade toward the vanishing line. A CSS pulse band shares the same projection. No WebGL, no per-frame cost. Stations stack as sections separated by a single 1px cyan line with a short bright segment. The same panel component styling is used, without clipping tricks that break text selection.

## 6. Station content

- **Intro**: name (display, large), role, tagline. The cycle spawns in front of the Intro billboard.
- **About**: paragraphs from `profile.about`. Left-aligned.
- **Skills**: groups as definition-list style rows: group label in `muted`, items as plain text separated by spacing, wrapping naturally. Not pills, not icons.
- **Experience**: a vertical timeline, the one place with dated markers. Each entry shows dates (`2021-03 to now`) in `muted`, role and organization in `core`, summary in `ice`, optional highlights as a short list.
- **Projects**: one card per project. Each card has, top to bottom: title (display), year and role in `muted` when present, summary, tags as plain `muted` text separated by wide spacing, then links. The primary link reads "Open project" (mobile apps) or "Visit website" (web) and the optional repo link reads "View source"; when both are absent the whole links row hides. Links open in a new tab with `rel="noopener noreferrer"` and use `ember` to signal that they leave the site. Screenshots render in code-built frames — phone decks for mobile apps (`thumbnailKind: 'mobile'`), a stacked browser deck for web projects — with up to three shots per project (`thumbnail`, `thumbnailSecondary`, `thumbnailTertiary`); with no thumbnail, a generated glyph (see §10).
- **Links**: list of `profile.links` using each link's own `label`. `mailto:` links are `ember` like other outbound links.

Copy rules: sentence case, plain verbs, no marketing filler. Labels name what the thing is or does. Empty states say what is missing, for example "No projects yet" with no apology.

## 7. 3D scene

The environment is fully procedural (shader grid floor, fog, boundary walls, beams). The light cycle and rider are a local OBJ model with 1:1 UV textures from `public/models/` — no external fetches, no CDNs.

### 7.1 Environment

- Background `void`. Exponential fog in `void` colour, density **start** 0.018, so the grid dissolves into haze at roughly 80 units.
- **Grid floor**: a large plane with a shader (or an instanced line set) drawing two grid levels: fine lines every 1 unit at 25% brightness and major lines every 10 units at 60%. Lines are about 0.02 units wide with anti-aliasing via `fwidth`. Floor base colour `deep` at very low brightness, slightly reflective feel faked by a soft gradient toward the horizon. The grid must be infinite-looking: it follows the cycle's position, snapping to the cell size so lines do not swim.
- **Distant beams**: 30–60 instanced thin vertical boxes (width ~0.05, heights 20–120) scattered 40–150 units away from the track, emissive `cyan` at low intensity, fading with fog. They give parallax and scale. They do not animate by themselves.
- No skybox, no stars, no clouds.

### 7.2 Arena and stations

- Free-roam bounded arena, 240×240 units ($[-120, 120]$ on X and Z), enclosed by glowing cyan energy boundary walls. No track, no gates, no scroll-driven motion — the rider drives.
- Each station is a **spatial monument**: a flat landing pad on the grid (a dark disc with three concentric glowing rings — deliberately NO raised platform), pylons and a holographic billboard, plus a high-altitude vertical beacon line visible across the arena. Billboards light up on approach; a proximity prompt invites inspection.
- The cycle spawns in front of the Intro billboard; station-nav selection autopilots to a parking point in front of each billboard and docks facing it.

### 7.3 Cycle

- The 2nd Generation light cycle and rider load from `public/models/light_cycle_with_rider.obj` (shipped as `.obj.gz`, parsed once per page, cloned per mount) with self-hosted 1:1 UV textures (`flipY = false`, sRGB color maps, anisotropic filtering).
- Hierarchy, wheel axle pivots, air-brake hinges, and the measured lean-lift table are invariants — see AGENTS.md §4.2. The cycle banks into curves (20° normal, 28° in a drift) but stays flat on the floor: no pitch dynamics, no wheelies, no brake dive.

### 7.4 Trail

- Vertical ribbon walls of light, 0.84 high (rear-wheel top), emitted **only while boosting** — laid path segments with per-point lean so the wall banks with the bike; a rigid anchor segment keeps the wall crossing the rear wheel cleanly.
- Walls are solid for collision (including the rider's own). Ribbons dissolve tail-first when boost stops; multiple concurrent ribbons are supported. Length is capped per ribbon (67.5 units in the arena; fuel capacity in battles).

### 7.5 Camera and speed

- Chase camera: spherical orbit math centered on the cycle — distance 4.6 (3.8 mobile), polar `PI/2 − 0.28`, FOV 45°.
- Free orbit: drag rotates 360°, wheel zooms 1.8–25 with damping; when the bike moves, the camera damps back to chase alignment. Speed feedback on boost: FOV widening, edge streaks, trail lengthening — all eased, no screen shake.

### 7.6 Post-processing

- Bloom (mipmap blur): intensity **start** 0.9, `luminanceThreshold` 0.25, `luminanceSmoothing` 0.2, radius 0.7. Bloom is the main source of the Legacy look, so emissive materials use `toneMapped={false}` and colours multiplied above 1 for the hot cores.
- Subtle vignette (offset 0.3, darkness 0.6). No chromatic aberration, no film grain, no scanlines.
- Quality tiers are a one-way ratchet: (1) full bloom + vignette composer; (2+) no composer at all — the vignette becomes a CSS radial-gradient overlay and bloom is dropped; touch devices cap DPR at 1.25 and anisotropy at 8. Never re-enter tier 1 after a decline.

## 8. Motion and interaction

- All motion answers a user action: scrolling, nav selection, mode toggle, hover or focus feedback. No splash or boot intro.
- **Panel changes** (station to station): crossfade only, ≤ 200 ms. No slide-ups, no staggered entrances, no per-element reveals.
- **Hover and focus**: links and nav items change color and show an underline or a brighter border within 100 ms. Nothing scales or floats.
- **Focus ring**: 2px `ember`, 3px offset, always visible, on every interactive element.
- Never animate more than one thing at once for attention. No pulsing or flashing; keep any brightness change under 3 Hz.

## 9. Accessibility of the visuals

- All text ≥ 4.5:1 against its backdrop, including over the 3D scene. The panel's `void` backdrop at 60% exists for this; verify with real screenshots, not assumptions.
- Panels must be selectable text, not canvas text.
- `prefers-reduced-motion: reduce` → Read view by default.
- Do not rely on color alone: current station is also indicated by a brighter node and the label's weight, and outbound links also get an underline.
- The 3D canvas is decorative: `aria-hidden="true"`. All information exists in the DOM.

## 10. Generated project glyph

When a project has no `thumbnail`, render an inline SVG (16:9) from a hash of its `id`: a small perspective grid in `cyan` at 30% with one brighter line and one node placed deterministically by the hash. Same id always gives the same glyph. No text inside the SVG.

## 11. Copy for fixed UI

Use these exact strings so naming stays consistent: "Skip the ride", "Ride", "Read", "Open project" (mobile apps) / "Visit website" (web), "View source", "No projects yet". Footer: "Visual style inspired by Tron: Legacy. Not affiliated with Disney."

## 12. Do not

- Use rounded cards, soft grey drop shadows, identical card grids, or gradient washes.
- Use film assets, logos, stills, the Tron or Disney marks, or Daft Punk or any film audio.
- Add parallax mouse effects, custom cursors, particles beyond those specified, glitch effects, or typewriter text.
- Add second accent colors, light-mode, or a theme toggle.
- Hide content in the 3D scene that does not exist in the DOM.
