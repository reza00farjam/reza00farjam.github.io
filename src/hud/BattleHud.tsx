import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { updateCycleKinematics } from '../lib/cyclePhysics'
import { useBattleStore, battleRuntime } from '../lib/battleStore'
import {
  hostBattle,
  joinBattle,
  leaveBattle,
  localRefs,
  reportTimeout,
  requestRematch,
} from '../lib/battleNet'
import {
  BATTLE_DURATION,
  STALL_FLIP_S,
  STALL_SPEED,
  normalizeBattleCode,
  stepFuel,
} from '../lib/battle'
import { soundEngine } from '../lib/soundEngine'
import { HelpDialog } from './HelpDialog'

// Toasts/boards: top-CENTER on desktop, top-LEFT on tablet/phone (same rule
// as the station prompt — the radar owns top-right). Desktop centering uses
// inset-x-0 + w-fit, NOT translate-centering (that caps wrap width at 50vw)
const toastPosClass = (isMobile: boolean) =>
  isMobile ? 'fixed top-4 left-4 z-30' : 'fixed top-4 left-0 right-0 mx-auto w-fit z-30'

const btnClass =
  'px-4 py-2 text-xs font-mono uppercase tracking-wider border border-cyan/40 text-core hover:border-cyan hover:bg-cyan/10 transition-colors focus-visible:outline-ember cursor-pointer'

const emberBtnClass =
  'px-4 py-2 text-xs font-mono uppercase tracking-wider border border-ember/60 text-ember hover:border-ember hover:bg-ember/10 transition-colors focus-visible:outline-ember cursor-pointer'

/** Host-side battle launcher: opened with Enter at the battle terminal.
    Dismissing the dialog (X / Esc / backdrop) KEEPS the battle alive — only
    the explicit Cancel button tears the session down. */
