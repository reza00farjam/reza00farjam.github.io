import React, { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CycleState } from '../lib/cyclePhysics'
import { BOOSTER_RADIUS } from '../lib/battle'
import { useBattleStore } from '../lib/battleStore'
import { reportBoosterPickup } from '../lib/battleNet'
import { soundEngine } from '../lib/soundEngine'

interface BoostersProps {
  cycleStateRef: React.MutableRefObject<CycleState>
}

// Radial glow texture — the canister "lamp" light pool it casts on the grid.
// Same hue as the canister core (cyan for everyone — boosters are neutral).
const GLOW_COLOR = '#35e4ff'
const glowTexture = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.3)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
})()

// Glowing fuel canisters on the grid — each pickup permanently raises the
// rider's boost capacity (+20) and refuels a chunk instantly. The light pool
// under each canister marks the pickup zone (BOOSTER_RADIUS): the canister
// reads as a lamp lighting its own patch of grid, constant — no pulsing; it
// vanishes only with the taken canister.
export const Boosters: React.FC<BoostersProps> = ({ cycleStateRef }) => {
  const boosters = useBattleStore((s) => s.boosters)
  const groupRefs = useRef<(THREE.Group | null)[]>([])
  const canisterRefs = useRef<(THREE.Group | null)[]>([])

  useFrame((_, delta) => {
    const st = useBattleStore.getState()
    if (st.phase !== 'running') return
    const c = cycleStateRef.current
    st.boosters.forEach((b, idx) => {
      const g = groupRefs.current[idx]
      if (!g) return
      g.visible = !b.taken
      if (b.taken) return
      const can = canisterRefs.current[idx]
      if (can) {
        can.rotation.y += delta * 2.2
        can.position.y = 0.9 + Math.sin(performance.now() * 0.003 + b.id) * 0.12
      }
      // Pickup: the local bike rolls through the lit zone
      if (Math.hypot(c.x - b.x, c.z - b.z) < BOOSTER_RADIUS) {
        soundEngine.playBoosterPickup()
        reportBoosterPickup(b.id)
      }
    })
  })

  return (
    <group>
      {boosters.map((b, idx) => (
        <group
          key={b.id}
          ref={(el) => {
            groupRefs.current[idx] = el
          }}
          position={[b.x, 0, b.z]}
        >
          {/* Pickup-zone light pool — the lamp's glow on the grid floor */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <circleGeometry args={[BOOSTER_RADIUS, 40]} />
            <meshBasicMaterial
              map={glowTexture}
              color={GLOW_COLOR}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <group
            ref={(el) => {
              canisterRefs.current[idx] = el
            }}
            position-y={0.9}
          >
            <mesh>
              <octahedronGeometry args={[0.55, 0]} />
              <meshBasicMaterial color="#eafcff" toneMapped={false} />
            </mesh>
            <mesh>
              <octahedronGeometry args={[0.34, 0]} />
              <meshBasicMaterial color={GLOW_COLOR} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}
