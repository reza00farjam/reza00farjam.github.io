// Grid Battle networking — WebRTC data channel via the PeerJS cloud broker.
// peerjs is ONLY dynamically imported here, so normal rides and the Read view
// never load it. Each side simulates its own bike and broadcasts it at 30Hz;
// the receiver renders the foe by dead reckoning — snapshots extrapolated to
// TRUE NOW by measured velocity + RTT-estimated lead, with a smoothed
// velocity + gentle corrective pull so new snapshots never teleport the pose.
// Hits/crashes/boosters are tiny event messages.
import type { DataConnection, Peer } from 'peerjs'
import { CycleInputs, CycleState } from './cyclePhysics'
import { getStationFrontPosition } from './arena'
import type { TrailRibbon } from '../ride/Trail'
import {
  BATTLE_SPAWNS,
  BOOSTER_COUNT,
  BOOSTER_RESPAWN,
  HIT_DEBOUNCE,
  BoosterSpot,
  boosterGain,
  measureSnapshotMotion,
  predictPose,
  randomBoosterSpot,
  timerWinner,
} from './battle'
import { battleRuntime, resetBattleRuntime, useBattleStore } from './battleStore'
import { clearUrlHash, setBattleHash } from './hashSync'
import { soundEngine } from './soundEngine'

type StateMsg = {
  t: 's'
  x: number
  z: number
  yaw: number
  lean: number
  speed: number
  boost: 0 | 1
  drift: 0 | 1
  cap: number
  /** sender clock at send (performance.now) — RTT ping */
  ts: number
  /** ts of the last state msg RECEIVED from the foe — RTT pong */
  echo: number
}

type Msg =
  | StateMsg
  | { t: 'hello' } // joiner → host: challenger is in AND materialized (the
  // ride view finished its cold-start veil) — the host starts the countdown
  // on this, never earlier, so the duel cannot begin behind a spinner
  | { t: 'start'; boosters: BoosterSpot[] } // host → joiner: arena + countdown
  | { t: 'booster'; id: number } // sender took a booster
  | { t: 'spawn'; id: number; x: number; z: number } // host respawned a booster
  | { t: 'hit' } // sender touched an ARENA wall — point for the receiver
  | { t: 'wallhit'; vn: number } // sender's WALL AUTHORITY saw the receiver bounce off the sender's real ribbon — point for the sender
  | { t: 'crash'; x: number; z: number; into: 'own' | 'foe' } // sender crashed — receiver wins
  | { t: 'youcrash'; x: number; z: number } // sender's WALL AUTHORITY saw the receiver derezz — receiver loses
  | { t: 'timeout'; me: number; foe: number } // sender's clock hit zero — BOTH settle on the sender's scores
  | { t: 'rematch' } // joiner asks the host for a rematch
  | { t: 'lock' } // sender's drift heat saturated — their drift is locked (attack window intel)

// ---------------------------------------------------------------------------
// The foe's bike, reconstructed from the network. Trail/Cycle render from these
// refs exactly like the local bike renders from cycleStateRef.
const remoteState: CycleState = {
  x: 100,
  z: 100,
  yaw: 0,
  speed: 0,
  lean: 0,
  isAutopilot: false,
  autopilotTarget: null,
}
const remoteInputs: CycleInputs = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  boost: false,
  brake: false,
}

// ---------------------------------------------------------------------------
// Dead-reckoning renderer state. `snaps` keeps the last few 30Hz snapshots
// (newest last); every frame the newest is extrapolated to TRUE NOW by
// measured velocity + RTT-estimated lead (ping/pong piggybacked on the state
// stream). The rendered pose integrates a SMOOTHED velocity and is pulled
// toward the prediction with a gentle exponential correction — never a
// decaying position offset (one that complements the prediction cancels
// forward motion while the foe accelerates: frozen-then-jump stutter).
interface Snap {
  x: number
  z: number
  yaw: number
  lean: number
  speed: number
  boost: boolean
  drift: boolean
  recvAt: number
}
const snaps: Snap[] = [] // newest last (reliable channel = ordered)
const motion = { velX: 0, velZ: 0, yawRate: 0 } // measured between last two snaps
const predicted = { x: 100, z: 100, yaw: 0 }
// Rendered velocity (world frame): chased toward the measured motion and
// integrated into the pose; also what downstream reads as remoteState.vx/vz
const vRender = { x: 0, z: 0 }

// RTT piggyback: every state msg carries the sender's clock at send (ts) and
// echoes the last ts it received. A NEW echo on an incoming msg = one full
// round trip → lead = smoothed RTT/2 (one-way latency), clamped to 300ms.
let lastTsRecv = 0
let lastEcho = 0
let leadMs = 0

