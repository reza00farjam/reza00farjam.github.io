import React, { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { useAppStore, QualityTier } from '../lib/store'
import {
  CycleInputs,
  CycleState,
  resolveAlleyBlocks,
  resolveBikeContact,
  resolveTrailWalls,
  updateCycleKinematics,
} from '../lib/cyclePhysics'
import {
  DRIFT_HEAT_MAX_S,
  DRIFT_LOCK_S,
  STALL_FLIP_S,
  STALL_SPEED,
  STALL_WARN_S,
  isRibbonCrash,
  ribbonClosingFraction,
  stepDriftHeat,
  stepFuel,
  stepStall,
} from '../lib/battle'
import { battleRuntime, useBattleStore } from '../lib/battleStore'
import {
  forceFoeCrash,
  remoteRefs,
  reportDriftLock,
  reportFoeTrailHit,
  reportFoeWallTouch,
  reportLocalCrash,
} from '../lib/battleNet'
import { soundEngine } from '../lib/soundEngine'
import { GridFloor } from './GridFloor'
import { ArenaBoundary } from './ArenaBoundary'
import { DistantBeams } from './DistantBeams'
import { StationBillboards } from './StationBillboards'
import { BattleTerminalMarker } from './BattleTerminalMarker'
import { BattleAlley } from './BattleAlley'
import { Boosters } from './Boosters'
import { FoeNavArrow } from './FoeNavArrow'
import { Cycle } from './Cycle'
import { vehicleStatus, VEHICLE_MAP_COUNT } from './vehicleStatus'
import { Trail, TrailRibbon } from './Trail'
import { SkidMarks } from './SkidMarks'
import { CameraRig } from './CameraRig'
import { Effects } from './Effects'

interface RideSceneProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  inputsRef: React.MutableRefObject<CycleInputs>
  ribbonsRef: React.MutableRefObject<TrailRibbon[]>
  isMobile: boolean
  /** Reading a terminal dialog with the bike parked in the normal arena —
      the frame loop stops entirely (a fully static scene burning 60fps of
      GPU is pure battery/heat). Any input, dialog close, or duel resumes it. */
  paused: boolean
  /** Parked in the Read view (RideView stays mounted, hidden): the frame
      loop stops like `paused`, and window-level pointer/wheel listeners
      (camera orbit) ignore events — Read-mode drags must not steer or zoom
      the invisible camera. */
  parked: boolean
  /** The cold-entry veil holds: camera orbit/zoom locked along with it */
  veiled: boolean
  onNearbyStationChange: (stationId: string | null) => void
  onNearbyBattleChange: (nearby: boolean) => void
  onAutopilotArrived: (stationId: string) => void
  /** Cold-entry veil: fired once the bike + all player textures are in AND
      ~45 frames have settled after that (the shader-compile tail) — the
      moment the world is safe to unveil. 12s failsafe lifts any veil. */
  onReady: () => void
}

// Scratch pose for the owner-side wall probe — resolveTrailWalls mutates the
// state it resolves (push-out); the probe's mutations are discarded, only the
// hit callback matters.
const foeProbe: CycleState = {
  x: 0,
  z: 0,
  yaw: 0,
  speed: 0,
  vx: 0,
  vz: 0,
  lean: 0,
  isAutopilot: false,
  autopilotTarget: null,
}

