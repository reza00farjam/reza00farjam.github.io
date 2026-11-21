// Grid Battle rules — pure constants & functions, no THREE/React/network.
// Unit-tested in battle.test.ts.

export const BATTLE_BASE_CAPACITY = 80 // fuel = trail length budget; capacity = max active ribbon length
export const BOOSTER_GAIN = 20 // capacity AND fuel gain per booster pickup
export const BOOST_REGEN_FRAC = 0.15 // of capacity per second while not boosting
export const BOOST_REENGAGE_FRAC = 0.2 // empty meter locks boost until refilled to this fraction
// Into-wall speed that turns a trail contact into a crash. History: 12 derezzed
// even shallow grazes; 20 still killed cruise-speed contacts at ~50°; 24 kept
// near-head-on cruise hits lethal. Since 2026-11-05 (Reza: "only hits ABOVE
// normal drive crash") the gate is the normal max speed itself — 26 u/s
// (94 km/h), compared STRICTLY greater in Trail: anything you can reach
// without boosting (≤ 93.6 km/h) bounces and scores; only boost-range
// contact speed derezzes.
export const BATTLE_CRASH_SPEED = 26

// 2026-11-21 (Iran/VPN playtest — repeated false "own ribbon" derezzes nobody
// could see): speed ALONE made every >26 contact a crash, including grazes
// where the rider was travelling ALONG the wall — the post-boost-release
// glide (drive scalar still 40→26) drifting beside an own ribbon, a curl
// tightening under the capsule, or a dt-spike frame (VPN jitter) landing the
// capsule ON a wall for a single frame. A derezz now additionally requires
// CLOSING: vn must be at least half the rider's travel speed (≥ ~30°
// approach). vn may only NARROW the crash (AND-condition) — never replace the
// speed gate: when a wall is BORN inside the capsule (overtake pass) the push
// normal points along travel, so |vn| reads the full velocity VECTOR, which
// drift slip and bike-shove kicks push past 26 at plain cruise — vn as THE
// gate derezzed a cruising foe on a shallow overtake birth (2026-11-18).
export const RIBBON_CRASH_MIN_CLOSING = 0.5

/** Ribbon-crash gate, shared by all three call sites (own walls + foe walls
    in Trail, owner probe in RideScene): crash ⟺ the contactor's DRIVE SPEED —
    the gauge scalar, which GLIDES down past 26 for a while after boost
    release — is above normal max while touching a ribbon AND the rider is
    closing on the wall (vn ≥ RIBBON_CRASH_MIN_CLOSING × travel speed). A
    last-moment boost release still cannot dodge a real hit; riding ALONG a
    ribbon at >26 now only scrapes it. closingFraction defaults to 1 for
    callers without a normal in hand. */
export function isRibbonCrash(driveSpeed: number, closingFraction = 1): boolean {
  return driveSpeed > BATTLE_CRASH_SPEED && closingFraction >= RIBBON_CRASH_MIN_CLOSING
}

/** vn / travel speed — the closing fraction isRibbonCrash takes. travel ≈ 0
    (a >26 drive scalar with no real velocity — shove kicks) reads 0: bounce. */
export function ribbonClosingFraction(intoWallSpeed: number, travelSpeed: number): number {
  return travelSpeed > 1e-3 ? intoWallSpeed / travelSpeed : 0
}
export const HIT_DEBOUNCE = 0.75 // s between scored trail hits — one per contact episode
export const BATTLE_DURATION = 240 // s (4 min)
export const COUNTDOWN_SECONDS = 5
export const BOOSTER_COUNT = 5
export const BOOSTER_RESPAWN = 6 // s
// Anti-stall (duels are auto-cruise — bikes never stop on purpose, but wall
// grinds can still crawl): stalling costs NO points anymore (2026-11-05 —
// wall TOUCHES pay the foe now, so a wall-camper is already bleeding points
// on every contact debounce; the stall rule is purely the stuck rescue). The
// MOVE warning ("…FLIPS YOU IN N") fires at STALL_WARN_S of stalling (full
// 3-2-1 countdown) and STALL_FLIP_S turns the bike around so the always-on
// throttle carries it free. Same in running and waiting.
export const STALL_SPEED = 5 // u/s (18 km/h)
export const STALL_WARN_S = 2 // warn with 3s of countdown left before the flip
export const STALL_FLIP_S = 5
// Foe-proximity spectrum endpoints (nav arrow tint + distance readout):
// fully muted beyond FAR, fully the foe's theme inside NEAR, blending between
export const FOE_SPECTRUM_FAR = 120
export const FOE_SPECTRUM_NEAR = 40