function pushSnap(s: Snap): void {
  snaps.push(s)
  if (snaps.length > 4) snaps.shift()
  // Re-measure the foe's true motion on every arrival (cheap, and it keeps
  // the tick branch-free). A degenerate gap (reset seed) falls back to
  // heading × speed inside measureSnapshotMotion.
  measureSnapshotMotion(snaps[snaps.length - 2] ?? s, s, s.speed, motion)
}

function resetRemotePose(x: number, z: number, yaw: number): void {
  snaps.length = 0
  pushSnap({ x, z, yaw, lean: 0, speed: 0, boost: false, drift: false, recvAt: performance.now() })
  motion.velX = 0
  motion.velZ = 0
  motion.yawRate = 0
  vRender.x = 0
  vRender.z = 0
  Object.assign(remoteState, { x, z, yaw, lean: 0, speed: 0, vx: 0, vz: 0 })
}

export const remoteRefs = {
  cycle: { current: remoteState },
  inputs: { current: remoteInputs },
  ribbons: { current: [] as TrailRibbon[] },
}

/** Assigned by RideView on mount so the send loop can read the local bike. */
export const localRefs = {
  cycle: { current: null as CycleState | null },
  inputs: { current: null as CycleInputs | null },
  ribbons: { current: null as TrailRibbon[] | null },
}

if (import.meta.env.DEV) {
  const w = window as unknown as { __battleNetInstances?: number }
  w.__battleNetInstances = (w.__battleNetInstances ?? 0) + 1
}

// Liveness heartbeat: the 30Hz state stream doubles as one. A foe whose
// tab is KILLED (not closed cleanly) may never deliver a conn 'close' —
// especially over TURN — and the duel would silently run on for the
// survivor. The watchdog ends it instead.
let lastMsgAt = 0
let leftWatchdog = 0
const LEFT_AFTER_MS = 6000

let peer: import('peerjs').Peer | null = null
let conn: DataConnection | null = null
let sendTimer: number | null = null
let interpId = 0
let joinWatchdog = 0
const respawnTimers: number[] = []

function send(m: Msg): void {
  if (conn && conn.open) {
    if (import.meta.env.DEV) {
      const d = netDebug()
      d.sent++
      d.lastSentAt = performance.now()
    }
    conn.send(m)
  }
}

// Dev-only counters for CDP diagnosis (sent vs received state msgs)
interface BattleNetDebug {
  sent: number
  recvState: number
  connOpen: boolean
  lastSentAt: number
  sendTicks: number
  interpTicks: number
  rtt: number
  lead: number
  lastError: string
  lastPeerEvent: string
  lastSent: string
  lastRecv: string
  interpPos: string
}

function netDebug(): BattleNetDebug {
  const w = window as unknown as { __battleNetDebug?: BattleNetDebug }
  return (w.__battleNetDebug ??= {
    sent: 0,
    recvState: 0,
    connOpen: false,
    lastSentAt: 0,
    sendTicks: 0,
    interpTicks: 0,
    rtt: 0,
    lead: 0,
    lastError: '',
    lastPeerEvent: '',
    lastSent: '',
    lastRecv: '',
    interpPos: '',
  })
}

function randomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let id = ''
  for (let i = 0; i < 5; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)]
  return id
}

// ICE: STUN alone only connects when both peers can punch UDP at each other —
// two tabs on one machine (host candidates) or easy NATs. Symmetric NAT /
// CGNAT / UDP-blocked networks (most mobile carriers; exactly the
// cross-network friend case) never complete ICE and the join hangs until the
// watchdog kills it. A TURN relay is the only real fix: the channel routes
// through it when direct fails.
//
// Relay credentials live in `public/turn.json` (shape:
// `{ "iceServers": [{ "urls": [...], "username": "...", "credential": "..." }] }`),
// fetched at battle start — a RUNTIME file, deliberately gitignored here AND
// in docs/ (this repo commits docs/, and credentials must never enter git).
// Missing file / bad JSON = STUN-only fallback (same-machine and easy-NAT
// duels still work). Refresh the credentials in the provider's dashboard when
// they rotate. Free public no-signup relays are all dead (2026-11-05:
// openrelay/nextcloud/jitsi probed).
//
// Fallback when TURN is unavailable. (No STUN-over-TCP entries: Chrome
// doesn't do TCP STUN discovery and a rejected URL can stall gathering.)
const STUN_SERVERS = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]

