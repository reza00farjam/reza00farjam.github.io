import React, { useEffect, useRef } from 'react'
import { profile } from '../data/profile'
import { stations } from '../data/stations'
import { projects } from '../data/projects'
import { stationRegistry } from '../stations/registry'
import { ModeToggle } from '../hud/ModeToggle'
import { OverlayScrollbar } from '../hud/OverlayScrollbar'
import { GridFloor } from './GridFloor'
import { getHashStationId, updateUrlHash } from '../lib/hashSync'
import { useAppStore } from '../lib/store'

export const SimpleView: React.FC = () => {
  const setActiveStationId = useAppStore((s) => s.setActiveStationId)

  // Filter out empty projects station if needed
  const validStations = stations.filter((s) => {
    if (s.kind === 'projects' && projects.length === 0) return false
    return true
  })

  // Appbar nav skips intro — the name/role block is the intro link
  const navStations = validStations.filter((s) => s.kind !== 'intro')

  // Name/role click: smooth-scroll to the intro section at the top
  const goToIntro = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setActiveStationId('intro')
  }

  // Scroll to hash on load or hash change. First run = view mount (initial
  // load or a Ride→Read toggle): land on the section instantly, no fly-through
  // animation; in-view hash changes animate via CSS smooth scrolling.
  const mountedRef = useRef(false)
  useEffect(() => {
    const hashId = getHashStationId()
    if (hashId) {
      const el = document.getElementById(hashId)
      if (el) {
        el.scrollIntoView({ behavior: mountedRef.current ? 'smooth' : 'instant' })
        setActiveStationId(hashId)
      }
    }
    mountedRef.current = true
  }, [setActiveStationId])

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id
            setActiveStationId(id)
            updateUrlHash(id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' },
    )

    validStations.forEach((st) => {
      const el = document.getElementById(st.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [validStations, setActiveStationId])

  return (
    <div className="relative min-h-dvh bg-void text-ice font-sans">
      {/* Canvas-projected perspective grid floor */}
      <GridFloor />

      <OverlayScrollbar />

      {/* Top Bar: name & view toggle pinned to screen edges, section nav centered.
          Glass at rest, solid on hover — same treatment as the radar. */}
      <header className="sticky top-0 z-30 bg-void/25 backdrop-blur-md border-b border-cyan/20 px-3 py-3 sm:px-6 sm:py-4 transition-[background-color] duration-200 hover:bg-void/85">
        <div className="relative flex items-center justify-between gap-6">
          {/* Name/role doubles as the intro (top) link */}
          <a
            href={typeof window !== 'undefined' ? window.location.pathname : '#'}
            onClick={goToIntro}
            aria-label="Back to intro"
            className="shrink-0 cursor-pointer focus-visible:outline-ember"
          >
            <h1 className="font-display text-sm md:text-base font-bold text-core tracking-wider uppercase">
              {profile.name}
            </h1>
            <p className="text-xs text-muted font-sans">{profile.role}</p>
          </a>

          <div className="shrink-0 flex items-center gap-2 md:gap-3">
            <ModeToggle />
          </div>

          {/* Desktop only (lg+) — narrower viewports skip the section buttons
              (they collide with the toggle on tablets); absolutely centered on
              the content column */}
          <nav
            aria-label="Quick jump"
            className="hidden lg:flex items-center gap-4 text-xs font-mono min-w-0 lg:absolute lg:left-1/2 lg:-translate-x-1/2"
          >
            {navStations.map((st) => (
              <a
                key={st.id}
                href={`#${st.id}`}
                className="text-muted hover:text-core transition-colors focus-visible:outline-ember whitespace-nowrap"
              >
                {st.title}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Single-Column Content */}
      <main className="relative z-10 max-w-3xl mx-auto px-3 sm:px-6 py-8 sm:py-12 md:py-20 space-y-8 sm:space-y-16">
        {validStations.map((st) => {
          const StationComponent = stationRegistry[st.kind]
          if (!StationComponent) return null

          return (
            <section
              key={st.id}
              id={st.id}
              aria-label={st.title}
              className="station-section scroll-mt-24"
            >
              <StationComponent station={st} isSimpleView={true} />
            </section>
          )
        })}
      </main>

      {/* Page Footer */}
      <footer className="relative z-10 max-w-3xl mx-auto px-3 sm:px-6 pb-4 sm:pb-10">
        <div className="pt-6 text-xs text-muted leading-relaxed space-y-1">
          <p>© 2026 {profile.name}. All rights reserved.</p>
          <p>Visual style inspired by Tron: Legacy. Not affiliated with Disney.</p>
        </div>
      </footer>
    </div>
  )
}