/** Crash freeze (2026-11-07): whoever derezzed keeps their ribbons on BOTH
    screens — the crasher's own ribbons freeze on their screen ('me'), and the
    foe's reconstructed ribbons freeze on the winner's screen ('foe'). Relying
    on the foe's last boosted snapshot to keep emitting broke the moment they
    released boost (or hit fuel-out) before impact: the final snapshot carried
    boost=0, emission closed, and the ribbon dissolved from under the wreck. */
export const ribbonCrashFrozen = (crashSide: 'me' | 'foe' | null, isRemote: boolean): boolean =>
  crashSide === (isRemote ? 'foe' : 'me')

// Drift-camp penalty: brake/drift disabled for this long once drift heat
// saturates; the countdown chip shows when it re-engages
export const DRIFT_LOCK_S = 5

/** One frame of the stall accumulator: grows while stalled, resets on motion.
    "Stalled" here = crawling (real velocity under STALL_SPEED). */
export function stepStall(stalledFor: number, stalled: boolean, dt: number): number {
  return stalled ? stalledFor + dt : 0
}

// Drift heat: the anti-camp meter (2026-11-07, replaces the circle detector).
// ANY slow-riding camp needs the drift key held at high duty — staying slow in
// a duel requires braking (auto-cruise pins 26 otherwise) and the brake is
// drift-only. Shape recognition could never separate camp from legal drifting
// (a real powerslide IS a tight circle; a held Space with wiggled steer sides
// crawls at the 10 u/s floor forever without ever "circling"). So drift TIME
// itself is the signal: drifting heats the tyres (+1/s), releasing cools them
// (−DRIFT_HEAT_COOL/s). Saturating DRIFT_HEAT_MAX_S locks drift for
// DRIFT_LOCK_S. Sustained duty above cool/(1+cool) ≈ 75% eventually locks —
// the held-Space wiggle hits it in exactly DRIFT_HEAT_MAX_S; legal corner
// slides (short bursts with straights between) never get near, and heat
// floors at 0 so gaps fully repay a slide of 1/3 its length. MAX is 2.5s —
// one full drift circle at the floor speed takes ~2.5s (Reza's playtest
// number, 2026-11-07): heat fills exactly over one circle, so any hold
// longer than a single legal circle is already camping.
export const DRIFT_HEAT_MAX_S = 2.5
export const DRIFT_HEAT_COOL = 3.0

export function stepDriftHeat(heat: number, drifting: boolean, dt: number): number {
  const h = drifting ? heat + dt : heat - DRIFT_HEAT_COOL * dt
  return Math.min(DRIFT_HEAT_MAX_S, Math.max(0, h))
}
// Canister pickup zone — the glowing floor ring under each booster marks
// exactly this radius in the rider's own theme color (Boosters.tsx)
export const BOOSTER_RADIUS = 2.2

/** Yaw (0 = facing -Z) that makes a bike at (fx,fz) face (tx,tz). */
export function yawToward(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - fx), -(tz - fz))
}

// Opposite corners of the arena, both facing the center
export const BATTLE_SPAWNS = {
  host: { x: -100, z: -100, yaw: yawToward(-100, -100, 0, 0) },
  joiner: { x: 100, z: 100, yaw: yawToward(100, 100, 0, 0) },
}

