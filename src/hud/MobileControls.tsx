import React, { useRef } from 'react'
import { CycleInputs } from '../lib/cyclePhysics'

interface MobileControlsProps {
  inputsRef: React.MutableRefObject<CycleInputs>
  className?: string
  /** Duel: auto-cruise is on — the brake pedal is DRIFT ONLY (no stop), so
      its label says so; the joystick's forward/back axes are overridden by
      the physics loop every frame and stay harmless */
  battle?: boolean
}

/* Tron-styled virtual joystick: a chamfered pad with a sliding glowing puck.
   Drag in any direction — diagonals included — without lifting the finger.
   Maps to the same boolean inputs as the keyboard (W/A/S/D), PLUS a boost
   band at the top of the travel (up = drive, a little further up = boost —
   the old Boost pedal is gone; hysteresis keeps it flicker-free while the
   steering zones stay live underneath it).
   Themed cyan like the rest of the battle HUD: every rider rides cyan and
   sees the foe orange, so the local controls never switch color. */
const JoystickPad: React.FC<{
  inputsRef: React.MutableRefObject<CycleInputs>
  /** Duel: reverse is dead (auto-cruise) — the bottom mark hides */
  battle?: boolean
}> = ({ inputsRef, battle = false }) => {
  const accent = 'border-cyan/50'
  const cross = 'bg-cyan/10'
  const markGlow = 'shadow-[0_0_6px_#35e4ff]'
  const knobStyle = 'bg-cyan/20 border-cyan shadow-[0_0_12px_rgba(53,228,255,0.45)]'
  const padRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const marksRef = useRef<{
    up: HTMLSpanElement | null
    down: HTMLSpanElement | null
    left: HTMLSpanElement | null
    right: HTMLSpanElement | null
  }>({ up: null, down: null, left: null, right: null })
  const activePointerRef = useRef<number | null>(null)
  // Boost = the finger LEAVES the pad (2026-11-06, Reza's model: inside =
  // drive + steer, past the rim = boost). Pointer capture keeps tracking the
  // finger outside the pad element, so the raw vector's length vs the pad
  // radius IS the boost signal. Small hysteresis band around the rim so a
  // finger riding the edge can't flicker it.
  const boostActiveRef = useRef(false)

  const DEAD = 0.3 // normalized dead zone before a direction engages
  const BOOST_ENTER = 1.04 // raw length past the pad rim to ignite
  const BOOST_HOLD = 0.92 // once lit, hold until the finger is back inside

  const applyFromPointer = (clientX: number, clientY: number) => {
    const pad = padRef.current
    const knob = knobRef.current
    if (!pad || !knob) return
    const r = pad.getBoundingClientRect()
    const maxTravel = r.width / 2 - 26 // keep the 40px puck inside the pad

    // RAW vector (finger vs pad center, in pad radii) drives the boost rim
    // rule; the clamped vector drives steer/drive and the knob position
    const rawDx = (clientX - (r.left + r.width / 2)) / (r.width / 2)
    const rawDy = (clientY - (r.top + r.height / 2)) / (r.height / 2)
    const rawLen = Math.hypot(rawDx, rawDy)
    let dx = rawDx
    let dy = rawDy
    if (rawLen > 1) {
      dx /= rawLen
      dy /= rawLen
    }
    knob.style.transform = `translate(calc(-50% + ${dx * maxTravel}px), calc(-50% + ${dy * maxTravel}px))`

    const i = inputsRef.current
    const drive = dy < -DEAD
    // BOOST = finger outside the pad (past the rim): inside the pad it is
    // plain drive + steer; slide past the rim in ANY direction and boost
    // ignites (steering stays live from the clamped vector); slide back
    // inside or lift to release.
    // Rim-exit boost fires only in the TOP half (up / up-left / up-right —
    // 2026-11-06): sliding off the pad's bottom or side edges is steering
    // travel, not a boost intent
    const upper = rawDy < 0
    boostActiveRef.current =
      upper && (rawLen > BOOST_ENTER || (boostActiveRef.current && rawLen > BOOST_HOLD))
    const boost = boostActiveRef.current
    i.left = dx < -DEAD
    i.right = dx > DEAD
    i.forward = drive
    i.backward = dy > DEAD
    i.boost = boost
    i.boostHeld = boost // the battle fuel gate auto-resumes while held

    // Boost indicator: the TOP MARK of the pad flares in the rider's OWN
    // theme color + glows while boosting (the zone must be feel-able; the
    // knob itself stays themed)
    const m = marksRef.current
    // Boost flare in the rider's OWN theme: always the TOP mark; on a
    // steer-boost the ACTIVE direction mark flares too (2026-11-06). The
    // flare keeps each mark's orientation (horizontal top, vertical sides).
    const flareColor = '#35e4ff'
    const flareGlow = 'rgba(53,228,255,0.9)'
    const flare = (el: HTMLSpanElement | null, on: boolean, horizontal: boolean) => {
      if (!el) return
      el.style.background = on ? flareColor : ''
      el.style.boxShadow = on ? `0 0 10px ${flareGlow}` : ''
      el.style.width = on ? (horizontal ? '22px' : '5px') : ''
      el.style.height = on ? (horizontal ? '5px' : '22px') : ''
    }
    if (m.up) {
      m.up.style.opacity = boost ? '1' : i.forward ? '0.7' : '0.25'
      flare(m.up, boost, true)
    }
    if (m.down) m.down.style.opacity = i.backward ? '1' : '0.25'
    if (m.left) {
      m.left.style.opacity = i.left ? '1' : '0.25'
      flare(m.left, boost && i.left, false)
    }
    if (m.right) {
      m.right.style.opacity = i.right ? '1' : '0.25'
      flare(m.right, boost && i.right, false)
    }
  }

  const reset = () => {
    const knob = knobRef.current
    if (knob) knob.style.transform = 'translate(-50%, -50%)'
    boostActiveRef.current = false
    const i = inputsRef.current
    i.left = false
    i.right = false
    i.forward = false
    i.backward = false
    i.boost = false
    i.boostHeld = false
    const m = marksRef.current
    for (const key of ['up', 'down', 'left', 'right'] as const) {
      const el = m[key]
      if (!el) continue
      el.style.opacity = '0.25'
      el.style.background = ''
      el.style.boxShadow = ''
      el.style.height = ''
      el.style.width = ''
    }
  }

  return (
    <div
      ref={padRef}
      aria-label="Movement Joystick"
      // circular pad: the ring itself is the boost boundary (rim-exit boost)
      className={`joystick-pad-round relative w-[150px] h-[150px] bg-deep/70 border ${accent} touch-none pointer-events-auto select-none cursor-pointer`}
      onPointerDown={(e) => {
        e.preventDefault()
        activePointerRef.current = e.pointerId
        try {
          padRef.current?.setPointerCapture(e.pointerId)
        } catch {
          // capture is best-effort; tracking continues while the pointer stays down
        }
        applyFromPointer(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (activePointerRef.current !== e.pointerId) return
        applyFromPointer(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        if (activePointerRef.current !== e.pointerId) return
        activePointerRef.current = null
        reset()
      }}
      onPointerCancel={() => {
        activePointerRef.current = null
        reset()
      }}
    >
      {/* Inner frame + crosshair */}
      <span className={`absolute top-1/2 left-3 right-3 h-px ${cross}`} aria-hidden="true" />
      <span className={`absolute left-1/2 top-3 bottom-3 w-px ${cross}`} aria-hidden="true" />

      {/* Direction marks — brighten when engaged */}
      <span
        ref={(el) => {
          marksRef.current.up = el
        }}
        className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-core ${markGlow} opacity-25`}
        aria-hidden="true"
      />
      {!battle && (
        <span
          ref={(el) => {
            marksRef.current.down = el
          }}
          className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-core ${markGlow} opacity-25`}
          aria-hidden="true"
        />
      )}
      <span
        ref={(el) => {
          marksRef.current.left = el
        }}
        className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-core ${markGlow} opacity-25`}
        aria-hidden="true"
      />
      <span
        ref={(el) => {
          marksRef.current.right = el
        }}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-core ${markGlow} opacity-25`}
        aria-hidden="true"
      />

      {/* Sliding puck */}
      <div
        ref={knobRef}
        className={`joystick-pad-round absolute left-1/2 top-1/2 w-11 h-11 ${knobStyle} flex items-center justify-center`}
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <span className="w-2 h-2 bg-core shadow-[0_0_8px_#35e4ff]" aria-hidden="true" />
      </div>
    </div>
  )
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  inputsRef,
  className = '',
  battle = false,
}) => {
  const setInput = (key: keyof CycleInputs, val: boolean) => {
    inputsRef.current[key] = val
    // The drift pedal tracks the RAW brake hold for the drift-lock lockout
    if (key === 'brake') inputsRef.current.brake = val
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 z-30 pointer-events-none flex items-end justify-between select-none ${className}`}
    >
      {/* Movement Joystick (Left Thumb) — up = drive, top band = boost */}
      <JoystickPad inputsRef={inputsRef} battle={battle} />

      {/* Drift (Right Thumb) — the Boost pedal is gone (boost lives on the
          stick now); in a duel auto-cruise drives for you, so this pedal is
          a pure drift trigger */}
      <div className="flex flex-col gap-2 pointer-events-auto">
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault()
            setInput('brake', true)
            if (!battle) setInput('backward', true)
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            setInput('brake', false)
            if (!battle) setInput('backward', false)
          }}
          onMouseDown={() => {
            setInput('brake', true)
            if (!battle) setInput('backward', true)
          }}
          onMouseUp={() => {
            setInput('brake', false)
            if (!battle) setInput('backward', false)
          }}
          className="relative w-[110px] h-13 bg-deep/80 border border-cyan/40 text-muted active:bg-cyan/30 text-xs font-mono uppercase flex items-center justify-center tron-panel-clip"
          aria-label={battle ? 'Drift' : 'Brake or Drift'}
        >
          {battle ? 'Drift' : 'Brake'}
        </button>
      </div>
    </div>
  )
}
