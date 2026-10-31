import React, { useEffect, useId, useRef, useState } from 'react'
import { useTapHandlers } from '../lib/tap'
import { soundEngine } from '../lib/soundEngine'
import { FadeImg } from './FadeImg'

interface TronFrameProps {
  width: number
  height: number
  src: string
  alt: string
  /** Idle frame band color — authentic pale cyan from the original cast site */
  color?: string
  scanStrength?: number
  className?: string
}

/* Authentic TRON: Legacy cast-photo tile, ported from the site's measured
   assets: desaturated/cool-shifted color matrix, 2px scanlines, chamfered
   octagon crop (42% W / 18.6% H cuts), pale-cyan octagon band at 4.52% width,
   idle = dimmed (brightness 0.54), hover = full treatment + #0084C2 glow. */
export const TronFrame: React.FC<TronFrameProps> = ({
  width,
  height,
  src,
  alt,
  color = '#94dadc',
  scanStrength = 0.44,
  className = '',
}) => {
  const [active, setActive] = useState(false)
  // React ids contain ':' which breaks url(#...) references — strip them
  const filterId = 'tct-tint-' + useId().replace(/:/g, '')

  // Touch devices have no hover: a tap activates the glow for 2s; repeated
  // taps restart the window. Browsers emulate a sticky "hover" (mouseenter)
  // after taps — a timestamp guard makes those emulated events inert so touch
  // stays fully deterministic.
  const tapTimerRef = useRef<number | undefined>(undefined)
  const lastTouchAtRef = useRef(0)
  // Neon flicker accompanies the glow lighting up (best-effort: silent until
  // the audio context is unlocked by a real user gesture)
  const playFlicker = () => {
    soundEngine.init()
    soundEngine.playNeonFlicker()
  }
  const handleTap = () => {
    lastTouchAtRef.current = performance.now()
    window.clearTimeout(tapTimerRef.current)
    setActive(true)
    playFlicker()
    tapTimerRef.current = window.setTimeout(() => setActive(false), 2000)
  }
  useEffect(() => () => window.clearTimeout(tapTimerRef.current), [])

  // Real taps only — scroll gestures that start on the photo never glow
  const tap = useTapHandlers()

  const band = 0.0452 * width
  const cutX = Math.min(0.42 * width, width * 0.45)
  const cutY = Math.min(0.186 * height, height * 0.45)

  const outer: [number, number][] = [
    [cutX, 0],
    [width - cutX, 0],
    [width, cutY],
    [width, height - cutY],
    [width - cutX, height],
    [cutX, height],
    [0, height - cutY],
    [0, cutY],
  ]

  // Inner octagon: every outer edge offset inward by the band width, then
  // vertices re-intersected so the band stays uniform around all 8 edges
  const lines = outer.map((a, i) => {
    const b = outer[(i + 1) % 8]
    let nx = b[1] - a[1]
    let ny = a[0] - b[0]
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    const d = nx * a[0] + ny * a[1] - band
    return [nx, ny, d] as const
  })
  const inner = lines.map(([a1, b1, c1], i) => {
    const [a2, b2, c2] = lines[(i + 1) % 8]
    const det = a1 * b2 - a2 * b1
    return [(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det] as [number, number]
  })

  const toPath = (pts: [number, number][]) =>
    'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L') + 'Z'

  const clip = `polygon(${outer
    .map((p) => `${((p[0] / width) * 100).toFixed(2)}% ${((p[1] / height) * 100).toFixed(2)}%`)
    .join(', ')})`

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width, height }}
      onMouseEnter={() => {
        // Ignore emulated hover that follows a touch tap
        if (performance.now() - lastTouchAtRef.current < 500) return
        setActive(true)
        playFlicker()
      }}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      {...{
        onTouchStart: tap.onTouchStart,
        onTouchCancel: tap.cancel,
        onTouchEnd: (e) => tap.onTouchEnd(e, handleTap),
      }}
    >
      {/* Shared-per-instance color matrix: desat 30%, cool shift, the site's
          measured channel weights */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.4129 0.4606 0.0465 0 0 0.1488 0.8006 0.0505 0 0 0.1637 0.5507 0.3856 0 0 0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>

      {/* Photo: tinted, dimmed at idle, full treatment on hover. Eager —
          the portrait is the Read view's above-the-fold centerpiece (LCP),
          lazy-loading it delays the first impression for nothing. */}
      <FadeImg
        src={src}
        alt={alt}
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-200"
        style={{
          clipPath: clip,
          WebkitClipPath: clip,
          filter: `url(#${filterId}) brightness(${active ? 0.72 : 0.54}) contrast(1.12)`,
        }}
      />

      {/* Scanlines: dark line every 2px, clipped to the same octagon */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: clip,
          WebkitClipPath: clip,
          background: `repeating-linear-gradient(to bottom, rgba(0,0,0,${scanStrength}) 0px, rgba(0,0,0,${scanStrength}) 1px, transparent 1px, transparent 2px)`,
        }}
      />

      {/* Frame band: pixel-crisp SVG geometry — hover brightens the band and
          fades in the pale-cyan glow. The drop-shadow lives on the <svg>
          element (HTML-level filter): SVG-level filters on the path clip the
          blur at the filter region and the glow escapes the frame shape. Both
          end states are drop-shadow values so the fade interpolates. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full pointer-events-none transition-[filter] duration-200"
        style={{
          filter: `drop-shadow(0 0 ${active ? 8 : 0}px ${active ? color : 'transparent'})`,
        }}
        aria-hidden="true"
      >
        <path
          d={`${toPath(outer)}${toPath(inner)}`}
          fill={color}
          fillOpacity={active ? 1 : 0.9}
          fillRule="evenodd"
          className="transition-[fill-opacity] duration-200"
        />
      </svg>
    </div>
  )
}