// Session cache: undefined = not fetched yet, null = unavailable (missing
// file or fetch error), array = TURN entries to prepend to the STUN list
let turnIce: RTCIceServer[] | null | undefined

async function peerConfig(): Promise<{
  config: { iceServers: RTCIceServer[]; iceCandidateTimeout: number }
}> {
  if (turnIce === undefined) {
    turnIce = null
    try {
      const r = await fetch('./turn.json')
      if (r.ok) {
        const data = (await r.json()) as { iceServers?: RTCIceServer[] }
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          turnIce = data.iceServers
        }
      }
    } catch {
      // no relay configured — STUN fallback
    }
  }
  return {
    config: {
      iceServers: turnIce ? [...turnIce, ...STUN_SERVERS] : STUN_SERVERS,
      iceCandidateTimeout: 10000,
    },
  }
}

// ---------------------------------------------------------------------------
// Host: create the battle link and wait for a challenger

// The public PeerJS broker (0.peerjs.com) is INTERMITTENTLY unreachable from
// some networks: the wss handshake just stalls (no open, no error) for the
// full watchdog window, then works minutes later on the same build (verified
// 2026-11-18: a prod Create hung 12s → "Grid unavailable" at 00:40, then the
// identical build created in 3s at 01:05 — dev/prod was coincidence). One
// silent retry with a FRESH peer absorbs the transient window; the launcher
// only surfaces "Grid unavailable" when both attempts die. Same for joiner.
const BROKER_ATTEMPTS = 2

function awaitBrokerOpen(p: Peer, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('timeout')), ms)
    p.on('open', () => {
      window.clearTimeout(timeout)
      resolve()
    })
    p.on('error', (err: { type: string }) => {
      window.clearTimeout(timeout)
      reject(new Error(err.type))
    })
  })
}

export async function hostBattle(): Promise<string> {
  const { default: PeerCtor } = await import('peerjs')
  let battleId = ''
  let lastErr: unknown = null
  for (let attempt = 0; attempt < BROKER_ATTEMPTS; attempt++) {
    // Fresh id per attempt: a first peer whose 'open' was lost server-side
    // could still hold the id — re-registering it would hit 'unavailable-id'
    battleId = randomId()
    peer = new PeerCtor(battleId, await peerConfig())
    try {
      await awaitBrokerOpen(peer, 12000)
      lastErr = null
      break
    } catch (e) {
      // Failed attempt must not leak a half-open peer into the next retry
      try {
        peer?.destroy()
      } catch {
        // already dead
      }
      peer = null
      lastErr = e
    }
  }
  if (lastErr !== null) throw lastErr
  wirePeerError()
  useBattleStore.getState().startWaiting('host', battleId)
  setBattleHash(battleId)
  // The arena transforms the instant the battle is created (alley seals) —
  // the creator must not be left inside it: transform them to their battle
  // corner right away, not at match start
  placeBikes()
  const inp0 = localRefs.inputs.current
  if (inp0) {
    inp0.forward = false
    inp0.backward = false
    inp0.left = false
    inp0.right = false
    inp0.boost = false
    inp0.boostHeld = false
    inp0.brake = false
  }
  if (localRefs.ribbons.current) localRefs.ribbons.current.length = 0
  peer!.on('connection', (c) => {
    // One LIVE challenger at a time. Extra channels (double-join races) are
    // refused — but a fresh connection may REPLACE a dead one: mobile browsers
    // discard backgrounded tabs after ~a minute, and the reloaded challenger
    // page auto-rejoins from its #battle= link. Refusing that would strand
    // them in a silent empty arena.
    if (conn && conn.open) {
      c.close()
      return
    }
    if (conn && !conn.open) {
      try {
        conn.close()
      } catch {
        // already dead
      }
    }
    conn = c
    wireConnection(c)
  })
  return battleId
}

// ---------------------------------------------------------------------------
// Joiner: called automatically when the page opens with #battle=<id>
let joinInFlight = false // single-flight: StrictMode double-mounts the mount effect in dev

