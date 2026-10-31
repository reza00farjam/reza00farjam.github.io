import * as THREE from 'three'
import { stations } from '../data/stations'
import { projects } from '../data/projects'
import { Station, StationKind } from '../data/types'

export interface TrackStop {
  id: string
  stationId: string
  stationKind: StationKind
  title: string
  subIndex?: number
  isSubStop?: boolean
  progress: number
  position: THREE.Vector3
  tangent: THREE.Vector3
}

/**
 * Lateral XZ offset of a trail wall's TOP edge for a given travel direction and
 * bike lean: left-of-travel × tan(lean) × wall height. Positive lean (left
 * turn) tilts the wall top to the left, matching the bike's banking.
 */
export function trailTopLeanOffset(
  dirX: number,
  dirZ: number,
  lean: number,
  wallHeight: number,
): { x: number; z: number } {
  const t = Math.tan(lean) * wallHeight
  return { x: dirZ * t, z: -dirX * t } // left of travel = (dirZ, -dirX)
}

export interface TrackData {
  curve: THREE.CatmullRomCurve3
  stops: TrackStop[]
  stationStops: TrackStop[] // Primary stop for each station
  validStations: Station[]
  totalLength: number
}

export function buildTrack(): TrackData {
  // If projects is empty, skip that station as required
  const validStations = stations.filter((s) => {
    if (s.kind === 'projects' && projects.length === 0) {
      return false
    }
    return true
  })

  // Build the list of stops (projects expands into one sub-stop per project)
  interface RawStop {
    id: string
    stationId: string
    stationKind: StationKind
    title: string
    subIndex?: number
    isSubStop?: boolean
  }

  const rawStops: RawStop[] = []

  for (const station of validStations) {
    if (station.kind === 'projects' && projects.length > 0) {
      projects.forEach((proj, pIdx) => {
        rawStops.push({
          id: pIdx === 0 ? station.id : `${station.id}-${proj.id}`,
          stationId: station.id,
          stationKind: station.kind,
          title: pIdx === 0 ? station.title : proj.title,
          subIndex: pIdx,
          isSubStop: pIdx > 0,
        })
      })
    } else {
      rawStops.push({
        id: station.id,
        stationId: station.id,
        stationKind: station.kind,
        title: station.title,
      })
    }
  }

  const stopCount = rawStops.length
  const stepZ = 65 // Distance between stops along -Z

  // Generate control points for CatmullRomCurve3
  // Add gentle lateral offsets (max +-5) and small elevation (0 to 1.2)
  const points: THREE.Vector3[] = []

  // Pre-pad point before the start line
  points.push(new THREE.Vector3(0, 0.5, 30))

  for (let i = 0; i < stopCount; i++) {
    const z = -i * stepZ
    // Gentle sine-based offsets within specification limits
    const x = Math.sin(i * 1.25) * 4.5
    const y = 0.5 + Math.sin(i * 1.6) * 0.4
    points.push(new THREE.Vector3(x, y, z))
  }

  // Post-pad point beyond the last stop
  const lastZ = -(stopCount - 1) * stepZ
  const lastX = Math.sin((stopCount - 1) * 1.25) * 4.5
  points.push(new THREE.Vector3(lastX, 0.5, lastZ - 30))

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
  const totalLength = curve.getLength()

  // Calculate exact progress and 3D positions for each stop along the curve
  // Normalized arc length parameters for start and end stops
  const uStart = THREE.MathUtils.clamp(30 / totalLength, 0, 1)
  const uEnd = THREE.MathUtils.clamp((totalLength - 30) / totalLength, 0, 1)

  const stops: TrackStop[] = rawStops.map((raw, idx) => {
    const fraction = stopCount > 1 ? idx / (stopCount - 1) : 0
    // Remap fraction to curve parameter u
    const u = THREE.MathUtils.clamp(uStart + fraction * (uEnd - uStart), 0, 1)
    const position = curve.getPointAt(u)
    const tangent = curve.getTangentAt(u).normalize()

    return {
      ...raw,
      progress: fraction,
      position,
      tangent,
    }
  })

  // Collect primary station stops (for main station navigation)
  const stationStops: TrackStop[] = []
  const seenStations = new Set<string>()
  for (const stop of stops) {
    if (!seenStations.has(stop.stationId)) {
      seenStations.add(stop.stationId)
      stationStops.push(stop)
    }
  }

  return {
    curve,
    stops,
    stationStops,
    validStations,
    totalLength,
  }
}
