import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CycleState } from '../lib/cyclePhysics'
import { PROXIMITY_RADIUS } from '../lib/arena'
import { BATTLE_TERMINAL_POS } from '../lib/battle'

interface BattleTerminalMarkerProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  onNearbyChange: (nearby: boolean) => void
}

function createBattleBillboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#071a2b'
  ctx.fillRect(0, 0, 512, 256)

  // Subtle interior grid
  ctx.strokeStyle = 'rgba(255, 138, 31, 0.12)'
  ctx.lineWidth = 1
  for (let x = 32; x < 512; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 256)
    ctx.stroke()
  }
  for (let y = 32; y < 256; y += 32) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(512, y)
    ctx.stroke()
  }

  // Ember border with chamfered opposite corners (battle accent)
  ctx.strokeStyle = '#ff8a1f'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(492, 0)
  ctx.lineTo(512, 20)
  ctx.lineTo(512, 256)
  ctx.lineTo(20, 256)
  ctx.lineTo(0, 236)
  ctx.closePath()
  ctx.stroke()

  ctx.font = '18px "Saira", sans-serif'
  ctx.fillStyle = '#a86e3f'
  ctx.textAlign = 'center'
  ctx.fillText('// TERMINAL: BATTLE', 256, 75)

  ctx.font = 'bold 36px "Syncopate", sans-serif'
  ctx.fillStyle = '#fff3e6'
  ctx.shadowColor = 'rgba(255, 138, 31, 0.8)'
  ctx.shadowBlur = 12
  ctx.fillText('GRID BATTLE', 256, 140)

  ctx.font = '16px "Saira", sans-serif'
  ctx.fillStyle = '#ff8a1f'
  ctx.shadowBlur = 0
  ctx.fillText('APPROACH TO INITIATE DUEL', 256, 195)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.anisotropy = 16
  return texture
}

// The battle terminal: orange-liveried pad marked with a cross (the content
// stations wear concentric rings), pylons, billboard and a rotating cross
// beacon floating above instead of the identity disc.
export const BattleTerminalMarker: React.FC<BattleTerminalMarkerProps> = ({
  cycleStateRef,
  onNearbyChange,
}) => {
  const billboardTexture = useMemo(() => createBattleBillboardTexture(), [])
  const crossRef = useRef<THREE.Group>(null)
  // null until the first report — the marker unmounts during a battle and its
  // last state must not survive the remount as a stale toast
  const nearbyRef = useRef<boolean | null>(null)
  const { x, z, heading } = BATTLE_TERMINAL_POS

  useFrame((_, delta) => {
    const cycle = cycleStateRef.current
    if (crossRef.current) {
      crossRef.current.rotation.y += delta * 1.0
    }
    const nearby = Math.hypot(cycle.x - x, cycle.z - z) < PROXIMITY_RADIUS
    if (nearby !== nearbyRef.current) {
      nearbyRef.current = nearby
      onNearbyChange(nearby)
    }
  })

  return (
    <group position={[x, 0, z]} rotation={[0, heading, 0]}>
      {/* Flat landing pad (same dark disc as the stations) */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.0, 48]} />
        <meshStandardMaterial color="#040b13" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Cross marking on the pad — battle terminals wear a cross, not rings */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[11.4, 0.55]} />
        <meshBasicMaterial color="#ff8a1f" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[11.4, 0.55]} />
        <meshBasicMaterial color="#ff8a1f" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Pylons + top bar, ember */}
      <mesh position={[-4.5, 3.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 7.0, 8]} />
        <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
      </mesh>
      <mesh position={[4.5, 3.5, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 7.0, 8]} />
        <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
      </mesh>
      <mesh position={[0, 7.0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 9.0, 8]} />
        <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
      </mesh>

      {/* Holographic billboard */}
      <mesh position={[0, 4.2, 0]}>
        <planeGeometry args={[8.8, 5.2]} />
        <meshBasicMaterial
          map={billboardTexture}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* Rotating cross beacon above (stations float an identity disc) */}
      <group ref={crossRef} position={[0, 8.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[2.0, 0.12, 0.12]} />
          <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[2.0, 0.12, 0.12]} />
          <meshBasicMaterial color="#ff8a1f" toneMapped={false} />
        </mesh>
      </group>

      {/* Vertical beacon beam */}
      <mesh position={[0, 44.75, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 75, 8]} />
        <meshBasicMaterial color="#ff8a1f" transparent opacity={0.6} toneMapped={false} />
      </mesh>
    </group>
  )
}