export async function joinBattle(battleId: string): Promise<void> {
  if (joinInFlight) return
  joinInFlight = true
  const { default: PeerCtor } = await import('peerjs')
  let lastErr: unknown = null
  for (let attempt = 0; attempt < BROKER_ATTEMPTS; attempt++) {
    peer = new PeerCtor(await peerConfig())
    try {
      // Broker handshake watchdog — a hung cloud server (no open, no error)
      // must not leave the joiner stuck on the challenge screen forever
      await awaitBrokerOpen(peer, 12000)
      lastErr = null
      break
    } catch (e) {
      // Failed attempt must not leak a half-open peer into the next retry
      try {
        peer?.destroy()
      } catch {
        // already dead
      }
      peer = null
      lastErr = e
    }
  }
  if (lastErr !== null) {
    joinInFlight = false // failed attempt — a later link may retry
    useBattleStore.getState().setError('network')
    throw lastErr
  }
  wirePeerError()
  useBattleStore.getState().startWaiting('joiner', battleId)
  conn = peer!.connect(battleId, { reliable: true })
  wireConnection(conn)
  // Watchdog: a join that hasn't linked within 20s (broker unreachable, host
  // peer dead, or slow ICE — a TURN/TLS allocation on a throttled network can
  // take seconds) must not hang on "Linking…" forever
  joinWatchdog = window.setTimeout(() => {
    joinWatchdog = 0
    const st = useBattleStore.getState()
    if (st.phase === 'waiting' && st.role === 'joiner' && !(conn && conn.open)) {
      leaveBattle()
      useBattleStore.getState().setError('unreachable')
    }
  }, 20000)
}

function wirePeerError(): void {
  peer?.on('error', (err: { type: string }) => {
    if (import.meta.env.DEV) netDebug().lastPeerEvent = 'peer-error:' + err.type
    if (useBattleStore.getState().phase !== 'waiting') return
    leaveBattle()
    useBattleStore.getState().setError(err.type === 'peer-unavailable' ? 'invalid' : 'network')
  })
  peer?.on('disconnected', () => {
    // Signaling socket lost — data channels survive, but log it: mid-duel
    // vanishing foes start here
    if (import.meta.env.DEV) netDebug().lastPeerEvent = 'peer-disconnected'
  })
}

function wireConnection(c: DataConnection): void {
  let everOpened = false
  c.on('open', () => {
    everOpened = true
    if (import.meta.env.DEV) netDebug().lastPeerEvent = 'conn-open'
    // The hello means "in AND materialized" — a cold joiner sends it only
    // after the veil lifts (notifyRideReady); a warm one sends it right here
    maybeSendHello()
  })
  c.on('data', (raw) => handleMsg(raw as Msg))
  // Ignore teardown of a REPLACED connection — its replacement already took over
  c.on('close', () => {
    if (conn !== c) return
    if (import.meta.env.DEV) netDebug().lastPeerEvent = 'conn-close'
    // A challenger's handshake dying before the channel ever opened (ICE
    // failure, network flap) is not a foe leaving — their retry replaces this
    // conn. Tearing the waiting session down would kill a still-valid link.
    if (useBattleStore.getState().phase === 'waiting' && !everOpened) {
      conn = null
      return
    }
    handleFoeLeft()
  })
  c.on('error', () => {
    if (conn !== c) return
    if (import.meta.env.DEV) netDebug().lastPeerEvent = 'conn-error'
    handleFoeLeft()
  })
}

function handleMsg(m: Msg): void {
  lastMsgAt = performance.now() // any message = the foe is alive
  const st = useBattleStore.getState()
  try {
    dispatchMsg(m, st)
  } catch (e) {
    if (import.meta.env.DEV) netDebug().lastError = String(e)
  }
}