export const BattleDialog: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const phase = useBattleStore((s) => s.phase)
  const battleId = useBattleStore((s) => s.battleId)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [help, setHelp] = useState(false)
  // Join-by-code (PWA riders cannot open invite links): the code IS the
  // battle id the #b= link carries. Refs keep the window-level Enter handler
  // (effect deps are [open] only) on fresh values without re-binding.
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const joinBtnRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // The challenger arrived — the duel takes over, drop the dialog
  useEffect(() => {
    if (open && phase !== 'idle' && phase !== 'waiting') onClose()
  }, [phase, open, onClose])

  // A create can fail ASYNC after hostBattle resolved (broker socket dying
  // post-open → wirePeerError → leaveBattle → back to idle): the pane
  // returns with the button still stuck on "Opening grid…". Any TRANSITION
  // back to idle clears the loading flags (the legit broker handshake runs
  // while phase is already idle — no transition, no reset).
  useEffect(() => {
    if (phase !== 'idle') return
    const id = window.setTimeout(() => {
      setCreating(false)
      setJoining(false)
    }, 0)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (!open) return
    rootRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeDialog()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        // Enter inside the code box submits it (the live button's onClick
        // closure is always fresh); anywhere else Enter still dismisses
        if (e.target === codeInputRef.current) joinBtnRef.current?.click()
        else closeDialog()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const closeDialog = () => {
    // Dismiss only — the battle stays open, the "Awaiting challenger" chip
    // reopens this dialog with the link
    setCreating(false)
    setCopied(null)
    setJoining(false)
    onClose()
  }

  const cancelBattle = () => {
    leaveBattle()
    closeDialog()
  }

  if (!open) return null

  const link =
    battleId && typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#b=${battleId}`
      : ''

  const create = async () => {
    // A stale failure message must not linger into the new attempt — clear it
    // up front; if this attempt fails too, the catch shows a fresh one
    useBattleStore.getState().setError(null)
    setCreating(true)
    try {
      await hostBattle()
      soundEngine.playBattleLink()
    } catch {
      useBattleStore.getState().setError('network')
      setCreating(false)
    }
  }

  const joinByCode = async () => {
    const id = normalizeBattleCode(code)
    if (!/^[a-z0-9]{5}$/.test(id)) return
    useBattleStore.getState().setError(null)
    setJoining(true)
    try {
      // Resolves once the attempt is WIRED — the "Linking…" toast and the
      // async error toasts (dead code = not found) take over from here
      await joinBattle(id)
      closeDialog()
      setCode('')
    } catch {
      // Broker failure — the inline message below (same slot as Create's);
      // the dialog stays open for an in-place retry
    }
    setJoining(false)
  }

  const copyBattle = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? (battleId ?? '') : link)
      setCopied(what)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard unavailable — the code input still allows manual copy
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grid Battle Terminal"
      className="fixed inset-0 z-40 pointer-events-auto cursor-default flex items-center justify-center p-3 sm:p-6 animate-fade-in"
    >
      <div
        onClick={closeDialog}
        className="absolute inset-0 bg-void/75 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div
        ref={rootRef}
        tabIndex={0}
        className="relative z-10 w-full max-w-md bg-deep/95 border border-ember/50 shadow-[0_0_30px_rgba(255,138,31,0.2)] tron-ember tron-panel-clip overflow-hidden focus:outline-none"
      >
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />

        <div className="flex items-center justify-between gap-4 px-3 sm:px-6 md:px-6 py-4 border-b border-ember/25 bg-void/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-sm font-semibold text-core tracking-wide uppercase truncate">
              Grid Battle
            </span>
            <span className="font-mono text-xs uppercase tracking-wider text-muted whitespace-nowrap">
              Terminal
            </span>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Close"
            className={emberBtnClass + ' !px-3 !py-1'}
          >
            X
          </button>
        </div>

        <div className="p-3 sm:p-6 md:p-6 space-y-5">
          {phase !== 'waiting' ? (
            <>
              <p className="text-sm text-ice font-sans leading-relaxed">
                Spawn a Grid Battle arena and send the link or code to a challenger. You both ride
                cyan and see each other orange.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={create}
                  disabled={creating}
                  className={btnClass + (creating ? ' opacity-50 cursor-not-allowed' : '')}
                >
                  {creating ? 'Opening grid…' : 'Create Grid Battle'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="h-px flex-1 bg-ember/20" aria-hidden="true" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">
                    or
                  </span>
                  <span className="h-px flex-1 bg-ember/20" aria-hidden="true" />
                </div>
                <p className="text-sm text-ice font-sans leading-relaxed">
                  Have a challenger&apos;s code? Enter it to join their grid.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    ref={codeInputRef}
                    value={code}
                    onChange={(e) => setCode(normalizeBattleCode(e.target.value))}
                    placeholder="enter code"
                    aria-label="Grid Battle code"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 bg-void/70 border border-cyan/30 px-3 py-2 font-mono text-xs tracking-widest text-core placeholder:text-muted/50 focus-visible:outline-ember"
                  />
                  <button
                    ref={joinBtnRef}
                    type="button"
                    onClick={joinByCode}
                    disabled={joining || !/^[a-z0-9]{5}$/.test(code)}
                    className={
                      btnClass +
                      (joining || !/^[a-z0-9]{5}$/.test(code)
                        ? ' opacity-50 cursor-not-allowed'
                        : '')
                    }
                  >
                    {joining ? 'Linking…' : 'Join Grid Battle'}
                  </button>
                </div>
                {/* Same rules link as the result dialog — read before entering */}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setHelp(true)}
                    className="text-xs font-mono uppercase tracking-wider text-muted hover:text-core transition-colors focus-visible:outline-ember cursor-pointer underline underline-offset-4"
                  >
                    How to play
                  </button>
                </div>
              </div>
              {useBattleStore.getState().error === 'network' && (
                <p className="text-xs font-mono text-ember">Grid unavailable, try again.</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  readOnly
                  value={battleId ?? ''}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Battle code"
                  className="flex-1 min-w-0 bg-void/70 border border-cyan/30 px-3 py-2 font-mono text-xs tracking-widest text-center text-core focus-visible:outline-ember"
                />
                <button type="button" onClick={() => copyBattle('code')} className={btnClass}>
                  {copied === 'code' ? 'Copied' : 'Copy Code'}
                </button>
                <button type="button" onClick={() => copyBattle('link')} className={btnClass}>
                  {copied === 'link' ? 'Copied' : 'Copy Link'}
                </button>
              </div>
              <p className="text-xs text-ice/70 font-sans">
                Send the code or link to a challenger — link riders land on a challenge screen, and
                the Grid Battle starts the moment they enter the grid. Keep riding while you wait;
                closing this window does NOT cancel the battle.
              </p>
              <button type="button" onClick={cancelBattle} className={emberBtnClass}>
                Cancel Grid Battle
              </button>
            </>
          )}
        </div>
      </div>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  )
}

/** Waiting/status chips: joiner linking to the host's grid, host awaiting a
    challenger (reopens the link dialog), and fatal link errors. Error toasts
    dismiss themselves after TOAST_AUTO_MS — the drain bar at their bottom
    edge shows the remaining time (no dismiss button). */
const TOAST_AUTO_MS = 5000

/** Joiner's landing screen (opened a #battle= link): no instant join — the
    rider chooses to enter, and can read the rules first. This screen IS the
    joiner's splash (the boot animation stays skipped). Enter shows a loading
    state ("Entering…", disabled) until the join settles — a failure returns
    to the idle buttons for another try. */
export const BattleChallenge: React.FC<{
  onEnter: () => Promise<boolean>
  onReject: () => void
}> = ({ onEnter, onReject }) => {
  const [help, setHelp] = useState(false)
  const [entering, setEntering] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    rootRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (entering) return
        setEntering(true)
        onEnter().then((ok) => {
          if (!ok) setEntering(false)
        })
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onEnter, entering])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grid Battle challenge"
      className="fixed inset-0 z-40 pointer-events-auto cursor-default flex items-center justify-center p-3 sm:p-6 animate-fade-in"
    >
      <div className="absolute inset-0 bg-void/85 backdrop-blur-sm" aria-hidden="true" />

      <div
        ref={rootRef}
        tabIndex={0}
        className="relative z-10 w-full max-w-sm bg-deep/95 border border-ember/50 shadow-[0_0_30px_rgba(255,138,31,0.2)] tron-ember tron-panel-clip overflow-hidden text-center focus:outline-none"
      >
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />

        <div className="p-3 sm:p-6 md:p-6 space-y-5">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wider text-core">
            Grid Battle
          </h2>
          <p className="text-sm text-ice font-sans leading-relaxed">
            You&apos;ve been challenged to a Grid Battle on the light grid. The countdown starts the
            moment you enter.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                if (entering) return
                setEntering(true)
                onEnter().then((ok) => {
                  if (!ok) setEntering(false)
                })
              }}
              disabled={entering}
              className={btnClass + (entering ? ' opacity-50 cursor-not-allowed' : '')}
            >
              {entering ? 'Entering…' : 'Enter the Grid'}
            </button>
            <button type="button" onClick={onReject} className={emberBtnClass}>
              Reject
            </button>
          </div>
          {/* Rules stay reachable without competing with the two actions —
              same quiet link style as the result dialog's How to play */}
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="text-xs font-mono uppercase tracking-wider text-muted hover:text-core transition-colors focus-visible:outline-ember cursor-pointer underline underline-offset-4"
          >
            How to play
          </button>
        </div>
      </div>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  )
}

