import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useBattleStore } from './battleStore'

// Kill feed (BattleLog): scoreHit logs a cause-tagged event, the array stays
// capped, and each line self-prunes after its ~3s TTL.
describe('battleStore event log', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useBattleStore.getState().resetToIdle()
    useBattleStore.setState({ phase: 'running' })
  })
  afterEach(() => vi.useRealTimers())

  test('scoreHit scores and logs the cause', () => {
    const st = useBattleStore.getState()
    st.scoreHit('me', 'wall')
    st.scoreHit('foe', 'ribbon')
    const s = useBattleStore.getState()
    expect(s.score).toEqual({ me: 1, foe: 1 })
    expect(s.events.map((e) => [e.who, e.cause])).toEqual([
      ['me', 'wall'],
      ['foe', 'ribbon'],
    ])
  })

  test('logEvent covers the drift-lock intel line', () => {
    useBattleStore.getState().logEvent('foe', 'lock')
    const e = useBattleStore.getState().events
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ who: 'foe', cause: 'lock' })
  })

  test('events cap at 10 and prune after TTL', () => {
    const st = useBattleStore.getState()
    for (let i = 0; i < 13; i++) st.scoreHit('me', 'wall')
    let events = useBattleStore.getState().events
    expect(events).toHaveLength(10)
    vi.advanceTimersByTime(4200)
    events = useBattleStore.getState().events
    expect(events).toHaveLength(0)
  })

  test('a new duel clears the log', () => {
    useBattleStore.getState().scoreHit('foe', 'wall')
    useBattleStore.getState().beginCountdown([])
    expect(useBattleStore.getState().events).toHaveLength(0)
  })
})
