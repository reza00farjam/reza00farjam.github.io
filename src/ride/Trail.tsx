import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CycleInputs, CycleState, resolveTrailWalls } from '../lib/cyclePhysics'
import { trailTopLeanOffset } from '../lib/track'
import { soundEngine } from '../lib/soundEngine'
import { isRibbonCrash, ribbonCrashFrozen } from '../lib/battle'
import { battleRuntime } from '../lib/battleStore'

interface TrailProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  inputsRef: React.MutableRefObject<CycleInputs>
  /** Shared so the radar minimap can mirror the live ribbons (boost-only). */
  ribbonsRef: React.MutableRefObject<TrailRibbon[]>
  /** Battle: orange foe trail variant. */
  variant?: 'cyan' | 'orange'
  /** Battle: live per-ribbon length cap (grows with boost capacity). */
  getMaxLength?: () => number
  /** Battle: the foe's ribbons are solid to the local bike too. */
  foeRibbonsRef?: React.MutableRefObject<TrailRibbon[]>
  /** Battle: local bike hit a trail fast enough to crash. */
  onCrash?: (x: number, z: number, into: 'own' | 'foe') => void
  /** Remote (foe) bike trail: purely visual, never collides. */
  noCollide?: boolean
}

export interface TrailRibbon {
  points: THREE.Vector3[]
  /** Bike lean (rad) at emission time, index-aligned with `points` — the wall banks with the bike */
  leans: number[]
  isEmitting: boolean
  maxLength: number
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 uCore;
  uniform vec3 uCyan;
  varying vec2 vUv;