// South grid, facing the arena center — clear of every station marker
// At the end of the outside alley (normal arena only) — the terminal faces
// north so riders park facing it as they arrive down the corridor
export const BATTLE_TERMINAL_POS = { x: 0, z: 353, heading: Math.PI }

export interface FuelState {
  fuel: number
  capacity: number
  locked: boolean
}

/** One frame of the fuel/cooldown economy: boosting spends trail budget
    (distance laid), not boosting regenerates; empty locks until re-engage. */
export function stepFuel(f: FuelState, boosting: boolean, distance: number, dt: number): FuelState {
  if (boosting) {
    const fuel = Math.max(0, f.fuel - distance)
    return { fuel, capacity: f.capacity, locked: fuel <= 0 ? true : f.locked }
  }
  const fuel = Math.min(f.capacity, f.fuel + f.capacity * BOOST_REGEN_FRAC * dt)
  const locked = f.locked && fuel < f.capacity * BOOST_REENGAGE_FRAC
  return { fuel, capacity: f.capacity, locked }
}

export function boosterGain(f: FuelState): FuelState {
  const capacity = f.capacity + BOOSTER_GAIN
  return { capacity, fuel: Math.min(capacity, f.fuel + BOOSTER_GAIN), locked: f.locked }
}

export type BattleOutcome = 'me' | 'foe' | 'tie'

/** Timer expiry: whoever CAUSED more opponent trail-hits wins (score.me = hits
    the foe took on my ribbons). Equal = stalemate. */
export function timerWinner(meScore: number, foeScore: number): BattleOutcome {
  if (meScore > foeScore) return 'me'
  if (foeScore > meScore) return 'foe'
  return 'tie'
}

// ---------------------------------------------------------------------------
// Remote pose prediction (dead reckoning). The old renderer chased the latest
// 30Hz snapshot, so the rendered foe trailed the foe's TRUE pose by one-way
// latency + smoothing (~1-3.5u at boost) — the two screens disagreed about
// every consumer of the pose (bike, ribbons, radar, arrow, bike-vs-bike
// shoves). Prediction extrapolates the foe's own snapshots to TRUE NOW using
// velocity measured between consecutive snapshots (slip included), so both
// machines render near-identical poses.

export interface Pose {
  x: number
  z: number
  yaw: number
}

export interface FoeMotion {
  velX: number
  velZ: number
  yawRate: number
}

// Hidden tabs throttle the send timer to ~1Hz — keep predicting up to 1s
// (auto-cruise keeps a hidden foe riding mostly straight); beyond it freeze
// (the 6s liveness watchdog owns true silence)
export const PREDICT_MAX_DT = 1
const PREDICT_MAX_SPEED = 45 // u/s — defensive clamp vs corrupted snapshots
const PREDICT_MAX_YAW_RATE = 4 // rad/s (a floor-speed drift circle is ~2.6)

/** True motion across one snapshot gap: world velocity from position deltas
    (includes drift slip, unlike heading × speed) + wrapped yaw rate. Degenerate
    gaps (reset, duplicate timestamp) fall back to heading × speed. */
export function measureSnapshotMotion(
  prev: Pose & { recvAt: number },
  next: Pose & { recvAt: number },
  speed: number,
  out: FoeMotion,
): void {
  const gap = (next.recvAt - prev.recvAt) / 1000
  if (gap >= 0.004 && gap <= 2) {
    out.velX = (next.x - prev.x) / gap
    out.velZ = (next.z - prev.z) / gap
    let dy = next.yaw - prev.yaw
    while (dy > Math.PI) dy -= 2 * Math.PI
    while (dy < -Math.PI) dy += 2 * Math.PI
    out.yawRate = Math.min(PREDICT_MAX_YAW_RATE, Math.max(-PREDICT_MAX_YAW_RATE, dy / gap))
  } else {
    out.velX = -Math.sin(next.yaw) * speed
    out.velZ = -Math.cos(next.yaw) * speed
    out.yawRate = 0
  }
  const sp = Math.hypot(out.velX, out.velZ)
  if (sp > PREDICT_MAX_SPEED) {
    out.velX = (out.velX / sp) * PREDICT_MAX_SPEED
    out.velZ = (out.velZ / sp) * PREDICT_MAX_SPEED
  }
}

