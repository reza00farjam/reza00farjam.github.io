import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { TronNavArrow } from './TronNavArrow'
import { localRefs, remoteRefs } from '../lib/battleNet'
import { FOE_SPECTRUM_FAR, FOE_SPECTRUM_NEAR } from '../lib/battle'

/** The AUTHENTIC TRON: Legacy navigation arrow (tron_nav_arrow.obj, SmoothLookAt
    damping 6) as the battle foe-pointer: camera-parented like the original
    ArrowHolder (top-center HUD slot), re-aiming at the opponent's synced bike
    every frame with the authentic damped swing. Renders HUD-style (never
    depth-clipped); the arrow tints on the distance spectrum toward the foe's
    orange — the foe is always the orange rider on every screen. */
export const FoeNavArrow: React.FC = () => {
  const arrowRef = useRef<TronNavArrow | null>(null)
  const targetRef = useRef(new THREE.Vector3(100, 0.55, 100))
  const foeHex = 0xff8a1f
  const { scene, camera } = useThree()

  useEffect(() => {
    // GOTCHA (from the original integration): the arrow parents itself to the
    // camera — the camera must be a scene child or camera-attached children
    // never render. R3F does not add the default camera to the scene itself.
    scene.add(camera)
    const arrow = new TronNavArrow(camera, {
      url: `${import.meta.env.BASE_URL}models/tron_nav_arrow.obj`,
      // y 0.40 (not the guide's 0.48): with this project's 45° FOV the guide
      // slot's upper edge clips off-screen on desktop — 0.40 keeps the whole
      // chevron on-screen on both viewports
      offset: new THREE.Vector3(0, 0.4, -1.2),
    })
    arrowRef.current = arrow
    return () => {
      arrow.dispose()
      arrowRef.current = null
    }
  }, [scene, camera])

  useFrame((_, delta) => {
    const arrow = arrowRef.current
    if (!arrow) return
    const me = localRefs.cycle.current ?? { x: 0, z: 0 }
    const foe = remoteRefs.cycle.current
    targetRef.current.set(foe.x, 0.55, foe.z)
    arrow.setTarget(targetRef.current)
    arrow.update(delta)
    // Distance spectrum on the mesh itself: authentic tones far, foe theme near
    const dist = Math.hypot(foe.x - me.x, foe.z - me.z)
    const t = Math.max(
      0,
      Math.min(1, (FOE_SPECTRUM_FAR - dist) / (FOE_SPECTRUM_FAR - FOE_SPECTRUM_NEAR)),
    )
    arrow.setSpectrum(t, foeHex)
  })

  return null
}
