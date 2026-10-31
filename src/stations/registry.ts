import { ComponentType } from 'react'
import { StationKind } from '../data/types'
import { StationProps, Intro } from './Intro'
import { About } from './About'
import { Skills } from './Skills'
import { Experience } from './Experience'
import { Projects } from './Projects'
import { Links } from './Links'

export type { StationProps }

export const stationRegistry: Record<StationKind, ComponentType<StationProps>> = {
  intro: Intro,
  about: About,
  skills: Skills,
  experience: Experience,
  projects: Projects,
  links: Links,
}
