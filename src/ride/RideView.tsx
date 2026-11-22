import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { profile } from '../data/profile'
import { Materializing } from '../hud/Materializing'
import { stations } from '../data/stations'
import { projects } from '../data/projects'
import { STATION_COORDINATES, getStationFrontPosition, isInsideAlley } from '../lib/arena'
import { CycleInputs, CycleState } from '../lib/cyclePhysics'
import { StationNav } from '../hud/StationNav'
import { ModeToggle } from '../hud/ModeToggle'
import { AudioToggle } from '../hud/AudioToggle'
import { SpeedStreaks } from '../hud/SpeedStreaks'
import { Radar } from '../hud/Radar'
import { StationPrompt } from '../hud/StationPrompt'
import { StationInspector } from '../hud/StationInspector'
import { MobileControls } from '../hud/MobileControls'
import { RideScene } from './RideScene'
import type { TrailRibbon } from './Trail'
import { vehicleStatus } from './vehicleStatus'
import { useAppStore } from '../lib/store'
import {
  clearStationHash,
  clearUrlHash,
  getBattleIdFromHash,
  getHashStationId,
  updateAlleyHash,
  updateUrlHash,
} from '../lib/hashSync'
import { soundEngine } from '../lib/soundEngine'
import { useBattleStore, battleRuntime } from '../lib/battleStore'
import {
  hostBattle,
  joinBattle,
  leaveBattle,
  localRefs,
  remoteRefs,
  notifyRideReady,
} from '../lib/battleNet'
import { BATTLE_SPAWNS } from '../lib/battle'
import {
  BattleChallenge,
  BattleClock,
  BattleCountdown,
  BattleDialog,
  BattleDriftLock,
  BattleFuelGauge,
  BattleJoinStatus,
  BattleLog,
  BattleResult,
  BattleStallWarning,
  BattleStrip,
} from '../hud/BattleHud'
import { HelpDialog } from '../hud/HelpDialog'

/** "?" — opens How to Play while WAITING for a challenger (the host rides
    the waiting arena). Not mounted during the duel itself; the challenge
    screen and result dialog keep their own entry points. */
const HelpToggle: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="How to play"
      title="How to play"
      className="p-2 lg:px-3 lg:py-1.5 text-xs font-mono uppercase tracking-wider transition-colors duration-100 border border-cyan/40 hover:border-cyan bg-deep/80 text-ice hover:text-core hover:bg-deep focus-visible:outline-ember cursor-pointer flex items-center justify-center gap-1.5"
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0" aria-hidden="true">
        <span className="text-sm leading-none font-bold text-cyan">?</span>
      </span>
      <span className="text-muted font-semibold">How to Play</span>
    </button>
  )
}

