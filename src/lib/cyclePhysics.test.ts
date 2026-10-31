import { describe, it, expect } from 'vitest'
import {
  CycleInputs,
  CycleState,
  updateCycleKinematics,
  resolveTrailWalls,
  TRAIL_WALL_RADIUS,
} from './cyclePhysics'
import { trailTopLeanOffset } from './track'

const DT = 1 / 120

const idle: CycleInputs = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  boost: false,
  brake: false,
}

const freshState = (over: Partial<CycleState> = {}): CycleState => ({
  x: 0,
  z: 0,
  yaw: 0,
  speed: 0,
  lean: 0,
  isAutopilot: false,
  autopilotTarget: null,
  ...over,
})

function run(state: CycleState, inputs: CycleInputs, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    updateCycleKinematics(state, inputs, DT)
  }
}

/** Cruise up to a target speed with throttle/boost, returns once reached. */
function cruiseTo(state: CycleState, target: number, boost = false) {
  const inputs: CycleInputs = { ...idle, forward: !boost, boost }
  for (let i = 0; i < 2400 && Math.abs(state.speed - target) > 0.01; i++) {
    updateCycleKinematics(state, inputs, DT)
    // Clamp the per-frame overshoot — the loop condition alone never sees an
    // exact mid-range target (26/40 are hard caps, other values overshoot and
    // the bike would cruise on to the arena wall)
    if (state.speed > target) state.speed = target
  }
  expect(state.speed).toBeCloseTo(target, 1)
}

/**
 * Drive into the +X wall at `angleDeg` off the wall plane and return the bike
 * speed measured immediately after the first wall contact.
 */
function hitXWall(angleDeg: number): number {
  const angle = (angleDeg * Math.PI) / 180
  const yaw = -angle // heading = (sin(angle), -cos(angle)): into +X, mostly -Z
  const state = freshState({
    x: 118.0,
    yaw,
    speed: 30,
    vx: 30 * Math.sin(angle),
    vz: -30 * Math.cos(angle),
  })
  let hit = false
  let speedAfterHit: number | null = null
  for (let i = 0; i < 240 && speedAfterHit === null; i++) {
    updateCycleKinematics(state, idle, DT, undefined, () => {
      hit = true
    })
    if (hit && speedAfterHit === null) speedAfterHit = state.speed
  }
  expect(speedAfterHit).not.toBeNull()
  return speedAfterHit as number
}

