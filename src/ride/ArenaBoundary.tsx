import React, { useMemo } from 'react'
import * as THREE from 'three'
import { ARENA_HALF_SIZE } from '../lib/arena'
import { useBattleStore } from '../lib/battleStore'

export const ArenaBoundary: React.FC = () => {
  const wallHeight = 7.0
  const halfSize = ARENA_HALF_SIZE
  // In a battle the alley gate closes by rendering the south wall WHOLE —
  // identical to every other wall, no add-on door
  const battleActive = useBattleStore((s) => s.phase !== 'idle')

  // Build boundary fence lines
  const { lineGeo, wallGeos } = useMemo(() => {
    // Top border segments — the south edge is CUT at the Grid Battle alley
    // gate (7-wide gap at x≈0), matching the wall gap below it
    const seg = (ax: number, az: number, bx: number, bz: number) => [
      new THREE.Vector3(ax, wallHeight, az),
      new THREE.Vector3(bx, wallHeight, bz),
    ]
    // Discrete segment PAIRS (lineSegments — a loop/polyline would draw
    // straight across the gate between the two south edges). In a battle the
    // gate-gap segment is added back: the border closes with the wall.
    const linePoints = [
      ...seg(-halfSize, -halfSize, halfSize, -halfSize), // north
      ...seg(halfSize, -halfSize, halfSize, halfSize), // east
      ...seg(halfSize, halfSize, 3.5, halfSize), // south, east of the gate
      ...seg(-3.5, halfSize, -halfSize, halfSize), // south, west of the gate
      ...seg(-halfSize, halfSize, -halfSize, -halfSize), // west
      ...(battleActive ? seg(-3.5, halfSize, 3.5, halfSize) : []), // gate line (battle)
    ]
    const lGeo = new THREE.BufferGeometry().setFromPoints(linePoints)

    // 4 vertical walls
    const w = halfSize * 2
    const nWall = new THREE.PlaneGeometry(w, wallHeight)
    nWall.translate(0, wallHeight / 2, -halfSize)

    // South wall: normal arena has the 7-wide alley gate gap at x≈0; a
    // battle renders the south wall WHOLE (same plane as every other wall —
    // the gate closes as if never cut, no add-on door)
    const southGeos = battleActive
      ? [
          new THREE.PlaneGeometry(w, wallHeight)
            .rotateY(Math.PI)
            .translate(0, wallHeight / 2, halfSize),
        ]
      : [
          new THREE.PlaneGeometry(halfSize - 3.5, wallHeight)
            .rotateY(Math.PI)
            .translate(-(3.5 + (halfSize - 3.5) / 2), wallHeight / 2, halfSize),
          new THREE.PlaneGeometry(halfSize - 3.5, wallHeight)
            .rotateY(Math.PI)
            .translate(3.5 + (halfSize - 3.5) / 2, wallHeight / 2, halfSize),
        ]

    const eWall = new THREE.PlaneGeometry(w, wallHeight)
    eWall.rotateY(-Math.PI / 2)
    eWall.translate(halfSize, wallHeight / 2, 0)

    const wWall = new THREE.PlaneGeometry(w, wallHeight)
    wWall.rotateY(Math.PI / 2)
    wWall.translate(-halfSize, wallHeight / 2, 0)

    return { lineGeo: lGeo, wallGeos: [nWall, ...southGeos, eWall, wWall] }
  }, [halfSize, wallHeight, battleActive])

  // Corner pylon positions
  const cornerPositions: [number, number, number][] = [
    [-halfSize, wallHeight / 2, -halfSize],
    [halfSize, wallHeight / 2, -halfSize],
    [halfSize, wallHeight / 2, halfSize],
    [-halfSize, wallHeight / 2, halfSize],
  ]

  return (
    <group>
      {/* Top luminous border line — discrete segments (gap over the gate) */}
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color="#35e4ff" toneMapped={false} />
      </lineSegments>

      {/* 4 Semi-transparent energy grid boundary walls */}
      {wallGeos.map((geo, idx) => (
        <mesh key={`wall-${idx}`} geometry={geo}>
          <meshBasicMaterial
            color="#071a2b"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Corner pylons */}
      {cornerPositions.map((pos, idx) => (
        <group key={`pylon-${idx}`} position={pos}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, wallHeight + 4, 8]} />
            <meshBasicMaterial color="#35e4ff" toneMapped={false} />
          </mesh>
          <mesh position={[0, (wallHeight + 4) / 2, 0]}>
            <sphereGeometry args={[0.6, 12, 12]} />
            <meshBasicMaterial color="#eafcff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
