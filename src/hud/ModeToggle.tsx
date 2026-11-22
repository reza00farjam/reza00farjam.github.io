import React from 'react'
import { useAppStore } from '../lib/store'

// Warm the lazy ride chunk AND the bike payload on hover/focus intent — the
// same dynamic import App's React.lazy resolves to (browser dedupes by module
// URL), plus the 1MB obj.gz so the model is in HTTP cache before the click
let prefetched = false
const prefetchRide = () => {
  if (prefetched) return
  prefetched = true
  import('../ride/RideView')
  fetch(`${import.meta.env.BASE_URL}models/light_cycle_with_rider.obj.gz`).catch(() => {})
}

export const ModeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)

  const toggle = () => {
    setMode(mode === 'ride' ? 'simple' : 'ride')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onPointerEnter={mode === 'simple' ? prefetchRide : undefined}
      onFocus={mode === 'simple' ? prefetchRide : undefined}
      className={`relative p-2 lg:px-3 lg:py-1.5 text-xs font-mono uppercase tracking-wider transition-colors duration-100 border border-cyan/40 bg-deep/80 text-ice hover:text-core hover:border-cyan hover:bg-deep focus-visible:outline-ember cursor-pointer flex items-center justify-center ${mode === 'simple' ? 'neon-flicker' : ''} ${className}`}
      aria-label={`Switch to ${mode === 'ride' ? 'Read view' : 'Ride view'}`}
      title={`Switch to ${mode === 'ride' ? 'Read view' : 'Ride view'}`}
    >
      {/* Broken-neon sparks (Read mode only) — see .neon-spark in index.css */}
      {mode === 'simple' && (
        <>
          <i className="neon-spark" aria-hidden="true" />
          <i className="neon-spark" aria-hidden="true" />
          <i className="neon-spark" aria-hidden="true" />
        </>
      )}
      <span className="text-core font-semibold whitespace-nowrap max-lg:text-[10px] max-lg:leading-[14px]">
        {mode === 'ride' ? 'Read View' : 'Grid Ride'}
      </span>
    </button>
  )
}
