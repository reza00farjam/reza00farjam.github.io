import React, { useEffect, useRef } from 'react'

// Canvas-drawn perspective grid floor for the Read view. Same geometry the
// old CSS pseudo-element used — perspective(300px) rotateX(55deg), 40px
// cells, origin bottom center — but every line is projected individually
// and rasterized ONCE, as ink-normalized hairlines: each line paints the
// exact same amount of light per screen row (alpha compensates width), so
// brightness is deterministic instead of depending on subpixel AA phase —
// the old transformed background pattern swung 2x in line brightness,
// dropped random lines entirely, and dissolved into moire near the horizon.
// Lines thin with distance and fade toward the vanishing line like the rows
// do. The bottom→top fade is BAKED into the alpha (no CSS mask on the
// canvas — parent-mask-over-child-canvas compositing is unreliable on some
// mobile engines); the pulse lives in a separate masked sibling div and
// shares the same projection constants. Redrawn on resize only: zero
// per-frame cost, no WebGL.
const D = 300 // perspective distance (px) — shared with the pulse's CSS transform
const TILT = (55 * Math.PI) / 180
const SIN = Math.sin(TILT)
const COS = Math.cos(TILT)
const VANISH = (D * COS) / SIN // vanishing line height above the floor bottom (px)
const CELL = 40 // cell size in plane space (px)
const LINE = '53, 228, 255' // cyan
const ALPHA = 0.18

// Screen height (px above the floor's bottom edge) of a plane height h —
// the exact projection of perspective(D) rotateX(55deg), origin bottom.
const projY = (h: number) => (h * COS * D) / (D + h * SIN)

const draw = (canvas: HTMLCanvasElement, w: number, h: number, scale: number) => {
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = `rgb(${LINE})`
  const bottom = h
  const cx = w / 2
  const snap = (v: number) => Math.round(v * scale) / scale
  // the old wrapper mask's bottom→top fade, baked into the line alpha
  const fade = (yAbove: number) => Math.min(1, Math.max(0, 1 - yAbove / h))

  // Horizontal rows at plane h = k*CELL: 1 CSS px tall (the line weight the
  // approved design used — NOT 1 device px, which is 2-3x thinner on hi-dpr
  // screens and reads as colorless), top edge snapped to the device grid,
  // alpha = ALPHA * cut (cut = projected width factor) * fade. Drawing stops
  // once neighbouring rows compress under ~1px, where a denser fan would
  // alias.
  let prev = 0
  for (let k = 1; ; k++) {
    const y = projY(k * CELL) // px above the bottom
    if (y >= VANISH || y - prev < 1) break
    ctx.globalAlpha = ALPHA * ((VANISH - y) / VANISH) * fade(y)
    ctx.fillRect(0, snap(bottom - y - 0.5), w, 1)
    prev = y
  }

  // Vertical columns: software-rasterized hairlines following the straight
  // projected path from each foot to the vanishing point — one 1-CSS-px
  // cell per screen row on the snapped projected center (x snapped to the
  // device grid, so slants step smoothly on hi-dpr screens), alpha =
  // ALPHA * cut * fade. Every line is exactly as bright as its sibling at
  // the same height and exactly as heavy on every screen density: no
  // subpixel AA phase lottery, no sideways ink smear (a stroked slanted
  // line loses most of its brightness to smear; a thin quad's depends on
  // phase). Steep edge columns step sideways a few px per row — the same
  // dotted cadence the old CSS pattern had there, invisible at this alpha.
  // Span the full 2x-width strip like the old pattern did (jMax = w/CELL):
  // the fan converges, so near the horizon only far-out columns still cross
  // the side margins — a bottom-edge-only span leaves them empty.
  const jMax = Math.ceil(w / CELL)
  for (let j = -jMax; j <= jMax; j++) {
    const X = j * CELL
    for (let iy = 0; iy < VANISH; iy++) {
      const cut = 1 - iy / VANISH
      const a = ALPHA * cut * fade(iy)
      if (a < 0.004) break // fully faded toward the vanishing line
      ctx.globalAlpha = a
      ctx.fillRect(Math.round((cx + X * cut) * scale - 0.5) / scale, bottom - iy - 1, 1, 1)
    }
  }
}

export const GridFloor: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const wrap = canvas?.parentElement
    if (!canvas || !wrap) return
    const redraw = () => {
      const r = wrap.getBoundingClientRect()
      if (r.width > 0 && r.height > 0)
        draw(canvas, r.width, r.height, Math.min(window.devicePixelRatio || 1, 3))
    }
    // Layout is not guaranteed inside the effect — defer the first paint
    const raf = requestAnimationFrame(redraw)
    // Restores (tab discard return, bfcache) wipe the canvas bitmap and
    // fire no resize — repaint on page show/visibility, plus one delayed
    // fallback that catches mobile viewports still settling at mount.
    const onVis = () => {
      if (document.visibilityState === 'visible') redraw()
    }
    const t = setTimeout(redraw, 600)
    const ro = new ResizeObserver(redraw)
    ro.observe(wrap)
    window.addEventListener('pageshow', redraw)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', redraw)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      ro.disconnect()
      window.removeEventListener('pageshow', redraw)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', redraw)
    }
  }, [])

  return (
    <>
      {/* grid lines — no CSS mask, the fade is baked into the draw */}
      <div className="simple-grid-lines" aria-hidden="true">
        <canvas ref={ref} />
      </div>
      {/* pulse band — masked pseudo-element, shares the projection */}
      <div className="simple-grid-floor" aria-hidden="true" />
    </>
  )
}
