import React from 'react'
import { experience } from '../data/experience'
import { Panel } from '../hud/Panel'
import { StationProps } from './Intro'

export const Experience: React.FC<StationProps> = ({ station, isSimpleView, isDialog }) => {
  const body = (
    <div className="relative pl-6 space-y-8 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-cyan/30">
      {experience.map((item) => {
        const dateRange = `${item.start} to ${item.end ?? 'now'}`
        return (
          <div key={item.id} className="relative">
            {/* Timeline node */}
            <span
              className="absolute -left-[1.8rem] top-1.5 w-2 h-2 bg-core ring-2 ring-cyan/50"
              aria-hidden="true"
            />

            <div className="space-y-2">
              <span className="text-muted text-xs tracking-wider font-mono uppercase block">
                {dateRange}
              </span>

              <h3 className="text-core text-lg font-medium leading-snug">
                {item.role} <span className="text-cyan/60 font-normal">at</span>{' '}
                <span className="text-core font-semibold">{item.org}</span>
              </h3>

              <p className="text-ice text-base leading-relaxed">{item.summary}</p>

              {item.highlights && item.highlights.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm text-ice/90 pt-1">
                  {item.highlights.map((highlight, idx) => (
                    <li key={idx} className="marker:text-cyan">
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}

              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-xs text-muted font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  // In ride-view dialogs the dialog itself is the card — no inner Panel
  if (isDialog) return body

  return (
    <div className="space-y-8">
      {isSimpleView && (
        <h2 className="font-display font-normal text-2xl md:text-3xl text-core tracking-wide uppercase mb-4 sm:mb-6 heading-glow">
          {station.title}
        </h2>
      )}
      <Panel>{body}</Panel>
    </div>
  )
}
