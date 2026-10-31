import * as THREE from 'three'
import { ARENA_HALF_SIZE, BATTLE_ALLEY_BLOCKS, DOCK_RADIUS } from './arena'

export interface CycleInputs {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  boost: boolean
  /** RAW boost key/pedal state — `boost` is the effective (gated) signal */
  boostHeld?: boolean
  brake?: boolean
}

export interface CycleState {
  x: number
  z: number
  vx?: number // Velocity X in world space
  vz?: number // Velocity Z in world space
  yaw: number // Heading angle in radians (0 = facing -Z)
  speed: number
  lean: number // Banking angle in radians
  isDrifting?: boolean
  isBurnout?: boolean // Throttle fighting brake at (near) standstill
  burnoutSpin?: number // 0..1 ease-in accumulator for the burnout pivot rate
  driftCharge?: number // 0..1 ease in/out accumulator for the powerslide
  isArriving?: boolean // Autopilot final roll-in latch
  lastWallContactAt?: number // performance.now() of the latest wall/trail contact frame
  lastBikeContactAt?: number // performance.now() of the last bike-vs-bike contact frame
  isAutopilot: boolean
  autopilotTarget: { x: number; z: number; yaw?: number; id: string } | null
}

const MAX_SPEED = 26.0
const BOOST_SPEED = 40.0
const REVERSE_MAX = -8.0
const ACCELERATION = 32.0
const BRAKE_DECEL = 40.0
// Duel drift floor (u/s): braking in battle converges here and never below —
// the brake is a drift aid, not a way to stop (anti-camping, §4.8)
const BATTLE_DRIFT_FLOOR = 10.0
const COAST_DRAG = 12.0
const BASE_TURN_RATE = 2.5
// Lean-driven steering (bike-game standard): input commands LEAN, lean rolls in
// at a limited rate, and yaw follows from lean and speed — ω = G·tan(lean)/v.
// Turn radius widens with speed (r = v²/(G·tan(lean))); entries roll in and
// exits trail out as the bike rights itself. CORNER_G is arcade-scaled: real g
// would need r ≈ 82 units at 26 u/s — undrivable in a 240-unit arena.
const CORNER_G = 92.0
// Below ~10 u/s the physics arc gets tighter than the bike can hold — floor the
// radius at R_MIN instead (r = 4 units, the old low-speed direct-steer feel).
const R_MIN = 4.0
// Roll-in ceiling (rad/s): a bike banks into a turn over ~0.16s, it never snaps
const LEAN_RATE = 2.2
const MAX_LEAN = THREE.MathUtils.degToRad(20.0)
const DRIFT_LEAN = THREE.MathUtils.degToRad(28.0)

// Measured straight off the light cycle model bbox (light_cycle_with_rider.obj:
// z -1.356..1.356, x -0.532..0.546) so collision stops with zero gap — the
// visual wheel tip / body edge exactly touches arena walls and trails.
const BIKE_HALF_LENGTH = 1.36
export { BIKE_HALF_LENGTH }
const BIKE_HALF_WIDTH = 0.55

// Wall contact response: the penalty scales with how head-on the hit was.
// Head-on keeps the classic ×0.4; a graze keeps nearly all speed and slides along.
function wallImpactFactor(normalSpeed: number, vx: number, vz: number): number {
  const v = Math.hypot(vx, vz)
  if (v < 1e-4) return 0.4
  return 1 - 0.6 * Math.min(1, normalSpeed / v)
}

