import { describe, it, expect } from 'vitest'
import {
  BATTLE_BASE_CAPACITY,
  BATTLE_CRASH_SPEED,
  BATTLE_SPAWNS,
  BOOSTER_GAIN,
  BOOST_REGEN_FRAC,
  DRIFT_HEAT_MAX_S,
  stepDriftHeat,
  stepStall,
  FuelState,
  boosterGain,
  randomBoosterSpot,
  stepFuel,
  timerWinner,
  yawToward,
  ribbonCrashFrozen,
  measureSnapshotMotion,
  predictPose,
  PREDICT_MAX_DT,
  normalizeBattleCode,
  isRibbonCrash,
  ribbonClosingFraction,
} from './battle'
import { ARENA_HALF_SIZE as HALF, isInsideAlley } from './arena'
import { CycleState, resolveBikeContact } from './cyclePhysics'

const freshFuel = (over: Partial<FuelState> = {}): FuelState => ({
  fuel: BATTLE_BASE_CAPACITY,
  capacity: BATTLE_BASE_CAPACITY,
  locked: false,
  ...over,
})

describe('battle fuel economy', () => {
  it('boosting spends exactly the distance laid', () => {
    const f = stepFuel(freshFuel(), true, 12.5, 0.1)
    expect(f.fuel).toBeCloseTo(BATTLE_BASE_CAPACITY - 12.5)
    expect(f.locked).toBe(false)
  })

  it('empty fuel locks the boost', () => {
    const f = stepFuel(freshFuel({ fuel: 3 }), true, 10, 0.1)
    expect(f.fuel).toBe(0)
    expect(f.locked).toBe(true)
  })

  it('regen refills toward capacity but stays locked until the re-engage threshold', () => {
    // 80 capacity → unlock at 16; regen adds 15% of capacity per second
    const halfSec = BATTLE_BASE_CAPACITY * BOOST_REGEN_FRAC * 0.5 // 6
    let f = freshFuel({ fuel: 0, locked: true })
    f = stepFuel(f, false, 0, 0.5) // 6 — still locked
    expect(f.fuel).toBeCloseTo(halfSec)
    expect(f.locked).toBe(true)
    f = stepFuel(f, false, 0, 0.5) // 12 — still locked
    expect(f.locked).toBe(true)
    f = stepFuel(f, false, 0, 0.5) // 18 ≥ 16 — unlocked
    expect(f.locked).toBe(false)
  })

  it('regen never exceeds capacity', () => {
    const f = stepFuel(freshFuel({ fuel: 59 }), false, 0, 10)
    expect(f.fuel).toBe(BATTLE_BASE_CAPACITY)
  })

  it('boosters raise capacity and refuel, capping at the new capacity', () => {
    const full = boosterGain(freshFuel())
    expect(full.capacity).toBe(BATTLE_BASE_CAPACITY + BOOSTER_GAIN)
    expect(full.fuel).toBe(BATTLE_BASE_CAPACITY + BOOSTER_GAIN) // full tank grows with it

    const spent = boosterGain(freshFuel({ fuel: 10 }))
    expect(spent.fuel).toBe(10 + BOOSTER_GAIN)
  })
})

describe('battle outcome', () => {
  it('most caused hits wins at timer expiry', () => {
    expect(timerWinner(3, 1)).toBe('me')
    expect(timerWinner(1, 3)).toBe('foe')
    expect(timerWinner(2, 2)).toBe('tie')
    expect(timerWinner(0, 0)).toBe('tie')
  })

  it('crash gate sits exactly at normal max drive (only boost-speed hits derezz)', () => {
    // cyclePhysics MAX_SPEED = 26 u/s (93.6 km/h) — not imported here to keep
    // this module THREE-free; the equality IS the rule (Trail compares >)
    expect(BATTLE_CRASH_SPEED).toBe(26)
  })
})

