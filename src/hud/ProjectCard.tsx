import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Project } from '../data/types'
import { useTapHandlers } from '../lib/tap'
import { FadeImg } from './FadeImg'
import { ProjectGlyph } from './ProjectGlyph'

/* All web screenshots ship at one native resolution — pre-declaring it lets
   the deck size itself before the bytes arrive (no width snap on load).
   A future off-aspect shot letterboxes via object-contain instead. */
const WEB_SHOT_ASPECT = '2130 / 1298'

interface ProjectCardProps {
  project: Project
  className?: string
}

interface ScreenshotItem {
  key: string
  src: string
  title: string
}

interface ScreenshotModalProps {
  screens: ScreenshotItem[]
  initialIndex: number
  onClose: () => void
  onIndexChange?: (index: number) => void
}

/* Fullscreen modal for viewing project screenshots: rendered into document.body
   via React Portal so it breaks free from card clip-paths and overflow. Supports
   browsing between multiple screenshots with next/prev buttons & arrow keys,
   mouse wheel zoom (with background scroll prevention), click toggle, touch pinch,
   pan drag, and floating Tron zoom controls. */
export const ScreenshotModal: React.FC<ScreenshotModalProps> = ({
  screens,
  initialIndex,
  onClose,
  onIndexChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    hasMoved: false,
    lastDistance: null as number | null,
    touchStartX: 0,
  })

  const current = screens[currentIndex] ?? screens[0]

  const handleClose = () => {
    ;(document.activeElement as HTMLElement)?.blur?.()
    onClose()
  }

  const goToPrev = () => {
    setCurrentIndex((idx) => {
      const next = (idx - 1 + screens.length) % screens.length
      setScale(1)
      setPos({ x: 0, y: 0 })
      onIndexChange?.(next)
      return next
    })
  }

  const goToNext = () => {
    setCurrentIndex((idx) => {
      const next = (idx + 1) % screens.length
      setScale(1)
      setPos({ x: 0, y: 0 })
      onIndexChange?.(next)
      return next
    })
  }

  // Prevent behind page from scrolling while modal is open, and handle non-passive wheel zoom
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY < 0 ? 0.25 : -0.25
      setScale((s) => {
        const next = Math.min(3.5, Math.max(1, +(s + delta).toFixed(2)))
        if (next === 1) setPos({ x: 0, y: 0 })
        return next
      })
    }

    const modalEl = modalRef.current
    modalEl?.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      document.body.style.overflow = originalOverflow
      modalEl?.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // Escape key, arrow keys, and zoom keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (screens.length > 1) goToPrev()
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (screens.length > 1) goToNext()
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(3.5, +(s + 0.25).toFixed(2)))
      } else if (e.key === '-' || e.key === '_') {
        setScale((s) => {
          const next = Math.max(1, +(s - 0.25).toFixed(2))
          if (next === 1) setPos({ x: 0, y: 0 })
          return next
        })
      } else if (e.key === '0') {
        setScale(1)
        setPos({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.length])

  // Pointer drag to pan when zoomed
  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      hasMoved: false,
      lastDistance: null,
      touchStartX: e.clientX,
    }
    if (scale > 1) {
      setIsDragging(true)
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.hypot(dx, dy) > 5) {
      dragRef.current.hasMoved = true
    }
    if (scale > 1 && isDragging) {
      setPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)

    // If clicked/tapped without drag movement, toggle 1x <-> 2x zoom
    if (!dragRef.current.hasMoved) {
      if (scale === 1) {
        setScale(2)
      } else {
        setScale(1)
        setPos({ x: 0, y: 0 })
      }
    }
  }

  // Touch pinch to zoom & swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current.touchStartX = e.touches[0].clientX
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      dragRef.current.lastDistance = dist
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && dragRef.current.lastDistance !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const factor = dist / dragRef.current.lastDistance
      dragRef.current.lastDistance = dist
      setScale((s) => {
        const next = Math.min(3.5, Math.max(1, +(s * factor).toFixed(2)))
        if (next === 1) setPos({ x: 0, y: 0 })
        return next
      })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1 && scale === 1 && screens.length > 1) {
      const diffX = e.changedTouches[0].clientX - dragRef.current.touchStartX
      if (Math.abs(diffX) > 50) {
        if (diffX < 0) goToNext()
        else goToPrev()
      }
    }
  }

  const zoomPercent = Math.round(scale * 100)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${current.title} screenshot`}
      className="fixed inset-0 z-[100] bg-void/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in cursor-default select-none overflow-hidden touch-none"
      onClick={handleClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top right close button: CLOSE (ESC) on desktop, X on mobile */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close screenshot preview"
        className="fixed top-3 right-3 md:top-5 md:right-5 z-[110] px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider text-core bg-deep/90 border border-cyan/50 hover:border-cyan hover:bg-deep shadow-[0_0_15px_rgba(53,228,255,0.3)] transition-colors focus-visible:outline-ember cursor-pointer"
      >
        <span className="hidden sm:inline">CLOSE (ESC)</span>
        <span className="sm:hidden">X</span>
      </button>

      {/* Previous screen button (when multiple screenshots exist) */}
      {screens.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goToPrev()
          }}
          aria-label="Previous screenshot"
          className="fixed left-3 md:left-6 top-1/2 -translate-y-1/2 z-[110] p-2.5 md:p-3 text-core bg-deep/90 border border-cyan/50 hover:border-cyan hover:bg-deep shadow-[0_0_15px_rgba(53,228,255,0.35)] transition-colors focus-visible:outline-ember cursor-pointer tron-panel-clip chamfer-edge-strong flex items-center justify-center"
        >
          <svg
            className="w-5 h-5 text-cyan hover:text-core"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Next screen button (when multiple screenshots exist) */}
      {screens.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goToNext()
          }}
          aria-label="Next screenshot"
          className="fixed right-3 md:right-6 top-1/2 -translate-y-1/2 z-[110] p-2.5 md:p-3 text-core bg-deep/90 border border-cyan/50 hover:border-cyan hover:bg-deep shadow-[0_0_15px_rgba(53,228,255,0.35)] transition-colors focus-visible:outline-ember cursor-pointer tron-panel-clip chamfer-edge-strong flex items-center justify-center"
        >
          <svg
            className="w-5 h-5 text-cyan hover:text-core"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Centered Image with transform — fills as much of the screen height as possible */}
      <div
        className="relative flex items-center justify-center max-h-[94vh] max-w-[94vw]"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate3d(${pos.x}px, ${pos.y}px, 0px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <FadeImg
          src={current.src}
          alt={`Screenshot of ${current.title}`}
          draggable={false}
          className={`phone-screen max-h-[92vh] max-w-[92vw] border-2 border-cyan shadow-[0_0_35px_rgba(53,228,255,0.4)] object-contain ${
            scale === 1 ? 'cursor-zoom-in' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setIsDragging(false)}
        />
      </div>

      {/* Floating Tron Control Bar at bottom center */}
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-3.5 py-1.5 bg-deep/90 border border-cyan/40 shadow-[0_0_18px_rgba(53,228,255,0.25)] text-xs font-mono text-core tron-panel-clip"
        onClick={(e) => e.stopPropagation()}
      >
        {screens.length > 1 && (
          <span className="pr-2 border-r border-cyan/30 text-cyan font-mono font-semibold whitespace-nowrap shrink-0">
            {currentIndex + 1} / {screens.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setScale((s) => {
              const next = Math.max(1, +(s - 0.25).toFixed(2))
              if (next === 1) setPos({ x: 0, y: 0 })
              return next
            })
          }}
          disabled={scale <= 1}
          className="px-2 py-0.5 text-cyan hover:text-core disabled:opacity-30 disabled:hover:text-cyan cursor-pointer transition-colors"
          aria-label="Zoom out"
        >
          [-]
        </button>
        <span className="min-w-[48px] text-center text-muted font-mono">{zoomPercent}%</span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3.5, +(s + 0.25).toFixed(2)))}
          disabled={scale >= 3.5}
          className="px-2 py-0.5 text-cyan hover:text-core disabled:opacity-30 disabled:hover:text-cyan cursor-pointer transition-colors"
          aria-label="Zoom in"
        >
          [+]
        </button>
        {scale > 1 && (
          <button
            type="button"
            onClick={() => {
              setScale(1)
              setPos({ x: 0, y: 0 })
            }}
            className="ml-2 pl-2 border-l border-cyan/30 text-ember hover:text-core cursor-pointer transition-colors"
            aria-label="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* Mobile-app thumbnail composition: raw portrait screenshot(s) (up to 3)
   rendered in in-code phone frames on a glowing grid backdrop.
   Phones use height percentage (h-[92%] sm:h-[94%]) to maximize vertical space.
   Hover temporarily promotes a phone to primary and reverts to MAIN on hover
   exit; click/tap opens the full-size modal without changing the primary. */
const MobileThumb: React.FC<{
  screens: ScreenshotItem[]
  onOpenScreenshot: (index: number) => void
}> = ({ screens, onOpenScreenshot }) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const lastTouchAtRef = useRef(0)
  // Real taps only — touch events from scroll gestures never open the dialog
  const tap = useTapHandlers()

  if (screens.length === 0) return null

  // Main is the one-and-only resting primary; hover borrows it temporarily
  const currentPrimary = hoveredKey ?? screens[0].key

  // Vertical fill: phones take ~93% of container height so top/bottom wasted space is minimal.
  // 3-phone heights are width-capped: 3 phones + gaps + hover scale-[1.05] must stay inside
  // the 16:10 box or the outer phones clip behind the card edge on hover.
  const heightClass =
    screens.length === 1
      ? 'h-[92%] sm:h-[94%]'
      : screens.length === 2
        ? 'h-[90%] sm:h-[93%]'
        : 'h-[86%] sm:h-[88%]'

  const gapClass = screens.length === 3 ? 'gap-[2%]' : 'gap-[3%] sm:gap-[4%]'

  // Visual order: 3 screens put main CENTER (secondary, main, tertiary); else data order.
  // Indices stay bound to the original screens array (modal opens the right shot).
  const visualOrder = screens.length === 3 ? [1, 0, 2] : screens.map((_, i) => i)

  const phone = ({ key, src, title }: ScreenshotItem, index: number) => {
    const isPrimary = currentPrimary === key
    const isHovered = hoveredKey === key

    return (
      <button
        type="button"
        key={key}
        aria-label={`View ${title} screenshot full size`}
        className={`phone-screen no-focus-ring relative overflow-hidden border-2 bg-void ${heightClass} cursor-pointer transition-all duration-300 ease-out ${
          isPrimary
            ? 'z-10 opacity-100 border-cyan shadow-[0_0_28px_rgba(53,228,255,0.5)]'
            : 'z-0 opacity-85 border-cyan/45 translate-y-[4%] scale-[0.94] shadow-[0_0_14px_rgba(53,228,255,0.22)]'
        } ${isHovered ? 'scale-[1.05] shadow-[0_0_36px_rgba(53,228,255,0.7)]' : ''}`}
        style={{ aspectRatio: '1089 / 2000' }}
        onMouseEnter={() => {
          // Ignore emulated hover from touch taps
          if (performance.now() - lastTouchAtRef.current < 500) return
          if (hoveredKey !== key) {
            setHoveredKey(key)
          }
        }}
        onMouseLeave={() => setHoveredKey(null)}
        onTouchStart={tap.onTouchStart}
        onTouchCancel={tap.cancel}
        onTouchEnd={(e) =>
          tap.onTouchEnd(e, () => {
            lastTouchAtRef.current = performance.now()
            onOpenScreenshot(index)
          })
        }
        onClick={() => {
          // Mouse click opens full-size dialog directly
          if (performance.now() - lastTouchAtRef.current < 500) return
          onOpenScreenshot(index)
        }}
      >
        <FadeImg
          src={src}
          alt={`Screenshot of ${title}`}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none contrast-[1.04]"
          loading="lazy"
        />
      </button>
    )
  }

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center ${gapClass} bg-[radial-gradient(ellipse_at_50%_120%,rgba(53,228,255,0.18),transparent_60%),#061019]`}
    >
      {/* Faint grid backdrop */}
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(53,228,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(53,228,255,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />
      {visualOrder.map((i) => phone(screens[i], i))}
    </div>
  )
}

/* Website thumbnail composition: screenshot(s) stacked in a STATIC deck over
   the shared grid backdrop — each behind shot peeks out from the left AND top
   (fanned up-left of the shot in front). Hover promotes that shot in place:
   it rises above the deck (z) with full opacity + glow, covering the main
   area; hover exit returns the FIRST shot. Geometry NEVER changes on hover —
   slot-swapping vacates the region under the cursor and oscillates (the
   constant-blink bug). Hover is resolved from the actual button under the
   cursor (mouseover target), so hit areas are exactly the visible strips.
   Images object-contain: original framing always shown whole. Click/tap opens
   the fullscreen dialog. */
const WebThumb: React.FC<{
  screens: ScreenshotItem[]
  onOpenScreenshot: (index: number) => void
}> = ({ screens, onOpenScreenshot }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const lastTouchAtRef = useRef(0)
  const tap = useTapHandlers()

  if (screens.length === 0) return null

  const n = screens.length
  const STEP_X = 34 // px of visible strip per behind shot (left)
  const STEP_Y = 12 // px of visible strip per behind shot (top)
  const CHROME_H = 14 // px of the fake browser topbar on each layer
  const PAD_Y = 9 // % inset top/bottom so the grid backdrop shows
  const hot = hoveredIndex ?? 0

  return (
    <div
      className="relative w-full h-full bg-[radial-gradient(ellipse_at_50%_120%,rgba(53,228,255,0.18),transparent_60%),#061019]"
      onMouseOver={(e) => {
        // Ignore emulated hover from touch taps
        if (performance.now() - lastTouchAtRef.current < 500) return
        const btn = (e.target as HTMLElement).closest('button')
        setHoveredIndex(btn ? Number((btn as HTMLElement).dataset.idx) : null)
      }}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {/* Faint grid backdrop — same as the mobile composition */}
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(53,228,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(53,228,255,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />
      {/* Horizontally centered stack — the FRONT shot is in flow (its image
          sizes this wrapper), behind shots are absolute, right-anchored at
          i*STEP_X offsets; the left padding widens the wrapper to the fan
          span so behind layers never width-clamp. Grid shows evenly on both
          sides. */}
      <div
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-max"
        style={{ paddingLeft: (screens.length - 1) * STEP_X }}
      >
        {screens.map((shot, i) => {
          const isHot = i === hot
          const isHover = hoveredIndex === i
          const isFront = i === 0
          return (
            <button
              type="button"
              key={shot.key}
              data-idx={i}
              aria-label={`View ${shot.title} screenshot full size`}
              className={`web-screen ${isFront ? 'relative block' : 'absolute'} cursor-pointer border bg-[#061019] transition-all duration-300 ease-out focus-visible:outline-ember ${
                isHot
                  ? `border-cyan opacity-100 ${
                      isHover
                        ? 'shadow-[0_0_36px_rgba(53,228,255,0.7)]'
                        : 'shadow-[0_0_28px_rgba(53,228,255,0.5)]'
                    }`
                  : 'border-cyan/35'
              }`}
              style={
                isFront
                  ? {
                      // Fan-symmetric: the STACK bounding box is vertically
                      // centered — the front's bottom gap equals the last
                      // behind layer's top gap. Width comes from the image's
                      // own aspect. Uses `top` (not margin-top) — percentage
                      // margins resolve against the wrapper's WIDTH,
                      // percentage insets against its height.
                      top: `calc(${PAD_Y}% + ${(n - 1) * STEP_Y}px)`,
                      height: `calc(100% - ${2 * PAD_Y}% - ${(n - 1) * STEP_Y}px)`,
                      zIndex: isHot ? 40 : 30,
                    }
                  : {
                      // Right-anchored, width from the image's own aspect —
                      // every layer keeps its intrinsic size; behind ones fan
                      // up-left so the outermost gaps match the front's.
                      right: `${i * STEP_X}px`,
                      top: `calc(${PAD_Y}% + ${(n - 1 - i) * STEP_Y}px)`,
                      bottom: `calc(${PAD_Y}% + ${i * STEP_Y}px)`,
                      zIndex: isHot ? 40 : 30 - i * 10,
                    }
              }
              onTouchStart={tap.onTouchStart}
              onTouchCancel={tap.cancel}
              onTouchEnd={(e) =>
                tap.onTouchEnd(e, () => {
                  lastTouchAtRef.current = performance.now()
                  onOpenScreenshot(i)
                })
              }
              onClick={() => {
                if (performance.now() - lastTouchAtRef.current < 500) return
                onOpenScreenshot(i)
              }}
            >
              {/* Static browser-chrome strip — card deck only; the fullscreen
                  dialog shows the raw screenshot */}
              <span
                aria-hidden="true"
                className="absolute top-0 inset-x-0 z-10 flex items-center gap-1 px-1.5 bg-[#0a1622] border-b border-cyan/25"
                style={{ height: CHROME_H }}
              >
                <i className="w-1 h-1 rounded-full bg-cyan/60" />
                <i className="w-1 h-1 rounded-full bg-cyan/40" />
                <i className="w-1 h-1 rounded-full bg-cyan/25" />
                <span className="ml-1 h-1 flex-1 min-w-0 max-w-24 rounded-full bg-cyan/15 border border-cyan/20" />
              </span>
              <FadeImg
                src={shot.src}
                alt={`Screenshot of ${shot.title}`}
                className="block w-auto object-contain pointer-events-none"
                style={{
                  height: `calc(100% - ${CHROME_H}px)`,
                  marginTop: CHROME_H,
                  aspectRatio: WEB_SHOT_ASPECT,
                }}
                loading="lazy"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, className = '' }) => {
  const [modalIndex, setModalIndex] = useState<number | null>(null)

  const screens: ScreenshotItem[] = [
    ...(project.thumbnail ? [{ key: 'main', src: project.thumbnail, title: project.title }] : []),
    ...(project.thumbnailSecondary
      ? [
          {
            key: 'secondary',
            src: project.thumbnailSecondary,
            title: `${project.title} (Secondary)`,
          },
        ]
      : []),
    ...(project.thumbnailTertiary
      ? [{ key: 'tertiary', src: project.thumbnailTertiary, title: `${project.title} (Tertiary)` }]
      : []),
  ]

  const isMobileApp = project.thumbnailKind === 'mobile'

  return (
    <article
      className={`relative bg-deep/80 backdrop-blur-md p-3 sm:p-6 md:p-6 tron-panel-clip border border-cyan/40 shadow-[0_0_18px_rgba(53,228,255,0.15)] flex flex-col gap-3 sm:gap-4 ${className}`}
      aria-labelledby={`project-title-${project.id}`}
    >
      <span className="corner-tick-tl" aria-hidden="true" />
      <span className="corner-tick-br" aria-hidden="true" />

      {/* Thumbnail: 16:10 aspect ratio for mobile apps to give phones vertical room, 16:9 for websites */}
      <div
        className={`w-full overflow-hidden border border-cyan/20 ${
          isMobileApp ? 'aspect-[16/10] sm:aspect-[16/10]' : 'aspect-video'
        }`}
      >
        {isMobileApp && screens.length > 0 ? (
          <MobileThumb screens={screens} onOpenScreenshot={(idx) => setModalIndex(idx)} />
        ) : screens.length > 0 ? (
          <WebThumb screens={screens} onOpenScreenshot={(idx) => setModalIndex(idx)} />
        ) : (
          <ProjectGlyph id={project.id} />
        )}
      </div>

      {/* Header: Title */}
      <div>
        <h3
          id={`project-title-${project.id}`}
          className="font-display text-xl md:text-2xl text-core font-normal tracking-wide heading-glow uppercase"
        >
          {project.title}
        </h3>

        {/* Year and Role */}
        {(project.year || project.role) && (
          <div className="text-sm text-muted mt-1 flex items-center gap-3">
            {project.year && <span>{project.year}</span>}
            {project.year && project.role && <span aria-hidden="true">·</span>}
            {project.role && <span>{project.role}</span>}
          </div>
        )}
      </div>

      {/* Summary */}
      <p className="text-ice text-base leading-relaxed">{project.summary}</p>

      {/* Tags: plain muted text separated by wide spacing */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {project.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}

      {/* Outbound Links in Ember — the whole row (divider included) only
          renders when the project has at least one link */}
      {(project.url || project.repoUrl) && (
        <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-cyan/20">
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ember underline underline-offset-4 font-medium transition-colors duration-100 hover:text-core focus-visible:outline-ember"
            >
              {isMobileApp ? 'Open project' : 'Visit website'}
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )}

          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ember underline underline-offset-4 font-medium transition-colors duration-100 hover:text-core focus-visible:outline-ember"
            >
              View source
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )}
        </div>
      )}

      {/* Full-size screenshot modal rendered directly into document.body */}
      {modalIndex !== null && screens[modalIndex] && (
        <ScreenshotModal
          screens={screens}
          initialIndex={modalIndex}
          onClose={() => setModalIndex(null)}
        />
      )}
    </article>
  )
}