function dispatchMsg(m: Msg, st: ReturnType<typeof useBattleStore.getState>): void {
  switch (m.t) {
    case 's':
      if (import.meta.env.DEV) {
        netDebug().recvState++
        netDebug().lastRecv = m.x + ',' + m.z
      }
      // RTT pong: a NEW echo means this ts completed a full round trip
      if (m.echo > 0 && m.echo !== lastEcho) {
        lastEcho = m.echo
        const rtt = performance.now() - m.echo
        const lead = Math.min(300, Math.max(0, rtt / 2))
        leadMs = leadMs === 0 ? lead : leadMs * 0.8 + lead * 0.2
        if (import.meta.env.DEV) netDebug().rtt = rtt
      }
      lastTsRecv = m.ts
      pushSnap({
        x: m.x,
        z: m.z,
        yaw: m.yaw,
        lean: m.lean,
        speed: m.speed,
        boost: !!m.boost,
        drift: !!m.drift,
        recvAt: performance.now(),
      })
      battleRuntime.remoteCapacity = m.cap
      return
    case 'hello':
      startMatch()
      return
    case 'start':
      // Defensive stash: a start racing an un-lifted veil (should not happen
      // — hello is readiness-gated — but a host bug or a reload must never
      // begin a countdown behind the materializing screen) waits for ready
      if (battleRuntime.rideReadyAt === 0) {
        pendingStart = m.boosters
        return
      }
      applyStart(m.boosters)
      return
    case 'booster':
      st.takeBooster(m.id)
      if (st.role === 'host') scheduleRespawn(m.id)
      return
    case 'spawn':
      st.spawnBooster({ id: m.id, x: m.x, z: m.z })
      return
    case 'hit':
      st.scoreHit('me', 'wall')
      return
    case 'lock':
      st.logEvent('foe', 'lock')
      return
    case 'wallhit':
      // The foe's wall authority saw MY predicted pose bounce off their real
      // ribbon — their point, mirrored here (my own lagged reconstruction may
      // never have shown the contact; scoring follows the WALL OWNER, same
      // authority as crashes)
      if (st.phase !== 'running') return
      st.scoreHit('foe', 'ribbon')
      soundEngine.playWallImpact(Math.min(m.vn, 30))
      return
    case 'crash':
      battleRuntime.crashSide = 'foe'
      battleRuntime.crashFocus = { x: m.x, z: m.z }
      st.endBattle('win', m.into === 'own' ? 'own-ribbon' : 'foe-ribbon')
      stopSendLoop()
      soundEngine.playCrash()
      return
    case 'youcrash':
      // The foe's wall authority saw MY synced pose derezz through their
      // REAL ribbon — my own lagged reconstruction may never have seen the
      // wall. Mirror reportLocalCrash's teardown on my side.
      if (st.phase !== 'running') return
      battleRuntime.crashSide = 'me'
      // Mirror the wreck orbit on my own screen (m.x/z = where the foe's
      // wall authority saw my predicted pose cross their real ribbon)
      battleRuntime.crashFocus = { x: m.x, z: m.z }
      st.endBattle('lose', 'foe-ribbon')
      {
        const c = localRefs.cycle.current
        if (c) {
          c.speed = 0
          c.vx = 0
          c.vz = 0
        }
      }
      stopSendLoop()
      soundEngine.playCrash()
      return
    case 'timeout':
      // Deterministic settle: both machines compute the verdict from the
      // SENDER's scores — an in-flight 'hit' crossing the timeout must not
      // flip the two results apart (sender 'me' ⇒ receiver 'lose')
      if (st.phase !== 'running') return
      {
        const o = timerWinner(m.me, m.foe)
        st.endBattle(o === 'me' ? 'lose' : o === 'foe' ? 'win' : 'tie')
      }
      stopSendLoop()
      return
    case 'rematch':
      if (st.phase === 'ended' && st.role === 'host') startMatch()
      return
  }
}

// ---------------------------------------------------------------------------
// Match lifecycle (host authoritative for the booster layout)

/** A host 'start' that arrived before the local ride finished materializing —
    applied the moment notifyRideReady fires (countdown never begins behind
    the veil) */
let pendingStart: BoosterSpot[] | null = null

/** Joiner hello gate: only sent once the ride view is materialized, so the
    host's countdown (triggered BY the hello) cannot start behind a veil */
function maybeSendHello(): void {
  if (useBattleStore.getState().role === 'joiner' && battleRuntime.rideReadyAt > 0) {
    send({ t: 'hello' })
  }
}

/** Called by RideView when the cold-start veil lifts (or immediately on a
    warm mount): arms the joiner's hello and releases any stashed start */
export function notifyRideReady(): void {
  if (battleRuntime.rideReadyAt > 0) return // once per page
  battleRuntime.rideReadyAt = performance.now()
  maybeSendHello()
  if (pendingStart) {
    const spots = pendingStart
    pendingStart = null
    applyStart(spots)
  }
}

function startMatch(): void {
  const st = useBattleStore.getState()
  if (st.role !== 'host') return
  const bikes = [
    { x: BATTLE_SPAWNS.host.x, z: BATTLE_SPAWNS.host.z },
    { x: BATTLE_SPAWNS.joiner.x, z: BATTLE_SPAWNS.joiner.z },
  ]
  const spots: BoosterSpot[] = []
  for (let i = 0; i < BOOSTER_COUNT; i++) spots.push(randomBoosterSpot(spots, bikes, i))
  send({ t: 'start', boosters: spots })
  applyStart(spots)
}

function applyStart(spots: BoosterSpot[]): void {
  clearRespawnTimers()
  resetBattleRuntime()
  remoteRefs.ribbons.current.length = 0
  if (localRefs.ribbons.current) localRefs.ribbons.current.length = 0
  useBattleStore.getState().beginCountdown(spots)
  placeBikes()
  startSendLoop()
  startInterpolation()
}

