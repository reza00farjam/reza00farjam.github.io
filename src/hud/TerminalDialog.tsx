import React, { useEffect, useRef } from 'react'
import { OverlayScrollbar } from './OverlayScrollbar'

/** Shared terminal modal shell — backdrop, chamfered panel, header bar,
    keyboard-scrolling body. Every terminal-styled dialog (station
    inspectors, How to Play) renders through it so panel geometry is
    identical everywhere: content-height panels capped at 85vh (mobile at
    the wrapper's p-3 box) — long content fills the cap, short content
    stays compact. */
export const TerminalDialog: React.FC<{
  title: string
  onClose: () => void
  isMobile: boolean
  /** Header suffix tag — station inspectors say "Terminal"; How to Play
      deliberately shows none */
  tag?: string | null
  ariaLabel?: string
  refreshKey?: string
  children: React.ReactNode
}> = ({ title, onClose, isMobile, tag = 'Terminal', ariaLabel, refreshKey, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Focus scroll container so arrows and wheel immediately scroll content
  useEffect(() => {
    scrollRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      // Enter or Escape closes the pop up
      if (e.code === 'Enter' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Arrow / Page keys scroll the section content
      const page = e.key.startsWith('Page')
      if (page || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = (e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1) * (page ? 300 : 80)
        scrollRef.current?.scrollBy({ top: step, behavior: 'smooth' })
      }
    }

    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? `${title} Terminal`}
      className="fixed inset-0 z-40 pointer-events-auto cursor-default flex items-center justify-center p-3 sm:p-6 animate-fade-in"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-void/75 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Main Dialog Container */}
      <div
        className={`relative z-10 w-full max-w-2xl ${
          isMobile
            ? // Same 2xl width cap as desktop — only the height cap differs (a
              // tablet-wide dialog reading "bigger than desktop" was rejected)
              'max-h-full'
            : 'max-h-[85vh]'
        } flex flex-col bg-deep/95 border border-cyan/50 shadow-[0_0_30px_rgba(53,228,255,0.2)] tron-panel-clip overflow-hidden`}
      >
        <span className="corner-tick-tl" aria-hidden="true" />
        <span className="corner-tick-br" aria-hidden="true" />

        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 px-3 sm:px-6 md:px-6 py-4 border-b border-cyan/25 bg-void/50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-sm md:text-base font-semibold text-core tracking-wide uppercase truncate">
              {title}
            </span>
            {tag && (
              <span className="font-mono text-xs md:text-sm uppercase tracking-wider text-muted whitespace-nowrap">
                {tag}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="px-3 py-1 text-xs font-mono uppercase tracking-wider text-muted hover:text-core hover:border-cyan border border-cyan/30 transition-colors focus-visible:outline-ember cursor-pointer shrink-0 whitespace-nowrap"
          >
            {isMobile ? 'X' : 'Close (Enter)'}
          </button>
        </div>

        {/* Scrollable Content Body with Keyboard & Wheel Focus.
            Native scrollbar hidden — the shared OverlayScrollbar mirrors it
            over the content, same as the Read view page. */}
        <div
          ref={scrollRef}
          tabIndex={0}
          className="no-focus-ring hide-native-scrollbar overflow-y-auto p-3 sm:p-6 md:p-6 focus:outline-none"
        >
          {children}
        </div>
        <OverlayScrollbar targetRef={scrollRef} className="absolute" refreshKey={refreshKey} />
      </div>
    </div>
  )
}
