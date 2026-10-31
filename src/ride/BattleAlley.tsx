import React, { useMemo } from 'react'
import * as THREE from 'three'

const WALL_H = 7.0

interface WallSpec {
  /** Center position of the wall plane */
  pos: [number, number, number]
  /** Rotation around Y (radians) */
  rotY: number
  /** Wall length along its run */
  len: number
}

// Inner wall faces of the alley — ONE plane per surface, exactly like the
// arena boundary walls (no box = no double wall). Surfaces:
// corridor (x=±3.5, z 118..340), corner fillers' south faces (z=340,
// |x| 3.5..13), chamber sides (x=±13, z 340..366) + south end (z=366).
const WALLS: WallSpec[] = [
  // Visual planes start flush at the arena wall (z=120) — the collision
  // slabs extend 2 units further north to seal the gate corners, but that
  // stub must not poke into the arena
  { pos: [-3.5, 0, 230], rotY: Math.PI / 2, len: 220 }, // corridor west
  { pos: [3.5, 0, 230], rotY: -Math.PI / 2, len: 220 }, // corridor east
  { pos: [-8.25, 0, 340], rotY: 0, len: 9.5 }, // filler west face
  { pos: [8.25, 0, 340], rotY: Math.PI, len: 9.5 }, // filler east face
  { pos: [-13, 0, 353], rotY: Math.PI / 2, len: 26 }, // chamber west
  { pos: [13, 0, 353], rotY: -Math.PI / 2, len: 26 }, // chamber east
  { pos: [0, 0, 366], rotY: Math.PI, len: 26 }, // chamber south
]

// The Grid Battle alley (normal arena only): a straight 7-wide corridor and
// end chamber beyond the arena's south wall, styled after the arena boundary
// (single dark energy wall planes with luminous top edges) over a dark floor.
// Ember posts mark the gate on the arena side.
export const BattleAlley: React.FC = () => {
  const geos = useMemo(
    () =>
      WALLS.map((w) => {
        const plane = new THREE.PlaneGeometry(w.len, WALL_H)
        plane.rotateY(w.rotY)
        plane.translate(w.pos[0], WALL_H / 2, w.pos[2])
        // Points already sit at wall-top height — translate on XZ only, or
        // the line floats at 2x WALL_H
        const edge = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-w.len / 2, WALL_H, 0),
          new THREE.Vector3(w.len / 2, WALL_H, 0),
        ])
        edge.rotateY(w.rotY)
        edge.translate(w.pos[0], 0, w.pos[2])
        return { plane, edge }
      }),
    [],
  )

  return (
    <group>
      {geos.map(({ plane, edge }, i) => (
        <group key={i}>
          <mesh geometry={plane}>
            <meshBasicMaterial
              color="#071a2b"
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments geometry={edge}>
            <lineBasicMaterial color="#35e4ff" toneMapped={false} />
          </lineSegments>
        </group>
      ))}

      {/* Corridor + chamber floor (the grid floor ends at the arena wall).
          The corridor strip runs to z=340 and the chamber starts at z=340 —
          they meet flush INSIDE the walls; nothing extends behind them. */}
      <mesh position={[0, 0.01, 230]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 220]} />
        <meshStandardMaterial color="#040b13" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.01, 353]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#040b13" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Gate posts — ember, the battle accent, sitting exactly on the
          corner where the alley walls (|x| = 3.5) meet the arena wall (z=120) */}
      {[-3.5, 3.5].map((x) => (
        <group key={x} position={[x, 0, 120]}>
          <mesh position={[0, (WALL_H + 4) / 2, 0]}>
            <cylinderGeometry args={[0.3, 0.3, WALL_H + 4, 8]} />
            <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
          </mesh>
          <mesh position={[0, (WALL_H + 4) / 2, 0]}>
            <sphereGeometry args={[0.6, 12, 12]} />
            <meshBasicMaterial color="#fff3e6" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