function placeBikes(): void {
  const st = useBattleStore.getState()
  if (!st.role) return
  const mine = st.role === 'host' ? BATTLE_SPAWNS.host : BATTLE_SPAWNS.joiner
  const theirs = st.role === 'host' ? BATTLE_SPAWNS.joiner : BATTLE_SPAWNS.host
  const c = localRefs.cycle.current
  if (c) {
    c.x = mine.x
    c.z = mine.z
    c.yaw = mine.yaw
    c.speed = 0
    c.vx = 0
    c.vz = 0
    c.lean = 0
    c.isAutopilot = false
    c.autopilotTarget = null
    c.isArriving = false
  }
  resetRemotePose(theirs.x, theirs.z, theirs.yaw)
}

function scheduleRespawn(id: number): void {
  respawnTimers.push(
    window.setTimeout(() => {
      const st = useBattleStore.getState()
      if (st.phase !== 'running' || st.role !== 'host') return
      const bikes = [
        localRefs.cycle.current ?? { x: 0, z: 0 },
        { x: remoteState.x, z: remoteState.z },
      ]
      const spot = randomBoosterSpot(
        st.boosters.filter((b) => !b.taken),
        bikes,
        id,
      )
      send({ t: 'spawn', id: spot.id, x: spot.x, z: spot.z })
      st.spawnBooster(spot)
    }, BOOSTER_RESPAWN * 1000),
  )
}

function clearRespawnTimers(): void {
  respawnTimers.forEach((t) => window.clearTimeout(t))
  respawnTimers.length = 0
}

// ---------------------------------------------------------------------------
// 30Hz state broadcast + remote bike smoothing (raised from 20Hz/dt*12 on
// 2026-11-05: ~33ms snapshots + tighter catch-up halve the perceived foe lag;
// the tiny JSON state stays ~120B, so the channel cost is negligible)
function startSendLoop(): void {
  stopSendLoop()
  lastMsgAt = performance.now()
  leftWatchdog = window.setInterval(() => {
    const st = useBattleStore.getState()
    if (
      (st.phase === 'running' || st.phase === 'countdown') &&
      performance.now() - lastMsgAt > LEFT_AFTER_MS
    ) {
      handleFoeLeft()
    }
  }, 1000)
  sendTimer = window.setInterval(() => {
    const c = localRefs.cycle.current
    const inp = localRefs.inputs.current
    if (import.meta.env.DEV) {
      const d = netDebug()
      d.sendTicks++
      d.connOpen = !!(conn && conn.open)
    }
    if (!c || !inp) return
    if (import.meta.env.DEV) netDebug().lastSent = c.x.toFixed(1) + ',' + c.z.toFixed(1)
    send({
      t: 's',
      x: +c.x.toFixed(2),
      z: +c.z.toFixed(2),
      yaw: +c.yaw.toFixed(3),
      lean: +c.lean.toFixed(3),
      speed: +c.speed.toFixed(2),
      boost: inp.boost ? 1 : 0,
      drift: c.isDrifting ? 1 : 0,
      cap: battleRuntime.capacity,
      ts: Math.round(performance.now()),
      echo: lastTsRecv,
    })
  }, 33)
}

function stopSendLoop(): void {
  if (sendTimer !== null) {
    window.clearInterval(sendTimer)
    sendTimer = null
  }
  if (leftWatchdog) {
    window.clearInterval(leftWatchdog)
    leftWatchdog = 0
  }
}

