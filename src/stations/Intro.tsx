import React from 'react'
import { profile } from '../data/profile'
import { Station } from '../data/types'
import { Panel } from '../hud/Panel'
import { TronFrame } from '../hud/TronFrame'

export interface StationProps {
  station: Station
  isSimpleView?: boolean
  /** Rendered inside a ride-view terminal dialog: skip section headers,
      the dialog appbar already shows the station title. */
  isDialog?: boolean
  subIndex?: number
}

export const Intro: React.FC<StationProps> = ({ isDialog }) => {
  const body = (
    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
      {/* Authentic cast-site octagon portrait frame */}
      <TronFrame width={150} height={166} src="./images/profile.jpg" alt={profile.name} />

      <header className="space-y-4">
        <h1 className="font-display font-bold text-core tracking-wider uppercase leading-none text-4xl sm:text-5xl md:text-6xl heading-glow">
          {profile.name}
        </h1>
        <p className="font-display text-cyan text-lg md:text-xl tracking-wide uppercase font-normal">
          {profile.role}
        </p>
        <p className="text-ice text-base md:text-lg leading-relaxed">{profile.tagline}</p>
        {profile.location && <p className="text-muted text-sm tracking-wide">{profile.location}</p>}
      </header>
    </div>
  )

  // In ride-view dialogs the dialog itself is the card — no inner Panel
  if (isDialog) return body

  return <Panel>{body}</Panel>
}