  void main() {
    // Glass body: quick tint from core near the base into cyan, then uniform
    vec3 col = mix(uCore, uCyan, smoothstep(0.0, 0.45, vUv.y));
    
    // Along-length fade from head (vUv.x = 0) to tail (vUv.x = 1)
    float alpha = clamp(1.0 - vUv.x * 0.8, 0.0, 1.0);

    // Solid translucent glass body (no smoky vertical fade-out)
    alpha *= 0.5;

    // Crisp glowing rim along the very top edge, like the edge of a glass panel
    float rim = smoothstep(0.86, 0.97, vUv.y);
    col = mix(col, uCore, rim * 0.9);
    alpha = mix(alpha, min(0.95, alpha + 0.4), rim);

    // Slight base glow where the wall meets the floor line
    float base = 1.0 - smoothstep(0.0, 0.12, vUv.y);
    col = mix(col, uCore, base * 0.35);

    // Keep overall intensity restrained so bloom stays subtle
    col *= 0.85;

    gl_FragColor = vec4(col, alpha);
  }
`

// Vertex budget scales with ribbon length so long ribbons never silently hit
// the tessellation cap (ribbons render in order; overflow ribbons are dropped).
// Battle ribbons stretch with fuel capacity, so the budget covers two maxed bikes.
const MAX_TOTAL_POINTS = 2000
const MAX_RIBBON_LENGTH = 67.5

// Emission-point scratch, reused every frame (points store clones, never this)
const scratchWheelPos = new THREE.Vector3()
// Below this actual velocity, sustained wall contact counts as a stalled grind
const GRIND_STALL_SPEED = 10.0
const MIN_SEGMENT_DIST = 0.22
const RIBBON_HEIGHT = 0.84 // Matches rear wheel height (top of rear wheel at y=0.85)
// Ribbon bend limit: a wall can only curve so far before it snaps. THREE cut
// demands gate emission, because each alone misses cases the others catch:
// 1. TIP CLEARANCE (the exact condition) — the bike's rear corners vs the
//    ribbon's newest segments. At slow drift speeds the wall curls inside the
//    tail's swing and the rear wheel's tip runs into it before any proxy
//    trips; this measures that intrusion directly, at any speed/angle.
// 2. SLIP — the angle between the bike's heading and its actual velocity,
//    i.e. the bend the wall's head takes against the bike plane. A hard
//    powerslide runs 50–70° of slip even at speed (curvature alone stays low
//    there — the emitter still traces a wide arc); any normal turn is ≤~12°
//    (yaw-rate/grip). This is the "hard drift" cut.
// 3. CURVATURE — direction change per laid unit at the emitter. Catches the
//    slow coil a bled-out drift or burnout pivot traces around the wheel.
// Crossing any threshold cuts emission; a fresh ribbon is born only when the
// proxy demands relax under the (lower) resume thresholds after the minimum
// hold (a reborn ribbon's own head starts at the tip, so clearance needs no
// resume term — the hold already paces re-birth).
const RIBBON_CUT_SLIP = THREE.MathUtils.degToRad(50.0) // heading↔velocity angle — hard-drift cut
const RIBBON_RESUME_SLIP = THREE.MathUtils.degToRad(42.0) // hysteresis: re-birth only below this
// Curvature + tip clearance do the actual cutting under the lean-driven physics
// (post-2026-11-04 drifts run ~25–36° slip, under the 50° net). Tightened in
// two small steps 2026-11-04 at Reza's request ("a little sooner", then "just
// a little earlier still"): curvature 0.31→0.24→0.21 (drift cut boundary
// ~12.5→~17→~19 u/s); clearance 0.15→0.22→0.26m.
const RIBBON_CUT_CURVATURE = 0.21 // 1/radius — sharper bends snap the ribbon
const RIBBON_RESUME_CURVATURE = 0.16 // hysteresis: re-birth only below this
const RIBBON_TIP_CLEARANCE = 0.26 // m — cut BEFORE a rear corner actually crosses the wall
const TIP_CORNER_LAT = 0.55 // rear corner lateral offset (physics bbox half-width)
const TIP_CORNER_BACK = 1.36 // rear corner longitudinal station (bbox half-length)
const TIP_SEGMENTS = 10 // newest wall segments tested against the corners
const RIBBON_CUT_MIN_HOLD = 0.35 // s — a snapped ribbon stays cut at least this long
// (bend demands oscillate across their thresholds at the boundary; without the
// hold, emission strobes a chain of tiny wall nubs there)
const STRIP_HALF_WIDTH = 0.015 // Hair-thin floor line so the trail reads in straight lines
const STRIP_V = 0.1 // Near white-hot core color for the floor line

export const Trail: React.FC<TrailProps> = ({
  cycleStateRef,
  inputsRef,
  ribbonsRef,
  variant = 'cyan',
  getMaxLength,
  foeRibbonsRef,
  onCrash,
  noCollide = false,
}) => {
  const meshRef = useRef<THREE.Mesh>(null)
  // Emitter-path bend tracker: previous position + travel direction, and the
  // EMA-smoothed curvature + hysteresis cut flag derived from them each frame
  const bendRef = useRef({
    px: 0,
    pz: 0,
    dx: 0,
    dz: 0,
    hasDir: false,
    curv: 0,
    cut: false,
    cutAt: 0,
  })
  // Dev-probe mirror of the frame's tail-clearance result (Infinity = no ribbon)
  const tipClearRef = useRef(Infinity)
  // Vertex count written last frame — lets the upload below shrink instead of
  // re-sending the whole buffer when ribbons dissolve
  const prevWrittenVertsRef = useRef(0)

  // Main trail geometry: 4 verts per point = floor strip L/R + wall base/top
  const { geometry, positions, uvs, indices } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const vertexCount = MAX_TOTAL_POINTS * 4
    const pos = new Float32Array(vertexCount * 3)
    const uv = new Float32Array(vertexCount * 2)
    const ind = new Uint16Array(MAX_TOTAL_POINTS * 12)

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setIndex(new THREE.BufferAttribute(ind, 1))

    return { geometry: geo, positions: pos, uvs: uv, indices: ind }
  }, [])

  const uniforms = useMemo(
    () =>
      variant === 'orange'
        ? {
            uCore: { value: new THREE.Color('#ffe0b8') },
            uCyan: { value: new THREE.Color('#ff8a1f') },
          }
        : {
            uCore: { value: new THREE.Color('#9fe8f8') },
            uCyan: { value: new THREE.Color('#2bb9d4') },
          },
    [variant],
  )

  useFrame((_, delta) => {
    if (!meshRef.current) return

    // Dev-only live ribbon data for CDP inspection. The foe's orange trail
    // mounts later than the player's, so it gets its OWN handle — otherwise
    // its (usually empty) buffer would shadow the player's ribbons.
    if (import.meta.env.DEV) {
      const payload = {
        ribbonsRef,
        cycleStateRef,
        inputsRef,
        meshRef,
        at: performance.now(),
        pos: cycleStateRef.current.x.toFixed(1) + ',' + cycleStateRef.current.z.toFixed(1),
        curv: bendRef.current.curv.toFixed(3),
        cut: bendRef.current.cut,
        tipClear: tipClearRef.current === Infinity ? 'inf' : tipClearRef.current.toFixed(2),
        tipInWall: tipClearRef.current < RIBBON_TIP_CLEARANCE,
        slip: Math.round(
          (Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                ((cycleStateRef.current.vx ?? 0) * -Math.sin(cycleStateRef.current.yaw) +
                  (cycleStateRef.current.vz ?? 0) * -Math.cos(cycleStateRef.current.yaw)) /
                  Math.max(
                    0.001,
                    Math.hypot(cycleStateRef.current.vx ?? 0, cycleStateRef.current.vz ?? 0),
                  ),
              ),
            ),
          ) *
            180) /
            Math.PI,
        ),
      }
      if (variant === 'orange') {
        ;(window as unknown as { __trailDebugOrange?: unknown }).__trailDebugOrange = payload
      } else {
        ;(window as unknown as { __trailDebug?: unknown }).__trailDebug = payload
      }
    }

    const cycle = cycleStateRef.current
    const isBoosting = inputsRef.current.boost || cycle.isAutopilot
    const ribbons = ribbonsRef.current

    // Emission point at the bike's rear wheel edge (1.35 behind center), plus
    // a rigid anchor point 1.12 behind center (inside the bike). The wall
    // segment between them is rendered fixed to the bike's body so the ribbon
    // crosses the rear wheel at its vertical center; the laid trail reacts to
    // turns only from the 1.35 emission point outward.
    const rearX = cycle.x + Math.sin(cycle.yaw) * 1.35
    const rearZ = cycle.z + Math.cos(cycle.yaw) * 1.35
    const anchorX = cycle.x + Math.sin(cycle.yaw) * 1.13
    const anchorZ = cycle.z + Math.cos(cycle.yaw) * 1.13
    const currentWheelPos = scratchWheelPos.set(rearX, 0, rearZ)

    // ============ Ribbon management ============
    // Gate on ACTUAL velocity, not the engine-speed scalar: boosting into a
    // wall/trail pins the bike while `speed` hovers high (accel vs collision
    // penalty), which used to keep emission alive on a stationary bike.
    // Contact alone must NOT cut the ribbon — a fast graze barely slows the
    // bike. Only a contact that actually stalls it (sustained touch AND real
    // velocity under GRIND_STALL_SPEED) closes emission; grind crawls measure
    // up to ~8 u/s at the worst angle, fast grazes stay 20+.
    // Drifting while boosting LAYS RIBBON TOO (reverted 2026-11-04 — Reza:
    // boost-drift carves curved walls in both arenas) up to the BEND LIMIT
    // below: a stall, a released boost, or a bend the ribbon can't take
    // (hard-drift slip / tight coil) closes it.
    const groundSpeed = Math.hypot(cycle.vx ?? 0, cycle.vz ?? 0)
    const stalledByWall =
      cycle.lastWallContactAt !== undefined &&
      performance.now() - cycle.lastWallContactAt < 200 &&
      groundSpeed < GRIND_STALL_SPEED

    // Bend limit — two demands, either can snap the ribbon (see constants above):
    // curvature of the EMITTER's path (EMA ~0.1s) + the heading↔velocity slip
    // angle (smooth already — velocity is grip-lerped). cut=true stops emission;
    // it re-forms when BOTH relax under the resume thresholds, after the hold.
    const bend = bendRef.current
    const mvX = rearX - bend.px
    const mvZ = rearZ - bend.pz
    const mvLen = Math.hypot(mvX, mvZ)
    if (mvLen > 1e-4) {
      const ux = mvX / mvLen
      const uz = mvZ / mvLen
      let inst = 0
      if (bend.hasDir) {
        // Direction change since last frame over segment-scale travel — the
        // 0.22 floor keeps single-frame jitter from spiking the curvature
        const dot = Math.max(-1, Math.min(1, ux * bend.dx + uz * bend.dz))
        inst = Math.acos(dot) / Math.max(mvLen, MIN_SEGMENT_DIST)
      }
      bend.curv += (inst - bend.curv) * Math.min(1, delta * 10)
      bend.dx = ux
      bend.dz = uz
      bend.hasDir = true
    }
    bend.px = rearX
    bend.pz = rearZ

    // Slip: angle between the heading and the velocity. Undefined at crawl
    // (v < 1) — the curvature gate covers the coil case there.
    let slipCut = false
    let slipResume = true
    if (groundSpeed > 1.0) {
      const dot = Math.max(
        -1,
        Math.min(
          1,
          ((cycle.vx ?? 0) * -Math.sin(cycle.yaw) + (cycle.vz ?? 0) * -Math.cos(cycle.yaw)) /
            groundSpeed,
        ),
      )
      const slip = Math.acos(dot)
      slipCut = slip > RIBBON_CUT_SLIP
      slipResume = slip < RIBBON_RESUME_SLIP
    }

    // Exact tail clearance: rear corners of the bike footprint vs the newest
    // segments of the EMITTING ribbon. The wall is born at the rear wheel's
    // tip — when a tight low-speed curl brings a corner back over its own
    // wall, this fires (with clearance margin) before the tip actually enters.
    let tipInWall = false
    let minTipClear = Infinity
    {
      const last = ribbons.length > 0 ? ribbons[ribbons.length - 1] : null
      tipClearRef.current = Infinity
      if (last && last.isEmitting) {
        const pts = last.points
        const n = pts.length
        const cosY = Math.cos(cycle.yaw)
        const sinY = Math.sin(cycle.yaw)
        for (let c = 0; c < 2 && !tipInWall; c++) {
          const lat = c === 0 ? -TIP_CORNER_LAT : TIP_CORNER_LAT
          const cx = cycle.x + sinY * TIP_CORNER_BACK + cosY * lat
          const cz = cycle.z + cosY * TIP_CORNER_BACK - sinY * lat
          for (let i = n - 1; i > 0 && i > n - 1 - TIP_SEGMENTS; i--) {
            const ax = pts[i - 1].x
            const az = pts[i - 1].z
            const bx = pts[i].x
            const bz = pts[i].z
            const abx = bx - ax
            const abz = bz - az
            const len2 = abx * abx + abz * abz
            const t =
              len2 > 1e-9 ? Math.max(0, Math.min(1, ((cx - ax) * abx + (cz - az) * abz) / len2)) : 0
            const dx = ax + abx * t - cx
            const dz = az + abz * t - cz
            const clear = Math.hypot(dx, dz)
            if (clear < minTipClear) minTipClear = clear
            if (clear < RIBBON_TIP_CLEARANCE) {
              tipInWall = true
              break
            }
          }
        }
        tipClearRef.current = minTipClear
      }
    }

    if (!bend.cut) {
      if (bend.curv > RIBBON_CUT_CURVATURE || slipCut || tipInWall) {
        bend.cut = true
        bend.cutAt = performance.now()
      }
    } else if (
      performance.now() - bend.cutAt > RIBBON_CUT_MIN_HOLD * 1000 &&
      bend.curv < RIBBON_RESUME_CURVATURE &&
      slipResume
    ) {
      bend.cut = false
    }

    if (isBoosting && groundSpeed > 0.2 && !stalledByWall && !bend.cut) {
      const lastRibbon = ribbons.length > 0 ? ribbons[ribbons.length - 1] : null
      // Battle ribbons grow with the rider's fuel capacity
      const maxLen = getMaxLength ? getMaxLength() : MAX_RIBBON_LENGTH

      if (!lastRibbon || !lastRibbon.isEmitting) {
        ribbons.push({
          points: [currentWheelPos.clone(), currentWheelPos.clone()],
          leans: [cycle.lean, cycle.lean],
          isEmitting: true,
          maxLength: maxLen,
        })
      } else {
        const pts = lastRibbon.points
        const leans = lastRibbon.leans
        const lastIndex = pts.length - 1
        const prevPt = pts.length > 1 ? pts[lastIndex - 1] : pts[0]
        const dist = prevPt.distanceTo(currentWheelPos)

        if (dist >= MIN_SEGMENT_DIST) {
          // A ribbon is born as two identical points. At boost speed the first
          // update already exceeds MIN_SEGMENT_DIST, so without this guard the
          // birth duplicate [P0, P0] would freeze forever — point 0's travel
          // direction stays a zero vector and the wall's first point renders
          // vertical instead of banking with the bike's lean at birth.
          if (pts.length === 2 && pts[0].equals(pts[1])) {
            pts[1].copy(currentWheelPos)
            leans[1] = cycle.lean
          } else {
            pts.push(currentWheelPos.clone())
            leans.push(cycle.lean)
          }
        } else {
          pts[lastIndex].copy(currentWheelPos)
          leans[lastIndex] = cycle.lean
        }

        // Trim ribbon if it exceeds max length (live cap — a booster pickup
        // extends the ribbon being laid)
        let totalD = 0
        let trimIdx = 0
        for (let i = pts.length - 1; i > 0; i--) {
          totalD += pts[i].distanceTo(pts[i - 1])
          if (totalD > maxLen) {
            trimIdx = i
            break
          }
        }
        if (trimIdx > 0) {
          pts.splice(0, trimIdx)
          leans.splice(0, trimIdx)
        }
      }
    } else {
      const lastRibbon = ribbons.length > 0 ? ribbons[ribbons.length - 1] : null
      if (lastRibbon && lastRibbon.isEmitting) {
        lastRibbon.isEmitting = false
      }
    }

    // Dissipate non-emitting ribbons from tail to head — EXCEPT for whoever
    // just CRASHED in a duel: both screens must show the wreck with its ribbon
    // still lying there. On the crasher's own screen ('me') their ribbons
    // freeze; on the winner's screen ('foe') the foe's RECONSTRUCTED ribbons
    // freeze too — relying on the foe's last boosted snapshot to keep emitting
    // broke the moment they released boost (or hit fuel-out) before impact:
    // the final snapshot carried boost=0, emission closed, and the ribbon
    // dissolved from under the wreck. resetBattleRuntime() (rematch/exit)
    // resumes dissipation on both sides.
    const crashFrozen = ribbonCrashFrozen(battleRuntime.crashSide, noCollide)
    for (let r = ribbons.length - 1; r >= 0; r--) {
      const ribbon = ribbons[r]
      if (!ribbon.isEmitting && !crashFrozen) {
        const dropCount = Math.max(1, Math.round(delta * 38))
        for (let d = 0; d < dropCount && ribbon.points.length > 0; d++) {
          ribbon.points.shift()
          ribbon.leans.shift()
        }
      }
      if (ribbon.points.length < 2) {
        ribbons.splice(r, 1)
      }
    }

    // ============ Trail walls: ribbons block the bike like arena walls ============
    // The remote bike's trail never collides here — its physics run on the
    // foe's machine; only the local bike's own sim resolves contacts.
    if (!noCollide) {
      const isBattle = !!foeRibbonsRef
      resolveTrailWalls(cycle, ribbons, rearX, rearZ, (s) => {
        soundEngine.playWallImpact(s)
        // Battle: own walls are lethal too — a fast hit is a crash either way.
        // The gate is the bike's DRIVE SPEED (glides down past 26 after boost
        // release), never the impact component s — normals lie when a wall is
        // born inside the capsule (see isRibbonCrash)
        if (isBattle && isRibbonCrash(cycle.speed)) onCrash?.(cycle.x, cycle.z, 'own')
      })
      if (foeRibbonsRef) {
        resolveTrailWalls(cycle, foeRibbonsRef.current, rearX, rearZ, (s) => {
          soundEngine.playWallImpact(s)
          // Bounces stay LOCAL PHYSICS ONLY (push-out + sound); the SCORE for
          // touching the foe's wall is owner-authoritative — the foe's probe
          // against their real ribbons decides it (battleNet.reportFoeWallTouch)
          if (isRibbonCrash(cycle.speed)) onCrash?.(cycle.x, cycle.z, 'foe')
        })
      }
    }

    // ============ Tessellation: floor strip + vertical wall per point ============
    let totalPoints = 0
    for (const r of ribbons) totalPoints += r.points.length

    if (totalPoints < 2 || ribbons.length === 0) {
      meshRef.current.visible = false
      geometry.setDrawRange(0, 0)
      return
    }

    meshRef.current.visible = true

    let posIdx = 0
    let uvIdx = 0
    let indIdx = 0
    let baseVertex = 0
    for (const ribbon of ribbons) {
      const pts = ribbon.points
      const count = pts.length
      if (count < 2) continue
      // Emitting ribbons render one extra rigid anchor point INSIDE the bike
      // (1.12 behind center): the wall segment from the emission point (1.35)
      // to the anchor follows the bike's current yaw/lean every frame, so the
      // wall crossing the rear wheel is always in the bike's own plane —
      // vertical center from the chase cam — no matter how the laid trail lags.
      const renderCount = ribbon.isEmitting ? count + 1 : count
      if (baseVertex + renderCount * 4 > MAX_TOTAL_POINTS * 4) break

      for (let i = 0; i < renderCount; i++) {
        const isAnchor = ribbon.isEmitting && i === count
        const px = isAnchor ? anchorX : pts[i].x
        const py = isAnchor ? 0 : pts[i].y
        const pz = isAnchor ? anchorZ : pts[i].z
        const uFrac = (renderCount - 1 - i) / (renderCount - 1)

        // Perpendicular from central difference of neighbours (XZ plane).
        // The anchor point and the live emission head both take the bike's
        // CURRENT heading — rigid with the bike's body; only the laid trail
        // behind reacts to turns (path chords lag the bike's plane).
        const isLiveHead = ribbon.isEmitting && i >= count - 1
        let dirX: number
        let dirZ: number
        if (isLiveHead) {
          dirX = -Math.sin(cycle.yaw)
          dirZ = -Math.cos(cycle.yaw)
        } else {
          const prevP = pts[Math.max(0, i - 1)]
          const nextP = pts[Math.min(count - 1, i + 1)]
          dirX = nextP.x - prevP.x
          dirZ = nextP.z - prevP.z
          const dirLen = Math.hypot(dirX, dirZ)
          if (dirLen > 1e-6) {
            dirX /= dirLen
            dirZ /= dirLen
          } else {
            // Degenerate travel direction (the duplicated birth points on the
            // ribbon's very first frames): fall back to the bike's heading so
            // the wall is born BANKED — never a vertical first-glimpse
            dirX = -Math.sin(cycle.yaw)
            dirZ = -Math.cos(cycle.yaw)
          }
        }
        const perpX = -dirZ * STRIP_HALF_WIDTH
        const perpZ = dirX * STRIP_HALF_WIDTH

        // Vertex order per point: [stripL, stripR, wallBase, wallTop]
        positions[posIdx] = px + perpX
        positions[posIdx + 1] = py + 0.02
        positions[posIdx + 2] = pz + perpZ

        positions[posIdx + 3] = px - perpX
        positions[posIdx + 4] = py + 0.02
        positions[posIdx + 5] = pz - perpZ

        positions[posIdx + 6] = px
        positions[posIdx + 7] = py + 0.02
        positions[posIdx + 8] = pz

        // Wall top banks with the bike's lean at emission time — the wall
        // pivots at the floor line and its glowing top edge tilts sideways
        const leanHere = isAnchor ? cycle.lean : (ribbon.leans[i] ?? 0)
        const leanOff = trailTopLeanOffset(dirX, dirZ, leanHere, RIBBON_HEIGHT)
        positions[posIdx + 9] = px + leanOff.x
        positions[posIdx + 10] = py + RIBBON_HEIGHT
        positions[posIdx + 11] = pz + leanOff.z

        // UVs: strip verts near white-hot core (STRIP_V), wall base v = 0, top v = 1
        uvs[uvIdx] = uFrac
        uvs[uvIdx + 1] = STRIP_V
        uvs[uvIdx + 2] = uFrac
        uvs[uvIdx + 3] = STRIP_V
        uvs[uvIdx + 4] = uFrac
        uvs[uvIdx + 5] = 0.0
        uvs[uvIdx + 6] = uFrac
        uvs[uvIdx + 7] = 1.0

        posIdx += 12
        uvIdx += 8
      }

      // Indices per segment: floor strip quad + wall quad (incl. the anchor segment)
      for (let s = 0; s < renderCount - 1; s++) {
        const v = baseVertex + s * 4
        // Floor strip: (L0, R0, R1) and (L0, R1, L1)
        indices[indIdx++] = v
        indices[indIdx++] = v + 1
        indices[indIdx++] = v + 5
        indices[indIdx++] = v
        indices[indIdx++] = v + 5
        indices[indIdx++] = v + 4
        // Wall: (B0, T0, T1) and (B0, T1, B1)
        indices[indIdx++] = v + 2
        indices[indIdx++] = v + 3
        indices[indIdx++] = v + 7
        indices[indIdx++] = v + 2
        indices[indIdx++] = v + 7
        indices[indIdx++] = v + 6
      }

      baseVertex += renderCount * 4
    }

    // Upload ONLY the written slice via updateRanges: a bare needsUpdate
    // re-uploads the full ~200KB position+uv+index buffers every frame even
    // when a couple of segments changed — with two trails (duels) that was
    // ~24MB/s of pure GPU transfer. Zero just the SHRINK delta (verts that
    // held data last frame) so old triangles never leak — and never anything
    // before the written region: collapsing live verts to world origin sprays
    // triangles to (0, 0, 0).
    const writtenVerts = baseVertex
    const endVerts = Math.max(writtenVerts, prevWrittenVertsRef.current)
    if (endVerts > writtenVerts) {
      const from = writtenVerts * 3
      const to = endVerts * 3
      for (let i = from; i < to; i++) positions[i] = 0
    }
    prevWrittenVertsRef.current = writtenVerts

    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    posAttr.clearUpdateRanges()
    posAttr.addUpdateRange(0, endVerts * 3)
    posAttr.needsUpdate = true

    const uvAttr = geometry.attributes.uv as THREE.BufferAttribute
    uvAttr.clearUpdateRanges()
    uvAttr.addUpdateRange(0, endVerts * 2)
    uvAttr.needsUpdate = true

    const idxAttr = geometry.index as THREE.BufferAttribute
    idxAttr.clearUpdateRanges()
    idxAttr.addUpdateRange(0, indIdx)
    idxAttr.needsUpdate = true

    geometry.setDrawRange(0, indIdx)
  })

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