function startInterpolation(): void {
  stopInterpolation()
  let last = performance.now()
  const tick = (now: number) => {
    if (import.meta.env.DEV) {
      netDebug().interpTicks++
      netDebug().lead = leadMs
    }
    const dt = Math.min(0.1, Math.max(1 / 240, (now - last) / 1000))
    last = now
    const L = snaps[snaps.length - 1]
    if (L) {
      // After the duel ends the foe stops sending — freeze extrapolation at
      // their LAST snapshot (the wreck) and kill the rendered velocity, or
      // stale motion carries the foe past their crash point forever.
      const ended = useBattleStore.getState().phase === 'ended'
      // Predict the foe's pose at TRUE NOW: extrapolate the newest snapshot
      // by (time since receipt + one-way latency). What this machine renders
      // is where the foe's own machine has them right now — both screens
      // agree about both bikes.
      predictPose(
        L,
        motion.velX,
        motion.velZ,
        motion.yawRate,
        ended ? 0 : (now - L.recvAt) / 1000 + leadMs / 1000,
        predicted,
      )
      // Smoothed velocity + gentle corrective pull (never a snap): the pose
      // integrates vRender, and an exponential fraction of the gap to the
      // prediction closes each frame (~8/s — converges in ~125ms without
      // ever cancelling the forward motion). Ended skips the chase entirely
      // — otherwise the stale measured motion re-inflates vRender every
      // frame and the wreck creeps past its last snapshot.
      const kV = 1 - Math.exp(-dt * 12)
      const kP = 1 - Math.exp(-dt * 8)
      if (ended) {
        vRender.x = 0
        vRender.z = 0
      } else {
        vRender.x += (motion.velX - vRender.x) * kV
        vRender.z += (motion.velZ - vRender.z) * kV
      }
      remoteState.x += vRender.x * dt + (predicted.x - remoteState.x) * kP
      remoteState.z += vRender.z * dt + (predicted.z - remoteState.z) * kP
      let dy = predicted.yaw - remoteState.yaw
      while (dy > Math.PI) dy -= 2 * Math.PI
      while (dy < -Math.PI) dy += 2 * Math.PI
      remoteState.yaw += (ended ? 0 : motion.yawRate) * dt + dy * kP
      const kSlow = Math.min(1, dt * 20)
      remoteState.lean += (L.lean - remoteState.lean) * kSlow
      // ended: the wreck's wheels stop too (last snapshot may carry the
      // pre-crash boost speed)
      remoteState.speed += ((ended ? 0 : L.speed) - remoteState.speed) * kSlow
      remoteInputs.boost = ended ? false : L.boost
      remoteState.isDrifting = ended ? false : L.drift
      // Rendered velocity is the downstream truth (trail emission gate,
      // bike-vs-bike shoves, spatial audio) — smooth, slip included
      remoteState.vx = vRender.x
      remoteState.vz = vRender.z
    }
    interpId = requestAnimationFrame(tick)
  }
  interpId = requestAnimationFrame(tick)
}

function stopInterpolation(): void {
  cancelAnimationFrame(interpId)
}

// ---------------------------------------------------------------------------
// Reports from the local simulation (physics loop, Trail collision, Boosters)
export function reportLocalCrash(x: number, z: number, into: 'own' | 'foe' = 'own'): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  battleRuntime.crashSide = 'me'
  // The crasher gets the SAME cinematic wreck orbit the winner sees — the
  // chase cam freezing on the spot reads as a hang, not a derezz
  battleRuntime.crashFocus = { x, z }
  st.endBattle('lose', into === 'own' ? 'own-ribbon' : 'foe-ribbon')
  const c = localRefs.cycle.current
  if (c) {
    c.speed = 0
    c.vx = 0
    c.vz = 0
  }
  stopSendLoop()
  soundEngine.playCrash()
  send({ t: 'crash', x: +x.toFixed(1), z: +z.toFixed(1), into })
}

export function reportFoeTrailHit(): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  const now = performance.now()
  if (now - battleRuntime.lastFoeTrailHitAt < HIT_DEBOUNCE * 1000) return
  battleRuntime.lastFoeTrailHitAt = now
  st.scoreHit('foe', 'wall')
  send({ t: 'hit' })
}

/** Local drift heat saturated — tell the foe (their BattleLog shows the lock
    as an attack window). Waiting-phase locks are not duels yet, so
    running-only, like every other reporter. */
export function reportDriftLock(): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  send({ t: 'lock' })
}

/** Owner-side wall authority (probed from PhysicsLoop): the foe's latest
    synced pose crossed MY REAL ribbon at crash speed. My ribbons are the
    ground truth on this machine — the foe's client only has a lagged 30Hz
    reconstruction, so a wall whipped across their nose a frame before
    contact could pass through over there. End it here and tell their
    machine to derezz. Phase-gated both sides, so a duel ends exactly once
    no matter which side detects first. */
export function forceFoeCrash(x: number, z: number): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  battleRuntime.crashSide = 'foe'
  battleRuntime.crashFocus = { x, z }
  st.endBattle('win', 'foe-ribbon')
  stopSendLoop()
  soundEngine.playCrash()
  send({ t: 'youcrash', x: +x.toFixed(1), z: +z.toFixed(1) })
}

/** Probe-detected bounce (owner-side wall authority, sub-crash contacts):
    the foe's predicted pose touched MY real ribbon at ≤26 u/s — a point for
    me, mirrored to their machine, and the probe's push-out nudges the
    rendered pose so MY screen shows them pop off my wall. Scoring follows
    the WALL OWNER's real geometry (same authority as crashes); the
    contactor's own lagged reconstruction may show no contact at all. */
