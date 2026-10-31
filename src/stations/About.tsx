import React, { useState } from 'react'
import { profile } from '../data/profile'
import { Panel } from '../hud/Panel'
import { StationProps } from './Intro'

export const About: React.FC<StationProps> = ({ station, isSimpleView, isDialog }) => {
  const [extraOpen, setExtraOpen] = useState(false)

  const body = (
    <div className="space-y-4 text-ice text-base leading-relaxed">
      {profile.about.map((paragraph, idx) => (
        <p key={idx}>{paragraph}</p>
      ))}

      {profile.aboutExtra && (
        <div>
          <div className="h-[1px] bg-cyan/20 my-4" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setExtraOpen((v) => !v)}
            aria-expanded={extraOpen}
            aria-controls="about-extra"
            className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider text-cyan hover:text-core transition-colors focus-visible:outline-ember cursor-pointer"
          >
            {profile.aboutExtra.title}
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-300 ${extraOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {/* grid 0fr→1fr animates the reveal without measuring */}
          <div
            id="about-extra"
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: extraOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden" aria-hidden={!extraOpen}>
              <div className="space-y-4 pt-4">
                {profile.aboutExtra.paragraphs.map((paragraph, idx) => {
                  if (typeof paragraph === 'string') return <p key={idx}>{paragraph}</p>
                  const [before, after] = paragraph.text.split('{link}')
                  return (
                    <p key={idx}>
                      {before}
                      <a
                        href={paragraph.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ember underline underline-offset-4 font-medium transition-colors duration-100 hover:text-core focus-visible:outline-ember"
                      >
                        {paragraph.link.label}
                        <span className="sr-only"> (opens in new tab)</span>
                      </a>
                      {after}
                    </p>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
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