// Controller component inside canvas frame loop to update kinematics and audio
const PhysicsLoop: React.FC<{
  cycleStateRef: React.MutableRefObject<CycleState>
  inputsRef: React.MutableRefObject<CycleInputs>
  ribbonsRef: React.MutableRefObject<TrailRibbon[]>
  onAutopilotArrived: (stationId: string) => void
}> = ({ cycleStateRef, inputsRef, ribbonsRef, onAutopilotArrived }) => {
  const setIsJumping = useAppStore((s) => s.setIsJumping)
  // Reused per-frame scratch for the listener's forward vector
  const camForward = useRef(new THREE.Vector3(0, 0, -1))

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const bt = useBattleStore.getState()
    const rt = battleRuntime
    const c = cycleStateRef.current
    const inp = inputsRef.current

    // Boost fuel economy, derived per frame from the RAW key state: while the
    // meter is empty/locked the boost key acts as NORMAL DRIVE, and a still-
    // held key resumes boosting automatically once regen passes the re-engage
    // threshold (no re-press). Countdown/timer/regen live in BattleClock.
    const battleRunning = bt.phase === 'running'
    // WAITING rides like a duel too (2026-11-05, Reza: "make it move like
    // when in battle") — for the awaiting HOST only: the joiner PARKS while
    // linking (they are usually standing at their own battle terminal, and
    // auto-cruise drove them away mid-join; the countdown places both bikes
    // at their corners anyway)
    const battleRide = battleRunning || (bt.phase === 'waiting' && bt.role === 'host')
    if (battleRide) {
      // AUTO-CRUISE: a light cycle never stops in a duel — the throttle is
      // always on and reverse is dead. The rider modulates steer / boost /
      // drift only (also the mobile control simplification). The physics'
      // battle mode makes the brake a drift aid that cannot stop the bike.
      inp.forward = true
      inp.backward = false
      if (battleRunning) {
        const blocked = rt.locked || rt.fuel <= 0
        const wantBoost = !!inp.boostHeld
        const effectiveBoost = wantBoost && !blocked
        if (inp.boost !== effectiveBoost) {
          inp.boost = effectiveBoost
          setIsJumping(effectiveBoost)
        }
      }

      // Anti-stall, wall crawls only (drift circles get the drift lock
      // below instead). Stalling costs NO points anymore — wall TOUCHES pay
      // the foe (see the wall-hit callback below), so a wall camper already
      // bleeds a point per contact; the stall rule is purely the stuck
      // rescue. Stalled = real velocity under STALL_SPEED (NOT the `speed`
      // scalar — a wall-pinned bike keeps a deceptively high one). The MOVE
      // warning fires at STALL_WARN_S with a 3-2-1 countdown to the flip;
      // the flip turns the bike around so the always-on throttle carries it
      // free (running and waiting alike — the MOVE! warning shows in both).
      const stalled = Math.hypot(c.vx ?? 0, c.vz ?? 0) < STALL_SPEED
      rt.stallFor = stepStall(rt.stallFor, stalled, dt)
      if (rt.stallFor >= STALL_FLIP_S) {
        rt.stallFor = 0
        c.yaw += Math.PI
        c.speed = Math.max(Math.abs(c.speed), 6)
        c.vx = 0
        c.vz = 0
      }
      const warn = stalled && rt.stallFor >= STALL_WARN_S
      if (warn !== bt.stallWarning) bt.setStallWarning(warn)

      // Drift heat (anti-camp): drifting heats the tyres, releasing cools
      // them — saturating locks brake/drift for DRIFT_LOCK_S. Catches every
      // slow-riding camp (held Space with wiggled steer sides, tap-pulsed
      // crawls, drift circles — staying slow REQUIRES the drift key), while
      // legal corner slides never accumulate. The lock is re-asserted EVERY
      // frame, so held keys and touch pedals cannot keep the drift alive; a
      // countdown chip (BattleDriftLock) shows when it re-engages.
      const steerHeld = inp.left !== inp.right
      rt.driftHeat = stepDriftHeat(rt.driftHeat, !!inp.brake && steerHeld, dt)
      if (rt.driftHeat >= DRIFT_HEAT_MAX_S) {
        rt.driftHeat = 0
        rt.driftLockUntil = Math.max(rt.driftLockUntil, performance.now() + DRIFT_LOCK_S * 1000)
        reportDriftLock() // foe's BattleLog shows the lock as attack intel
      }
      if (rt.driftLockUntil > performance.now()) inp.brake = false
    }

    // Countdown freezes both bikes at their corners; after the duel the
    // survivor rolls to a stop under the victory orbit
    const frozen = bt.phase === 'countdown' || bt.phase === 'ended'
    if (!frozen) {
      const preX = c.x
      const preZ = c.z
      // A LINKING joiner's duel has not started yet — their arena keeps the
      // normal-arena physics (gate passable, alley slabs solid) so a bike
      // parked at the battle terminal is not yanked by the sealed-arena
      // south clamp. The waiting HOST is transformed: hostBattle already
      // moved them to their battle corner.
      const normalArena = bt.phase === 'idle' || (bt.phase === 'waiting' && bt.role === 'joiner')
      updateCycleKinematics(
        c,
        inp,
        delta,
        onAutopilotArrived,
        (impactSpeed) => {
          soundEngine.playWallImpact(impactSpeed)
          // Duel rule (2026-11-05): an arena-wall touch costs a point —
          // EXACTLY the ribbon-touch rules (debounced 0.75s, no crash; only
          // ribbons derezz). Wall campers/corner-cutters pay per contact.
          if (battleRunning && impactSpeed > 2) reportFoeTrailHit()
        },
        normalArena, // alley gate open only in the normal arena
        battleRide, // duel mode: no burnout, brake = drift only
      )
      if (normalArena) {
        // Normal arena: the alley wall slabs are solid (they vanish in battle)
        resolveAlleyBlocks(c, (s) => soundEngine.playWallImpact(s))
      }
      if (battleRunning) {
        // Fuel = trail budget: boosting spends exactly the distance laid
        if (inp.boost) {
          const dist = Math.hypot(c.x - preX, c.z - preZ)
          const f = stepFuel(rt, true, dist, dt)
          rt.fuel = f.fuel
          rt.capacity = f.capacity
          rt.locked = f.locked
        }
        // Bike-vs-bike: equal-mass shove — each side resolves only its own
        // bike (mirrored on the foe's machine), so momentum exchanges
        // symmetrically over the link
        const r = remoteRefs.cycle.current
        resolveBikeContact(c, r.x, r.z, r.yaw, r.vx ?? 0, r.vz ?? 0, (s) =>
          soundEngine.playWallImpact(s),
        )

        // OWNER-SIDE WALL AUTHORITY: the foe's client only has a lagged 30Hz
        // reconstruction of MY ribbons — a wall whipped across their nose a
        // frame before contact could pass through clean over there (the
        // 2026-11-05 playtest pass-through). My ribbons are REAL on this
        // machine, so probe the foe's PREDICTED pose (what this screen
        // renders, ≈ their true pose now) against them and enforce the
        // outcome here: >26 strictly into the wall = crash; a bounce-speed
        // contact = a point for me (what this screen SEES is what scores —
        // the contactor's own lagged reconstruction may show no contact at
        // all). Every path is phase-gated so the duel ends/scores exactly
        // once no matter which side detects first. rearX/Z far off the map =
        // no head-skip: the FRESHEST wall segment is solid for the probe.
        if (rt.crashSide === null) {
          const r = remoteRefs.cycle.current
          const myRibbons = ribbonsRef.current
          if (myRibbons.length > 0) {
            foeProbe.x = r.x
            foeProbe.z = r.z
            foeProbe.yaw = r.yaw
            foeProbe.vx = r.vx ?? 0 // measured motion — drift slip included
            foeProbe.vz = r.vz ?? 0
            foeProbe.speed = Math.hypot(foeProbe.vx, foeProbe.vz)
            let probeVn = 0
            resolveTrailWalls(foeProbe, myRibbons, 1e9, 1e9, (s) => {
              probeVn = Math.max(probeVn, s)
              if (import.meta.env.DEV) {
                ;(window as unknown as { __wallProbe?: unknown }).__wallProbe = {
                  vn: s,
                  speed: foeProbe.speed,
                  at: performance.now(),
                }
              }
            })
            // Gate on the foe's SYNCED drive scalar (glides down past 26 after
            // boost release — a last-moment release never dodges the crash)
            // AND closing on the wall — the dead-reckoned pose under VPN
            // jitter can SLIDE along a wall extrapolated past a turn; that is
            // a bounce, not a derezz (see isRibbonCrash)
            if (
              probeVn > 0 &&
              isRibbonCrash(r.speed, ribbonClosingFraction(probeVn, foeProbe.speed))
            )
              forceFoeCrash(r.x, r.z)
            else if (probeVn > 0) reportFoeWallTouch(probeVn, foeProbe.x - r.x, foeProbe.z - r.z)
          }
        }
      }
    } else if (bt.phase === 'ended' && Math.abs(c.speed) > 0.05) {
      const decay = Math.max(0, 1 - dt * 3)
      c.speed *= decay
      c.vx = (c.vx ?? 0) * decay
      c.vz = (c.vz ?? 0) * decay
      c.x += (c.vx ?? 0) * dt
      c.z += (c.vz ?? 0) * dt
    }

    // Real-time procedural audio synthesis update (engine RPM, boost thruster, drift tyre screech)
    const isAccelerating = inp.forward || inp.boost
    const isBoosting = inp.boost || c.isAutopilot
    const isDrifting = !!c.isDrifting
    // Burnout: the engine revs against the brake while the bike stands still
    const revSpeed = c.isBurnout ? (inp.boost ? 40.0 : 26.0) : c.speed

    soundEngine.update(c.speed, isAccelerating, isBoosting, isDrifting, revSpeed)

    // Foe bike spatial audio — the camera is the listener, the synced remote
    // bike is the source; distance + pan give a second way to locate them
    // (active only mid-duel; every other phase fades the layers to zero)
    state.camera.getWorldDirection(camForward.current)
    soundEngine.updateFoe(
      remoteRefs.cycle.current,
      remoteRefs.inputs.current,
      state.camera.position,
      camForward.current,
      battleRunning,
    )
  })
  return null
}