export function reportFoeWallTouch(vn: number, pushX: number, pushZ: number): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  const now = performance.now()
  if (now - battleRuntime.lastFoeWallTouchAt < HIT_DEBOUNCE * 1000) return
  battleRuntime.lastFoeWallTouchAt = now
  // Pop the rendered foe off my real wall (the pull would drag them back
  // through it until their bounced snapshots arrive, ~a snapshot or two)
  remoteState.x += pushX
  remoteState.z += pushZ
  st.scoreHit('me', 'ribbon')
  send({ t: 'wallhit', vn: Math.round(vn) })
}

export function reportBoosterPickup(id: number): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  st.takeBooster(id)
  const f = boosterGain(battleRuntime)
  battleRuntime.fuel = f.fuel
  battleRuntime.capacity = f.capacity
  if (st.role === 'host') scheduleRespawn(id)
  send({ t: 'booster', id })
}

/** BattleClock: local battle clock hit zero — settle on MY scores and send
    them; the foe settles on the same numbers (a 'hit' still in flight at
    expiry must not split the two verdicts). */
export function reportTimeout(): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  settleTimer()
  send({ t: 'timeout', me: st.score.me, foe: st.score.foe })
}

function settleTimer(): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'running') return
  const o = timerWinner(st.score.me, st.score.foe)
  st.endBattle(o === 'me' ? 'win' : o === 'foe' ? 'lose' : 'tie')
  stopSendLoop()
}

/** Result overlay rematch button — host restarts directly, joiner asks. */
export function requestRematch(): void {
  const st = useBattleStore.getState()
  if (st.phase !== 'ended' || !conn?.open) return
  if (st.role === 'host') startMatch()
  else send({ t: 'rematch' })
}

// ---------------------------------------------------------------------------
function handleFoeLeft(): void {
  const st = useBattleStore.getState()
  stopSendLoop()
  stopInterpolation()
  if (st.phase === 'waiting') {
    st.resetToIdle()
    clearUrlHash()
    return
  }
  if (st.phase === 'running' || st.phase === 'countdown') {
    st.endBattle('left')
    return
  }
  if (st.phase === 'ended') {
    // The result overlay is already up — the foe leaving only kills rematch
    st.markFoeGone()
  }
}

/** Cancel (host waiting) or exit (result screen) — tears the whole session
    and parks the rider back at their terminal (creator at the battle
    terminal, the link opener at the Intro terminal). */
export function leaveBattle(): void {
  const st0 = useBattleStore.getState()
  const role = st0.role
  // A joiner whose join FAILED during 'waiting' was never placed for a duel —
  // the bike never moved (joinBattle does not placeBikes), so it must stay
  // exactly where the rider parked it (usually their own battle terminal).
  // Only placed riders respawn: the host (hostBattle moves them) and any
  // joiner past the countdown.
  const joinFailed = role === 'joiner' && st0.phase === 'waiting'
  stopSendLoop()
  stopInterpolation()
  clearRespawnTimers()
  snaps.length = 0
  leadMs = 0
  lastEcho = 0
  lastTsRecv = 0
  if (joinWatchdog) {
    window.clearTimeout(joinWatchdog)
    joinWatchdog = 0
  }
  joinInFlight = false
  try {
    conn?.close()
  } catch {
    // already closed
  }
  try {
    peer?.destroy()
  } catch {
    // already destroyed
  }
  conn = null
  peer = null
  const c = localRefs.cycle.current
  if (c && role && !joinFailed) {
    // Exiting a duel parks EVERY rider at the battle terminal front — both
    // the creator and the link opener (2026-11-21, Reza: exit belongs at the
    // battle terminal, not the intro pad)
    const spawn = getStationFrontPosition('battle') ?? { x: 0, z: 347.2, yaw: Math.PI }
    c.x = spawn.x
    c.z = spawn.z
    c.yaw = spawn.yaw
    c.speed = 0
    c.vx = 0
    c.vz = 0
    c.lean = 0
    c.isAutopilot = false
    c.autopilotTarget = null
    c.isArriving = false
  }
  // Drop held keys too — exiting mid-boost must not launch the respawned bike
  const inp = localRefs.inputs.current
  if (inp) {
    inp.forward = false
    inp.backward = false
    inp.left = false
    inp.right = false
    inp.boost = false
    inp.brake = false
  }
  useBattleStore.getState().resetToIdle()
  resetBattleRuntime()
  remoteRefs.ribbons.current.length = 0
  if (localRefs.ribbons.current) localRefs.ribbons.current.length = 0
  clearUrlHash()
}