/** Integrate one snapshot forward by dt: constant body velocity rotated by the
    measured yaw rate each substep, so a turning foe traces its arc instead of
    a straight chord. Yaw convention: forward = (−sin yaw, −cos yaw), so
    rotating a world vector by δ is (x cos δ + z sin δ, −x sin δ + z cos δ). */
export function predictPose(
  from: Pose,
  velX: number,
  velZ: number,
  yawRate: number,
  dt: number,
  out: Pose,
): void {
  const sp = Math.hypot(velX, velZ)
  const scale = sp > PREDICT_MAX_SPEED ? PREDICT_MAX_SPEED / sp : 1
  let vx = velX * scale
  let vz = velZ * scale
  const w = Math.min(PREDICT_MAX_YAW_RATE, Math.max(-PREDICT_MAX_YAW_RATE, yawRate))
  let x = from.x
  let z = from.z
  let yaw = from.yaw
  let t = Math.min(PREDICT_MAX_DT, Math.max(0, dt))
  const H = 1 / 30
  while (t > 1e-6) {
    const h = Math.min(H, t)
    t -= h
    const a = w * h
    const c = Math.cos(a)
    const s = Math.sin(a)
    const nvx = vx * c + vz * s
    const nvz = -vx * s + vz * c
    vx = nvx
    vz = nvz
    x += vx * h
    z += vz * h
    yaw += w * h
  }
  out.x = x
  out.z = z
  out.yaw = yaw
}

export interface BoosterSpot {
  id: number
  x: number
  z: number
}

/** Booster placement, stratified by SECTOR: the arena is divided into
    BOOSTER_COUNT angular wedges around the center and each booster id owns
    one wedge, placed at a random point inside it. The pack always covers the
    whole arena — cluster-free by construction (plain uniform random could
    pile several canisters into one corner, 2026-11-05). A respawned id
    re-rolls within its OWN wedge, so the region keeps its canister. Bike
    clearance and mutual clearance (adjacent wedges meet) are retry-checked;
    the sector split makes those retries cheap, not load-bearing. */
/** Normalize a hand-typed battle code: accept the bare 5-char id, or a pasted
    invite link (…#b=<id>) — PWA riders cannot open links, so the launcher's
    code box is their way in. Lowercase + strip everything non-alphanumeric. */
export function normalizeBattleCode(raw: string): string {
  const m = raw.match(/#b=([a-z0-9]+)/i)
  return (m ? m[1] : raw).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function randomBoosterSpot(
  existing: BoosterSpot[],
  bikes: { x: number; z: number }[],
  id: number,
): BoosterSpot {
  const SECTOR = (2 * Math.PI) / BOOSTER_COUNT
  const base = SECTOR * (id % BOOSTER_COUNT)
  const R_MIN = 35 // keep the wedges from collapsing onto the exact center
  // 2026-11-05: wall touches now score for the foe, so canisters keep a wide
  // berth from the walls (120 half - 24) — nobody should have to graze a wall
  // to grab fuel
  const R_MAX = 96
  for (let attempt = 0; attempt < 40; attempt++) {
    const ang = base + Math.random() * SECTOR
    const r = R_MIN + Math.random() * (R_MAX - R_MIN)
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r
    const clearOfBikes = bikes.every((b) => Math.hypot(b.x - x, b.z - z) > 10)
    const clearOfOthers = existing.every((s) => Math.hypot(s.x - x, s.z - z) > 14)
    if (clearOfBikes && clearOfOthers) return { id, x, z }
  }
  // ponytail: fixed fallback after 40 tries — sector wedges make it practically unreachable
  return { id, x: Math.cos(base) * 70, z: Math.sin(base) * 70 }
}
