import React, { useMemo } from 'react'
import * as THREE from 'three'
import { useAppStore } from '../lib/store'
import { useBattleStore } from '../lib/battleStore'
import { ARENA_HALF_SIZE } from '../lib/arena'

interface DistantBeamsProps {
  trackLength?: number
}

// Deterministic LCG random generator
function pseudoRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export const DistantBeams: React.FC<DistantBeamsProps> = () => {
  const qualityTier = useAppStore((s) => s.qualityTier)
  // Normal arena: the SOUTH exterior beams would tower over the battle alley
  // corridor and chamber as random sky-going lines — that zone is dropped.
  // Battle arenas keep the full ring (the gate is sealed, nothing beyond).
  const battleActive = useBattleStore((s) => s.phase !== 'idle')

  const { matrices, instanceCount } = useMemo(() => {
    const rand = pseudoRandom(1982)
    const mats: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()

    const wallDist = ARENA_HALF_SIZE + 6 // Strictly outside perimeter walls (> 126)

    for (let i = 0; i < 56; i++) {
      // Distribute evenly among the 4 exterior zones beyond the walls
      const quadrant = i % 4
      let x: number
      let z: number

      if (quadrant === 0) {
        // North exterior zone
        x = (rand() - 0.5) * 360
        z = -(wallDist + rand() * 90)
      } else if (quadrant === 1) {
        // South exterior zone (skipped in the normal arena — see above)
        x = (rand() - 0.5) * 360
        z = +(wallDist + rand() * 90)
      } else if (quadrant === 2) {
        // East exterior zone
        x = +(wallDist + rand() * 90)
        z = (rand() - 0.5) * 360
      } else {
        // West exterior zone
        x = -(wallDist + rand() * 90)
        z = (rand() - 0.5) * 360
      }

      const height = 30 + rand() * 90

      dummy.position.set(x, height / 2, z)
      dummy.scale.set(1, height, 1)
      dummy.updateMatrix()
      if (!battleActive && quadrant === 1) continue
      mats.push(dummy.matrix.clone())
    }

    const count = qualityTier >= 3 ? Math.min(16, mats.length) : mats.length
    return { matrices: mats, instanceCount: count }
  }, [qualityTier, battleActive])

  const instancedRef = React.useCallback(
    (node: THREE.InstancedMesh | null) => {
      if (!node) return
      for (let i = 0; i < instanceCount; i++) {
        node.setMatrixAt(i, matrices[i])
      }
      node.instanceMatrix.needsUpdate = true
    },
    [matrices, instanceCount],
  )

  return (
    <instancedMesh
      key={`beams-${instanceCount}`}
      ref={instancedRef}
      args={[undefined, undefined, instanceCount]}
    >
      <boxGeometry args={[0.08, 1, 0.08]} />
      <meshBasicMaterial color="#35e4ff" toneMapped={false} />
    </instancedMesh>
  )
}
