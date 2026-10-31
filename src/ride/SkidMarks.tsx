import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CycleState } from '../lib/cyclePhysics'

interface SkidMarksProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  /** Grid Battle: the link opener's tyre marks glow ember */
  variant?: 'cyan' | 'orange'
}

interface SkidSegment {
  p1: THREE.Vector3 // Left rear contact
  p2: THREE.Vector3 // Right rear contact
  p3: THREE.Vector3 // Left next
  p4: THREE.Vector3 // Right next
  alpha: number
}

const MAX_SEGMENTS = 250
const TYRE_HALF_WIDTH = 0.271

const vertexShader = `
  attribute float aAlpha;
  varying float vAlpha;
  varying vec2 vUv;
  void main() {
    vAlpha = aAlpha;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 uCyan;
  uniform vec3 uCore;
  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    // Twin tyre edge tread glow: brighter at the two outer rims (vUv.x near 0 and 1)
    float edgeGlow = smoothstep(0.3, 0.05, abs(vUv.x - 0.15)) + smoothstep(0.3, 0.05, abs(vUv.x - 0.85));
    vec3 col = mix(uCyan, uCore, edgeGlow * 0.7);
    float a = vAlpha * (0.35 + edgeGlow * 0.55);
    gl_FragColor = vec4(col, a);
  }
`

