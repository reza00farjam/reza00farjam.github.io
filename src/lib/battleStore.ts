import { create } from 'zustand'
import { BATTLE_BASE_CAPACITY, BATTLE_DURATION, COUNTDOWN_SECONDS, BoosterSpot } from './battle'

export type BattlePhase = 'idle' | 'waiting' | 'countdown' | 'running' | 'ended'
export type BattleRole = 'host' | 'joiner'
export type BattleEnd = 'win' | 'lose' | 'tie' | 'left'

export interface Booster extends BoosterSpot {
  taken: boolean
}

/** One battle event-log line (kill feed): who gained the point and the cause.
    'lock' lines are foe-only intel (own lock has its own chip). */
export interface BattleEvent {
  id: number
  who: 'me' | 'foe'
  cause: 'wall' | 'ribbon' | 'lock'
}

interface BattleState {
  phase: BattlePhase
  role: BattleRole | null
  /** Host's peer id — the token inside the #battle= link */
  battleId: string | null
  /** score.me = hits the foe took on MY ribbons (points I caused) */
  score: { me: number; foe: number }
  boosters: Booster[]
  end: BattleEnd | null
  error: string | null
  /** Foe disconnected after the duel ended — rematch impossible, exit only */
  foeGone: boolean
  /** Why a crash verdict happened — which ribbon the loser hit */
  endReason: 'own-ribbon' | 'foe-ribbon' | null
  /** Anti-stall: true while the local bike is stalled long enough to warn */
  stallWarning: boolean
  /** Kill-feed lines for the BattleLog HUD — each self-prunes after ~3s */
  events: BattleEvent[]

  startWaiting: (role: BattleRole, battleId: string) => void
  beginCountdown: (boosters: BoosterSpot[]) => void
  beginRunning: () => void
  markFoeGone: () => void
  scoreHit: (who: 'me' | 'foe', cause: 'wall' | 'ribbon') => void
  logEvent: (who: 'me' | 'foe', cause: BattleEvent['cause']) => void
  endBattle: (end: BattleEnd, reason?: 'own-ribbon' | 'foe-ribbon') => void
  takeBooster: (id: number) => void
  spawnBooster: (spot: BoosterSpot) => void
  setError: (error: string | null) => void
  setStallWarning: (warn: boolean) => void
  resetToIdle: () => void
}

/** Kill-feed rows live ~4s (CSS fades at 3.7s); the timer is the DOM-removal
    backstop, and the cap keeps the array bounded between prunes. */
let nextEventId = 1
const EVENT_TTL_MS = 4100
const EVENT_CAP = 10

function pushEvent(events: BattleEvent[], e: BattleEvent): BattleEvent[] {
  setTimeout(() => {
    useBattleStore.setState((s) => ({ events: s.events.filter((x) => x.id !== e.id) }))
  }, EVENT_TTL_MS)
  const next = [...events, e]
  return next.length > EVENT_CAP ? next.slice(next.length - EVENT_CAP) : next
}

