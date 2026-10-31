import React from 'react'

/* The "Materializing grid" lock-screen visual — the identity disc, spinning.
   Shared by RideView's cold-entry veil and App's Suspense fallback so the
   two read as ONE continuous loader. Ring gaps (dasharray) make the rotation
   read as the disc turning; the hub stays white-hot with a cyan halo. */
export const Materializing: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <svg
        viewBox="0 0 64 64"
        className="h-12 w-12 text-cyan animate-spin [animation-duration:1.6s] motion-reduce:animate-none drop-shadow-[0_0_8px_rgba(53,228,255,0.55)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {/* Outer ring with one opening — the disc's handle gap */}
        <circle cx="32" cy="32" r="26" strokeDasharray="130.7 32.7" />
        {/* Inner ring, offset opening */}
        <circle
          cx="32"
          cy="32"
          r="13"
          strokeWidth="2"
          strokeDasharray="61.3 20.4"
          strokeDashoffset="10"
        />
        {/* White-hot central hub */}
        <circle cx="32" cy="32" r="5" className="fill-core" stroke="none" />
      </svg>
      <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cyan/70">
        Materializing grid
        {/* Trailing dots pulse in sequence under the loading text */}
        <span className="motion-reduce:animate-none">
          <span className="animate-pulse [animation-delay:0ms]">.</span>
          <span className="animate-pulse [animation-delay:250ms]">.</span>
          <span className="animate-pulse [animation-delay:500ms]">.</span>
        </span>
      </div>
    </div>
  )
}
