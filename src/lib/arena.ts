import { stations } from '../data/stations'
import { projects } from '../data/projects'
import { StationKind } from '../data/types'
import { BATTLE_TERMINAL_POS } from './battle'

export const ARENA_HALF_SIZE = 120
export const ARENA_SIZE = ARENA_HALF_SIZE * 2
export const PROXIMITY_RADIUS = 15.0
export const DOCK_RADIUS = 2.8
export const TERMINAL_PARK_DISTANCE = 5.8 // Distance in front of billboard on circular platform

export function getStationFrontPosition(stationId: string): { x: number; z: number; yaw: number } {
  const coords = STATION_COORDINATES[stationId] || { x: 0, z: 0, heading: 0 }
  const x = coords.x + Math.sin(coords.heading) * TERMINAL_PARK_DISTANCE
  const z = coords.z + Math.cos(coords.heading) * TERMINAL_PARK_DISTANCE
  return { x, z, yaw: coords.heading }
}

export interface SpatialStation {
  id: string
  kind: StationKind
  title: string
  x: number
  z: number
  heading: number // Facing angle in radians for billboard facing
  color: string
}

export const STATION_COORDINATES: Record<string, { x: number; z: number; heading: number }> = {
  intro: { x: 0, z: 0, heading: 0 },
  about: { x: -65, z: -55, heading: Math.PI / 4 },
  skills: { x: 65, z: -55, heading: -Math.PI / 4 },
  experience: { x: -65, z: 55, heading: (3 * Math.PI) / 4 },
  projects: { x: 65, z: 55, heading: (-3 * Math.PI) / 4 },
  links: { x: 0, z: -95, heading: 0 },
  // Not a registry station (no StationKind) — only the ride view's #battle
  // deep link spawns here; the battle terminal itself is a BattleTerminalMarker
  battle: BATTLE_TERMINAL_POS,
}

// ---------------------------------------------------------------------------
// Grid Battle alley (NORMAL arena only — sealed during a battle): a straight
// 7-wide corridor punched through the arena's south wall at x=0, running 220
// units into the void (≈5-6 boosted seconds) and opening into a small chamber
// around (0, 353) where the battle terminal lives. Riders beyond the south
// wall drop off the radar (secret approach).
export interface AlleyBlock {
  x1: number
  x2: number
  z1: number
  z2: number
}

export const BATTLE_ALLEY_BLOCKS: AlleyBlock[] = [
  // Corridor walls start EXACTLY at the arena wall (z=120): the collision
  // push fires when the bike's extent crosses z1 - extentZ, and the south
  // clamp lets riders hug the wall up to 120 - extentZ — those two limits only
  // coincide when z1 = 120. Any earlier start (118, 119.5) left an invisible
  // barrier inside the arena beside the gate posts.
  { x1: -10, x2: -3.5, z1: 120, z2: 340 }, // corridor, west wall
  { x1: 3.5, x2: 10, z1: 120, z2: 340 }, // corridor, east wall
  { x1: -19.5, x2: -13, z1: 340, z2: 372.5 }, // chamber, west wall
  { x1: 13, x2: 19.5, z1: 340, z2: 372.5 }, // chamber, east wall
  // Corner fillers: seal the pocket at |x| 10..13 where the corridor wall
  // (ends z=340) meets the chamber wall (starts |x| 13) — riders used to slip
  // diagonally into the void beside the terminal. Faces align with the
  // neighbours (west 3.5, south 340) so pushes never oppose each other.
  { x1: -13, x2: -3.5, z1: 338, z2: 340 }, // corner filler, west
  { x1: 3.5, x2: 13, z1: 338, z2: 340 }, // corner filler, east
  { x1: -19.5, x2: 19.5, z1: 366, z2: 372.5 }, // chamber, south wall
]

/** Beyond the south wall inside the alley corridor/chamber (radar hides the rider). */
export function isInsideAlley(x: number, z: number): boolean {
  return z > 119.5 && Math.abs(x) <= 19.5
}

export function getSpatialStations(): SpatialStation[] {
  const validStations = stations.filter((s) => {
    if (s.kind === 'projects' && projects.length === 0) return false
    return true
  })

  return validStations.map((st) => {
    const coords = STATION_COORDINATES[st.id] || { x: 0, z: 0, heading: 0 }
    return {
      id: st.id,
      kind: st.kind,
      title: st.title,
      x: coords.x,
      z: coords.z,
      heading: coords.heading,
      color: '#35e4ff',
    }
  })
}