export function updateCycleKinematics(
  state: CycleState,
  inputs: CycleInputs,
  delta: number,
  onAutopilotArrived?: (stationId: string) => void,
  onWallHit?: (speed: number) => void,
  /** Normal arena only: the south wall opens for the alley gate at x≈0 */
  alleyGateOpen = false,
  /** Duel mode: no burnout, brake is DRIFT ONLY (needs steer) and can never
      stop the bike — speed converges to the drift floor from either side */
  battle = false,
): void {
  const dt = Math.min(delta, 0.1)

  // Autopilot steering and speed control
  if (state.isAutopilot && state.autopilotTarget) {
    state.isDrifting = false
    state.isBurnout = false
    const dx = state.autopilotTarget.x - state.x
    const dz = state.autopilotTarget.z - state.z
    const dist = Math.hypot(dx, dz)

    if (dist <= DOCK_RADIUS) {
      state.isArriving = true
    }

    if (state.isArriving) {
      // Arrived at parking zone: natural roll-in — decelerate and swing yaw
      // toward the terminal facing direction smoothly instead of snapping
      const targetYaw =
        state.autopilotTarget.yaw !== undefined ? state.autopilotTarget.yaw : state.yaw

      let yawDiff = targetYaw - state.yaw
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI

      // Gentle rotation rate while rolling in (never instantaneous, decays as it squares up)
      state.yaw += THREE.MathUtils.clamp(yawDiff * 2.2, -1.4, 1.4) * dt
      state.lean = THREE.MathUtils.lerp(state.lean, 0, dt * 5.0)

      // Smooth deceleration to a full stop (natural coast-down, no hard cut)
      state.speed = THREE.MathUtils.lerp(state.speed, 0, dt * 3.5)

      // Fully parked once stopped and square to the terminal
      if (Math.abs(state.speed) < 0.12 && Math.abs(yawDiff) < 0.03) {
        state.speed = 0
        state.vx = 0
        state.vz = 0
        state.lean = 0
        state.isArriving = false
        state.isAutopilot = false
        const targetId = state.autopilotTarget?.id
        state.autopilotTarget = null
        if (onAutopilotArrived && targetId) onAutopilotArrived(targetId)
      }
    } else {
      // Calculate desired heading towards target (facing -Z when yaw=0)
      const desiredYaw = Math.atan2(-dx, -dz)

      // Shortest angle difference in [-PI, PI]
      let angleDiff = desiredYaw - state.yaw
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

      // Autopilot speed: cruise fast, decelerate proportionally on final
      // approach, and ease off while the heading error is large — a rider
      // slows to square up before carving, never boost-loops a 180°
      const cruiseSpeed = dist > 25 ? BOOST_SPEED : MAX_SPEED * 0.7
      const turnEase = 1 - 0.65 * Math.min(1, Math.abs(angleDiff) / (Math.PI / 2))
      const targetSpeed = THREE.MathUtils.clamp(dist * 1.0, 1.5, cruiseSpeed * turnEase)
      state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, dt * 5.0)

      // Lean-driven steering — the SAME model as manual riding (§4.3): the
      // heading error commands a lean target capped by what the speed's arc
      // supports, rolled in at LEAN_RATE, and yaw FOLLOWS lean. Replaces the
      // pre-lean-model autopilot (constant 2.5 rad/s kart yaw under a cosmetic
      // counter-lean — it banked OUT of every turn).
      const speedAbs = Math.abs(state.speed)
      const steerCmd = THREE.MathUtils.clamp(angleDiff * 2.0, -1, 1) // same sign as steerDir: left = +
      const leanUsable = Math.atan((speedAbs * speedAbs) / (R_MIN * CORNER_G))
      const targetLean = steerCmd * Math.min(MAX_LEAN, leanUsable)
      const eased = THREE.MathUtils.lerp(state.lean, targetLean, dt * 9.0)
      state.lean = THREE.MathUtils.clamp(
        eased,
        state.lean - LEAN_RATE * dt,
        state.lean + LEAN_RATE * dt,
      )
      const omegaLean = (CORNER_G * Math.tan(Math.abs(state.lean))) / Math.max(speedAbs, 0.001)
      const omega = Math.min(omegaLean, speedAbs / R_MIN)
      state.yaw += Math.sign(state.lean) * omega * dt

      // A hop started mid-drift must not stay slidey the whole way — decay the
      // charge so grip recovers on the same 0.3s ease as the manual branch
      state.driftCharge = Math.max(0, (state.driftCharge ?? 0) - dt / 0.3)
    }
  } else {
    // Manual steering
    let steerDir = 0
    if (inputs.left) steerDir += 1
    if (inputs.right) steerDir -= 1

    // In a duel the brake is DRIFT ONLY — it does nothing without steering
    // (auto-cruise keeps the throttle on), so a parked brake-hold is impossible
    const brakeHeld = battle ? !!inputs.brake && steerDir !== 0 : !!inputs.brake

    // Burnout: throttle fighting the brake at (near) standstill — the engine revs
    // in place and steering pivots the rear around the planted front wheel
    // (never in a duel: the bike may not stop)
    const isBurnout =
      !battle && !!inputs.brake && (inputs.forward || inputs.boost) && Math.abs(state.speed) < 3.0
    state.isBurnout = isBurnout

    // Drift powerslide condition: holding brake (Space) while moving & steering
    const isDrifting = isBurnout || (brakeHeld && Math.abs(state.speed) > 1.0 && steerDir !== 0)
    state.isDrifting = isDrifting

    // Drift charge: eases the powerslide in/out (~0.3s). Turn multiplier, grip
    // recovery, and brake bleed all blend on it — none of them may snap in a
    // single frame (the old entry doubled turn rate in one frame; exit snapped
    // grip 3.5→14 and halved the rate instantly).
    const driftActive = brakeHeld && steerDir !== 0 && Math.abs(state.speed) > 1.0
    state.driftCharge = driftActive
      ? Math.min(1.0, (state.driftCharge ?? 0) + dt / 0.3)
      : Math.max(0.0, (state.driftCharge ?? 0) - dt / 0.3)
    const charge = state.driftCharge

    // Burnout spin-up: the pivot starts near-zero and eases into full circle
    // speed (~1s, quadratic) like a tyre fighting the brake — never an instant
    // max-rate spin. Accumulates during the WHOLE brake+throttle+steer approach
    // (faster while still rolling) so crossing the 3 u/s burnout gate is smooth
    // instead of collapsing the turn rate to zero for a frame.
    const burnoutApproach =
      !battle && !!inputs.brake && (inputs.forward || inputs.boost) && steerDir !== 0
    state.burnoutSpin = burnoutApproach
      ? Math.min(1.0, (state.burnoutSpin ?? 0) + dt / (Math.abs(state.speed) >= 0.5 ? 0.25 : 1.0))
      : Math.max(0.0, (state.burnoutSpin ?? 0) - dt * 3.0)

    // Steering. Non-burnout: bike-standard, LEAN-DRIVEN — the input commands a
    // lean angle, the lean rolls in at a limited rate, and yaw FOLLOWS lean and
    // speed (ω = G·tan(lean)/v, floored at r = R_MIN). The old model spun a
    // constant 2.5 rad/s from 10→26 u/s with full 20° lean at any speed — a
    // kart pirouette, not a bike.
    const speedAbs = Math.abs(state.speed)
    const steerFactor = state.speed >= 0 ? 1 : -1
    // Drift deepens the lean target (20° → 28°) as the charge settles
    const maxLeanAngle = MAX_LEAN + (DRIFT_LEAN - MAX_LEAN) * charge

    let steerSpeed: number
    if (isBurnout) {
      // Burnout keeps the steer-driven pivot model verbatim — the eased 2.1 rad/s
      // planted-front circles are canon (§4.3), and the bike leans fully on purpose.
      // ponytail: rate kinks against the lean model at the 3 u/s gate (deliberate
      // "rear breaks loose" whip); blend here if it reads bad in playtest.
      const standstill = Math.max((state.burnoutSpin ?? 0) ** 2, Math.min(1.0, speedAbs / 3.0))
      steerSpeed =
        steerDir *
        BASE_TURN_RATE *
        (0.4 + 0.6 * Math.min(1.0, speedAbs / 10.0)) *
        2.1 *
        standstill *
        steerFactor
      state.lean = THREE.MathUtils.lerp(state.lean, steerDir * maxLeanAngle, dt * 12.0)
    } else {
      // Usable lean at this speed: only what the R_MIN arc supports. A slow bike
      // barely leans (parking-lot rule) — full 20° bank at 5 u/s was the old fake.
      const leanUsable = Math.atan((speedAbs * speedAbs) / (R_MIN * CORNER_G))
      const targetLean = steerDir * Math.min(maxLeanAngle, leanUsable)
      // Roll-rate limited lean: banks in over ~0.2s; a drift flicks in faster
      const rollRate = LEAN_RATE * (1 + 0.8 * charge)
      const eased = THREE.MathUtils.lerp(state.lean, targetLean, dt * (isDrifting ? 12.0 : 9.0))
      state.lean = THREE.MathUtils.clamp(
        eased,
        state.lean - rollRate * dt,
        state.lean + rollRate * dt,
      )
      // Yaw follows lean; the slide-charge steps the rear out with a modest
      // multiplier on top of the lean arc (was 2.1× — a 300°/s pin-turn)
      const omegaLean = (CORNER_G * Math.tan(Math.abs(state.lean))) / Math.max(speedAbs, 0.001)
      const omega = Math.min(omegaLean, speedAbs / R_MIN) * (1 + 0.35 * charge)
      steerSpeed = Math.sign(state.lean) * omega * steerFactor
    }

    if (isBurnout && speedAbs < 0.5 && steerDir !== 0) {
      // Burnout pivot: steering swings the rear around the planted front wheel
      // (local -Z, 0.948 ahead of center) — this is what traces the skid circle
      const dYaw = steerSpeed * dt
      const fx = state.x - Math.sin(state.yaw) * 0.948
      const fz = state.z - Math.cos(state.yaw) * 0.948
      const cx = state.x - fx
      const cz = state.z - fz
      const cosD = Math.cos(dYaw)
      const sinD = Math.sin(dYaw)
      state.x = fx + cx * cosD + cz * sinD
      state.z = fz - cx * sinD + cz * cosD
      state.yaw += dYaw
    } else {
      state.yaw += steerSpeed * dt
    }

    // Forward and Reverse acceleration / Brake
    const isAccelerating = inputs.forward || inputs.boost
    const topSpeed = inputs.boost ? BOOST_SPEED : MAX_SPEED

    if (brakeHeld) {
      // Brake bleed blends hard straight-line braking (1.5x) into the gradual
      // drift slide (0.22x) on the drift charge — tapping steer mid-brake must
      // not swap the decel rate sevenfold in one frame
      const bleed = BRAKE_DECEL * (1.5 - 1.28 * charge)
      if (state.speed > 0) {
        const target = state.speed - bleed * dt
        // Duel drift floor: braking decelerates TO the floor, holds there, and
        // below it (wall hit, duel start) the throttle climbs back — the bike
        // cannot be parked with the brake from any starting speed
        state.speed = battle
          ? Math.max(target, Math.min(BATTLE_DRIFT_FLOOR, state.speed + ACCELERATION * dt))
          : Math.max(0, target)
      } else if (state.speed < 0) {
        state.speed = Math.min(0, state.speed + bleed * dt)
      } else if (battle) {
        // Duel standstill under drift: the always-on throttle engages — the
        // bike rolls up to the floor (no parking at 0 with brake held)
        state.speed = Math.min(BATTLE_DRIFT_FLOOR, ACCELERATION * dt)
      }
    } else if (isAccelerating) {
      if (state.speed < topSpeed) {
        state.speed = Math.min(
          topSpeed,
          state.speed + ACCELERATION * (inputs.boost ? 1.4 : 1.0) * dt,
        )
      } else {
        // Over the current cap (e.g. boost released while still on throttle):
        // glide back down to it instead of floating at the old boost speed
        state.speed = Math.max(topSpeed, state.speed - COAST_DRAG * dt)
      }
    } else if (inputs.backward) {
      if (state.speed > 0) {
        state.speed = Math.max(0, state.speed - BRAKE_DECEL * dt)
      } else if (state.speed > REVERSE_MAX) {
        state.speed = Math.max(REVERSE_MAX, state.speed - ACCELERATION * 0.5 * dt)
      }
    } else {
      // Natural drag coasting to stop
      if (state.speed > 0) {
        state.speed = Math.max(0, state.speed - COAST_DRAG * dt)
      } else if (state.speed < 0) {
        state.speed = Math.min(0, state.speed + COAST_DRAG * dt)
      }
    }
  }

  // Update velocity with drift momentum
  // Direction vector for current heading (yaw=0 means facing -Z)
  const dirX = -Math.sin(state.yaw)
  const dirZ = -Math.cos(state.yaw)
  const headingVx = dirX * state.speed
  const headingVz = dirZ * state.speed

  if (state.vx === undefined || state.vz === undefined) {
    state.vx = headingVx
    state.vz = headingVz
  }

  // Grip blends with the drift charge: slide (3.5/s) eases into full grip
  // (14/s) as the charge decays — never a one-frame hook-up snap on exit
  const gripRate = 14.0 - 10.5 * (state.driftCharge ?? 0)
  state.vx = THREE.MathUtils.lerp(state.vx, headingVx, dt * gripRate)
  state.vz = THREE.MathUtils.lerp(state.vz, headingVz, dt * gripRate)

  state.x += state.vx * dt
  state.z += state.vz * dt

  // Arena boundary containment with realistic zero-space contact
  // Bike half-dimensions from the model bbox: length half 1.36, width half 0.55
  const extentX =
    Math.abs(Math.sin(state.yaw)) * BIKE_HALF_LENGTH +
    Math.abs(Math.cos(state.yaw)) * BIKE_HALF_WIDTH
  const boundX = ARENA_HALF_SIZE - extentX

  const extentZ =
    Math.abs(Math.cos(state.yaw)) * BIKE_HALF_LENGTH +
    Math.abs(Math.sin(state.yaw)) * BIKE_HALF_WIDTH
  const boundZ = ARENA_HALF_SIZE - extentZ

  if (Math.abs(state.x) >= boundX) {
    state.x = Math.sign(state.x) * boundX
    state.lastWallContactAt = performance.now()
    const normalSpeed = Math.abs(state.vx ?? 0)
    if (normalSpeed > 2.0 && onWallHit) onWallHit(normalSpeed)
    state.speed *= wallImpactFactor(normalSpeed, state.vx ?? 0, state.vz ?? 0)
    state.vx = 0
  }
  // Grid Battle alley gate: south of the arena at x≈0 the wall opens so the
  // rider can leave into the outside corridor (the alley's own wall slabs and
  // far chamber contain them beyond it)
  // Past the wall (z clearly beyond ±120) the whole alley region is exempt —
  // the alley's own slabs contain the rider. The narrow |x| test only gates
  // PASSAGE THROUGH the wall, which otherwise clamped chamber riders (|x| up
  // to ~12) straight back to the arena edge.
  const southGate =
    alleyGateOpen && state.z > 0 && (Math.abs(state.x) < 3.5 || state.z > ARENA_HALF_SIZE + 2)
  if (Math.abs(state.z) >= boundZ && !southGate) {
    state.z = Math.sign(state.z) * boundZ
    state.lastWallContactAt = performance.now()
    const normalSpeed = Math.abs(state.vz ?? 0)
    if (normalSpeed > 2.0 && onWallHit) onWallHit(normalSpeed)
    state.speed *= wallImpactFactor(normalSpeed, state.vz ?? 0, state.vx ?? 0)
    state.vz = 0
  }
}