export const RideView: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const setActiveStationId = useAppStore((s) => s.setActiveStationId)
  const setIsJumping = useAppStore((s) => s.setIsJumping)
  const qualityTier = useAppStore((s) => s.qualityTier)
  const battlePhase = useBattleStore((s) => s.phase)
  const battleEnd = useBattleStore((s) => s.end)

  const [isMobile, setIsMobile] = useState(false)
  const [nearbyStationId, setNearbyStationId] = useState<string | null>(null)
  // Rider entered the battle alley — station shortcuts hide like the radar
  // blips do (polled: entering/leaving needs no per-frame React state)
  const [inAlley, setInAlley] = useState(false)
  const [inspectingStationId, setInspectingStationId] = useState<string | null>(null)
  const [nearBattleTerminal, setNearBattleTerminal] = useState(false)
  const [battleDialogOpen, setBattleDialogOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // A #battle= link NEVER auto-joins — the challenger lands on the challenge
  // screen and enters deliberately (the duel waits; they can read the rules)
  const [challengeId, setChallengeId] = useState<string | null>(() => getBattleIdFromHash())

  const battleActive = battlePhase !== 'idle'
  const foeConnected =
    battlePhase === 'countdown' || battlePhase === 'running' || battlePhase === 'ended'

  // Reading a terminal (station inspector, battle launcher, help) parks the
  // whole render loop in the normal arena — a static scene at 60fps is pure
  // battery burn. Duels keep rendering (their clock/physics never pause).
  // Parked ALSO while the visitor reads in the Read view: RideView stays
  // MOUNTED across mode switches (App keeps it alive once entered) so the
  // WebGL context — textures, shaders, composer buffers — survives instead
  // of being rebuilt on every switch ("each switch caused the chopped scene
  // again"). The context does zero work while parked; it just stays warm.
  const reading = !!inspectingStationId || battleDialogOpen || helpOpen
  const scenePaused = (!active || reading) && battlePhase === 'idle'

  // Inputs must not leak across the park: a key pressed while hidden (its
  // keyUP lands after deactivation and would be swallowed below) would
  // otherwise re-activate into a stuck throttle
  const activeRef = useRef(active)

  // Cold-entry veil (2026-11-17): the FIRST ride mount on a page runs the
  // obj.gz parse (300-600ms main-thread hitch), texture upload, and shader
  // compile — rendered raw that read as a chopped scene for a few seconds.
  // The veil locks the world behind a dark spinner (canvas + vignette only;
  // HUD and dialogs stay usable above it) until RideReadyGate reports the
  // assets in and settled. Warm entries skip it entirely: the Read-view
  // background warm-up (App.tsx → warmVehicle) has usually parsed the proto
  // already, and builtAt > 0 means the remaining work is sub-second.
  const [veilActive, setVeilActive] = useState(() => vehicleStatus.builtAt === 0)
  const [veilFading, setVeilFading] = useState(false)
  const veilActiveRef = useRef(vehicleStatus.builtAt === 0)
  // Warm mount (proto parsed during Read, or a parked revive): ready NOW —
  // arms the battle hello gate without waiting for the frame-count settle
  useEffect(() => {
    if (vehicleStatus.builtAt > 0) notifyRideReady()
  }, [])
  const handleRideReady = useCallback(() => {
    if (!veilActiveRef.current) return
    veilActiveRef.current = false
    setVeilFading(true)
    window.setTimeout(() => {
      setVeilActive(false)
      // Battle gate AFTER the fade completes (idempotent): the joiner's
      // hello — and any stashed host 'start' — releases only once the veil
      // is fully gone, so the countdown and the materializing spinner can
      // never coexist, not even for the fade's half-second
      notifyRideReady()
    }, 550)
  }, [])

  // Stable refs for keyboard event listener so re-renders never tear down or drop keys
  const nearbyStationIdRef = useRef<string | null>(null)
  const inspectingStationIdRef = useRef<string | null>(null)
  const nearBattleTerminalRef = useRef(false)
  const battleDialogOpenRef = useRef(false)
  const activeKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    nearbyStationIdRef.current = nearbyStationId
    inspectingStationIdRef.current = inspectingStationId
    nearBattleTerminalRef.current = nearBattleTerminal
    battleDialogOpenRef.current = battleDialogOpen
    // Dev-only battle store handle for CDP HUD verification (same pattern as
    // __trailDebug) — lets headless probes force phase/role/error to test
    // battle HUD rendering without a live P2P duel.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __battleStore?: unknown }).__battleStore = useBattleStore
      ;(window as unknown as { __battleRuntime?: unknown }).__battleRuntime = battleRuntime
      // Remote refs (foe pose/ribbons/latest snapshot) — lets headless probes
      // fake the synced opponent, e.g. to test the owner-side wall authority
      ;(window as unknown as { __battleRemote?: unknown }).__battleRemote = remoteRefs
      // Net entry points — enable full headless P2P duels across two tabs
      ;(window as unknown as { __battleNet?: unknown }).__battleNet = {
        hostBattle,
        joinBattle,
        leaveBattle,
      }
    }
  }, [nearbyStationId, inspectingStationId, nearBattleTerminal, battleDialogOpen])

  useEffect(() => {
    nearbyStationIdRef.current = nearbyStationId
    inspectingStationIdRef.current = inspectingStationId
  }, [nearbyStationId, inspectingStationId])

  // Filter out empty projects station if needed
  const validStations = useMemo(() => {
    return stations.filter((s) => {
      if (s.kind === 'projects' && projects.length === 0) return false
      return true
    })
  }, [])

  // Input states
  const inputsRef = useRef<CycleInputs>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    boost: false,
  })

  // Cycle physical state - a battle-link joiner starts at its duel corner (it
  // would otherwise spawn on the Intro pad and trip the terminal toast);
  // otherwise spawns in front of the deep-linked station when the URL has one
  // (no arrival drive), or the Intro terminal
  const initialSpawn = getBattleIdFromHash()
    ? BATTLE_SPAWNS.joiner
    : (getStationFrontPosition(getHashStationId() ?? 'intro') ?? getStationFrontPosition('intro'))
  const cycleStateRef = useRef<CycleState>({
    x: initialSpawn.x,
    z: initialSpawn.z,
    yaw: initialSpawn.yaw,
    speed: 0,
    lean: 0,
    isAutopilot: false,
    autopilotTarget: null,
  })

  // Live boost-trail ribbons, shared between the arena renderer and the radar
  const ribbonsRef = useRef<TrailRibbon[]>([])

  // Park/revive across mode switches — see scenePaused above
  useEffect(() => {
    const was = activeRef.current
    activeRef.current = active
    if (was && !active) {
      activeKeysRef.current.clear()
      const inputs = inputsRef.current
      inputs.forward = false
      inputs.backward = false
      inputs.left = false
      inputs.right = false
      inputs.boost = false
      inputs.brake = false
      setIsJumping(false)
    }
  }, [active, setIsJumping])

  // Alley watch for the desktop station shortcuts (hidden inside, like the
  // radar blips) + the #battle fragment (rides along only while idle — a
  // live duel owns the #b= link). Same-value writes are free — no per-frame churn.
  useEffect(() => {
    const id = window.setInterval(() => {
      const c = cycleStateRef.current
      const inside = isInsideAlley(c.x, c.z)
      setInAlley(inside)
      if (useBattleStore.getState().phase === 'idle') updateAlleyHash(inside)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  // Ride root element, for imperative zoom-cursor toggling
  const rootRef = useRef<HTMLDivElement>(null)

  // Grid Battle: expose the local bike to the net layer and tear the session
  // down on unmount (switching to Read mid-duel concedes — the foe sees the
  // rider leave). Invite links NEVER auto-join: the challenge screen gates
  // the join (see challengeId). Opening a link in a tab that is ALREADY on
  // the site is a same-document hash navigation — no remount — so hashchange
  // must surface the challenge screen too.
  const challengeIdRef = useRef<string | null>(challengeId)
  useEffect(() => {
    challengeIdRef.current = challengeId
  }, [challengeId])

  const enterChallenge = useCallback(async () => {
    const id = challengeIdRef.current
    if (!id) return false
    try {
      // Resolves once the attempt is WIRED, not linked — keep the challenge
      // screen up until the duel actually starts, so a failed join leaves
      // the Enter button for an in-place retry (no page reload)
      await joinBattle(id)
      // The invite is CONSUMED: drop the challenge id and the #b= fragment
      // now, or the challenge screen would resurrect after the duel ends
      // and the rider exits back to idle
      setChallengeId(null)
      clearUrlHash()
      return true
    } catch {
      // toast shows the failure; the challenge screen stays for a retry
      return false
    }
  }, [])

  /** Rejecting an invite drops the rider at the battle terminal (they may
      well want to start their own duel) instead of wherever the link found
      them. clearUrlHash uses replaceState, so no hashchange fires and the
      dropped invite cannot resurrect the challenge screen. */
  const rejectChallenge = useCallback(() => {
    setChallengeId(null)
    clearUrlHash()
    const park = getStationFrontPosition('battle')
    const c = cycleStateRef.current
    if (park) {
      c.x = park.x
      c.z = park.z
      c.yaw = park.yaw
    }
    c.speed = 0
    c.vx = 0
    c.vz = 0
    c.lean = 0
    c.isAutopilot = false
    c.autopilotTarget = null
    ribbonsRef.current.length = 0
  }, [])

  useEffect(() => {
    localRefs.cycle.current = cycleStateRef.current
    localRefs.inputs.current = inputsRef.current
    localRefs.ribbons.current = ribbonsRef.current

    const onHashChange = () => {
      const battleId = getBattleIdFromHash()
      const st = useBattleStore.getState()
      if (!battleId) {
        // The battle hash was cleared (leaveBattle) — drop a stale challenge
        // screen so exiting the grid never resurrects it
        if (challengeIdRef.current && st.phase === 'idle') setChallengeId(null)
        return
      }
      if (battleId === st.battleId || st.phase !== 'idle') return
      setChallengeId(battleId)
    }
    window.addEventListener('hashchange', onHashChange)

    return () => {
      window.removeEventListener('hashchange', onHashChange)
      if (useBattleStore.getState().phase !== 'idle') leaveBattle()
    }
    // Mount-only wiring (stable refs) — no exhaustive-deps concern
  }, [])

  // The challenge screen gates the join and doubles as the retry surface — it
  // only steps aside once the duel is actually underway (a "Linking…" attempt
  // or a failed join keeps it on screen with its Enter button)
  const challengeOpen =
    !!challengeId &&
    battlePhase !== 'countdown' &&
    battlePhase !== 'running' &&
    battlePhase !== 'ended'

  // Duel verdict: victory fanfare / defeat slide, and kill boost visuals
  useEffect(() => {
    if (battlePhase !== 'ended') return
    setIsJumping(false)
    if (battleEnd === 'win' || battleEnd === 'left') soundEngine.playVictory()
    else if (battleEnd === 'lose') soundEngine.playDefeat()
    else soundEngine.playAutopilotDock() // stalemate — neutral two-note
  }, [battlePhase, battleEnd, setIsJumping])

  // User gesture to unlock and resume Web Audio
  useEffect(() => {
    const unlockAudio = () => {
      soundEngine.init()
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true })
    window.addEventListener('keydown', unlockAudio, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true })
      window.removeEventListener('keydown', unlockAudio, { capture: true })
      soundEngine.stopContinuous()
    }
  }, [])

  // Terminal open & close sound effect triggers + silence engine while reading
  // (station inspectors, the Grid Battle launcher dialog, and the help
  // terminal — same treatment)
  const prevInspectingRef = useRef<string | null>(null)
  const prevBattleDialogRef = useRef(false)
  const prevHelpRef = useRef(false)
  useEffect(() => {
    soundEngine.setReading(!!inspectingStationId || battleDialogOpen || helpOpen)
    if (inspectingStationId && !prevInspectingRef.current) {
      soundEngine.playTerminalOpen()
    } else if (!inspectingStationId && prevInspectingRef.current) {
      soundEngine.playTerminalClose()
    }
    prevInspectingRef.current = inspectingStationId

    if (battleDialogOpen && !prevBattleDialogRef.current) {
      soundEngine.playTerminalOpen()
    } else if (!battleDialogOpen && prevBattleDialogRef.current) {
      soundEngine.playTerminalClose()
    }
    prevBattleDialogRef.current = battleDialogOpen

    if (helpOpen && !prevHelpRef.current) {
      soundEngine.playTerminalOpen()
    } else if (!helpOpen && prevHelpRef.current) {
      soundEngine.playTerminalClose()
    }
    prevHelpRef.current = helpOpen
  }, [inspectingStationId, battleDialogOpen, helpOpen])

  // Viewport resize tracking
  useEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as { __gridDebug?: unknown }).__gridDebug = { inputsRef, cycleStateRef }
      // Cold-start pipeline observability (veil/quality gates)
      ;(window as unknown as { __vehicleStatus?: unknown }).__vehicleStatus = vehicleStatus
    }
    const checkMobile = () => {
      // Tablets (portrait iPads are exactly 768, landscape up to 1024) get the
      // mobile ride experience: touch controls, compact HUD, mobile camera
      setIsMobile(window.innerWidth <= 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Keyboard navigation & drive controls
  useEffect(() => {
    const activeKeys = activeKeysRef.current

    const updateInputs = (shiftKey?: boolean) => {
      const inputs = inputsRef.current

      const isBoostHeld =
        activeKeys.has('shift') ||
        activeKeys.has('shiftleft') ||
        activeKeys.has('shiftright') ||
        !!shiftKey

      // boost = effective signal (battle fuel gating may cut it per frame);
      // boostHeld = the RAW key state, so a held key auto-resumes when the
      // cooldown refills past the re-engage threshold
      inputs.boost = isBoostHeld
      inputs.boostHeld = isBoostHeld

      // When user is boosting (holding Shift), boost already propels the bike forward,
      // so don't listen to up arrow / W to free up keyboard matrix lines
      inputs.forward =
        !isBoostHeld &&
        (activeKeys.has('keyw') ||
          activeKeys.has('w') ||
          activeKeys.has('arrowup') ||
          activeKeys.has('up'))

      inputs.backward =
        activeKeys.has('keys') ||
        activeKeys.has('s') ||
        activeKeys.has('arrowdown') ||
        activeKeys.has('down')

      inputs.left =
        activeKeys.has('keya') ||
        activeKeys.has('a') ||
        activeKeys.has('arrowleft') ||
        activeKeys.has('left')

      inputs.right =
        activeKeys.has('keyd') ||
        activeKeys.has('d') ||
        activeKeys.has('arrowright') ||
        activeKeys.has('right')

      // Space is the brake and drift key
      inputs.brake = activeKeys.has('space') || activeKeys.has(' ')

      // Immediate visual speed streaks and FOV feedback while boost is held down
      if (!cycleStateRef.current.isAutopilot) {
        setIsJumping(isBoostHeld)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Parked in the Read view: the world is hidden, keys belong to the
      // reader. The veil gate below covers the cold-start lock.
      if (!activeRef.current) return
      // Cold-start veil: swallow keys while the world materializes — drive
      // inputs would ride blind, and opening a terminal would pause the
      // frame loop (freezing RideReadyGate under the veil). The challenge
      // screen's own Enter handler lives outside this listener.
      if (veilActiveRef.current) return

      // Typing in the battle dialog's code box: every key — including Space
      // and the cursor arrows this handler preventDefaults for the ride, and
      // the Enter that submits the code — belongs to the input, never the bike
      if (battleDialogOpenRef.current && (e.target as HTMLElement | null)?.tagName === 'INPUT')
        return

      // Enter toggles station inspector open/close
      if (e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault()
        if (inspectingStationIdRef.current) {
          setInspectingStationId(null)
          return
        }
        if (battleDialogOpenRef.current) {
          setBattleDialogOpen(false)
          return
        }
        if (nearbyStationIdRef.current) {
          setInspectingStationId(nearbyStationIdRef.current)
          return
        }
        if (nearBattleTerminalRef.current && useBattleStore.getState().phase === 'idle') {
          setBattleDialogOpen(true)
          return
        }
      }

      // Prevent browser default window scrolling on drive keys
      if (
        e.code === 'Space' ||
        e.key === ' ' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault()
      }

      // Don't capture drive inputs if inspecting station content
      if (inspectingStationIdRef.current) return

      if (e.code) activeKeys.add(e.code.toLowerCase())
      if (e.key) activeKeys.add(e.key.toLowerCase())
      if (e.shiftKey) activeKeys.add('shift')

      // Modifier ground truth: every event carries the OS's live Shift state.
      // A hardware-swallowed Shift keyUP leaves boost stuck ON; any later
      // keydown now clears it. (This is why Shift is trustworthy but Space
      // can't be — modifiers are reported on every event, plain keys only on
      // their own down/up, which his keyboard sometimes eats. macOS repeats
      // only the MOST RECENTLY pressed key, so repeat-based expiry is useless
      // for held gameplay keys.)
      if (!e.shiftKey && !e.getModifierState('Shift')) {
        activeKeys.delete('shift')
        activeKeys.delete('shiftleft')
        activeKeys.delete('shiftright')
      }

      // Any steering or drive input cancels autopilot
      const isDriveInput =
        activeKeys.has('keyw') ||
        activeKeys.has('w') ||
        activeKeys.has('keys') ||
        activeKeys.has('s') ||
        activeKeys.has('keya') ||
        activeKeys.has('a') ||
        activeKeys.has('keyd') ||
        activeKeys.has('d') ||
        activeKeys.has('arrowup') ||
        activeKeys.has('arrowdown') ||
        activeKeys.has('arrowleft') ||
        activeKeys.has('arrowright')

      if (isDriveInput && cycleStateRef.current.isAutopilot) {
        cycleStateRef.current.isAutopilot = false
        cycleStateRef.current.isArriving = false
        cycleStateRef.current.autopilotTarget = null
        setIsJumping(false)
      }

      updateInputs(e.shiftKey)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!activeRef.current || veilActiveRef.current) return
      if (e.code) activeKeys.delete(e.code.toLowerCase())
      if (e.key) activeKeys.delete(e.key.toLowerCase())

      if (!e.shiftKey) {
        activeKeys.delete('shift')
        activeKeys.delete('shiftleft')
        activeKeys.delete('shiftright')
      }

      updateInputs(e.shiftKey)
    }

    const handleBlur = () => {
      activeKeys.clear()
      updateInputs(false)
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleBlur)
    }
  }, [setIsJumping])

  // Autopilot navigation to a station
  const navigateToStation = useCallback(
    (stationId: string) => {
      const parkPos = getStationFrontPosition(stationId)
      if (!parkPos) return

      setActiveStationId(stationId)
      updateUrlHash(stationId)

      // Activate autopilot to park neatly in front of terminal
      cycleStateRef.current.isAutopilot = true
      cycleStateRef.current.isArriving = false
      cycleStateRef.current.autopilotTarget = {
        x: parkPos.x,
        z: parkPos.z,
        yaw: parkPos.yaw,
        id: stationId,
      }
      setIsJumping(true)
      soundEngine.playAutopilotEngage()
    },
    [setActiveStationId, setIsJumping],
  )

  // Autopilot arrived handler
  const handleAutopilotArrived = useCallback(
    (stationId: string) => {
      setIsJumping(false)
      setActiveStationId(stationId)
      setNearbyStationId(stationId)
      soundEngine.playAutopilotDock()
    },
    [setActiveStationId, setIsJumping],
  )

  // Initial deep link: bike already spawned at the hashed station — just sync state
  useEffect(() => {
    const hashId = getHashStationId()
    if (hashId && STATION_COORDINATES[hashId]) {
      setActiveStationId(hashId)
    }
  }, [setActiveStationId])

  // Zoom feedback: mirror camera wheel-zooms with a brief zoom-in/out cursor
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let timer: number | undefined
    const onWheel = (e: WheelEvent) => {
      if (!activeRef.current || inspectingStationIdRef.current) return // dialog wheel scrolls content; parked ride ignores Read-scroll
      const c = cycleStateRef.current
      // Same gate as the camera: wheel zoom (and its cursor) only while parked
      if (Math.abs(c.speed) >= 0.8 || c.isAutopilot) return
      root.classList.remove('ride-zooming-in', 'ride-zooming-out')
      root.classList.add(e.deltaY < 0 ? 'ride-zooming-in' : 'ride-zooming-out')
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        root.classList.remove('ride-zooming-in', 'ride-zooming-out')
      }, 400)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.clearTimeout(timer)
    }
  }, [])

  // Idle cursor: hide the mouse cursor after 3s without movement (cinematic
  // ride view); any mouse movement brings it back. Never hidden while a
  // terminal dialog is open — the reader needs the pointer.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let lastMove = performance.now()
    let hidden = false
    const onMouseMove = () => {
      lastMove = performance.now()
      if (hidden) {
        root.classList.remove('ride-cursor-idle')
        hidden = false
      }
    }
    const tick = window.setInterval(() => {
      // Idle-hide never engages under the veil — the rider waiting on the
      // spinner keeps a visible (default) cursor
      const shouldHide =
        !veilActiveRef.current &&
        performance.now() - lastMove > 3000 &&
        !inspectingStationIdRef.current
      if (shouldHide !== hidden) {
        hidden = shouldHide
        root.classList.toggle('ride-cursor-idle', hidden)
      }
    }, 250)
    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.clearInterval(tick)
      root.classList.remove('ride-cursor-idle')
    }
  }, [])

  return (
    // touch-none keeps browser pinch/page-zoom off the arena so two-finger
    // gestures go to the camera; h-dvh sizes correctly under mobile UI bars.
    // `hidden` while parked in the Read view: the mount SURVIVES mode
    // switches (App keeps it alive) so the WebGL context — textures, shader
    // programs, composer buffers — is never rebuilt; re-entering the ride
    // resumes the same warm context (no chopped scene, no re-upload).
    <div
      ref={rootRef}
      className={`relative w-screen h-dvh overflow-hidden bg-void text-ice select-none touch-none${
        // While the veil holds, the ROOT swaps to cursor-default: HUD pieces
        // that float above the veil (header name/role, hints) inherit from
        // here, and the grab hand must not advertise a locked camera
        veilActive ? ' cursor-default' : ' cursor-grab active:cursor-grabbing'
      }${active ? '' : ' hidden'}`}
    >
      {/* 3D WebGL Canvas Arena Scene */}
      <RideScene
        cycleStateRef={cycleStateRef}
        inputsRef={inputsRef}
        ribbonsRef={ribbonsRef}
        isMobile={isMobile}
        paused={scenePaused}
        parked={!active}
        veiled={veilActive}
        onNearbyStationChange={(id) => {
          if (id && id !== nearbyStationIdRef.current) {
            soundEngine.playProximityPing()
          }
          setNearbyStationId(id)
          // Never let station proximity touch the app state / URL once a battle
          // is active — the last report before the arena swap would otherwise
          // stick (a permanent "Intro detected" toast on the joiner) and the
          // hash update would clobber the #battle= link
          if (useBattleStore.getState().phase !== 'idle') return
          if (id) {
            setActiveStationId(id)
            updateUrlHash(id)
          } else if (!cycleStateRef.current.isAutopilot) {
            // Left the station space: fragment gone, no shortcut highlighted.
            // Autopilot flights keep their destination's hash until arrival.
            setActiveStationId(null)
            clearStationHash()
          }
        }}
        onNearbyBattleChange={(nearby) => {
          if (nearby !== nearBattleTerminalRef.current) {
            if (nearby) soundEngine.playProximityPing()
            setNearBattleTerminal(nearby)
          }
        }}
        onAutopilotArrived={handleAutopilotArrived}
        onReady={handleRideReady}
      />

      {/* CSS vignette — replaces the postprocessing Vignette pass whenever the
          EffectComposer is unmounted (quality tier 2+: no bloom, no fullscreen
          render-target chain). Same look, zero per-frame GPU cost. */}
      {qualityTier >= 2 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 55%, rgba(3, 7, 13, 0.6) 140%)',
          }}
        />
      )}

      {/* Speed Streaks Overlay during boost or autopilot */}
      <SpeedStreaks />

      {/* Cold-entry veil — dark spinner over the still-materializing world
          (canvas + vignette only; HUD/dialogs render above z-[15] and stay
          usable). Fades out over 0.5s once RideReadyGate fires. `cursor-default`
          beats the root's inherited grab/grabbing, and the idle-hide below is
          gated — the ONLY cursor during the veil is the default one. */}
      {veilActive && (
        <div
          role="status"
          aria-label="Materializing grid"
          className={`fixed inset-0 z-[15] pointer-events-auto cursor-default flex items-center justify-center bg-void/75 backdrop-blur-[2px] transition-opacity duration-500 motion-reduce:transition-none ${
            veilFading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Materializing />
        </div>
      )}

      {/* Fixed UI Header */}
      <header className="fixed top-0 left-0 right-0 z-30 px-4 md:px-6 py-4 flex items-center justify-between pointer-events-none">
        {/* Name and Role (desktop only — mobile/tablet uses the top-left radar
            spot; inside a battle the name clears out for the foe compass) */}
        {!isMobile && !battleActive && (
          <div className="pointer-events-auto">
            <h1 className="font-display text-sm md:text-base font-bold text-core tracking-wider uppercase">
              {profile.name}
            </h1>
            <p className="text-xs text-muted font-sans">{profile.role}</p>
          </div>
        )}

        {/* Help / Audio / View toggles, left to right — desktop header row.
            The view toggle hides inside battles (leaving concedes); help shows
            ONLY while waiting for a challenger, not during the duel itself. */}
        {!isMobile && (
          <div className="pointer-events-auto ml-auto flex flex-row items-center gap-2 md:gap-3">
            {battlePhase === 'waiting' && <HelpToggle onOpen={() => setHelpOpen(true)} />}
            <AudioToggle />
            {!battleActive && <ModeToggle />}
          </div>
        )}
      </header>

      {/* Desktop Station Navigation (Left Edge) — hidden inside the battle
          arena AND inside the battle alley (blips go dark on the radar too).
          While the cold-entry veil holds the shortcuts stay IN the DOM but
          dimmed + `inert` (no clicks, no focus) — the chrome reads as part
          of the materializing UI instead of popping in after the lift */}
      {!isMobile && !battleActive && !inAlley && (
        <aside
          aria-label="Grid Stations"
          className={`fixed left-6 top-1/2 -translate-y-1/2 z-30 pointer-events-auto${
            veilActive ? ' opacity-40 pointer-events-none' : ''
          }`}
          inert={veilActive}
        >
          <StationNav stations={validStations} onSelectStation={navigateToStation} />
        </aside>
      )}

      {/* Radar Minimap — bottom-left on desktop; top-RIGHT on tablet/mobile so
          it sits far from the left-thumb steering joystick. Fades out inside the
          battle alley (the toggles row slides up into its place). Under
          the cold-entry veil: present but dimmed + inert, like the shortcuts */}
      <div
        className={`fixed z-30 pointer-events-auto ${isMobile ? 'top-4 right-4' : 'bottom-6 left-6'} transition-opacity duration-300 ${
          inAlley
            ? 'opacity-0 pointer-events-none'
            : veilActive
              ? 'opacity-40 pointer-events-none'
              : 'opacity-100'
        }`}
        inert={veilActive || inAlley}
      >
        <Radar
          cycleStateRef={cycleStateRef}
          ribbonsRef={ribbonsRef}
          onSelectStation={navigateToStation}
          isMobile={isMobile}
          battle={battleActive}
          showFoe={foeConnected}
        />
      </div>

      {/* Mobile toggles — row directly below the top-right radar, right-aligned;
          slides up into the radar's spot when it fades out in the battle alley */}
      {isMobile && (
        <div
          className={`fixed ${inAlley ? 'top-4' : 'top-[136px]'} right-4 z-30 pointer-events-auto flex flex-row items-center justify-end gap-2 transition-[top] duration-300 ease-in-out`}
        >
          {battlePhase === 'waiting' && <HelpToggle onOpen={() => setHelpOpen(true)} />}
          <AudioToggle />
          {!battleActive && <ModeToggle />}
        </div>
      )}

      {/* Desktop Drive Controls Hint — duels are auto-cruise: steering only */}
      {!isMobile && (
        <div className="fixed bottom-6 right-6 z-20 pointer-events-none text-right font-mono text-xs text-muted/70 space-y-1">
          {battleActive ? (
            <>
              <div>
                <span className="text-core font-semibold">[A, D]</span> or{' '}
                <span className="text-core font-semibold">[Left / Right Arrow]</span> to steer
              </div>
              <div>
                <span className="text-core font-semibold">[Shift]</span> boost ·{' '}
                <span className="text-core font-semibold">[Space]</span> drift
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-core font-semibold">[W, A, S, D]</span> or{' '}
                <span className="text-core font-semibold">[Arrows]</span> to drive
              </div>
              <div>
                <span className="text-core font-semibold">[Shift]</span> boost ·{' '}
                <span className="text-core font-semibold">[Space]</span> brake / drift
              </div>
            </>
          )}
        </div>
      )}

      {/* Proximity Prompt to Inspect Nearby Station / Initiate Battle —
          suppressed entirely inside the battle arena, and while the cold-entry
          veil holds (no prompt for a world the rider cannot see yet) */}
      {!veilActive && (
        <StationPrompt
          stationId={battleActive ? null : nearbyStationId}
          onInspect={(id) => {
            if (id === 'battle-terminal') setBattleDialogOpen(true)
            else setInspectingStationId(id)
          }}
          isMobile={isMobile}
          battle={!nearbyStationId && nearBattleTerminal && !battleActive}
        />
      )}

      {/* Station Content Inspector Overlay */}
      <StationInspector
        stationId={inspectingStationId}
        onClose={() => setInspectingStationId(null)}
        isMobile={isMobile}
      />

      {/* Grid Battle overlays */}
      <BattleClock />
      <BattleDriftLock />
      {challengeOpen && <BattleChallenge onEnter={enterChallenge} onReject={rejectChallenge} />}
      <BattleDialog open={battleDialogOpen} onClose={() => setBattleDialogOpen(false)} />
      {!battleDialogOpen && !challengeId && (
        <BattleJoinStatus onOpenDialog={() => setBattleDialogOpen(true)} isMobile={isMobile} />
      )}
      {battlePhase === 'countdown' && <BattleCountdown />}
      {battlePhase === 'running' && <BattleStrip isMobile={isMobile} />}
      {battlePhase === 'running' && <BattleLog isMobile={isMobile} />}
      {(battlePhase === 'running' || battlePhase === 'waiting') && <BattleStallWarning />}
      {battlePhase === 'running' && <BattleFuelGauge isMobile={isMobile} />}
      {battlePhase === 'ended' && <BattleResult />}

      {/* How to Play — from the ? toggle while waiting (never pauses the game) */}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {/* Mobile On-Screen Drive Controls (hidden while the veil holds —
          touch inputs would drive a world the rider cannot see yet) */}
      {isMobile && !inspectingStationId && !battleDialogOpen && !helpOpen && !veilActive && (
        <MobileControls inputsRef={inputsRef} battle={battleActive} />
      )}
    </div>
  )
}

export default RideView