export const BattleJoinStatus: React.FC<{
  onOpenDialog: () => void
  isMobile?: boolean
}> = ({ onOpenDialog, isMobile = false }) => {
  const phase = useBattleStore((s) => s.phase)
  const role = useBattleStore((s) => s.role)
  const error = useBattleStore((s) => s.error)
  const setError = useBattleStore((s) => s.setError)

  // Auto-dismiss error toasts (the drain bar animates over the same duration)
  useEffect(() => {
    if (!error) return
    const id = window.setTimeout(() => useBattleStore.getState().setError(null), TOAST_AUTO_MS)
    return () => window.clearTimeout(id)
  }, [error])

  if (phase === 'waiting' && !error && role === 'joiner') {
    return (
      <div className={`${toastPosClass(isMobile)} pointer-events-none`}>
        <div
          className={`bg-deep/60 backdrop-blur-md border border-ember/50 tron-ember tron-panel-clip ${isMobile ? 'px-4 py-2' : 'px-6 py-3'}`}
        >
          <span className="corner-tick-tl" aria-hidden="true" />
          <span className="corner-tick-br" aria-hidden="true" />
          <p
            className={`font-mono uppercase tracking-wider text-core animate-pulse ${isMobile ? 'text-[10px]' : 'text-xs'}`}
          >
            Linking to Grid Battle…
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'waiting' && !error && role === 'host') {
    return (
      <div className={`${toastPosClass(isMobile)} pointer-events-auto`}>
        <button
          type="button"
          onClick={onOpenDialog}
          className={`relative bg-deep/60 backdrop-blur-md border border-ember/50 tron-ember tron-panel-clip cursor-pointer hover:bg-deep/85 transition-[background-color] duration-200 focus-visible:outline-ember ${isMobile ? 'px-4 py-2' : 'px-6 py-3'}`}
        >
          <span className="corner-tick-tl" aria-hidden="true" />
          <span className="corner-tick-br" aria-hidden="true" />
          <p
            className={`flex items-center gap-2 font-mono uppercase tracking-wider text-ember animate-pulse ${isMobile ? 'text-[10px]' : 'text-xs'}`}
          >
            Awaiting challenger
            {/* Clickable on every viewport — chevron on desktop too (the
                station prompt keeps its chevron mobile-only) */}
            <span
              aria-hidden="true"
              className={`font-mono leading-none ${isMobile ? 'text-sm' : 'text-base'}`}
            >
              ›
            </span>
          </p>
        </button>
      </div>
    )
  }

  if (error && (phase === 'idle' || phase === 'waiting')) {
    return (
      <div className={`${toastPosClass(isMobile)} pointer-events-auto`}>
        <div
          className={`relative flex items-center gap-4 bg-deep/60 backdrop-blur-md border border-ember/50 tron-ember tron-panel-clip ${isMobile ? 'px-4 py-2' : 'px-6 py-3'}`}
          role="status"
        >
          <span className="corner-tick-tl" aria-hidden="true" />
          <span className="corner-tick-br" aria-hidden="true" />
          <p
            className={`font-mono uppercase tracking-wider text-ember ${isMobile ? 'text-[10px]' : 'text-xs'}`}
          >
            {error === 'invalid' ? 'Grid Battle not found' : 'Grid Battle unreachable'}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="px-2 py-0.5 text-xs leading-none font-mono border border-ember/60 text-ember hover:border-ember hover:bg-ember/10 transition-colors focus-visible:outline-ember cursor-pointer"
          >
            X
          </button>
          {/* Remaining-time drain bar — empties right as the toast clears */}
          <span
            key={error}
            aria-hidden="true"
            className="toast-drain absolute bottom-0 left-0 h-[2px] bg-ember/80"
            style={{ animationDuration: `${TOAST_AUTO_MS}ms` }}
          />
        </div>
      </div>
    )
  }

  return null
}

/** In-duel match board: hit score + battle clock (the fuel gauge lives in its
    own BattleFuelGauge). The timer text is written imperatively per frame —
    only score changes re-render. YOU is always cyan and FOE always orange —
    every rider rides cyan and sees the opponent orange.
    Parks top-LEFT on BOTH viewports (2026-11-21, Reza — top-center belongs
    to the nav arrow alone in a duel; the BattleLog hangs right under it).
    Mobile/tablet (isMobile ≤1024 JS flag, like the radar) renders it compact. */
export const BattleStrip: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const score = useBattleStore((s) => s.score)
  const timeRef = useRef<HTMLSpanElement>(null)
  const meScoreRef = useRef<HTMLSpanElement>(null)
  const prevMeRef = useRef(score.me)

  /* Point scored (foe bounced off our ribbon): the YOU digit pops once —
     imperative classList, restartable, no extra re-render */
  useEffect(() => {
    const el = meScoreRef.current
    if (score.me > prevMeRef.current && el) {
      el.classList.remove('score-pop')
      void el.offsetWidth // restart the animation on back-to-back hits
      el.classList.add('score-pop')
    }
    prevMeRef.current = score.me
  }, [score.me])

  useEffect(() => {
    let animId = 0
    const update = () => {
      const rt = battleRuntime
      if (timeRef.current) {
        const s = Math.max(0, Math.ceil(rt.timeLeft))
        timeRef.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      }
      animId = requestAnimationFrame(update)
    }
    animId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className="fixed top-4 left-4 z-30 pointer-events-none">
      <div
        className={`flex items-center bg-deep/60 backdrop-blur-md border ${
          isMobile ? 'gap-2.5 px-3 py-1.5' : 'gap-4 px-5 py-2.5'
        } border-cyan/40 tron-panel-clip`}
      >
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />
        <span
          className={`font-mono uppercase tracking-wider ${isMobile ? 'text-[10px]' : 'text-xs'} text-cyan`}
        >
          YOU{' '}
          <span ref={meScoreRef} className="font-semibold">
            {score.me}
          </span>
        </span>
        <span
          ref={timeRef}
          className={`font-display font-bold text-core tabular-nums tracking-wider ${isMobile ? 'text-xs' : 'text-sm'}`}
        >
          3:00
        </span>
        <span
          className={`font-mono uppercase tracking-wider ${isMobile ? 'text-[10px]' : 'text-xs'} text-ember`}
          aria-label="Foe hits caused"
        >
          <span className="font-semibold">{score.foe}</span> FOE
        </span>
      </div>
    </div>
  )
}

/** Boost fuel / cooldown gauge — deliberately separate from the match board.
    Fill percentage on the left, tank capacity on the right; a booster pickup
    announces its +gain with a quiet float-and-fade blip. Fill is always cyan
    (every rider rides cyan); white while recharging (locked).
    Mobile: compact (radar treatment) and parked bottom-center BETWEEN the
    joystick and the boost/brake pedals; if it would overlap either on a
    narrow screen it lifts above the controls (same imperative collision
    fallback as the station toast). */
export const BattleFuelGauge: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)
  const capRef = useRef<HTMLSpanElement>(null)
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null)

  useLayoutEffect(() => {
    if (!isMobile) return
    const el = rootRef.current
    if (!el) return

    const apply = () => {
      // Always re-measure from the default bottom-4 spot
      el.style.bottom = ''
      const r = el.getBoundingClientRect()
      const blockers = [
        document.querySelector('[aria-label="Movement Joystick"]'),
        document.querySelector('[aria-label="Drift"], [aria-label="Brake or Drift"]'),
      ]
      let minTop = Infinity
      let hit = false
      for (const b of blockers) {
        if (!b) continue
        const br = b.getBoundingClientRect()
        minTop = Math.min(minTop, br.top)
        if (r.left < br.right && br.left < r.right && r.top < br.bottom && br.top < r.bottom) {
          hit = true
        }
      }
      if (hit) el.style.bottom = `${Math.ceil(window.innerHeight - minTop + 8)}px`
    }
    apply()
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('resize', apply)
      el.style.bottom = ''
    }
  }, [isMobile])

  useEffect(() => {
    let animId = 0
    let prevCapacity = battleRuntime.capacity
    let gainKey = 0
    let gainTimer = 0
    const update = () => {
      const rt = battleRuntime
      const frac = rt.capacity > 0 ? Math.max(0, rt.fuel / rt.capacity) : 0
      if (barRef.current) {
        barRef.current.style.width = `${(frac * 100).toFixed(1)}%`
        barRef.current.style.background = rt.locked ? '#eafcff' : '#35e4ff'
      }
      if (pctRef.current) {
        pctRef.current.textContent = `${Math.round(frac * 100)}%`
      }
      if (capRef.current) {
        capRef.current.textContent = String(Math.round(rt.capacity))
      }
      if (rt.capacity > prevCapacity + 0.5) {
        const amount = Math.round(rt.capacity - prevCapacity)
        prevCapacity = rt.capacity
        setGain({ amount, key: ++gainKey })
        window.clearTimeout(gainTimer)
        gainTimer = window.setTimeout(() => setGain(null), 1400)
      } else if (rt.capacity !== prevCapacity) {
        prevCapacity = rt.capacity
      }
      animId = requestAnimationFrame(update)
    }
    animId = requestAnimationFrame(update)
    return () => {
      cancelAnimationFrame(animId)
      window.clearTimeout(gainTimer)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={`fixed ${isMobile ? 'bottom-4 w-36' : 'bottom-6 w-44'} left-1/2 -translate-x-1/2 z-30 pointer-events-none`}
      aria-label="Boost fuel"
    >
      <div className="flex items-center justify-between mb-1">
        <span ref={pctRef} className="font-mono text-[10px] tabular-nums tracking-wider text-cyan">
          100%
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted/70">
          boost
        </span>
        <span ref={capRef} className="font-mono text-[10px] tabular-nums text-muted">
          80
        </span>
      </div>
      <div className="relative h-1.5 bg-void/80 border border-cyan/30">
        <div className="absolute inset-0 overflow-hidden">
          <div ref={barRef} className="h-full transition-none" style={{ width: '100%' }} />
        </div>
        {gain && (
          <span
            key={gain.key}
            className="booster-gain absolute -top-4 right-0 font-mono text-xs font-semibold text-cyan"
          >
            +{gain.amount}
          </span>
        )}
      </div>
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-muted/70">
        cooldown
      </p>
    </div>
  )
}

/** Anti-stall warning — dead center of the screen, impossible to miss:
    stay stalled and the bike gets flipped around (no points — wall touches
    pay those). The countdown reads the mutable runtime (never React state
    at frame rate) and refreshes each second. */
export const BattleStallWarning: React.FC = () => {
  const stalled = useBattleStore((s) => s.stallWarning)
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.ceil(STALL_FLIP_S - battleRuntime.stallFor)),
  )

  useEffect(() => {
    if (!stalled) return
    const id = window.setInterval(() => {
      setSecs(Math.max(0, Math.ceil(STALL_FLIP_S - battleRuntime.stallFor)))
    }, 250)
    return () => window.clearInterval(id)
  }, [stalled])

  if (!stalled) return null
  return (
    <p
      className="fixed top-1/2 left-0 right-0 mx-auto w-fit -translate-y-1/2 z-30 pointer-events-none font-mono text-[11px] sm:text-base uppercase tracking-widest text-ember animate-pulse text-center px-2"
      role="alert"
    >
      MOVE! STALLING FLIPS YOU IN {secs}
    </p>
  )
}

