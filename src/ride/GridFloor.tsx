import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useAppStore } from '../lib/store'
import { useBattleStore } from '../lib/battleStore'

interface GridFloorProps {
  cyclePosRef: React.MutableRefObject<THREE.Vector3>
}

const vertexShader = `
  varying vec2 vWorldPos;
  varying vec3 vViewPosition;

  #include <common>
  #include <fog_pars_vertex>

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xz;
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const fragmentShader = `
  uniform vec3 uVoid;
  uniform vec3 uDeep;
  uniform vec3 uCyan;
  uniform float uBrightnessBoost;
  // 1.0 in the normal arena: the floor plane is 260 wide (snap overhang) and
  // its grid lines leak past the south wall through the alley gate — mask
  // them beyond z=120. Battle arenas keep the stock floor (gate is sealed).
  uniform float uHideSouthLines;

  varying vec2 vWorldPos;
  varying vec3 vViewPosition;

  #include <common>
  #include <fog_pars_fragment>

  void main() {
    vec2 coord = vWorldPos;

    // Minor grid: 1.0 unit cell
    vec2 f1 = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line1 = 1.0 - min(min(f1.x, f1.y), 1.0);

    // Major grid: 10.0 unit cell
    vec2 coord10 = coord / 10.0;
    vec2 f10 = abs(fract(coord10 - 0.5) - 0.5) / fwidth(coord10);
    float line10 = 1.0 - min(min(f10.x, f10.y), 1.0);

    // Base floor tone
    vec3 col = mix(uVoid, uDeep, 0.2);

    // Line brightness: fine lines at 25%, major lines at 60%
    float lineIntensity = (line1 * 0.25 + line10 * 0.45) * uBrightnessBoost;
    lineIntensity *= 1.0 - uHideSouthLines * smoothstep(119.5, 120.5, coord.y);
    col += uCyan * lineIntensity;

    gl_FragColor = vec4(col, 1.0);

    #include <fog_fragment>
  }
`

export const GridFloor: React.FC<GridFloorProps> = ({ cyclePosRef }) => {
  const meshRef = useRef<THREE.Mesh>(null)
  const isJumping = useAppStore((s) => s.isJumping)
  // Normal arena hides the snap-overhang lines beyond the south wall; a
  // battle arena keeps the stock floor untouched
  const battleActive = useBattleStore((s) => s.phase !== 'idle')

  const uniforms = useMemo(
    () => ({
      uVoid: { value: new THREE.Color('#03070d') },
      uDeep: { value: new THREE.Color('#071a2b') },
      uCyan: { value: new THREE.Color('#35e4ff') },
      uBrightnessBoost: { value: 1.0 },
      uHideSouthLines: { value: 0.0 },
      fogColor: { value: new THREE.Color('#03070d') },
      fogDensity: { value: 0.018 },
    }),
    [],
  )

  useFrame(() => {
    if (!meshRef.current) return

    const cycle = cyclePosRef.current

    // Snap floor mesh to 10-unit grid near cycle so lines do not swim
    const snapX = Math.floor(cycle.x / 10) * 10
    const snapZ = Math.floor(cycle.z / 10) * 10
    meshRef.current.position.set(snapX, -0.01, snapZ)

    uniforms.uHideSouthLines.value = battleActive ? 0.0 : 1.0

    // Smooth brightness boost (+15%) during jump
    const targetBoost = isJumping ? 1.15 : 1.0
    uniforms.uBrightnessBoost.value = THREE.MathUtils.lerp(
      uniforms.uBrightnessBoost.value,
      targetBoost,
      0.1,
    )
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[260, 260, 1, 1]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog={true}
      />
    </mesh>
  )
}
