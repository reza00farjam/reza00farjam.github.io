import React from 'react'
import { skills } from '../data/skills'
import { Panel } from '../hud/Panel'
import { StationProps } from './Intro'

export const Skills: React.FC<StationProps> = ({ station, isSimpleView, isDialog }) => {
  const body = (
    <dl className="space-y-4">
      {skills.map((group) => (
        <div key={group.label} className="border-b border-cyan/15 pb-4 last:border-b-0 last:pb-0">
          <dt className="text-muted text-sm uppercase tracking-wider mb-2 font-medium">
            {group.label}
          </dt>
          <dd className="text-ice flex flex-wrap gap-x-5 gap-y-2 text-base leading-relaxed">
            {group.items.map((item) => (
              <span key={item} className="inline-block">
                {item}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
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