/** Circle-camp penalty chip — the rider's brake/drift is disabled for
    DRIFT_LOCK_S after a detected drift circle; counts down to re-engage.
    Polls the mutable runtime like the stall warning (no frame-rate React). */
export const BattleDriftLock: React.FC = () => {
  const phase = useBattleStore((s) => s.phase)
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      const left = battleRuntime.driftLockUntil - performance.now()
      setSecs(left > 0 ? Math.ceil(left / 1000) : 0)
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  if (secs <= 0 || (phase !== 'running' && phase !== 'waiting')) return null
  return (
    <p
      className="fixed top-[62%] left-0 right-0 mx-auto w-fit z-30 pointer-events-none font-mono text-xs sm:text-sm uppercase tracking-widest text-ember animate-pulse text-center px-2"
      role="status"
    >
      DRIFT DISABLED! BACK IN {secs}
    </p>
  )
}

/** Kill feed: one fading line per scored point (cause included) plus the
    FOE's drift lock as attack-window intel (own lock has its own chip).
    Top-left UNDER the score strip on BOTH viewports (6 lines desktop, 3 on
    tablet/phone — the strip is taller on desktop, hence top-16 vs top-14).
    Newest sits at the BOTTOM; each row grows in, pushing the older rows
    up, then collapse-fades at ~3.7s (see .battle-log-row). */