// ============================ Quality ladder ============================
// Two-stage response to GPU pressure (measured 2026-11-17 on the Iris Xe
// laptop at 1080p: tier-1 bloom chain = 37fps at 2.07M px, 49fps at 1.44M,
// vsync-capped ~57fps at ≤1.17M — the cost is almost pure pixel count):
//
// 1. WARM-UP GATE (below): the first seconds after mount are obj.gz parse +
//    texture upload + PBR/bloom shader compile — multi-hundred-ms main-thread
//    hitches that have nothing to do with steady-state GPU load. Sampling
//    there read 9-of-10 windows under 40fps and demoted healthy machines to
//    tier 2 before the first ride ("the grid lines switch off immediately").
//    The monitor arms only after the bike attached + 120 rendered frames +
//    3s with a full sample (absolute fallback 20s so a missing model or a
//    warm-up spent reading modals can't disarm the ladder forever).
//    The gate also measures warm-up THROUGHPUT (storm hitches included — an
//    earlier filter that skipped stalled frames measured the smooth frames
//    BETWEEN hitches and over-primed by two steps) and primes the resolution
//    scale from it (bandwidth model: affordable px ∝ fps), so a weak GPU
//    STARTS at the resolution it can hold instead of spending ~12s stepping
//    down through choppy framerates.
//
// 2. ADAPTIVE RESOLUTION inside tier 1: onDecline first drops the internal
//    render resolution (dpr 1.0 → 0.6 in 0.04 steps) — bloom stays ON, the
//    canvas is CSS-upscaled, and on this class of iGPU the scene rides at
//    the vsync cap instead of losing its look. The scale ladder is ONE-WAY
//    like the tier ladder above it: incline recovery would ping-pong across
//    the fps band on marginal GPUs (each flip reallocates the render
//    targets), and re-entry into the ride re-primes fresh anyway. Only when
//    the floor is exhausted does the old ladder take over (tier 2 = composer
//    off, then dpr 1.0, then the Read fallback). Live dpr changes resize the
//    canvas and the postprocessing composer in place — no remount.
const SCALE_STEPS = 10 // dpr scale: 1.0 → 0.6 in SCALE_STEP_DROP steps
const SCALE_STEP_DROP = 0.04
const WARMUP_MIN_S = 3.0
const WARMUP_MIN_FRAMES = 120
const WARMUP_MAX_S = 10.0
const WARMUP_TARGET_FPS = 55 // prime the scale to HOLD this, not just survive