// Grid Battle alley (normal arena only): the corridor/chamber wall slabs
// beyond the arena's south wall are axis-aligned boxes. The bike collides as
// its CAPSULE SPINE (same model as the trail walls): the spine is sampled and
// the closest slab contact pushes along the TRUE connecting normal — walls
// stop the bike nose-first with zero gap, and grazing past a wall END sheds
// contact smoothly instead of the phantom side-shoves an axis-expanded AABB
// produced at the corridor/chamber mouth.
const SPINE_SAMPLES = [-1, -0.5, 0, 0.5, 1]

export function resolveAlleyBlocks(state: CycleState, onWallHit?: (speed: number) => void): void {
  const hdX = -Math.sin(state.yaw)
  const hdZ = -Math.cos(state.yaw)

  for (const b of BATTLE_ALLEY_BLOCKS) {
    // Closest contact across the spine samples (point-vs-rect distances)
    let best: { nx: number; nz: number; push: number } | null = null

    for (const t of SPINE_SAMPLES) {
      const px = state.x + hdX * SPINE_HALF * t
      const pz = state.z + hdZ * SPINE_HALF * t
      const qx = Math.max(b.x1, Math.min(px, b.x2))
      const qz = Math.max(b.z1, Math.min(pz, b.z2))
      const dx = px - qx
      const dz = pz - qz
      const dist = Math.hypot(dx, dz)
      if (dist >= TRAIL_WALL_RADIUS) continue

      if (dist > 1e-4) {
        const push = TRAIL_WALL_RADIUS - dist
        if (!best || push > best.push) best = { nx: dx / dist, nz: dz / dist, push }
      } else {
        // Sample center is INSIDE the slab: exit along its shallowest face
        const faces = [
          { p: px - b.x1 + TRAIL_WALL_RADIUS, nx: -1, nz: 0 },
          { p: b.x2 - px + TRAIL_WALL_RADIUS, nx: 1, nz: 0 },
          { p: pz - b.z1 + TRAIL_WALL_RADIUS, nx: 0, nz: -1 },
          { p: b.z2 - pz + TRAIL_WALL_RADIUS, nx: 0, nz: 1 },
        ].sort((a, c) => a.p - c.p)[0]
        if (!best || faces.p > best.push) best = { nx: faces.nx, nz: faces.nz, push: faces.p }
      }
    }
    if (!best) continue

    state.x += best.nx * best.push
    state.z += best.nz * best.push
    state.lastWallContactAt = performance.now()
    const preVx = state.vx ?? 0
    const preVz = state.vz ?? 0
    const vn = preVx * best.nx + preVz * best.nz
    if (Math.abs(vn) > 2.0 && onWallHit) onWallHit(Math.abs(vn))
    state.speed *= wallImpactFactor(Math.abs(vn), preVx, preVz)
    // Slide along the wall: only the into-wall velocity component is killed
    state.vx = preVx - vn * best.nx
    state.vz = preVz - vn * best.nz
  }
}