export const SkidMarks: React.FC<SkidMarksProps> = ({ cycleStateRef, variant = 'cyan' }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const segmentsRef = useRef<SkidSegment[]>([])
  const lastContactRef = useRef<{
    center: THREE.Vector3
    left: THREE.Vector3
    right: THREE.Vector3
  } | null>(null)

  const { geometry, positions, alphas } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const vertexCount = MAX_SEGMENTS * 4
    const pos = new Float32Array(vertexCount * 3)
    const uv = new Float32Array(vertexCount * 2)
    const alp = new Float32Array(vertexCount)
    const ind = new Uint16Array(MAX_SEGMENTS * 6)

    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const v = i * 4
      const idx = i * 6
      ind[idx] = v
      ind[idx + 1] = v + 1
      ind[idx + 2] = v + 2
      ind[idx + 3] = v + 1
      ind[idx + 4] = v + 3
      ind[idx + 5] = v + 2

      // Quad UVs
      uv[i * 8] = 0.0
      uv[i * 8 + 1] = 0.0
      uv[i * 8 + 2] = 1.0
      uv[i * 8 + 3] = 0.0
      uv[i * 8 + 4] = 0.0
      uv[i * 8 + 5] = 1.0
      uv[i * 8 + 6] = 1.0
      uv[i * 8 + 7] = 1.0
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1))
    geo.setIndex(new THREE.BufferAttribute(ind, 1))

    return { geometry: geo, positions: pos, alphas: alp }
  }, [])

  const uniforms = useMemo(
    () => ({
      uCyan: { value: new THREE.Color(variant === 'orange' ? '#ff8a1f' : '#35e4ff') },
      uCore: { value: new THREE.Color('#eafcff') },
    }),
    [variant],
  )

  useFrame((_, delta) => {
    if (!meshRef.current) return

    const cycle = cycleStateRef.current
    const isDrifting = !!cycle.isDrifting

    // Dev-only live skid data for CDP verification
    if (import.meta.env.DEV) {
      ;(window as unknown as { __skidDebug?: unknown }).__skidDebug = {
        segmentsRef,
        cycleStateRef,
      }
    }

    // Rear wheel contact position (matches 2nd Gen Light Cycle rear axle at 0.912)
    const rearX = cycle.x + Math.sin(cycle.yaw) * 0.912
    const rearZ = cycle.z + Math.cos(cycle.yaw) * 0.912
    const floorY = 0.015
    const curCenter = new THREE.Vector3(rearX, floorY, rearZ)

    // Perpendicular vector across tyre width (rider's right at yaw)
    const normX = Math.cos(cycle.yaw)
    const normZ = -Math.sin(cycle.yaw)

    // Under lean the bike rolls onto one side of the tyre: the ground trace
    // migrates toward the GROUNDED edge (lean left + grounds the −norm edge,
    // lean right − the +norm edge) and narrows as it rides up onto the edge.
    // The migration BLENDS by lean amount: upright = the full-width centered
    // twin strip; full drift lean (28°) = contact edge only. Jumping straight
    // to the edge at any nonzero lean put every mark on one side, never center.
    const sideSign = cycle.lean >= 0 ? -1 : 1
    const s = Math.abs(Math.sin(cycle.lean))
    const k = Math.min(1, s / 0.469) // 0 upright → 1 at max drift lean
    const shift = sideSign * TYRE_HALF_WIDTH * Math.cos(cycle.lean) * k
    const halfWidth = TYRE_HALF_WIDTH * (1 - s * k)

    const curLeft = new THREE.Vector3(
      rearX + normX * (shift - halfWidth),
      floorY,
      rearZ + normZ * (shift - halfWidth),
    )
    const curRight = new THREE.Vector3(
      rearX + normX * (shift + halfWidth),
      floorY,
      rearZ + normZ * (shift + halfWidth),
    )

    // Burnout pivots sweep the rear contact through an arc even at ~0 forward speed
    if (isDrifting && (Math.abs(cycle.speed) > 1.0 || !!cycle.isBurnout)) {
      if (lastContactRef.current) {
        // Measure travel distance from tyre center for 100% left-right turn symmetry
        const dist = lastContactRef.current.center.distanceTo(curCenter)

        if (dist >= 0.08) {
          // Add skid segment
          if (segmentsRef.current.length >= MAX_SEGMENTS) {
            segmentsRef.current.shift()
          }
          segmentsRef.current.push({
            p1: lastContactRef.current.left.clone(),
            p2: lastContactRef.current.right.clone(),
            p3: curLeft.clone(),
            p4: curRight.clone(),
            alpha: 1.0,
          })
          lastContactRef.current = {
            center: curCenter.clone(),
            left: curLeft.clone(),
            right: curRight.clone(),
          }
        }
      } else {
        lastContactRef.current = {
          center: curCenter.clone(),
          left: curLeft.clone(),
          right: curRight.clone(),
        }
      }
    } else {
      lastContactRef.current = null
    }

    // Fade out skid segments over time (~5.5 seconds lifetime)
    const segs = segmentsRef.current
    for (let i = segs.length - 1; i >= 0; i--) {
      segs[i].alpha -= delta * 0.18
      if (segs[i].alpha <= 0.01) {
        segs.splice(i, 1)
      }
    }

    if (segs.length === 0) {
      meshRef.current.visible = false
      geometry.setDrawRange(0, 0)
      return
    }

    meshRef.current.visible = true
    const count = segs.length

    let posIdx = 0
    let alpIdx = 0

    for (let i = 0; i < count; i++) {
      const seg = segs[i]

      // Vertex 0: p1
      positions[posIdx] = seg.p1.x
      positions[posIdx + 1] = seg.p1.y
      positions[posIdx + 2] = seg.p1.z

      // Vertex 1: p2
      positions[posIdx + 3] = seg.p2.x
      positions[posIdx + 4] = seg.p2.y
      positions[posIdx + 5] = seg.p2.z

      // Vertex 2: p3
      positions[posIdx + 6] = seg.p3.x
      positions[posIdx + 7] = seg.p3.y
      positions[posIdx + 8] = seg.p3.z

      // Vertex 3: p4
      positions[posIdx + 9] = seg.p4.x
      positions[posIdx + 10] = seg.p4.y
      positions[posIdx + 11] = seg.p4.z

      alphas[alpIdx] = seg.alpha
      alphas[alpIdx + 1] = seg.alpha
      alphas[alpIdx + 2] = seg.alpha
      alphas[alpIdx + 3] = seg.alpha

      posIdx += 12
      alpIdx += 4
    }

    // Ranged upload — only the live segments (the buffer is allocated for
    // MAX_SEGMENTS; a bare needsUpdate would re-send the whole tail every
    // frame while the marks merely fade)
    const posAttr = geometry.attributes.position as THREE.BufferAttribute
    posAttr.clearUpdateRanges()
    posAttr.addUpdateRange(0, count * 4 * 3)
    posAttr.needsUpdate = true

    const alphaAttr = geometry.attributes.aAlpha as THREE.BufferAttribute
    alphaAttr.clearUpdateRanges()
    alphaAttr.addUpdateRange(0, count * 4)
    alphaAttr.needsUpdate = true

    geometry.setDrawRange(0, count * 6)
  })

  return (
    <mesh ref={meshRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