const QualityGate: React.FC<{ onArmed: (warmupFps: number) => void }> = ({ onArmed }) => {
  // t0/prev are seeded lazily on the FIRST rendered frame (performance.now()
  // in the useRef initializer is a render-phase impurity)
  const gateRef = useRef({
    t0: 0,
    frames: 0,
    fired: false,
    // Rolling recent-frame dts (~last 2-4s) — the arm-time THROUGHPUT
    // estimate. Storm hitches count (they are real load); only multi-second
    // gaps (a paused frame loop) reset the window.
    recent: [] as number[],
    prev: 0,
  })
  useFrame(() => {
    const g = gateRef.current
    if (g.fired) return
    const now = performance.now()
    if (g.t0 === 0) {
      g.t0 = now
      g.prev = now
    }
    const dt = now - g.prev
    g.prev = now
    // >2s = the frame loop was parked (reading modal / hidden tab), not GPU
    // load — start the estimate window over instead of counting the gap
    if (dt > 2000) {
      g.recent.length = 0
    } else {
      g.recent.push(dt)
      if (g.recent.length > 120) g.recent.shift()
    }
    g.frames++
    const t = (now - g.t0) / 1000
    // Normal arm: bike attached + enough frames + enough SAMPLE for a sane
    // prime. Hard timeout doubled: a >2s reading pause RESETS the sample, so
    // an arm would otherwise fire right after a pause with no data (no prime,
    // and the decline stumble the prime exists to skip).
    if (
      (vehicleStatus.builtAt > 0 &&
        g.frames >= WARMUP_MIN_FRAMES &&
        t >= WARMUP_MIN_S &&
        g.recent.length >= 60) ||
      t >= WARMUP_MAX_S * 2
    ) {
      g.fired = true
      // Stamp BEFORE onArmed: RideView's veil waits for this so the
      // resolution prime (canvas+composer buffer resize) lands while the
      // world is still veiled
      vehicleStatus.ladderArmedAt = performance.now()
      const sum = g.recent.reduce((a, b) => a + b, 0)
      onArmed(sum > 0 ? (g.recent.length * 1000) / sum : 999)
    }
  })
  return null
}

