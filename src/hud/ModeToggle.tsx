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
      className={`relative p-2 lg:px-3 lg:py-1.5 text-xs font-mono uppercase tracking-wider transition-colors duration-100 border border-cyan/40 bg-deep/80 text-ice hover:text-core hover:border-cyan hover:bg-deep focus-visible:outline-ember cursor-pointer flex items-center justify-center gap-1.5 ${mode === 'simple' ? 'neon-flicker' : ''} ${className}`}
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
      {/* Icon: mobile/tablet only — desktop shows the text label alone */}
      <span className="flex items-center justify-center shrink-0 lg:hidden" aria-hidden="true">
        {mode === 'ride' ? (
          // Identity disc: the ride view's icon
          <svg
            className="w-3.5 h-3.5 text-cyan"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-cyan"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        )}
      </span>
      {/* Text: hidden on mobile, visible on sm+ */}
      <span className="hidden lg:inline text-muted mr-1">View:</span>
      <span className="hidden lg:inline text-core font-semibold">
        {mode === 'ride' ? 'Ride' : 'Read'}
      </span>
    </button>
  )
}
