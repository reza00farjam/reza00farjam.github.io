import React from 'react'
import { useAppStore } from '../lib/store'
import { soundEngine } from '../lib/soundEngine'

export const AudioToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const isMuted = useAppStore((s) => s.isMuted)
  const setIsMuted = useAppStore((s) => s.setIsMuted)

  const toggle = () => {
    soundEngine.init()
    const nextState = !isMuted
    setIsMuted(nextState)
    soundEngine.setMuted(nextState)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`p-2 lg:px-3 lg:py-1.5 text-xs font-mono uppercase tracking-wider transition-colors duration-100 border border-cyan/40 hover:border-cyan bg-deep/80 text-ice hover:text-core hover:bg-deep focus-visible:outline-ember cursor-pointer flex items-center justify-center gap-1.5 ${className}`}
      aria-label={`Turn sound ${isMuted ? 'on' : 'off'}`}
      title={`Sound is ${isMuted ? 'Muted' : 'Active'}`}
    >
      {/* Icon: mobile/tablet only — desktop shows the text label alone */}
      <span className="flex items-center justify-center shrink-0 lg:hidden" aria-hidden="true">
        {isMuted ? (
          <svg
            className="w-3.5 h-3.5 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon
              points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
              fill="currentColor"
              fillOpacity="0.1"
            />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
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
            <polygon
              points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"
              fill="currentColor"
              fillOpacity="0.25"
            />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </span>
      {/* Text: hidden on mobile, visible on sm+ */}
      <span className="hidden lg:inline text-muted">Audio:</span>
      <span className={`hidden lg:inline font-semibold ${isMuted ? 'text-muted' : 'text-core'}`}>
        {isMuted ? 'OFF' : 'ON'}
      </span>
    </button>
  )
}