export const BattleLog: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const events = useBattleStore((s) => s.events)
  const rows = events.slice(isMobile ? -3 : -6)
  if (rows.length === 0) return null
  return (
    <div
      className={`fixed z-30 pointer-events-none flex flex-col gap-1 font-mono uppercase tracking-wider ${
        isMobile ? 'top-14 left-4' : 'top-18 left-4'
      }`}
      aria-live="polite"
    >
      {rows.map((e) => {
        const mine = e.who === 'me'
        const text =
          e.cause === 'lock'
            ? 'FOE DRIFT LOCKED'
            : `${mine ? 'YOU' : 'FOE'} +1 · ${e.cause === 'wall' ? 'WALL' : 'RIBBON'}`
        return (
          <p
            key={e.id}
            className={`battle-log-row ${isMobile ? 'text-[10px]' : 'text-xs'} ${
              mine ? 'text-cyan' : 'text-ember'
            }`}
          >
            {text}
          </p>
        )
      })}
    </div>
  )
}

/** Frame-independent battle clock: countdown, 3-minute timer, fuel regen and
    the timeout verdict run on a wall-clock interval, so the duel advances even
    while the ride tab is hidden (the R3F frame loop freezes on hidden tabs).
    Renders nothing. */
export const BattleClock: React.FC = () => {
  useEffect(() => {
    let last = performance.now()
    let lastCount = Math.ceil(battleRuntime.countdown)

    // Hidden tab: the rAF physics loop is frozen but auto-cruise must keep
    // the bike riding at REAL speed — a statue (or a slow crawl) would read
    // as frozen to the foe. The interval only throttles (250ms → 1s in
    // background tabs), so the elapsed dt is simulated in 0.1s sub-steps —
    // full-rate riding exactly like the frame loop (walls still bounce; the
    // 30Hz send loop keeps broadcasting). A wall-pinned hidden bike
    // SELF-RESCUES with the same flip the stall forfeit uses — a hidden
    // rider cannot see a MOVE warning, so hidden stalls never forfeit.
    const simulateHidden = (dt: number) => {
      const c = localRefs.cycle.current
      const inp = localRefs.inputs.current
      if (!c || !inp) return
      inp.forward = true
      inp.backward = false
      inp.left = false
      inp.right = false
      inp.brake = false
      for (let t = 0; t < dt; t += 0.1) {
        updateCycleKinematics(c, inp, Math.min(0.1, dt - t), undefined, undefined, false, true)
      }
      if (Math.hypot(c.vx ?? 0, c.vz ?? 0) < STALL_SPEED) {
        c.yaw += Math.PI
        c.speed = Math.max(Math.abs(c.speed), 6)
        c.vx = 0
        c.vz = 0
      }
    }

    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(1.5, (now - last) / 1000)
      last = now
      const st = useBattleStore.getState()
      const rt = battleRuntime

      if (st.phase === 'countdown') {
        rt.countdown -= dt
        const n = Math.max(0, Math.ceil(rt.countdown))
        if (n !== lastCount) {
          lastCount = n
          soundEngine.playCountdownBeep(n === 0)
        }
        if (rt.countdown <= 0) {
          rt.countdown = 0
          rt.timeLeft = BATTLE_DURATION
          useBattleStore.getState().beginRunning()
        }
      } else if (st.phase === 'running') {
        rt.timeLeft -= dt
        if (rt.timeLeft <= 0) {
          rt.timeLeft = 0
          reportTimeout()
        } else {
          if (!localRefs.inputs.current?.boost) {
            // Regen lives here (not in the frame loop) so the meter refills
            // while the tab is away too
            const f = stepFuel(rt, false, 0, dt)
            rt.fuel = f.fuel
            rt.locked = f.locked
          }
          if (document.hidden) simulateHidden(dt)
        }
      } else if (st.phase === 'waiting' && st.role === 'host') {
        // Awaiting a challenger rides like a duel (auto-cruise) — a hidden
        // waiting HOST keeps riding the same way; a linking joiner parks
        // (see battleRide in RideScene)
        if (document.hidden) simulateHidden(dt)
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [])
  return null
}

/** 5-second pre-duel countdown, frozen at the spawn corners. Display only —
    the clock itself (and the beeps) tick in BattleClock. */
export const BattleCountdown: React.FC = () => {
  const [n, setN] = useState(5)

  useEffect(() => {
    // The arena just transformed into the duel grid — riders frozen at corners
    soundEngine.playBattleTransform()
    let last = Math.ceil(battleRuntime.countdown)
    let animId = 0
    const update = () => {
      const now = Math.ceil(battleRuntime.countdown)
      if (now !== last) {
        last = now
        setN(now)
      }
      animId = requestAnimationFrame(update)
    }
    animId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className="fixed inset-0 z-30 pointer-events-none flex flex-col items-center justify-center gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">Grid Battle</p>
      <p
        className={`font-display text-8xl font-bold tabular-nums ${n === 0 ? 'text-ember' : 'text-core'}`}
        style={{ textShadow: '0 0 40px rgba(53,228,255,0.5)' }}
      >
        {n === 0 ? 'GO' : n}
      </p>
    </div>
  )
}

/** End-of-duel overlay: verdict + WHY it happened, rematch / exit. Rematch is
    disabled once the foe left (the connection is gone). */
export const BattleResult: React.FC = () => {
  const end = useBattleStore((s) => s.end)
  const score = useBattleStore((s) => s.score)
  const foeGone = useBattleStore((s) => s.foeGone)
  const endReason = useBattleStore((s) => s.endReason)
  const role = useBattleStore((s) => s.role)
  const [help, setHelp] = useState(false)
  if (!end) return null

  const titles: Record<string, { label: string; cls: string }> = {
    win: { label: 'Victory', cls: 'text-cyan' },
    lose: { label: 'Defeat', cls: 'text-ember' },
    tie: { label: 'Stalemate', cls: 'text-ice' },
    left: { label: '', cls: 'text-ice' }, // filled per role below
  }
  titles.left.label = role === 'joiner' ? 'Host Left the Grid' : 'Challenger Left the Grid'
  const t = titles[end] ?? titles.tie
  const canRematch = end !== 'left' && !foeGone

  // Crash verdicts explain WHICH ribbon ended the loser; the hit count then
  // becomes secondary data (parenthesised). Timer verdicts keep the score
  // front and center — the score IS the reason there.
  const reason =
    endReason === 'own-ribbon'
      ? end === 'win'
        ? 'Opponent crashed into their own light ribbon'
        : 'You crashed into your own light ribbon'
      : endReason === 'foe-ribbon'
        ? end === 'win'
          ? 'Opponent crashed into your light ribbon'
          : 'You crashed into your opponent\u2019s light ribbon'
        : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Grid Battle result"
      className="fixed inset-0 z-40 pointer-events-auto cursor-default flex items-center justify-center p-3 sm:p-6 animate-fade-in"
    >
      <div className="absolute inset-0 bg-void/75 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-sm bg-deep/95 border border-ember/50 shadow-[0_0_30px_rgba(255,138,31,0.2)] tron-ember tron-panel-clip overflow-hidden text-center">
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />

        <div className="p-3 sm:p-6 md:p-6 space-y-5">
          <h2 className={`font-display text-2xl font-bold uppercase tracking-wider ${t.cls}`}>
            {t.label}
          </h2>
          {reason ? (
            // Reason + hits grouped tightly — the count is secondary data
            <div className="space-y-1">
              <p className="text-sm text-ice font-sans leading-relaxed">{reason}</p>
              <p className="font-mono text-xs text-muted/70 tabular-nums">
                YOU {score.me} — {score.foe} FOE
              </p>
            </div>
          ) : (
            <p className="font-mono text-sm text-muted tabular-nums">
              YOU {score.me} — {score.foe} FOE
            </p>
          )}
          {foeGone && (
            <p className="font-mono text-xs uppercase tracking-wider text-ember">Challenger left</p>
          )}
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={requestRematch}
              disabled={!canRematch}
              className={btnClass + (canRematch ? '' : ' opacity-50 cursor-not-allowed')}
            >
              Rematch
            </button>
            <button type="button" onClick={leaveBattle} className={emberBtnClass}>
              Exit Grid
            </button>
          </div>
          {/* Read the rules before the rematch — the duel does not restart
              until the rider asks for it */}
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="text-xs font-mono uppercase tracking-wider text-muted hover:text-core transition-colors focus-visible:outline-ember cursor-pointer underline underline-offset-4"
          >
            How to play
          </button>
        </div>
      </div>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  )
}
