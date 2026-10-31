import React from 'react'
import { projects } from '../data/projects'
import { Panel } from '../hud/Panel'
import { ProjectCard } from '../hud/ProjectCard'
import { StationProps } from './Intro'

export const Projects: React.FC<StationProps> = ({
  station,
  isSimpleView,
  isDialog = false,
  subIndex = 0,
}) => {
  if (projects.length === 0) {
    return (
      <Panel>
        <h2 className="font-display font-normal text-2xl md:text-3xl text-core tracking-wide uppercase mb-4 heading-glow">
          {station.title}
        </h2>
        <p className="text-muted">No projects yet</p>
      </Panel>
    )
  }

  if (isSimpleView) {
    const cards = (
      <div className="space-y-4 sm:space-y-8">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    )

    // In ride-view dialogs the header bar already carries the station title
    if (isDialog) return cards

    return (
      <section className="space-y-8" aria-labelledby="simple-projects-heading">
        <h2
          id="simple-projects-heading"
          className="font-display font-normal text-2xl md:text-3xl text-core tracking-wide uppercase mb-4 sm:mb-6 heading-glow"
        >
          {station.title}
        </h2>
        {cards}
      </section>
    )
  }

  const activeProject = projects[subIndex] || projects[0]

  return (
    <div className="w-full">
      <ProjectCard project={activeProject} />
    </div>
  )
}
