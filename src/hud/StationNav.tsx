import React from 'react'
import { Station } from '../data/types'
import { useAppStore } from '../lib/store'

interface StationNavProps {
  stations: Station[]
  onSelectStation: (stationId: string) => void
  className?: string
}

export const StationNav: React.FC<StationNavProps> = ({
  stations,
  onSelectStation,
  className = '',
}) => {
  const activeStationId = useAppStore((s) => s.activeStationId)

  return (
    <nav aria-label="Stations" className={`relative pl-4 select-none ${className}`}>
      {/* Vertical connecting line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-cyan/30" aria-hidden="true" />

      <ul className="space-y-4">
        {stations.map((st) => {
          const isCurrent = st.id === activeStationId

          return (
            <li key={st.id} className="relative flex items-center">
              {/* Node */}
              <span
                className={`absolute -left-[13px] w-2.5 h-2.5 transition-all duration-150 ${
                  isCurrent ? 'bg-core shadow-[0_0_8px_#35e4ff] ring-2 ring-cyan' : 'bg-cyan/40'
                }`}
                aria-hidden="true"
              />

              <button
                type="button"
                onClick={() => onSelectStation(st.id)}
                aria-current={isCurrent ? 'location' : undefined}
                className={`ml-4 text-sm font-sans tracking-wide transition-colors duration-100 text-left cursor-pointer focus-visible:outline-ember ${
                  isCurrent ? 'text-core font-semibold' : 'text-muted hover:text-ice'
                }`}
              >
                {st.title}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
