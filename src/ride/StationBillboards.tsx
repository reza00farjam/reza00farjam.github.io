import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { getSpatialStations, SpatialStation, PROXIMITY_RADIUS } from '../lib/arena'
import { CycleState } from '../lib/cyclePhysics'

interface StationBillboardsProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  onNearbyStationChange: (stationId: string | null) => void
}

function createBillboardTexture(title: string, kind: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Deep background with low opacity
  ctx.fillStyle = '#071a2b'
  ctx.fillRect(0, 0, 512, 256)

  // Subtle interior grid
  ctx.strokeStyle = 'rgba(53, 228, 255, 0.15)'
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

  // Cyan border with chamfered opposite corners
  ctx.strokeStyle = '#35e4ff'
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

  // Station Kind Tag
  ctx.font = '18px "Saira", sans-serif'
  ctx.fillStyle = '#6e95a8'
  ctx.textAlign = 'center'
  ctx.fillText(`// TERMINAL: ${kind.toUpperCase()}`, 256, 75)

  // Title in Syncopate uppercase
  ctx.font = 'bold 36px "Syncopate", sans-serif'
  ctx.fillStyle = '#eafcff'
  ctx.shadowColor = 'rgba(53, 228, 255, 0.8)'
  ctx.shadowBlur = 12
  ctx.fillText(title.toUpperCase(), 256, 140)

  // Subtitle / Prompt
  ctx.font = '16px "Saira", sans-serif'
  ctx.fillStyle = '#35e4ff'
  ctx.shadowBlur = 0
  ctx.fillText('APPROACH TO INSPECT', 256, 195)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  texture.anisotropy = 16 // keep billboard text crisp at grazing angles
  return texture
}

// Pylon frame colors, pre-parsed once — setting these from hex strings every
// frame ×7 stations ×3 bars was constant string→Color garbage churn
const FRAME_CYAN = new THREE.Color('#35e4ff')
const FRAME_WHITE = new THREE.Color('#ffffff')

export const StationBillboards: React.FC<StationBillboardsProps> = ({
  cycleStateRef,
  onNearbyStationChange,
}) => {
  const stationsList = useMemo(() => getSpatialStations(), [])
  const billboardTextures = useMemo(() => {
    return stationsList.map((st) => createBillboardTexture(st.title, st.kind))
  }, [stationsList])

  const ringsRef = useRef<(THREE.Mesh | null)[]>([])
  const framesRef = useRef<(THREE.Group | null)[]>([])
  // Last-applied proximity state per station — colors are written on the
  // TRANSITION only, not every frame
  const nearStatesRef = useRef<boolean[]>([])
  const nearestStationRef = useRef<string | null>(null)
  // Force one report on the first frame after (re)mount — the billboards
  // unmount inside a battle and a stale proximity must not survive as a toast
  const reportedRef = useRef(false)

  useFrame((_, delta) => {
    const cycle = cycleStateRef.current

    let closestStation: SpatialStation | null = null
    let minDistance = Infinity

    stationsList.forEach((st, idx) => {
      const dist = Math.hypot(cycle.x - st.x, cycle.z - st.z)
      if (dist < minDistance) {
        minDistance = dist
        closestStation = st
      }

      // Rotate floating identity disc
      const ring = ringsRef.current[idx]
      if (ring) {
        ring.rotation.z += delta * 1.2
        ring.rotation.x = Math.sin(performance.now() * 0.002) * 0.2
      }

      // Dynamic frame brightness on proximity (transition-only writes)
      const frame = framesRef.current[idx]
      if (frame) {
        const isNear = dist < PROXIMITY_RADIUS
        if (nearStatesRef.current[idx] !== isNear) {
          nearStatesRef.current[idx] = isNear
          const c = isNear ? FRAME_WHITE : FRAME_CYAN
          frame.children.forEach((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
              child.material.color.copy(c)
            }
          })
        }
      }
    })

    const newNearbyId =
      minDistance < PROXIMITY_RADIUS && closestStation
        ? (closestStation as SpatialStation).id
        : null
    if (!reportedRef.current || nearestStationRef.current !== newNearbyId) {
      reportedRef.current = true
      nearestStationRef.current = newNearbyId
      onNearbyStationChange(newNearbyId)
    }
  })

  return (
    <group>
      {stationsList.map((st, idx) => {
        const tex = billboardTextures[idx]

        return (
          <group key={st.id} position={[st.x, 0, st.z]} rotation={[0, st.heading, 0]}>
            {/* Terminal marker: a flat landing pad on the grid — the platform's
                dark surface as a floor-level disc (no raised geometry), with the
                glowing rings drawn on top */}
            <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[9.0, 48]} />
              <meshStandardMaterial color="#040b13" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[8.85, 9.05, 48]} />
              <meshBasicMaterial color="#35e4ff" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>

            {/* Concentric mid glowing circuit ring */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[5.85, 6.0, 48]} />
              <meshBasicMaterial
                color="#35e4ff"
                transparent
                opacity={0.5}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>

            {/* Inner target disc */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2.85, 3.0, 36]} />
              <meshBasicMaterial
                color="#eafcff"
                transparent
                opacity={0.6}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>

            {/* Left and Right Vertical Pylons (standing on the grid) */}
            <group
              ref={(el) => {
                framesRef.current[idx] = el
              }}
              position={[0, 0, 0]}
            >
              <mesh position={[-4.5, 3.5, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 7.0, 8]} />
                <meshBasicMaterial color="#35e4ff" toneMapped={false} />
              </mesh>
              <mesh position={[4.5, 3.5, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 7.0, 8]} />
                <meshBasicMaterial color="#35e4ff" toneMapped={false} />
              </mesh>
              {/* Top cross bar */}
              <mesh position={[0, 7.0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 9.0, 8]} />
                <meshBasicMaterial color="#35e4ff" toneMapped={false} />
              </mesh>
            </group>

            {/* Holographic Billboard Canvas Screen (centered on circular platform) */}
            <mesh position={[0, 4.2, 0]}>
              <planeGeometry args={[8.8, 5.2]} />
              <meshBasicMaterial
                map={tex}
                transparent
                opacity={0.92}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>

            {/* Floating Concentric Identity Disc above Billboard */}
            <mesh
              ref={(el) => {
                ringsRef.current[idx] = el
              }}
              position={[0, 8.2, 0]}
            >
              <torusGeometry args={[0.8, 0.06, 12, 32]} />
              <meshBasicMaterial color="#35e4ff" toneMapped={false} />
            </mesh>
            <mesh position={[0, 8.2, 0]}>
              <torusGeometry args={[0.4, 0.04, 8, 24]} />
              <meshBasicMaterial color="#eafcff" toneMapped={false} />
            </mesh>

            {/* High-altitude vertical beacon beam rising into sky (starts from top bar at y=7.0) */}
            <mesh position={[0, 44.75, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 75, 8]} />
              <meshBasicMaterial color="#35e4ff" transparent opacity={0.6} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
