import React, { Suspense, useEffect, useState } from 'react'
import { useAppStore } from './lib/store'
import { SimpleView } from './simple/SimpleView'
import { soundEngine } from './lib/soundEngine'
import { getBattleIdFromHash } from './lib/hashSync'
import { Materializing } from './hud/Materializing'

const RideView = React.lazy(() => import('./ride/RideView'))

// Read-view background warm runs at most once per page load (mode toggles
// re-run the effect below — the flag keeps the second pass a no-op)
let rideWarmed = false

export const App: React.FC = () => {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  // RideView stays mounted after the first entry: switching to Read parks it
  // (hidden + frameloop stopped) instead of unmounting, so switching back
  // resumes the SAME warm WebGL context — textures, shader programs, composer
  // buffers — with no re-upload, no recompile, no chopped scene
  const [rideEverActive, setRideEverActive] = useState(() => mode === 'ride')
  if (mode === 'ride' && !rideEverActive) {
    // Render-phase adjustment (the React-sanctioned derive-from-props
    // pattern — adjusts state that depends on this render's value)
    setRideEverActive(true)
  }

  // A #battle= invite link always lands in the ride view — the duel auto-joins.
  // A #battle deep link lands at the battle terminal (alley chamber).
  useEffect(() => {
    if (getBattleIdFromHash() || window.location.hash === '#battle') setMode('ride')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Landing directly in the ride (battle link, stored preference, ?mode=ride):
  // preload the bike payload in parallel with the lazy chunk — otherwise the
  // 1MB obj.gz only starts fetching AFTER the chunk loads, mounts, and the
  // Canvas spins up (a serialized waterfall that dominated "Loading grid...").
  // The full player texture set is preloaded too — the cold-entry veil waits
  // on all four maps landing before it lifts.
  useEffect(() => {
    if (mode !== 'ride') return
    const base = import.meta.env.BASE_URL
    const preload = (href: string, as: string) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = href
      link.as = as
      document.head.appendChild(link)
    }
    preload(`${base}models/light_cycle_with_rider.obj.gz`, 'fetch')
    preload(`${base}models/textures/LightCycleSam_color_BLUE_dark_73.jpg`, 'image')
    preload(`${base}models/textures/sam_color_BLUE_dark_46.jpg`, 'image')
    preload(`${base}models/textures/sam_normals_02_js_165.png`, 'image')
    preload(`${base}models/textures/disc_color_sam_blueDark_36.png`, 'image')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Read-view background warm (2026-11-17): a ride entry on a cold page
  // serialized chunk → mount → obj.gz fetch → 300-600ms parse → texture
  // upload — the "few chopped seconds" at ride start. While the visitor
  // READS, pull all of it in the background: the lazy chunk, the parsed
  // proto (same module cache the mount path uses), and the texture set
  // into the HTTP cache. A ride entered afterwards skips the veil entirely.
  //
  // MUST NOT slow the reading itself down (2026-11-18): the chunk eval and
  // especially the OBJ parse are main-thread hitches. The warm only fires
  // inside a QUIET window — page fully loaded, ≥4s after mount, and ≥2s
  // since the last pointer/scroll/key activity — so the hitches land while
  // the reader is genuinely idle, never mid-scroll. Once per page.
  useEffect(() => {
    if (mode !== 'simple') return
    let lastInput = performance.now()
    const t0 = performance.now()
    const markInput = () => {
      lastInput = performance.now()
    }
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, markInput, { passive: true, capture: true }))
    const iv = window.setInterval(() => {
      if (rideWarmed) {
        window.clearInterval(iv)
        return
      }
      if (document.readyState !== 'complete') return // Read's own assets first
      if (performance.now() - t0 < 4000) return
      if (performance.now() - lastInput < 2000) return // reader is active — wait
      window.clearInterval(iv)
      events.forEach((e) => window.removeEventListener(e, markInput, { capture: true }))
      // The once-guard lives INSIDE the warm (StrictMode double-mount: the
      // first schedule may be cancelled by cleanup; the second must re-arm)
      const warm = () => {
        if (rideWarmed) return
        rideWarmed = true
        void import('./ride/RideView')
        void import('./ride/vehicleProto').then((m) => m.warmVehicle())
      }
      // typeof on an undeclared global is safe (yields 'undefined') on the
      // old-Safari path — no `in window` narrowing (lib.dom declares the
      // API, so the negative branch would collapse to `never`)
      const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : null
      if (ric) ric(warm, { timeout: 3500 })
      else window.setTimeout(warm, 1500)
    }, 400)
    return () => {
      window.clearInterval(iv)
      events.forEach((e) => window.removeEventListener(e, markInput, { capture: true }))
    }
  }, [mode])

  // Unlock Web Audio on the FIRST interaction anywhere — Read included.
  // Every synth layer is built inside init(), so the ride now enters with
  // the engine already alive instead of spinning up seconds after the
  // first click inside the ride (RideView keeps its own listener as a
  // belt-and-braces for ride-first visits; init is idempotent).
  useEffect(() => {
    const unlock = () => soundEngine.init()
    window.addEventListener('pointerdown', unlock, { once: true, capture: true })
    window.addEventListener('keydown', unlock, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true })
      window.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (mode === 'simple') {
      soundEngine.stopContinuous()
    }
  }, [mode])

  return (
    <>
      {/* "Skip the ride" is the first focusable element on the page */}
      <button
        type="button"
        onClick={() => {
          setMode('simple')
          const main = document.getElementById('main-content') || document.getElementById('intro')
          if (main) main.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-deep focus:text-core focus:border focus:border-cyan focus:outline-ember font-mono text-xs uppercase tracking-wider"
      >
        Skip the ride
      </button>

      {rideEverActive ? (
        <Suspense
          // Same visual as RideView's cold-entry veil — one continuous
          // "materializing" experience instead of two different loaders
          fallback={
            <div className="min-h-screen bg-void flex items-center justify-center">
              <Materializing />
            </div>
          }
        >
          {/* Parked (hidden) while the visitor reads — see rideEverActive */}
          <RideView active={mode === 'ride'} />
        </Suspense>
      ) : null}
      {mode === 'simple' && <SimpleView />}
    </>
  )
}