describe('cycle kinematics', () => {
  it('does not yaw at standstill (no pirouette while parked)', () => {
    const state = freshState()
    run(state, { ...idle, left: true }, 1.0)
    expect(Math.abs(state.yaw)).toBeLessThan(0.02)
    expect(Math.abs(state.lean)).toBeLessThan(0.05) // parked steering leans nothing either
  })

  /** Settled yaw rate (rad/s) steering left with speed pinned (roll-in finished). */
  function steadyYaw(speed: number, boost = false, brake = false): number {
    const state = freshState()
    cruiseTo(state, speed, boost)
    const inputs: CycleInputs = { ...idle, boost, brake, left: true }
    for (let i = 0; i < Math.ceil(1.2 / DT); i++) {
      updateCycleKinematics(state, inputs, DT)
      state.speed = speed
    }
    const y0 = state.yaw
    for (let i = 0; i < Math.ceil(0.4 / DT); i++) {
      updateCycleKinematics(state, inputs, DT)
      state.speed = speed
    }
    return Math.abs(state.yaw - y0) / 0.4
  }

  it('turning is lean-driven: radius widens with speed (bike standard, not a kart)', () => {
    const w10 = steadyYaw(10)
    const w26 = steadyYaw(26)
    const w40 = steadyYaw(40, true)
    // Low speed: R_MIN floor keeps direct-steer agility (r = 4 units)
    expect(w10).toBeCloseTo(2.5, 1)
    // At speed yaw comes from the lean arc: ω = G·tan(20°)/v — r ≈ 20 at 26 u/s
    expect(w26).toBeCloseTo((92 * Math.tan((20 * Math.PI) / 180)) / 26, 1)
    // Boost arcs widen further (r ≈ 48) — the old model held 2.5 rad/s everywhere
    expect(w40).toBeCloseTo((92 * Math.tan((20 * Math.PI) / 180)) / 40, 1)
    expect(40 / w40).toBeGreaterThan(45)
  })

  it('drift: deep lean + eased rear-out multiplier — wide powerslide, no 300°/s pin-turn', () => {
    // Settled drift at 26 u/s: lean 28°, ω = 1.35·G·tan(28°)/26 ≈ 2.04 (r ≈ 12.7)
    expect(steadyYaw(26, false, true)).toBeCloseTo(
      (1.35 * 92 * Math.tan((28 * Math.PI) / 180)) / 26,
      1,
    )
  })

  it('drift eases in and out — no one-frame snap in yaw or lean', () => {
    const state = freshState()
    cruiseTo(state, 20.0)
    const turn: CycleInputs = { ...idle, forward: true, left: true }
    const drift: CycleInputs = { ...idle, forward: true, left: true, brake: true }

    // Settled plain turn (ω ≈ 1.35 rad/s at 20 u/s), then press brake:
    // neither yaw nor lean may jump toward drift values in one frame
    for (let i = 0; i < 90; i++) updateCycleKinematics(state, turn, DT)
    const l0 = state.lean
    updateCycleKinematics(state, drift, DT)
    expect(Math.abs(state.lean - l0)).toBeLessThan(0.03)
    const y0 = state.yaw
    updateCycleKinematics(state, drift, DT)
    expect(Math.abs(state.yaw - y0) / DT).toBeLessThan(1.9)

    // Settled drift (speed pinned — brake would bleed it): full 28° slide
    for (let i = 0; i < 150; i++) {
      updateCycleKinematics(state, drift, DT)
      state.speed = 20
    }
    const y1 = state.yaw
    updateCycleKinematics(state, drift, DT)
    expect(Math.abs(state.yaw - y1) / DT).toBeCloseTo(
      (1.35 * 92 * Math.tan((28 * Math.PI) / 180)) / 20,
      1,
    )

    // FIRST frame after releasing brake: still well above the plain rate (easing out)
    const y2 = state.yaw
    updateCycleKinematics(state, turn, DT)
    expect(Math.abs(state.yaw - y2) / DT).toBeGreaterThan(1.8)
    // And eases back to plain turning (speed pinned — throttle would run to 26)
    for (let i = 0; i < 240; i++) {
      updateCycleKinematics(state, turn, DT)
      state.speed = 20
    }
    const y3 = state.yaw
    updateCycleKinematics(state, turn, DT)
    expect(Math.abs(state.yaw - y3) / DT).toBeCloseTo((92 * Math.tan((20 * Math.PI) / 180)) / 20, 1)
  })

  it('lean rolls in — no instant full bank, and no full lean at parking speeds', () => {
    const state = freshState()
    cruiseTo(state, 26.0)
    const turn: CycleInputs = { ...idle, forward: true, left: true }
    for (let i = 0; i < Math.ceil(0.12 / DT); i++) updateCycleKinematics(state, turn, DT)
    expect(state.lean).toBeGreaterThan(0.08) // already leaning...
    expect(state.lean).toBeLessThan(0.3) // ...but roll-rate capped (~0.26 at 0.12s)
    for (let i = 0; i < Math.ceil(1.0 / DT); i++) updateCycleKinematics(state, turn, DT)
    expect(state.lean).toBeCloseTo((20 * Math.PI) / 180, 2) // full lean only once settled

    // At 5 u/s the same input leans only what the R_MIN arc needs (~4.8°)
    const slow = freshState()
    cruiseTo(slow, 5.0)
    for (let i = 0; i < Math.ceil(1.0 / DT); i++) {
      updateCycleKinematics(slow, turn, DT)
      slow.speed = 5
    }
    expect(slow.lean).toBeCloseTo(Math.atan(25 / (4 * 92)), 2)
  })

  it('releasing steer trails out — the bike finishes its arc (no kart stop)', () => {
    const state = freshState()
    cruiseTo(state, 26.0)
    const turn: CycleInputs = { ...idle, forward: true, left: true }
    run(state, turn, 1.2)
    expect(state.lean).toBeCloseTo((20 * Math.PI) / 180, 2)
    run(state, { ...idle, forward: true }, 0.5)
    // Yaw kept accumulating while the bike righted itself
    expect(state.yaw).toBeGreaterThan(0.08)
  })

  it('crossing into a burnout while steering never collapses the turn rate', () => {
    const state = freshState({ speed: 6, vx: 0, vz: -6 })
    const bt: CycleInputs = { ...idle, forward: true, brake: true, left: true }
    let minRate = Infinity
    for (let i = 0; i < 600; i++) {
      const y0 = state.yaw
      updateCycleKinematics(state, bt, DT)
      const rate = Math.abs(state.yaw - y0) / DT
      if (Math.abs(state.speed) < 3.5 && Math.abs(state.speed) > 1.5) {
        minRate = Math.min(minRate, rate)
      }
    }
    // Lean-model drift side runs ~0.5 rad/s just above the gate, burnout pivot
    // ~1.3+ below it — neither may collapse to the old one-frame 0.00 hitch
    expect(minRate).toBeGreaterThan(0.3)
  })

  it('brake bleed blends: steer tap mid-brake no longer swaps decel sevenfold', () => {
    const state = freshState({ speed: 20, vx: 0, vz: -20 })
    const bs: CycleInputs = { ...idle, brake: true, left: true }
    const s0 = state.speed
    run(state, bs, 0.1)
    const earlyDecel = (s0 - state.speed) / 0.1
    expect(earlyDecel).toBeGreaterThan(25) // between 60 (straight) and 8.8 (full slide)
    // After the charge settles, decel reads the drift bleed
    run(state, bs, 0.5)
    const s1 = state.speed
    run(state, bs, 0.3)
    const lateDecel = (s1 - state.speed) / 0.3
    expect(lateDecel).toBeLessThan(10)
  })

  it('penalises wall hits by impact angle: head-on loses 60%, a graze keeps sliding', () => {
    const headOn = hitXWall(89)
    expect(headOn).toBeGreaterThan(9) // ~30 × 0.4 minus drag
    expect(headOn).toBeLessThan(14)

    const graze = hitXWall(10)
    // Tangential component keeps most speed: 30 × (1 − 0.6·sin10°) ≈ 26.9
    expect(graze).toBeGreaterThan(24)
  })

  it('keeps zero-gap wall contact at the rotated bike extent', () => {
    const state = freshState({ yaw: -Math.PI / 4, x: 100, z: 0 })
    cruiseTo(state, 26.0)
    run(state, idle, 4.0)
    const extent = Math.SQRT1_2 * 1.36 + Math.SQRT1_2 * 0.55
    expect(state.x).toBeCloseTo(120 - extent, 1)
  })

  it('inverts steering in reverse and coasts at a constant 12 u/s² drag', () => {
    const state = freshState({ speed: -8 })
    run(state, { ...idle, backward: true, left: true }, 0.5)
    expect(state.yaw).toBeLessThan(0) // left key steers the other way in reverse
    expect(state.lean).toBeGreaterThan(0) // lean stays input-signed (documented)

    const coast = freshState({ speed: 26 })
    run(coast, idle, 0.5)
    expect(coast.speed).toBeCloseTo(26 - 12 * 0.5, 1)
  })

  it('trail walls: head-on loses 60%, graze slides along, fresh ribbon head is skipped', () => {
    const wall = [
      { x: 5, z: -50 },
      { x: 5, z: 50 },
    ]

    // Head-on into the trail wall moving +X
    const headOn = freshState({ x: 4.0, yaw: -Math.PI / 2, speed: 20, vx: 20, vz: 0 })
    resolveTrailWalls(headOn, [{ points: wall }], 4.0, -0.912)
    expect(headOn.speed).toBeCloseTo(20 * 0.4, 1)
    expect(headOn.vx ?? 0).toBeCloseTo(0, 5)

    // Graze: mostly -Z with a slight +X drift into the wall
    const angle = (10 * Math.PI) / 180
    const graze = freshState({
      x: 5.4,
      yaw: -angle,
      speed: 20,
      vx: 20 * Math.sin(angle),
      vz: -20 * Math.cos(angle),
    })
    resolveTrailWalls(graze, [{ points: wall }], 5.4, 0)
    expect(graze.speed).toBeGreaterThan(17) // ~20 × (1 − 0.6·sin10°)
    expect(graze.vz ?? 0).toBeLessThan(-18) // tangential slide survives
    expect(graze.vx ?? 0).toBeCloseTo(0, 5) // into-wall component killed

    // Head-skip: a segment sitting at our own rear wheel must not collide
    // (emitting — a newborn head is exempt from the dissolving-stub rule, so
    // this still exercises head-skip specifically)
    const rearX = 0
    const rearZ = 0
    const fresh = freshState({ x: 0, z: 0, yaw: 0, speed: 10, vx: 0, vz: -10 })
    resolveTrailWalls(
      fresh,
      [
        {
          isEmitting: true,
          points: [
            { x: rearX, z: rearZ },
            { x: rearX, z: rearZ - 1 },
          ],
        },
      ],
      rearX,
      rearZ,
    )
    expect(fresh.speed).toBe(10) // untouched
    expect(Math.hypot(fresh.x, fresh.z)).toBeLessThan(TRAIL_WALL_RADIUS)
  })

  it('dissolving stubs under 4 units are not solid; emitting newborns stay solid', () => {
    // Bike facing +X toward the wall line x=5 (spine along X) — near contact
    const stub = [
      { x: 5, z: -1.5 },
      { x: 5, z: 0 },
      { x: 5, z: 1.5 },
    ]
    const mk = () => freshState({ x: 4.0, yaw: -Math.PI / 2, speed: 30, vx: 30, vz: 0 })

    // A fading 3-unit stub: no crash material — bike passes through untouched
    const ghost = mk()
    resolveTrailWalls(ghost, [{ points: stub }], 99, 99)
    expect(ghost.x).toBe(4.0)
    expect(ghost.speed).toBe(30)

    // The SAME geometry while emitting is solid from its first segment
    const live = mk()
    resolveTrailWalls(live, [{ points: stub, isEmitting: true }], 99, 99)
    expect(live.x).toBeLessThan(4.0) // shoved back off the wall
    expect(live.speed).toBeLessThan(30) // impact damped
  })

  it('burnout: throttle against brake revs in place; steering pivots around the planted front wheel', () => {
    const state = freshState({ x: 10, z: 10, yaw: 0.3 })
    const fx0 = 10 - Math.sin(0.3) * 0.948
    const fz0 = 10 - Math.cos(0.3) * 0.948
    run(state, { ...idle, forward: true, brake: true, left: true }, 2.0)

    expect(state.isBurnout).toBe(true)
    expect(Math.abs(state.speed)).toBeLessThan(0.05) // held in place, engine fighting brake
    expect(state.yaw).toBeGreaterThan(1.0) // pivots (~2.1 rad/s)

    // Front wheel stays planted while the rear sweeps the circle
    const fx1 = state.x - Math.sin(state.yaw) * 0.948
    const fz1 = state.z - Math.cos(state.yaw) * 0.948
    expect(Math.hypot(fx1 - fx0, fz1 - fz0)).toBeLessThan(0.05)
  })

  it('burnout without steering: bike stays stopped with the engine revving', () => {
    const state = freshState({ speed: 5 })
    run(state, { ...idle, forward: true, brake: true }, 1.0)
    expect(Math.abs(state.speed)).toBeLessThan(0.05)
    expect(state.yaw).toBeCloseTo(0, 5) // no steer input → no yaw
    expect(state.isBurnout).toBe(true)
  })

  it('releasing boost under throttle glides speed back down to the normal cap', () => {
    const state = freshState()
    cruiseTo(state, 40.0, true)
    run(state, { ...idle, forward: true }, 1.5)
    expect(state.speed).toBeCloseTo(26.0, 1)

    // And with everything released it keeps coasting down (no throttle pinned)
    run(state, idle, 1.0)
    expect(state.speed).toBeLessThan(20)
  })

  it('boosting into a wall pins the bike: actual velocity dies below the trail-emission gate', () => {
    const state = freshState({ yaw: -Math.PI / 2 }) // facing +X
    const boost: CycleInputs = { ...idle, boost: true }
    for (let i = 0; i < 600; i++) updateCycleKinematics(state, boost, DT) // ~5s: reach wall, grind

    // Pinned at the wall with zero gap
    expect(state.x).toBeCloseTo(120 - 1.36, 1)

    // The engine-speed scalar can stay above 0.2 while grinding (accel vs
    // collision penalty balance) — the trap that kept trails emitting.
    // Actual velocity must be dead, so the emission gate closes:
    const v = Math.hypot(state.vx ?? 0, state.vz ?? 0)
    expect(v).toBeLessThan(0.2)
  })

  it('grinding a wall at an angle crawls tangentially but wall contact stays fresh (no trail)', () => {
    const yaw = -Math.PI / 6 // 30° into the +X wall — the angled-grind case
    const state = freshState({
      x: 117,
      yaw,
      speed: 30,
      vx: 30 * Math.sin(Math.PI / 6),
      vz: -30 * Math.cos(Math.PI / 6),
    })
    const boost: CycleInputs = { ...idle, boost: true }
    for (let i = 0; i < 1200; i++) updateCycleKinematics(state, boost, DT)

    // Pinned at the rotated extent
    const extent = 0.5 * 1.36 + Math.cos(Math.PI / 6) * 0.55
    expect(state.x).toBeCloseTo(120 - extent, 1)

    // The tangential crawl alone would pass the velocity gate (the old bug)...
    expect(Math.hypot(state.vx ?? 0, state.vz ?? 0)).toBeGreaterThan(0.2)
    // ...and it stays under the stall threshold, so with fresh contact the
    // emission gate closes
    expect(Math.hypot(state.vx ?? 0, state.vz ?? 0)).toBeLessThan(10)
    expect(state.lastWallContactAt).toBeDefined()
    expect(performance.now() - (state.lastWallContactAt as number)).toBeLessThan(200)
  })

  it('a fast graze keeps its ribbon: contact alone does not cut emission', () => {
    // Shallow 10° clip into the +X wall at speed 30 — touches, barely slows
    const angle = (10 * Math.PI) / 180
    const state = freshState({
      x: 119.2,
      yaw: -angle,
      speed: 30,
      vx: 30 * Math.sin(angle),
      vz: -30 * Math.cos(angle),
    })
    run(state, idle, 3 * DT)
    expect(state.lastWallContactAt).toBeDefined() // touched the wall...
    // ...but still moving fast, so the stall condition fails and the ribbon continues
    expect(Math.hypot(state.vx ?? 0, state.vz ?? 0)).toBeGreaterThan(10)
  })

  it('free riding never marks wall contact', () => {
    const state = freshState()
    cruiseTo(state, 26.0)
    run(state, { ...idle, forward: true }, 0.5)
    expect(state.lastWallContactAt).toBeUndefined()
  })

  it('trail wall banks with the bike: top-edge lean offset direction and magnitude', () => {
    const H = 0.84

    // No lean → perfectly vertical wall
    expect(trailTopLeanOffset(0, -1, 0, 0.84).x).toBeCloseTo(0, 5)
    expect(trailTopLeanOffset(0, -1, 0, 0.84).z).toBeCloseTo(0, 5)

    // Left turn (lean +) facing -Z: top tilts to world -X (the rider's left)
    const left = trailTopLeanOffset(0, -1, 0.3, 0.84)
    expect(left.x).toBeCloseTo(-Math.tan(0.3) * H, 5)
    expect(left.z).toBeCloseTo(0, 5)

    // Right turn (lean −) facing -Z: top tilts to world +X
    const right = trailTopLeanOffset(0, -1, -0.3, 0.84)
    expect(right.x).toBeCloseTo(Math.tan(0.3) * H, 5)

    // Facing +X, left turn: top tilts to world -Z
    const side = trailTopLeanOffset(1, 0, 0.3, 0.84)
    expect(side.x).toBeCloseTo(0, 5)
    expect(side.z).toBeCloseTo(-Math.tan(0.3) * H, 5)

    // Max drift lean (28°) stays a sane offset (~0.45 units)
    expect(Math.hypot(trailTopLeanOffset(0, -1, 0.4887, 0.84).x, 0)).toBeLessThan(0.5)
  })

  it('burnout pivot spins up smoothly: near-zero at first, full circle rate after ~1s', () => {
    const state = freshState()
    const burn: CycleInputs = { ...idle, forward: true, brake: true, left: true }

    // Early: barely turning (quadratic ease-in from zero)
    run(state, burn, 0.25)
    const y0 = state.yaw
    run(state, burn, 0.1)
    const earlyRate = Math.abs(state.yaw - y0) / 0.1
    expect(earlyRate).toBeLessThan(0.3) // far under the 2.1 rad/s steady rate

    // Late: full-speed circles
    run(state, burn, 1.0) // total 1.35s > 1s ramp
    const y1 = state.yaw
    run(state, burn, 0.1)
    const lateRate = Math.abs(state.yaw - y1) / 0.1
    expect(lateRate).toBeCloseTo(2.1, 1)

    // Release steer → spin decays; re-entry starts slow again
    run(state, { ...idle, forward: true, brake: true }, 0.5)
    expect(state.burnoutSpin ?? 1).toBe(0)
    const y2 = state.yaw
    run(state, burn, 0.2)
    const reentryRate = Math.abs(state.yaw - y2) / 0.2
    expect(reentryRate).toBeLessThan(0.3)
  })

  it('autopilot docks at the target, squares up and stops (regression)', () => {
    const state = freshState({ yaw: Math.PI / 2 })
    state.isAutopilot = true
    state.autopilotTarget = { x: 30, z: -40, yaw: 0.5, id: 'test' }
    let arrived = ''
    for (let i = 0; i < 3600 && !arrived; i++) {
      updateCycleKinematics(state, idle, DT, (id) => (arrived = id))
    }
    expect(arrived).toBe('test')
    expect(state.speed).toBe(0)
    expect(Math.hypot(state.x - 30, state.z - -40)).toBeLessThan(3.5)
    expect(Math.abs(state.yaw - 0.5)).toBeLessThan(0.05)
    expect(state.isAutopilot).toBe(false)
  })

  it('autopilot leans INTO its turns (lean-driven, same model as manual)', () => {
    // Target hard to the left of the heading, far enough to stay in cruise
    const state = freshState({ speed: 18 })
    state.isAutopilot = true
    state.autopilotTarget = { x: -60, z: -5, id: 'test' }
    let mismatches = 0
    let turning = 0
    let prevYaw = state.yaw
    for (let i = 0; i < 240; i++) {
      updateCycleKinematics(state, idle, DT)
      let dYaw = state.yaw - prevYaw
      while (dYaw > Math.PI) dYaw -= 2 * Math.PI
      while (dYaw < -Math.PI) dYaw += 2 * Math.PI
      prevYaw = state.yaw
      if (Math.abs(state.lean) > 0.05 && Math.abs(dYaw) > 1e-6 && !state.isArriving) {
        turning++
        // Counter-lean regression: yawing one way while banked the other
        if (Math.sign(dYaw) !== Math.sign(state.lean)) mismatches++
        expect(Math.abs(state.lean)).toBeLessThanOrEqual(20.5 * (Math.PI / 180))
      }
    }
    expect(turning).toBeGreaterThan(20)
    expect(mismatches).toBe(0)
  })
})