export const useBattleStore = create<BattleState>((set) => ({
  phase: 'idle',
  role: null,
  battleId: null,
  score: { me: 0, foe: 0 },
  boosters: [],
  end: null,
  error: null,
  foeGone: false,
  endReason: null,
  stallWarning: false,
  events: [],

  startWaiting: (role, battleId) =>
    set({
      phase: 'waiting',
      role,
      battleId,
      score: { me: 0, foe: 0 },
      end: null,
      error: null,
      foeGone: false,
      endReason: null,
      stallWarning: false,
      events: [],
    }),
  beginCountdown: (spots) =>
    set({
      phase: 'countdown',
      score: { me: 0, foe: 0 },
      end: null,
      foeGone: false,
      endReason: null,
      stallWarning: false,
      events: [],
      boosters: spots.map((s) => ({ ...s, taken: false })),
    }),
  beginRunning: () => set({ phase: 'running' }),
  markFoeGone: () => set({ foeGone: true }),
  scoreHit: (who, cause) =>
    set((s) => ({
      score: { ...s.score, [who]: s.score[who] + 1 },
      events: pushEvent(s.events, { id: nextEventId++, who, cause }),
    })),
  logEvent: (who, cause) =>
    set((s) => ({ events: pushEvent(s.events, { id: nextEventId++, who, cause }) })),
  endBattle: (end, reason) =>
    set({ phase: 'ended', end, endReason: reason ?? null, stallWarning: false }),
  takeBooster: (id) =>
    set((s) => ({ boosters: s.boosters.map((b) => (b.id === id ? { ...b, taken: true } : b)) })),
  spawnBooster: (spot) =>
    set((s) => ({
      boosters: s.boosters.map((b) => (b.id === spot.id ? { ...spot, taken: false } : b)),
    })),
  setError: (error) => set({ error }),
  setStallWarning: (warn) => set({ stallWarning: warn }),
  resetToIdle: () =>
    set({
      phase: 'idle',
      role: null,
      battleId: null,
      score: { me: 0, foe: 0 },
      boosters: [],
      end: null,
      error: null,
      foeGone: false,
      endReason: null,
      stallWarning: false,
      events: [],
    }),
}))

// ---------------------------------------------------------------------------
// Mutable 60fps battle runtime — read/written inside useFrame loops, never in
// React state (same discipline as cycleStateRef).
export const battleRuntime = {
  fuel: BATTLE_BASE_CAPACITY,
  capacity: BATTLE_BASE_CAPACITY,
  locked: false,
  timeLeft: BATTLE_DURATION,
  countdown: COUNTDOWN_SECONDS,
  /** performance.now() of the last scored foe-trail hit (debounce) */
  lastFoeTrailHitAt: 0,
  /** performance.now() of the last probe-detected foe wall touch (debounce;
       owner-side bounce authority, see battleNet.reportFoeWallTouch) */
  lastFoeWallTouchAt: 0,
  /** Which bike is falling after a crash ('me' | 'foe' | null) */
  crashSide: null as 'me' | 'foe' | null,
  /** Winner's camera orbits this point after the loser's crash */
  crashFocus: null as { x: number; z: number } | null,
  /** Foe's synced fuel capacity — caps the remote ribbon length */
  remoteCapacity: BATTLE_BASE_CAPACITY,
  /** Seconds the local bike has been stalled (anti-camp accumulator) */
  stallFor: 0,
  /** Drift heat accumulator (anti-camp, stepDriftHeat in battle.ts) */
  driftHeat: 0,
  /** performance.now() until which the local rider's brake/drift is locked
      (drift-camp penalty) */
  driftLockUntil: 0,
  /** performance.now() when the local ride view finished materializing
      (RideReadyGate fired / veil lifted — set once per page via
      battleNet.notifyRideReady). The joiner's `hello` waits on this so the
      duel countdown NEVER starts behind a still-materializing screen. NEVER
      reset by resetBattleRuntime — it is a per-page ride fact, not a
      per-match one (zeroing it would strand a stashed pending start). */
  rideReadyAt: 0,
}

export function resetBattleRuntime(): void {
  battleRuntime.fuel = BATTLE_BASE_CAPACITY
  battleRuntime.capacity = BATTLE_BASE_CAPACITY
  battleRuntime.locked = false
  battleRuntime.timeLeft = BATTLE_DURATION
  battleRuntime.countdown = COUNTDOWN_SECONDS
  battleRuntime.lastFoeTrailHitAt = 0
  battleRuntime.lastFoeWallTouchAt = 0
  battleRuntime.crashSide = null
  battleRuntime.crashFocus = null
  battleRuntime.remoteCapacity = BATTLE_BASE_CAPACITY
  battleRuntime.stallFor = 0
  battleRuntime.driftHeat = 0
  battleRuntime.driftLockUntil = 0
}