// Trail walls: laid ribbons are solid like the arena boundary (Tron rules).
export const TRAIL_WALL_RADIUS = BIKE_HALF_WIDTH // Capsule around the bike — wall touches its visual edge
const HEAD_SKIP_DIST = 1.7 // Fresh head sits at our own rear wheel — never self-collide there
const SPINE_HALF = BIKE_HALF_LENGTH - TRAIL_WALL_RADIUS // Spine endpoints, so the capsule ends reach the wheel tips

export interface TrailWallRibbon {
  points: { x: number; z: number }[]
  /** Set on live ribbons (TrailRibbon); plain wall fixtures omit it. The
      dissolved-stub solidity check reads it — emitting walls are always solid. */
  isEmitting?: boolean
}

// Bike-vs-bike: equal-mass rigid-body contact, not a wall. Each machine
// resolves ONLY its own bike (the foe's sim mirrors the computation), so the
// push emerges symmetrically over the link: positional correction splits the
// penetration 50/50, and an impulse along the contact normal exchanges
// momentum with low restitution (0.15) — bikes SHOVE each other rather than
// pop apart. A rider ramming a parked foe keeps roughly half their speed and
// drags them along; equal head-ons nearly stop both.
export function resolveBikeContact(
  state: CycleState,
  foeX: number,
  foeZ: number,
  foeYaw: number,
  foeVx: number,
  foeVz: number,
  onWallHit?: (speed: number) => void,
): void {
  const RADIUS = TRAIL_WALL_RADIUS * 2 // both capsules are 0.55 wide
  const fx = -Math.sin(state.yaw)
  const fz = -Math.cos(state.yaw)
  const px = state.x + fx * SPINE_HALF
  const pz = state.z + fz * SPINE_HALF
  const d1x = -2 * fx * SPINE_HALF
  const d1z = -2 * fz * SPINE_HALF
  const gfx = -Math.sin(foeYaw)
  const gfz = -Math.cos(foeYaw)
  const qx = foeX + gfx * SPINE_HALF
  const qz = foeZ + gfz * SPINE_HALF
  const d2x = -2 * gfx * SPINE_HALF
  const d2z = -2 * gfz * SPINE_HALF

  // Closest points between the two spine segments (XZ plane)
  const len11 = d1x * d1x + d1z * d1z
  const len22 = d2x * d2x + d2z * d2z
  const len12 = d1x * d2x + d1z * d2z
  const rx = px - qx
  const rz = pz - qz
  const len1r = d1x * rx + d1z * rz
  const len2r = d2x * rx + d2z * rz
  const denom = len11 * len22 - len12 * len12

  let s: number
  let t: number
  if (denom !== 0) {
    s = THREE.MathUtils.clamp((len12 * len2r - len22 * len1r) / denom, 0, 1)
    const rawT = (len12 * s + len2r) / len22
    t = rawT < 0 || rawT > 1 ? THREE.MathUtils.clamp(rawT, 0, 1) : rawT
  } else {
    t = 0
    s = 0
  }

  const sx = px + d1x * s
  const sz = pz + d1z * s
  const cx = qx + d2x * t
  const cz = qz + d2z * t
  const dx = sx - cx
  const dz = sz - cz
  const dist = Math.hypot(dx, dz)
  if (dist >= RADIUS) return

  // Contact normal, pointing from the foe toward the local bike
  let nx: number
  let nz: number
  if (dist > 1e-4) {
    nx = dx / dist
    nz = dz / dist
  } else {
    const v = Math.hypot(state.vx ?? 0, state.vz ?? 0)
    if (v > 1e-4) {
      nx = (state.vx ?? 0) / v
      nz = (state.vz ?? 0) / v
    } else {
      nx = fx
      nz = fz
    }
  }

  // 1) Positional correction — every contact frame, each bike resolves only a
  //    QUARTER of the overlap on its own machine (anti-tunnel clamped). The
  //    deliberate residual overlap keeps BOTH sims in contact, so a throttling
  //    rider continuously shoves their opponent along — the mirrored
  //    corrections creep the pair apart at about half the closing pace.
  const pen = RADIUS - dist
  const correction = Math.max(pen * 0.25, pen - 0.5)
  state.x += nx * correction
  state.z += nz * correction
  state.lastWallContactAt = performance.now()

  // 2) Momentum exchange fires ONCE per touch (impact), not every frame —
  //    per-frame impulses would exponentially crush the pusher's throttle
  //    into a dead press. Equal masses: each side sets its OWN normal
  //    velocity to the pair's center-of-mass velocity plus its half of the
  //    restitution kick; both machines derive the same shared velocity from
  //    the synced data.
  // Momentum exchange fires ONCE per touch (impact), plus a resting-contact
  // constraint while touching: the local closing velocity is clamped to the
  // foe's — a throttling rider presses and shoves (the mirrored positional
  // corrections carry the foe along) but can never nose THROUGH a stalled foe.
  const now = performance.now()
  const lastTouch = state.lastBikeContactAt
  // undefined = never touched (treat as ancient — performance.now() may be
  // near 0 in tests, so a ?? 0 default would wrongly look "just touched")
  const freshTouch = lastTouch === undefined || now - lastTouch > 150
  state.lastBikeContactAt = now
  const preVx = state.vx ?? 0
  const preVz = state.vz ?? 0
  const vnMe = preVx * nx + preVz * nz
  const vnFoe = foeVx * nx + foeVz * nz
  const closing = vnFoe - vnMe // > 0 → approaching along n
  if (closing > 0 && freshTouch) {
    const RESTITUTION = 0.15 // shove, not bounce
    // ponytail: no resting velocity clamp — with throttle re-accelerating
    // before contact every frame, ANY per-frame clamp crushes the press into
    // a dead stop. Entry impulse + the positional anti-tunnel cap is the
    // shipped compromise; a very fast chase can still slip past a stalled
    // foe (interp lag), accepted for v1.
    const vnNew = (vnMe + vnFoe) / 2 + (RESTITUTION * closing) / 2
    const dvn = vnNew - vnMe
    state.vx = preVx + dvn * nx
    state.vz = preVz + dvn * nz
    // The driving speed follows the shoved velocity (projection on heading);
    // a backward shove may exceed reverse-drive speed — it's a push, not braking.
    // Upper bound = the rider's own pre-shove speed (or the normal cap): a ram
    // may slow you but never inject overspeed — isRibbonCrash derezzes on this
    // scalar, so a boosted shove into a cruise bike must not make the VICTIM
    // lethal-speed on the next ribbon touch. Their own boost/glide still may.
    state.speed = THREE.MathUtils.clamp(
      state.vx * fx + state.vz * fz,
      -BOOST_SPEED,
      Math.max(state.speed, MAX_SPEED),
    )
    if (freshTouch && closing > 2.0 && onWallHit) onWallHit(closing)
  }
}