describe('battle spawns & boosters', () => {
  it('spawn corners are inside the arena and face the center', () => {
    for (const s of [BATTLE_SPAWNS.host, BATTLE_SPAWNS.joiner]) {
      expect(Math.abs(s.x)).toBeLessThan(HALF)
      expect(Math.abs(s.z)).toBeLessThan(HALF)
      // forward direction (-sin, -cos) must point at the origin
      const dirX = -Math.sin(s.yaw)
      const dirZ = -Math.cos(s.yaw)
      expect(-(dirX * s.x + dirZ * s.z)).toBeGreaterThan(0)
    }
    // opposite corners
    expect(BATTLE_SPAWNS.host.x).toBeCloseTo(-BATTLE_SPAWNS.joiner.x)
    expect(BATTLE_SPAWNS.host.z).toBeCloseTo(-BATTLE_SPAWNS.joiner.z)
  })

  it('yawToward matches the arena yaw convention', () => {
    // yaw 0 faces -Z: from (0, 10) toward (0, 0) is straight -Z
    expect(yawToward(0, 10, 0, 0)).toBeCloseTo(0)
    // due +X target from origin
    expect(yawToward(0, 0, 10, 0)).toBeCloseTo(-Math.PI / 2)
  })

  it('random booster spots stay in bounds and clear of bikes and other boosters', () => {
    const bikes = [
      { x: BATTLE_SPAWNS.host.x, z: BATTLE_SPAWNS.host.z },
      { x: BATTLE_SPAWNS.joiner.x, z: BATTLE_SPAWNS.joiner.z },
    ]
    const spots = [randomBoosterSpot([], bikes, 0)]
    for (let i = 1; i < 6; i++) spots.push(randomBoosterSpot(spots, bikes, i))
    for (const s of spots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(HALF)
      expect(Math.abs(s.z)).toBeLessThanOrEqual(HALF)
      for (const b of bikes) expect(Math.hypot(s.x - b.x, s.z - b.z)).toBeGreaterThan(10)
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(14)
  })
})

describe('booster spread', () => {
  it('sector stratification covers the whole arena — no empty half, any roll', () => {
    for (let trial = 0; trial < 30; trial++) {
      const spots: { id: number; x: number; z: number }[] = []
      for (let i = 0; i < 5; i++) spots.push(randomBoosterSpot(spots, [], i))
      const angs = spots.map((s) => Math.atan2(s.z, s.x)).sort((a, b) => a - b)
      let maxGap = 0
      for (let i = 0; i < angs.length; i++) {
        const gap = i === angs.length - 1 ? angs[0] + 2 * Math.PI - angs[i] : angs[i + 1] - angs[i]
        maxGap = Math.max(maxGap, gap)
      }
      // one booster per 72° sector → worst gap is two sectors (144° < 180°);
      // old uniform random could leave half the arena empty
      expect(maxGap).toBeLessThan(Math.PI)
      for (const s of spots) expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(30)
    }
  })
})

describe('bike-vs-bike contact', () => {
  const bike = (x: number, z: number, yaw = 0): CycleState => ({
    x,
    z,
    yaw,
    speed: 20,
    vx: -Math.sin(yaw) * 20,
    vz: -Math.cos(yaw) * 20,
    lean: 0,
    isAutopilot: false,
    autopilotTarget: null,
  })

  it('ramming a parked foe shoves it: local keeps half the momentum', () => {
    const me = bike(0, 0, Math.PI) // facing +Z at 20 u/s, nose at z=0.81
    // parked foe facing -Z, nose gap 1.0 (< 1.1 contact threshold)
    resolveBikeContact(me, 0, 2.62, 0, 0, 0)
    // equal-mass inelastic: 20 u/s -> ~8.5 along heading; a QUARTER of the
    // overlap (0.025) is resolved locally — the residual keeps both sims in
    // contact so the shove continues on the foe's machine
    expect(me.speed).toBeCloseTo(8.5, 1)
    expect(me.z).toBeCloseTo(-0.025, 2)
    expect(me.x).toBeCloseTo(0, 5)
  })

  it('equal head-on nearly stops both bikes (small restitution rebound)', () => {
    const me = bike(0, 0, Math.PI) // +Z at 20
    const foeVz = -20 // foe moving -Z at 20
    resolveBikeContact(me, 0, 2.62, 0, 0, foeVz)
    // closing speed 40 -> post-impulse local velocity ≈ -3 (tiny rebound)
    expect(me.speed).toBeLessThan(0)
    expect(me.speed).toBeGreaterThan(-4)
  })

  it('bikes 5u apart never touch', () => {
    const me = bike(0, 0, 0)
    resolveBikeContact(me, 5, 5, 0, 0, 0)
    expect(me.x).toBe(0)
    expect(me.z).toBe(0)
    expect(me.speed).toBe(20)
  })

  it('a boosted rear-end shove never pushes the victim above its own drive speed', () => {
    // cruise victim at 26 (yaw 0 → moving -Z), rammer behind at 40 same heading
    const me = bike(0, 0, 0)
    me.speed = 26
    me.vz = -26
    resolveBikeContact(me, 0, 1, Math.PI / 2, 0, -40)
    // velocity takes the shove, but the drive scalar (the isRibbonCrash gate)
    // stays capped at the rider's own pre-shove speed — no derezz at cruise
    expect(me.vz).toBeLessThan(-26)
    expect(me.speed).toBe(26)

    // the rider's OWN overspeed (boost-release glide) survives the cap
    const glider = bike(0, 0, 0)
    glider.speed = 30
    glider.vz = -30
    resolveBikeContact(glider, 0, 1, Math.PI / 2, 0, -40)
    expect(glider.speed).toBe(30)
  })
})

describe('battle alley', () => {
  it('corridor and chamber count as inside; arena and slabs do not', () => {
    expect(isInsideAlley(0, 130)).toBe(true) // corridor
    expect(isInsideAlley(0, 300)).toBe(true) // deep corridor
    expect(isInsideAlley(0, 353)).toBe(true) // chamber
    expect(isInsideAlley(15, 350)).toBe(true) // chamber edge region
    expect(isInsideAlley(25, 350)).toBe(false) // beyond the chamber walls
    expect(isInsideAlley(0, 0)).toBe(false) // open arena
    expect(isInsideAlley(0, 119)).toBe(false) // still inside the arena
  })

  it('the south wall opens at the gate and the corridor walls contain the rider', async () => {
    const { resolveAlleyBlocks, updateCycleKinematics } = await import('./cyclePhysics')
    const me: import('./cyclePhysics').CycleState = {
      x: 0,
      z: 119,
      yaw: Math.PI, // facing +Z, driving south through the gate
      speed: 30,
      vx: 0,
      vz: 30,
      lean: 0,
      isAutopilot: false,
      autopilotTarget: null,
    }
    for (let i = 0; i < 30; i++) {
      updateCycleKinematics(
        me,
        { forward: false, backward: false, left: false, right: false, boost: false },
        1 / 60,
        undefined,
        undefined,
        true,
      )
      resolveAlleyBlocks(me)
    }
    expect(me.z).toBeGreaterThan(125) // passed through the gate
    // drifting east into the corridor wall gets pushed back inside
    me.x = 3.2
    me.vx = 20
    for (let i = 0; i < 10; i++) resolveAlleyBlocks(me)
    expect(Math.abs(me.x)).toBeLessThan(3.5)
  })

  it('moving sideways in the chamber does NOT snap the rider back to the arena wall', async () => {
    const { updateCycleKinematics } = await import('./cyclePhysics')
    const me: import('./cyclePhysics').CycleState = {
      x: 8, // chamber side, |x| well past the corridor's 3.5
      z: 350,
      yaw: 0,
      speed: 10,
      vx: 5,
      vz: 0,
      lean: 0,
      isAutopilot: false,
      autopilotTarget: null,
    }
    updateCycleKinematics(
      me,
      { forward: false, backward: false, left: false, right: false, boost: false },
      1 / 60,
      undefined,
      undefined,
      true,
    )
    expect(me.z).toBeGreaterThan(300) // still in the chamber
  })

  it('the chamber corners are sealed — no diagonal leak beside the terminal', async () => {
    const { resolveAlleyBlocks } = await import('./cyclePhysics')
    const { BATTLE_ALLEY_BLOCKS } = await import('./arena')
    // The old leak: the pocket at |x| 10..13 just north of the chamber walls
    for (const leak of [
      { x: 11.5, z: 339 },
      { x: -11.5, z: 339 },
      { x: 12.5, z: 339 },
    ]) {
      const me: import('./cyclePhysics').CycleState = {
        x: leak.x,
        z: leak.z,
        yaw: 0,
        speed: 0,
        vx: 0,
        vz: 0,
        lean: 0,
        isAutopilot: false,
        autopilotTarget: null,
      }
      // Iterate like the game loop — corners between touching slabs funnel
      // the bike through the neighbour before settling
      for (let i = 0; i < 5; i++) resolveAlleyBlocks(me)
      // Sealed corner = the pocket is inside a wall slab, so the bike must be
      // PUSHED (moved). An open leak would leave it untouched.
      expect(me.x !== leak.x || me.z !== leak.z).toBe(true)
      const overlaps = BATTLE_ALLEY_BLOCKS.some(
        (b) => me.x > b.x1 && me.x < b.x2 && me.z > b.z1 && me.z < b.z2,
      )
      expect(overlaps).toBe(false)
    }
  })

  it('slabs push a deep-overlapping bike fully out', async () => {
    const { resolveAlleyBlocks } = await import('./cyclePhysics')
    const me: import('./cyclePhysics').CycleState = {
      x: -6, // deep inside the west corridor wall (x -10..-3.5)
      z: 200,
      yaw: 0,
      speed: 20,
      vx: -15, // driving INTO the wall
      vz: 15,
      lean: 0,
      isAutopilot: false,
      autopilotTarget: null,
    }
    resolveAlleyBlocks(me)
    expect(me.x).toBeGreaterThanOrEqual(-3.5)
    expect(me.speed).toBeLessThan(20)
  })
})

describe('anti-stall accumulator', () => {
  const DT = 1 / 60
  it('accumulates while stalled and resets to zero on motion', () => {
    expect(stepStall(1.2, true, DT)).toBeCloseTo(1.2 + DT)
    expect(stepStall(9.9, false, DT)).toBe(0)
  })
})

describe('drift heat (anti-camp)', () => {
  const DT = 1 / 60
  const run = (pattern: (t: number) => boolean, seconds: number) => {
    // Returns [everLocked, secondsAtMax] for a duty pattern over time
    let heat = 0
    let locked = false
    let atMax = 0
    for (let t = 0; t < seconds; t += DT) {
      heat = stepDriftHeat(heat, pattern(t), DT)
      if (heat >= DRIFT_HEAT_MAX_S) locked = true
      if (heat >= DRIFT_HEAT_MAX_S) atMax++
    }
    return [locked, atMax * DT] as const
  }

  it('locks the held-Space steer-wiggle crawl (Reza: "hold drift, switch steer sides")', () => {
    // Space held CONSTANTLY, steer alternating — drifting every frame
    const [locked, atMax] = run(() => true, 6)
    expect(locked).toBe(true)
    // heat rate 1/s → saturates at exactly DRIFT_HEAT_MAX_S of drift
    expect(atMax).toBeGreaterThan(6 - DRIFT_HEAT_MAX_S - 0.2)
  })

  it('a legal slide under one full circle stays clean; a circle-length hold camps', () => {
    expect(run(() => true, 2.4)[0]).toBe(false) // just under one circle (~2.5s)
    expect(run(() => true, 3.0)[0]).toBe(true) // longer than a full circle = camping
  })

  it('tap-pulsed crawls below the ~75% duty equilibrium never lock', () => {
    // 0.45s taps / 0.25s gaps = 64% duty — net cooling per cycle
    expect(run((t) => t % 0.7 < 0.45, 30)[0]).toBe(false)
  })

  it('chained hard drifts with real gaps never lock (the "drift jams" guard)', () => {
    // 1.2s slides / 0.8s straights = 60% duty, sustained — still never
    expect(run((t) => t % 2 < 1.2, 60)[0]).toBe(false)
  })

  it('high-duty pulsing eventually locks — no pulse-pattern camp either', () => {
    // 0.9s on / 0.1s off = 90% duty: net +0.6/s per cycle carried forward
    expect(run((t) => t % 1 < 0.9, 12)[0]).toBe(true)
  })

  it('heat cools to zero and stays there when not drifting', () => {
    let heat = stepDriftHeat(0, true, 2) // 2s of drift
    heat = stepDriftHeat(heat, false, 1) // 1s off cools 3 units
    expect(heat).toBe(0)
  })
})

describe('crash freeze covers both screens', () => {
  // The wreck must keep its ribbon on BOTH screens: the crasher's own ribbons
  // freeze on their machine, and the foe's reconstructed ribbons freeze on the
  // winner's machine (regression: relying on the foe's last boosted snapshot
  // dissolved the ribbon when boost was released before impact).
  it('freezes the crasher own ribbons on their screen', () => {
    expect(ribbonCrashFrozen('me', false)).toBe(true)
    expect(ribbonCrashFrozen('foe', false)).toBe(false)
  })
  it('freezes the foe ribbons on the winner screen', () => {
    expect(ribbonCrashFrozen('foe', true)).toBe(true)
    expect(ribbonCrashFrozen('me', true)).toBe(false)
  })
  it('never freezes without a crash', () => {
    expect(ribbonCrashFrozen(null, false)).toBe(false)
    expect(ribbonCrashFrozen(null, true)).toBe(false)
  })
})

describe('remote pose prediction (dead reckoning)', () => {
  const out = { x: 0, z: 0, yaw: 0 }
  const motion = { velX: 0, velZ: 0, yawRate: 0 }

  it('measures true motion between snapshots (slip included)', () => {
    // bike drifting: heading yaw 0 (facing -Z) but moving diagonally — the
    // position delta, not heading × speed, is the velocity
    measureSnapshotMotion(
      { x: 0, z: 0, yaw: 0, recvAt: 1000 },
      { x: 0.5, z: -0.8, yaw: 0.1, recvAt: 1033 },
      26,
      motion,
    )
    expect(motion.velX).toBeCloseTo(0.5 / 0.033, 1)
    expect(motion.velZ).toBeCloseTo(-0.8 / 0.033, 1)
    expect(motion.yawRate).toBeCloseTo(0.1 / 0.033, 1)
  })

  it('falls back to heading × speed on degenerate gaps', () => {
    measureSnapshotMotion(
      { x: 5, z: 5, yaw: 0, recvAt: 1000 },
      { x: 5, z: 5, yaw: 0, recvAt: 1000 },
      20,
      motion,
    )
    expect(motion.velX).toBeCloseTo(0)
    expect(motion.velZ).toBeCloseTo(-20) // yaw 0 = facing -Z
    expect(motion.yawRate).toBe(0)
  })

  it('clamps absurd measured speed and yaw rate', () => {
    measureSnapshotMotion(
      { x: 0, z: 0, yaw: 0, recvAt: 1000 },
      { x: 500, z: 0, yaw: 10, recvAt: 1033 },
      0,
      motion,
    )
    expect(Math.hypot(motion.velX, motion.velZ)).toBeLessThanOrEqual(45.0001)
    expect(Math.abs(motion.yawRate)).toBeLessThanOrEqual(4.0001)
  })

  it('predicts straight-line motion at constant velocity', () => {
    predictPose({ x: 0, z: 0, yaw: 0 }, 0, -26, 0, 0.1, out)
    expect(out.x).toBeCloseTo(0)
    expect(out.z).toBeCloseTo(-2.6, 1)
    expect(out.yaw).toBeCloseTo(0)
  })

  it('turns the predicted arc, not a straight chord', () => {
    // yaw 0 = facing -Z, positive yawRate rotates toward -X; after 0.5s the
    // predicted position must have drifted off the straight -Z line
    predictPose({ x: 0, z: 0, yaw: 0 }, 0, -26, 1.2, 0.5, out)
    expect(out.x).toBeLessThan(-0.5) // curved left of the chord
    expect(out.z).toBeGreaterThan(-13) // and covered less forward ground
    expect(out.yaw).toBeCloseTo(0.6, 1)
  })

  it('caps the extrapolation horizon (hidden-tab 1Hz snapshots)', () => {
    predictPose({ x: 0, z: 0, yaw: 0 }, 0, -40, 0, 10, out)
    expect(out.z).toBeCloseTo(-40 * PREDICT_MAX_DT, 1)
  })

  it('never moves backwards on a negative dt', () => {
    predictPose({ x: 1, z: 2, yaw: 0.5 }, 0, -26, 1, -1, out)
    expect(out.x).toBeCloseTo(1)
    expect(out.z).toBeCloseTo(2)
    expect(out.yaw).toBeCloseTo(0.5)
  })
})

describe('isRibbonCrash (gate = DRIVE SPEED above normal max AND closing on the wall)', () => {
  it('max-cruise and below never derezz — even when wall-birth overlap reads |vn| = full |v|', () => {
    // 2026-11-18 playtest: overtake pass laid ribbon onto a cruising foe —
    // slip/shove pushed the VECTOR past 26 while the drive scalar stayed 26
    expect(isRibbonCrash(26)).toBe(false)
    expect(isRibbonCrash(10)).toBe(false)
    expect(isRibbonCrash(26, 1)).toBe(false)
  })

  it('any speed above normal derezzes when closing — including the post-boost-release glide', () => {
    // Reza: a last-moment boost release must NOT dodge the crash — the speed
    // glides down past 26 and stays lethal until it lands
    expect(isRibbonCrash(26.1)).toBe(true)
    expect(isRibbonCrash(35)).toBe(true)
    expect(isRibbonCrash(40)).toBe(true)
    expect(isRibbonCrash(27.5, 0.7)).toBe(true)
    expect(isRibbonCrash(40, 0.5)).toBe(true)
  })

  it('a >26 contact while travelling ALONG the wall only scrapes (2026-11-21 false derezzes)', () => {
    // Iran/VPN playtest: post-boost glide beside an own ribbon, a curl
    // tightening under the capsule, a dt-spike frame landing on a wall — all
    // closing-angle grazes nobody could see. They bounce + score now.
    expect(isRibbonCrash(40, 0)).toBe(false)
    expect(isRibbonCrash(35, 0.2)).toBe(false) // ~12° graze
    expect(isRibbonCrash(40, 0.49)).toBe(false) // just under the floor
  })

  it('ribbonClosingFraction: vn over travel, zero travel reads 0 (bounce)', () => {
    expect(ribbonClosingFraction(20, 40)).toBeCloseTo(0.5)
    expect(ribbonClosingFraction(20, 0)).toBe(0)
  })
})

describe('battle code entry (PWA join)', () => {
  it('accepts a bare code, lowercasing and stripping noise', () => {
    expect(normalizeBattleCode('xk7m2')).toBe('xk7m2')
    expect(normalizeBattleCode(' XK-7M2 ')).toBe('xk7m2')
  })

  it('extracts the code from a pasted invite link', () => {
    expect(normalizeBattleCode('https://reza.dev/portfolio/#b=xk7m2')).toBe('xk7m2')
    expect(normalizeBattleCode('http://localhost:5173/#b=xk7m2')).toBe('xk7m2')
  })
})
