import React, { useEffect } from 'react'
import { stations } from '../data/stations'

interface StationPromptProps {
  stationId: string | null
  onInspect: (stationId: string) => void
  /** Mobile: hide the "Press Enter" hint — the toast itself is the tap target */
  isMobile?: boolean
  className?: string
  /** Battle terminal pseudo-station ("battle-terminal") — not in the station data */
  battle?: boolean
}

export const StationPrompt: React.FC<StationPromptProps> = ({
  stationId,
  onInspect,
  isMobile = false,
  className = '',
  battle = false,
}) => {
  const station = stations.find((s) => s.id === stationId)

  // Listen for 'Enter' key to inspect
  useEffect(() => {
    if (!stationId && !battle) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onInspect(stationId ?? 'battle-terminal')
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [stationId, battle, onInspect])

  if (!station && !battle) return null

  const title = battle ? 'Grid Battle' : (station as { title: string }).title
  const label = 'Terminal'
  const promptId = battle ? 'battle-terminal' : (station as { id: string }).id

  return (
    <div
      className={`fixed top-4 z-30 pointer-events-auto transition-all duration-200 animate-fade-in ${
        isMobile ? 'left-4' : 'left-1/2 -translate-x-1/2'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onInspect(promptId)}
        className={`relative bg-deep/25 backdrop-blur-md border ${
          isMobile ? 'px-4 py-2' : 'px-6 py-3'
        } ${
          battle
            ? 'border-ember/70 shadow-[0_0_20px_rgba(255,138,31,0.25)] hover:border-ember tron-ember tron-panel-clip'
            : 'border-cyan/60 shadow-[0_0_20px_rgba(53,228,255,0.25)] hover:border-cyan tron-panel-clip chamfer-edge-strong'
        } flex items-center gap-4 cursor-pointer transition-[background-color] duration-200 hover:bg-deep/85 focus-visible:outline-ember ${isMobile ? 'animate-pulse' : ''}`}
      >
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <span
            className={`font-display font-semibold text-core tracking-wide uppercase whitespace-nowrap ${isMobile ? 'text-xs' : 'text-sm'}`}
          >
            {title}
          </span>
          <span
            className={`font-mono uppercase tracking-wider text-muted whitespace-nowrap ${isMobile ? 'text-[10px]' : 'text-xs'}`}
          >
            {label}
          </span>
          {/* Mobile: the toast itself is the tap target — blink + chevron say so */}
          {isMobile && (
            <span
              aria-hidden="true"
              className={`font-mono text-sm leading-none ${battle ? 'text-ember' : 'text-cyan'}`}
            >
              ›
            </span>
          )}
        </div>

        {!isMobile && (
          <div
            className={`pl-4 border-l ${battle ? 'border-ember/30' : 'border-cyan/30'} flex items-center gap-2`}
          >
            <span className="text-xs text-ice group-hover:text-core transition-colors font-sans">
              Press
            </span>
            <span
              className={`px-2 py-0.5 ${battle ? 'bg-ember/20 border border-ember/40 text-core' : 'bg-cyan/20 border border-cyan/40 text-core'} text-xs font-mono font-semibold`}
            >
              Enter
            </span>
            <span className="text-xs text-ice group-hover:text-core transition-colors font-sans">
              {battle ? 'to Grid Battle' : 'to Inspect'}
            </span>
          </div>
        )}
      </button>
    </div>
  )
}
