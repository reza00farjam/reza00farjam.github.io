import React from 'react'

interface PanelProps {
  children: React.ReactNode
  className?: string
  as?: React.ElementType
  id?: string
  'aria-label'?: string
}

export const Panel: React.FC<PanelProps> = ({
  children,
  className = '',
  as: Component = 'div',
  id,
  'aria-label': ariaLabel,
}) => {
  return (
    <Component
      id={id}
      aria-label={ariaLabel}
      className={`relative bg-deep/80 backdrop-blur-md p-3 sm:p-6 md:p-6 tron-panel-clip border border-cyan/40 shadow-[0_0_18px_rgba(53,228,255,0.15)] ${className}`}
    >
      {/* Corner ticks at the two unchamfered corners (top-left & bottom-right) */}
      <span className="corner-tick-tl" aria-hidden="true" />
      <span className="corner-tick-br" aria-hidden="true" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </Component>
  )
}