describe('duel mode (battle = true): auto-cruise & drift-only brake', () => {
  const runBattle = (state: CycleState, inputs: CycleInputs, seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      updateCycleKinematics(state, inputs, DT, undefined, undefined, false, true)
    }
  }

  it('braking with steer converges to the drift floor and never below', () => {
    const s = freshState({ speed: 26 })
    runBattle(s, { ...idle, brake: true, left: true }, 6)
    expect(s.speed).toBeCloseTo(10, 0)
  })

  it('brake without steer is ignored in a duel — the throttle keeps driving', () => {
    const s = freshState({ speed: 0 })
    runBattle(s, { ...idle, forward: true, brake: true }, 1)
    expect(s.speed).toBeGreaterThan(20)
  })

  it('no burnout in a duel: brake+throttle+steer at standstill rolls forward', () => {
    const s = freshState({ speed: 0 })
    runBattle(s, { ...idle, forward: true, brake: true, left: true }, 1)
    expect(s.isBurnout).toBe(false)
    expect(s.speed).toBeGreaterThan(4) // climbing to the 10 u/s drift floor
  })

  it('below the floor (wall crawl) the drift brake climbs back up', () => {
    const s = freshState({ speed: 3 })
    runBattle(s, { ...idle, brake: true, left: true }, 1)
    expect(s.speed).toBeGreaterThanOrEqual(3) // never bled below the entry speed
    expect(s.speed).toBeLessThanOrEqual(10)
  })
})
