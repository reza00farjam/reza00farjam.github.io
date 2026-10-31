import React from 'react'
import { useAppStore } from '../lib/store'

export const SpeedStreaks: React.FC = () => {
  const isJumping = useAppStore((s) => s.isJumping)
  const glow = '#35e4ff'
  const line = 'bg-cyan/70'
  const lineSoft = 'bg-cyan/60'

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-20 transition-opacity duration-300 ${
        isJumping ? 'opacity-60' : 'opacity-0'
      }`}
      aria-hidden="true"
    >
      {/* Left edge streaks */}
      <div className="absolute left-0 top-0 bottom-0 w-24 overflow-hidden">
        <span
          className={`absolute top-[20%] left-2 w-16 h-[1px] ${line} shadow-[0_0_6px]`}
          style={{ boxShadow: `0 0 6px ${glow}` }}
        />
        <span
          className="absolute top-[35%] left-4 w-20 h-[1.5px] bg-core"
          style={{ boxShadow: `0 0 8px ${glow}` }}
        />
        <span className={`absolute top-[50%] left-1 w-12 h-[1px] ${lineSoft}`} />
        <span
          className="absolute top-[68%] left-3 w-24 h-[1px] bg-core"
          style={{ boxShadow: `0 0 6px ${glow}` }}
        />
        <span className={`absolute top-[82%] left-2 w-14 h-[1px] ${line}`} />
      </div>

      {/* Right edge streaks */}
      <div className="absolute right-0 top-0 bottom-0 w-24 overflow-hidden">
        <span
          className={`absolute top-[18%] right-2 w-18 h-[1px] ${line}`}
          style={{ boxShadow: `0 0 6px ${glow}` }}
        />
        <span
          className="absolute top-[32%] right-3 w-24 h-[1.5px] bg-core"
          style={{ boxShadow: `0 0 8px ${glow}` }}
        />
        <span className={`absolute top-[48%] right-1 w-14 h-[1px] ${lineSoft}`} />
        <span
          className="absolute top-[65%] right-4 w-20 h-[1px] bg-core"
          style={{ boxShadow: `0 0 6px ${glow}` }}
        />
        <span className={`absolute top-[78%] right-2 w-16 h-[1px] ${line}`} />
      </div>
    </div>
  )
}
