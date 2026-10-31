import React, { useEffect, useRef } from 'react'

/* Set by the drag handler, read by the wheel glide: while the user owns the
   thumb, a stray wheel notch must not start a glide that fights the drag. */
const dragActive = { current: false }

interface OverlayScrollbarProps {
  /** Scroll container to mirror; omit for the page (window) scroller */
  targetRef?: React.RefObject<HTMLElement | null>
  /** Positioning for the track: 'fixed' (page) or 'absolute' (inside a dialog) */
  className?: string
  /** Change to force a re-measure (e.g. when the scrolled content swaps) */
  refreshKey?: string
}

/* Floating Tron scrollbar drawn over the content (native scrollbar is hidden
   via the `hide-native-scrollbar` class / html rules in index.css so it never
   consumes layout width). Draggable like a native scrollbar via pointer
   capture. Shared by the Read view page and ride-view terminal dialogs. */
export const OverlayScrollbar: React.FC<OverlayScrollbarProps> = ({
  targetRef,
  className = 'fixed',
  refreshKey,
}) => {
  const thumbRef = useRef<HTMLDivElement>(null)
  // Effect assigns, drag handler calls — kills any in-flight glide on grab
  const cancelGlideRef = useRef<() => void>(() => {})

  const getEl = () => (targetRef ? targetRef.current : document.documentElement)

  useEffect(() => {
    const thumb = thumbRef.current
    const track = thumb?.parentElement
    if (!thumb || !track) return

    // Thumb lives visible while scrolling/dragging/hovering, then fades out
    // (macOS overlay behavior). It stays hit-testable at opacity 0 so the
    // track area still reveals it on approach.
    let hideTimer = 0
    let hideScheduled = false
    let pinned = false
    const showThumb = () => {
      if (thumb.style.opacity !== '1') thumb.style.opacity = '1'
      thumb.style.pointerEvents = 'auto'
      if (hideScheduled) return
      hideScheduled = true
      hideTimer = window.setTimeout(() => {
        hideScheduled = false
        if (!pinned) thumb.style.opacity = '0'
      }, 1200)
    }

    // Scroll events fire at fling frequency on touch — every write here must
    // be compositor-cheap or guarded. `height` dirties layout, so it (and the
    // track geometry) only goes down when the measured values actually
    // change. Where the browser supports scroll-driven animations, the page
    // thumb skips JS transform writes entirely and rides a compositor-run
    // scroll() timeline (see .overlay-thumb-auto in index.css) — a busy main
    // thread mid-fling can no longer make it step. Dialogs (targetRef) and
    // old browsers keep the JS path.
    const autoTimeline =
      !targetRef && typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'scroll()')
    if (autoTimeline) thumb.classList.add('overlay-thumb-auto')
    let lastTrackTop = ''
    let lastTrackH = ''
    let lastThumbH = -1
    let lastTransform = ''
    const update = () => {
      const el = getEl()
      if (!el) return
      // Dialog mode: the track lives in the card but aligns to the scroller's
      // actual box (below the header bar) — the card's height is content-driven
      // so the track cannot rely on stretching (top-0/bottom-0) to fill it
      let trackH = track.clientHeight
      if (targetRef) {
        const t = `${el.offsetTop}px`
        const h = `${el.clientHeight}px`
        if (t !== lastTrackTop || h !== lastTrackH) {
          track.style.top = t
          track.style.height = h
          lastTrackTop = t
          lastTrackH = h
        }
        trackH = el.clientHeight
      }
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) {
        if (hideScheduled) {
          window.clearTimeout(hideTimer)
          hideScheduled = false
        }
        thumb.style.opacity = '0'
        thumb.style.pointerEvents = 'none'
        return
      }
      const top = targetRef ? el.scrollTop : window.scrollY
      const thumbH = Math.max(48, (el.clientHeight / el.scrollHeight) * trackH)
      showThumb()
      if (thumbH !== lastThumbH) {
        thumb.style.height = `${thumbH}px`
        lastThumbH = thumbH
        const travel = `${trackH - thumbH}px`
        if (autoTimeline) thumb.style.setProperty('--thumb-travel', travel)
      }
      if (!autoTimeline) {
        const tf = `translateY(${(top / max) * (trackH - thumbH)}px)`
        if (tf !== lastTransform) {
          thumb.style.transform = tf
          lastTransform = tf
        }
      }
    }

    const scroller: HTMLElement | Window = (targetRef?.current as HTMLElement) ?? window
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    const onPinEnter = () => {
      pinned = true
      window.clearTimeout(hideTimer)
      thumb.style.opacity = '1'
    }
    const onPinLeave = () => {
      pinned = false
      showThumb()
    }
    thumb.addEventListener('pointerenter', onPinEnter)
    thumb.addEventListener('pointerleave', onPinLeave)

    // Container box changes (viewport/dialog resize) re-measure the track
    let ro: ResizeObserver | undefined
    const el = getEl()
    if (targetRef && el) {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }

    // Buttery wheel glide: notch deltas accumulate into a target and the
    // scroller eases to it (frame-rate-independent exponential). Touch
    // scrolling, pinch/page zoom (ctrl+wheel), horizontal intents and
    // reduced-motion users keep fully native scrolling. A foreign scroll
    // (keyboard, scrollbar drag, anchor jump) mid-glide adopts the new
    // position instead of fighting it.
    let glideTarget = 0
    let glideCur = 0
    let rafId = 0
    let lastT = 0
    let lastWritten = -1
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const getTop = () => (targetRef ? el!.scrollTop : window.scrollY)
    const setTop = (y: number) => {
      const opts: ScrollToOptions = { top: y, behavior: 'instant' }
      if (targetRef) el!.scrollTo(opts)
      else window.scrollTo(opts)
    }
    const tick = (t: number) => {
      const dt = Math.min(0.06, Math.max(0.001, (t - lastT) / 1000))
      lastT = t
      const actual = getTop()
      if (Math.abs(actual - lastWritten) > 1) {
        glideCur = actual
        glideTarget = actual
      }
      glideTarget = Math.min(glideTarget, getEl()!.scrollHeight - getEl()!.clientHeight)
      glideCur += (glideTarget - glideCur) * (1 - Math.exp(-dt * 14))
      if (Math.abs(glideTarget - glideCur) < 0.5) glideCur = glideTarget
      setTop(glideCur)
      lastWritten = glideCur
      rafId = glideCur !== glideTarget ? requestAnimationFrame(tick) : 0
    }
    const onWheel = (e: WheelEvent) => {
      if (dragActive.current || reducedMotion.matches || e.ctrlKey || e.defaultPrevented) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = getEl()!.scrollHeight - getEl()!.clientHeight
      if (max <= 0) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? getEl()!.clientHeight : 1
      if (!rafId) glideCur = getTop()
      glideTarget = Math.max(0, Math.min(max, glideTarget + e.deltaY * unit))
      if (!rafId) {
        lastT = performance.now()
        rafId = requestAnimationFrame(tick)
      }
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })

    cancelGlideRef.current = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    update()
    return () => {
      scroller.removeEventListener('scroll', update)
      scroller.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', update)
      thumb.removeEventListener('pointerenter', onPinEnter)
      thumb.removeEventListener('pointerleave', onPinLeave)
      window.clearTimeout(hideTimer)
      if (rafId) cancelAnimationFrame(rafId)
      ro?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRef, refreshKey])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const thumb = thumbRef.current
    const track = thumb?.parentElement
    const el = getEl()
    if (!thumb || !track || !el) return
    const max = el.scrollHeight - el.clientHeight
    if (max <= 0) return
    const trackH = track.clientHeight
    const thumbH = thumb.offsetHeight
    const startY = e.clientY
    const startScroll = targetRef ? el.scrollTop : window.scrollY
    // Instant writes: the page inherits `scroll-behavior: smooth` from html,
    // and a smooth scrollTo per pointermove queues a tween per event — the
    // page "gathers tension" mid-drag and releases on let-go instead of
    // tracking the pointer. Grabbing the thumb also kills any in-flight
    // wheel glide so the two never fight over the scroll position.
    cancelGlideRef.current()
    dragActive.current = true
    const scrollToY = (y: number) => {
      if (targetRef) el.scrollTo({ top: y, behavior: 'instant' })
      else window.scrollTo({ top: y, behavior: 'instant' })
    }
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY
      scrollToY(startScroll + (dy / (trackH - thumbH)) * max)
    }
    const onUp = () => {
      dragActive.current = false
      thumb.removeEventListener('pointermove', onMove)
      thumb.removeEventListener('pointerup', onUp)
      thumb.removeEventListener('pointercancel', onUp)
    }
    thumb.addEventListener('pointermove', onMove)
    thumb.addEventListener('pointerup', onUp)
    thumb.addEventListener('pointercancel', onUp)
    thumb.setPointerCapture(e.pointerId)
  }

  return (
    <div
      aria-hidden="true"
      className={`right-0 top-0 bottom-0 w-2.5 z-40 pointer-events-none ${className}`}
    >
      {/* Wider invisible hit strip wrapping the 3px visual bar — 16px reach
          so grabbing never means hunting the window-edge resize zone */}
      <div
        ref={thumbRef}
        onPointerDown={onPointerDown}
        className="absolute right-0 h-0 w-4 flex justify-end items-stretch cursor-grab active:cursor-grabbing touch-none opacity-0 transition-opacity duration-300 will-change-transform"
      >
        <div className="w-[3px] h-full bg-cyan/60 shadow-[0_0_8px_rgba(53,228,255,0.5)]" />
      </div>
    </div>
  )
}
