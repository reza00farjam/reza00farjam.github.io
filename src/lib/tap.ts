import React from 'react'
import { useRef } from 'react'

/* Tap-vs-scroll discrimination for touch: a touch only counts as a tap when
   the finger lifts within TAP_SLOP px of where it landed and within TAP_MS —
   scroll/swipe gestures that merely begin on the element never fire onTap
   (distance is judged from changedTouches at lift, so no move tracking is
   needed). Call the hook once per component and wire the pieces into touch
   props; pass your action to onTouchEnd inside the event-handler arrow. */
const TAP_SLOP = 10
const TAP_MS = 500

export const isTapGesture = (dx: number, dy: number, durationMs: number) =>
  Math.hypot(dx, dy) <= TAP_SLOP && durationMs <= TAP_MS

export const useTapHandlers = () => {
  const g = useRef({ x: 0, y: 0, t: 0, ok: false })

  return {
    onTouchStart(e: React.TouchEvent) {
      const t = e.touches[0]
      if (t) g.current = { x: t.clientX, y: t.clientY, t: performance.now(), ok: true }
    },
    cancel() {
      g.current.ok = false
    },
    onTouchEnd(e: React.TouchEvent, onTap: () => void) {
      const s = g.current
      const t = e.changedTouches[0]
      const ok =
        s.ok && !!t && isTapGesture(t.clientX - s.x, t.clientY - s.y, performance.now() - s.t)
      s.ok = false
      if (ok) {
        // Suppress the synthesized mouse events + click that follow a tap.
        // Without this, a tap that opens a modal is followed ~instantly by a
        // ghost click at the same coordinates — if that point now lands on
        // the modal's backdrop (tap near a thumb's edge), the modal closes
        // the moment it opens ("works after some tries").
        e.preventDefault()
        onTap()
      }
    },
  }
}
