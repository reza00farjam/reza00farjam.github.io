import React from 'react'
import { profile } from '../data/profile'
import { Panel } from '../hud/Panel'
import { StationProps } from './Intro'

export const Links: React.FC<StationProps> = ({ station, isSimpleView, isDialog }) => {
  // Link row layout: same item spacing as the Skills matrix (gap-x-5)
  const findLink = (label: string) => profile.links.find((l) => l.label === label)

  const linkClass =
    'text-ember underline underline-offset-4 font-medium transition-colors duration-100 hover:text-core focus-visible:outline-ember'

  const renderItem = (label: string) => {
    const link = findLink(label)
    if (!link) return null
    const isEmail = link.url.startsWith('mailto:')
    return (
      <li key={link.url} className="flex items-center">
        <a
          href={link.url}
          target={isEmail ? undefined : '_blank'}
          rel={isEmail ? undefined : 'noopener noreferrer'}
          className={linkClass}
        >
          {link.label}
          {!isEmail && <span className="sr-only"> (opens in new tab)</span>}
        </a>
      </li>
    )
  }

  const body = (
    <div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {renderItem('Email')}
        {renderItem('LinkedIn')}
      </ul>

      <div className="h-[1px] bg-cyan/20 my-4" aria-hidden="true" />

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {renderItem('GitHub')}
        {renderItem('Medium')}
        {renderItem('Stack Overflow')}
      </ul>
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