// Cold-entry readiness for RideView's veil (distinct from QualityGate above,
// which arms the quality LADDER): "ready" = bike attached + every player
// texture landed + the quality ladder ARMED (the resolution prime's
// canvas+composer buffer resize happens behind the veil too — lifting right
// after the assets still left one visible hitch, Reza: "still chopped a
// little") + 60 rendered frames after all that. Absolute 12s failsafe so a
// dead asset can't lock the rider out.
const RideReadyGate: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const gateRef = useRef({ t0: 0, framesAfterAssets: 0, fired: false })
  useFrame(() => {
    const g = gateRef.current
    if (g.fired) return
    const now = performance.now()
    if (g.t0 === 0) g.t0 = now
    const assetsIn = vehicleStatus.builtAt > 0 && vehicleStatus.mapsLoaded >= VEHICLE_MAP_COUNT
    if (assetsIn) g.framesAfterAssets++
    if (
      (assetsIn && g.framesAfterAssets >= 60 && vehicleStatus.ladderArmedAt > 0) ||
      now - g.t0 > 12000
    ) {
      g.fired = true
      onReady()
    }
  })
  return null
}

export const RideScene: React.FC<RideSceneProps> = ({
  cycleStateRef,
  inputsRef,
  ribbonsRef,
  isMobile,
  paused,
  parked,
  veiled,
  onNearbyStationChange,
  onNearbyBattleChange,
  onAutopilotArrived,
  onReady,
}) => {
  const qualityTier = useAppStore((s) => s.qualityTier)
  const battlePhase = useBattleStore((s) => s.phase)

  // Battle arena: the same grid, stripped of every terminal. The waiting phase
  // already swaps the arena over; the foe's bike appears once matched.
  const battleActive = battlePhase !== 'idle'
  const foeConnected =
    battlePhase === 'countdown' || battlePhase === 'running' || battlePhase === 'ended'

  const [tabHidden, setTabHidden] = useState(false)
  // Quality ladder: monitor arms after warm-up (see QualityGate); tier 1
  // adapts internal resolution before anything else is sacrificed
  const [monitorArmed, setMonitorArmed] = useState(false)
  const [dprScale, setDprScale] = useState(1)
  const scaleStepRef = useRef(0)

  // Pause rendering when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      setTabHidden(document.hidden)
      // The paused frame loop stops calling update(), which would freeze every
      // sound layer at its current level (e.g. full boost) — silence until visible
      if (document.hidden) soundEngine.stopContinuous()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Shared refs for camera and effects
  const cyclePosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0))
  const cycleTangentRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1))
  // Dummy sinks for the remote bike (Cycle writes them; nothing reads them)
  const remotePosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0))
  const remoteTangentRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1))

  // Determine DPR cap based on device and tier.
  // Desktop renders at NATIVE retina resolution (up to 2x) — a 1.5 cap was
  // upscaling the canvas on retina displays and read as low-quality textures.
  // Touch cap is 1.25 (was 1.5): postprocessing + a 1.5x buffer was the main
  // mobile heat source; phones keep MSAA (near-free on tile-based GPUs) for
  // the line work instead of raw pixels.
  // Tier 1 multiplies in the adaptive dprScale (see the quality ladder above):
  // the bloom chain's cost is almost pure pixel count, so resolution is the
  // first thing traded — never the bloom itself.
  const dpr = React.useMemo(() => {
    if (qualityTier >= 3) return 1.0
    if (typeof window === 'undefined') return 1.0
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const cap = isTouch ? 1.25 : 2.0
    const base = Math.min(window.devicePixelRatio || 1, cap)
    return qualityTier === 1 ? base * dprScale : base
  }, [qualityTier, dprScale])

  return (
    <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop={tabHidden || paused ? 'never' : 'always'}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          stencil: false,
          depth: true,
        }}
        camera={{ position: [0, 3, 20], fov: 55, near: 0.1, far: 500 }}
      >
        {/* Warm-up gate: arms the PerformanceMonitor only after the load
            storm (model parse, texture upload, shader compile) has passed,
            priming the tier-1 resolution scale from the measured warm-up fps */}
        <QualityGate
          onArmed={(warmupFps) => {
            setMonitorArmed(true)
            // Prime: scale ≈ sqrt(fps/target) (GPU-bandwidth model), rounded
            // up to the next step so the ladder errs slightly soft — the
            // ladder is one-way down, and a small over-estimate corrects via
            // one decline window while an under-estimate would stick
            if (warmupFps < WARMUP_TARGET_FPS) {
              const est = Math.sqrt(warmupFps / WARMUP_TARGET_FPS)
              const step = Math.min(SCALE_STEPS, Math.ceil((1 - est) / SCALE_STEP_DROP))
              scaleStepRef.current = step
              setDprScale(1 - SCALE_STEP_DROP * step)
            }
          }}
        />
        {/* Cold-entry readiness for RideView's materializing veil */}
        <RideReadyGate onReady={onReady} />
        {monitorArmed && (
          <PerformanceMonitor
            // Refresh-RELATIVE bands: "acceptable" must mean a fraction of
            // what the display can show, not a fixed 40-60. A 60Hz screen
            // judders below ~47fps even though 40 "sounds fine"; the wide
            // dead band (0.78..0.92 × refreshrate) is the anti-oscillation
            // hysteresis between the decline and incline sides.
            bounds={(rr) => (rr > 100 ? [rr * 0.55, rr * 0.9] : [rr * 0.78, rr * 0.92])}
            onDecline={() => {
              // getState() — the callbacks may outlive a render's closure
              const st = useAppStore.getState()
              // Tier 1: trade internal resolution FIRST. Bloom (the look)
              // survives; each decline window (~2.5s of sustained low fps)
              // steps dpr down 4%. Live dpr changes resize the canvas and
              // composer in place — no remount, no hitch.
              if (st.qualityTier === 1 && scaleStepRef.current < SCALE_STEPS) {
                scaleStepRef.current += 1
                setDprScale(1 - SCALE_STEP_DROP * scaleStepRef.current)
                return
              }
              // Resolution floor exhausted (or tier > 1): the old ladder.
              // Weak devices eventually fall back to the Read view — but
              // NEVER mid-duel: flipping the view unmounts RideView, which
              // concedes the battle. A PerformanceMonitor dip must not
              // forfeit a match.
              const next = Math.min(4, st.qualityTier + 1) as QualityTier
              st.setQualityTier(next)
              if (next === 4 && useBattleStore.getState().phase === 'idle') {
                st.setMode('simple')
              }
            }}
            onIncline={() => {
              const st = useAppStore.getState()
              // Tier 1 NEVER climbs back up (see the ladder notes above —
              // one-way by design, re-primed fresh on the next ride entry).
              // Tier 2 never re-enters tier 1: remounting the composer was
              // the periodic "laggy sometimes" oscillation. 4→3→2 is fine.
              if (st.qualityTier > 2) {
                st.setQualityTier((st.qualityTier - 1) as QualityTier)
              }
            }}
          />
        )}

        {/* Scene Background and Exponential Fog */}
        <color attach="background" args={['#03070d']} />
        <fogExp2 attach="fog" args={['#03070d', 0.015]} />

        {/* Lighting */}
        <ambientLight intensity={0.45} />
        <directionalLight position={[10, 30, 10]} intensity={0.8} />

        {/* Physics Kinematics Loop */}
        <PhysicsLoop
          cycleStateRef={cycleStateRef}
          inputsRef={inputsRef}
          ribbonsRef={ribbonsRef}
          onAutopilotArrived={onAutopilotArrived}
        />

        {/* Authentic TRON nav arrow — camera-parented top-center, aims at the
            foe (distance readout is the DOM FoeCompass under its slot) */}
        {foeConnected && <FoeNavArrow />}

        {/* Environment, Arena & Stations */}
        <GridFloor cyclePosRef={cyclePosRef} />
        <SkidMarks cycleStateRef={cycleStateRef} variant="cyan" />
        {/* The foe's drift marks, reconstructed from the synced drift flag —
            both riders see each other's traces on their own grid */}
        {foeConnected && <SkidMarks cycleStateRef={remoteRefs.cycle} variant="orange" />}
        <ArenaBoundary />
        <DistantBeams />
        {!battleActive ? (
          <>
            <BattleAlley />
            <StationBillboards
              cycleStateRef={cycleStateRef}
              onNearbyStationChange={onNearbyStationChange}
            />
            <BattleTerminalMarker
              cycleStateRef={cycleStateRef}
              onNearbyChange={onNearbyBattleChange}
            />
          </>
        ) : null}

        {/* Foe bike, its trail, and the fuel canisters */}
        {foeConnected && (
          <>
            <Cycle
              variant="orange"
              cycleStateRef={remoteRefs.cycle}
              cyclePosRef={remotePosRef}
              cycleTangentRef={remoteTangentRef}
              inputsRef={remoteRefs.inputs}
            />
            <Trail
              variant="orange"
              noCollide
              cycleStateRef={remoteRefs.cycle}
              inputsRef={remoteRefs.inputs}
              ribbonsRef={remoteRefs.ribbons}
              getMaxLength={() => battleRuntime.remoteCapacity}
            />
            <Boosters cycleStateRef={cycleStateRef} />
          </>
        )}

        {/* Player Cycle & Trail — every rider rides cyan; only the foe is orange */}
        <Cycle
          variant="blue"
          cycleStateRef={cycleStateRef}
          cyclePosRef={cyclePosRef}
          cycleTangentRef={cycleTangentRef}
          inputsRef={inputsRef}
        />
        <Trail
          variant="cyan"
          cycleStateRef={cycleStateRef}
          inputsRef={inputsRef}
          ribbonsRef={ribbonsRef}
          foeRibbonsRef={foeConnected ? remoteRefs.ribbons : undefined}
          getMaxLength={foeConnected ? () => battleRuntime.capacity : undefined}
          onCrash={foeConnected ? reportLocalCrash : undefined}
        />

        {/* Chase Camera — window-level listeners gated on the interaction
            lock (`parked` Read-mode park, `veiled` cold-start veil) */}
        <CameraRig
          cycleStateRef={cycleStateRef}
          cyclePosRef={cyclePosRef}
          cycleTangentRef={cycleTangentRef}
          isMobile={isMobile}
          parked={parked}
          veiled={veiled}
        />

        {/* Post-processing (Bloom + Vignette) */}
        <Effects />
      </Canvas>
    </div>
  )
}