// The bike is a capsule: spine from front wheel tip to rear, TRAIL_WALL_RADIUS wide.
// On contact it is pushed out like an arena wall.

// A DISSOLVING ribbon's last stub is no longer solid (2026-11-21): dissipation
// eats walls tail-first and a few fading units are effectively invisible at
// boost speed — derezzing on a wall the rider cannot possibly see reads as a
// false crash (playtest: "crashed into my own ribbon with nothing in front of
// me"). Below this remaining length the wall stops colliding, scoring and
// crashing for EVERYONE (this fn is the single collision primitive: own
// crash, foe bounce and the owner-side probe all pass through it, so the
// wall's solidity is identical on both screens). EMITTING ribbons are exempt
// — a newborn wall is solid from its first segment.
const DISSOLVED_MIN_UNITS = 4

function ribbonSolid(ribbon: TrailWallRibbon): boolean {
  if (ribbon.isEmitting === true) return true
  const pts = ribbon.points
  let units = 0
  for (let i = 1; i < pts.length; i++) {
    units += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
    if (units >= DISSOLVED_MIN_UNITS) return true
  }
  return false
}

export function resolveTrailWalls(
  state: CycleState,
  ribbons: TrailWallRibbon[],
  rearX: number,
  rearZ: number,
  onWallHit?: (speed: number) => void,
): void {
  const fx = -Math.sin(state.yaw)
  const fz = -Math.cos(state.yaw)
  const px = state.x + fx * SPINE_HALF // spine front end (capsule extends to the wheel tip)
  const pz = state.z + fz * SPINE_HALF
  const d1x = -2 * fx * SPINE_HALF // spine direction (front -> rear)
  const d1z = -2 * fz * SPINE_HALF

  for (const ribbon of ribbons) {
    if (!ribbonSolid(ribbon)) continue
    const pts = ribbon.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (
        Math.hypot(a.x - rearX, a.z - rearZ) < HEAD_SKIP_DIST &&
        Math.hypot(b.x - rearX, b.z - rearZ) < HEAD_SKIP_DIST
      ) {
        continue
      }

      // Closest points between the bike spine and the wall segment (XZ plane)
      const d2x = b.x - a.x
      const d2z = b.z - a.z
      const rx = px - a.x
      const rz = pz - a.z
      const len11 = d1x * d1x + d1z * d1z
      const len22 = d2x * d2x + d2z * d2z
      const len12 = d1x * d2x + d1z * d2z
      const len1r = d1x * rx + d1z * rz
      const len2r = d2x * rx + d2z * rz

      let s: number
      let t: number
      if (len22 > 1e-9) {
        const denom = len11 * len22 - len12 * len12
        s = denom !== 0 ? THREE.MathUtils.clamp((len12 * len2r - len22 * len1r) / denom, 0, 1) : 0
        const rawT = (len12 * s + len2r) / len22
        if (rawT < 0 || rawT > 1) {
          t = THREE.MathUtils.clamp(rawT, 0, 1)
          s = THREE.MathUtils.clamp((t * len12 - len1r) / len11, 0, 1)
        } else {
          t = rawT
        }
      } else {
        // Degenerate wall segment: treat it as the single point a
        t = 0
        s = THREE.MathUtils.clamp(-len1r / len11, 0, 1)
      }

      const sx = px + d1x * s
      const sz = pz + d1z * s
      const cx = a.x + d2x * t
      const cz = a.z + d2z * t
      const dx = sx - cx
      const dz = sz - cz
      const dist = Math.hypot(dx, dz)
      if (dist >= TRAIL_WALL_RADIUS) continue

      // Same response as arena walls: push out, kill velocity, damp speed
      let nx: number
      let nz: number
      if (dist > 1e-4) {
        nx = dx / dist
        nz = dz / dist
      } else {
        // Spine crosses the wall line: push straight back along the travel direction
        const v = Math.hypot(state.vx ?? 0, state.vz ?? 0)
        if (v > 1e-4) {
          nx = -(state.vx ?? 0) / v
          nz = -(state.vz ?? 0) / v
        } else {
          nx = -fz
          nz = fx
        }
      }
      state.x += nx * (TRAIL_WALL_RADIUS - dist)
      state.z += nz * (TRAIL_WALL_RADIUS - dist)
      state.lastWallContactAt = performance.now()
      const preVx = state.vx ?? 0
      const preVz = state.vz ?? 0
      const vn = preVx * nx + preVz * nz
      if (Math.abs(vn) > 2.0 && onWallHit) onWallHit(Math.abs(vn))
      state.speed *= wallImpactFactor(Math.abs(vn), preVx, preVz)
      // Slide along the wall: only the into-wall velocity component is killed
      state.vx = preVx - vn * nx
      state.vz = preVz - vn * nz
    }
  }
}
