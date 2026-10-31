import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { profile } from './profile'
import { projects } from './projects'
import { experience } from './experience'
import { stations } from './stations'
import { stationRegistry } from '../stations/registry'
import { STATION_COORDINATES } from '../lib/arena'
import { CycleState, resolveTrailWalls, BIKE_HALF_LENGTH } from '../lib/cyclePhysics'

const publicDir = path.resolve(process.cwd(), 'public')

describe('Data Contracts and Integrity', () => {
  it('should have unique project IDs', () => {
    const ids = projects.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have unique experience IDs', () => {
    const ids = experience.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have unique station IDs', () => {
    const ids = stations.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('should have arena coordinates for every station id', () => {
    for (const st of stations) {
      expect(
        STATION_COORDINATES[st.id],
        `Station "${st.id}" has no entry in STATION_COORDINATES (arena.ts)`,
      ).toBeDefined()
    }
  })

  it('should have valid URLs (http, https, or mailto)', () => {
    const validProtocols = ['http:', 'https:', 'mailto:']

    const checkUrl = (urlStr: string, context: string) => {
      let parsed: URL
      try {
        parsed = new URL(urlStr)
      } catch {
        throw new Error(`Invalid URL string in ${context}: "${urlStr}"`)
      }
      expect(
        validProtocols.includes(parsed.protocol),
        `Protocol "${parsed.protocol}" in ${context} ("${urlStr}") is not allowed. Must be http:, https:, or mailto:.`,
      ).toBe(true)
    }

    // Profile links
    for (const link of profile.links) {
      checkUrl(link.url, `profile.link "${link.label}"`)
    }

    // Projects
    for (const p of projects) {
      if (p.url) {
        checkUrl(p.url, `project "${p.id}" url`)
      }
      if (p.repoUrl) {
        checkUrl(p.repoUrl, `project "${p.id}" repoUrl`)
      }
    }
  })

  it('should not have experience end date earlier than start date', () => {
    for (const exp of experience) {
      if (exp.end !== null) {
        expect(
          exp.end >= exp.start,
          `Experience "${exp.id}" has end date (${exp.end}) earlier than start date (${exp.start})`,
        ).toBe(true)
      }
    }
  })

  it('should have a registered component for every station kind', () => {
    for (const station of stations) {
      const component = stationRegistry[station.kind]
      expect(
        component,
        `Station "${station.id}" with kind "${station.kind}" has no registered component`,
      ).toBeDefined()
    }
  })

  it('should ensure any referenced thumbnail file exists in public/', () => {
    const resolvePublic = (p: string) => path.join(publicDir, p.startsWith('/') ? p.slice(1) : p)
    for (const project of projects) {
      for (const thumb of [
        project.thumbnail,
        project.thumbnailSecondary,
        project.thumbnailTertiary,
      ]) {
        if (thumb) {
          expect(
            fs.existsSync(resolvePublic(thumb)),
            `Referenced thumbnail "${thumb}" for project "${project.id}" not found in ${publicDir}`,
          ).toBe(true)
        }
      }
    }
  })
})

describe('Trail wall physics', () => {
  const makeState = (x: number, z: number): CycleState => ({
    x,
    z,
    yaw: 0,
    speed: 20,
    lean: 0,
    vx: -10,
    vz: 0,
    isAutopilot: false,
    autopilotTarget: null,
  })

  it('should stop the bike with the front wheel tip just touching the wall', () => {
    const state = makeState(5, 1.3) // facing -Z, wheel tip 0.06 inside contact distance
    state.vx = 0
    state.vz = -20
    let hits = 0
    resolveTrailWalls(
      state,
      [
        {
          points: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
          ],
        },
      ],
      -100,
      -100,
      () => hits++,
    )
    expect(state.z).toBeCloseTo(BIKE_HALF_LENGTH, 9) // wheel tip parked exactly on the wall
    expect(state.x).toBeCloseTo(5)
    expect(state.speed).toBeCloseTo(8) // 20 * 0.4
    expect(state.vx).toBe(0)
    expect(state.vz).toBe(0)
    expect(hits).toBe(1)
  })

  it('should ignore the fresh trail head at the rear wheel', () => {
    const state = makeState(0, 0.5)
    resolveTrailWalls(
      state,
      [
        {
          points: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
          ],
        },
      ],
      0.5,
      0,
    )
    expect(state.speed).toBe(20) // untouched
  })

  it('should leave a distant bike alone', () => {
    const state = makeState(50, 50)
    resolveTrailWalls(
      state,
      [
        {
          points: [
            { x: 0, z: 0 },
            { x: 10, z: 0 },
          ],
        },
      ],
      -100,
      -100,
    )
    expect(state.speed).toBe(20)
    expect(state.x).toBe(50)
  })
})
