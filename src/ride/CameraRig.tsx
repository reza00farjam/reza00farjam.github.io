import React, { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useAppStore } from '../lib/store'
import { battleRuntime, useBattleStore } from '../lib/battleStore'
import { CycleState } from '../lib/cyclePhysics'

interface CameraRigProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  cyclePosRef: React.MutableRefObject<THREE.Vector3>
  cycleTangentRef: React.MutableRefObject<THREE.Vector3>
  isMobile: boolean
  /** Camera interaction lock — window-level listeners go deaf. `parked`:
      RideView hidden but mounted (Read-mode park) — Read-mode drags/scrolls
      must never orbit or zoom the invisible camera. `veiled`: the cold-start
      veil holds — no orbiting or zooming a world the rider cannot see yet. */
  parked?: boolean
  veiled?: boolean
}

// Scratch vectors reused across frames — allocating them per frame at 60fps
// shows up as GC churn (micro-stutter) on mobile
const scratchCamPos = new THREE.Vector3()
const scratchLook = new THREE.Vector3()

export const CameraRig: React.FC<CameraRigProps> = ({
  cycleStateRef,
  cyclePosRef,
  cycleTangentRef,
  isMobile,
  parked = false,
  veiled = false,
}) => {
  const { camera } = useThree()
  const isJumping = useAppStore((s) => s.isJumping)
  const parkedRef = useRef(parked)
  const veiledRef = useRef(veiled)
  useEffect(() => {
    parkedRef.current = parked
  }, [parked])
  useEffect(() => {
    veiledRef.current = veiled
  }, [veiled])
  const camLocked = () => parkedRef.current || veiledRef.current

  // A new round (countdown, incl. rematch) resets the camera to the chase
  // framing — the rig would otherwise keep the last duel's orbit/victory angle
  const battlePhase = useBattleStore((s) => s.phase)
  useEffect(() => {
    if (battlePhase === 'countdown') {
      orbitActiveRef.current = false
      camInitialized.current = false
    }
  }, [battlePhase])

  const currentCamPos = useRef(new THREE.Vector3(0, 2, 20))
  const currentLookTarget = useRef(new THREE.Vector3(0, 0.55, 0))
  const camInitialized = useRef(false)

  // FOV: 45 deg default (demo parity), gentle +3 deg on boost
  const baseFov = isMobile ? 48.0 : 45.0
  const targetFov = useRef(baseFov)

  // ================== RIDE MODE (chase cam — the primary experience) ==================
  const behindDist = 4.4
  const heightDist = isMobile ? 1.7 : 1.5
  const lookAheadDist = isMobile ? 2.0 : 2.8
  const lookHeight = isMobile ? 0.9 : 0.45

  // ================== ORBIT MODE (free spherical orbit, stationary only) =============
  const orbitActiveRef = useRef(false)
  const targetTheta = useRef(0)
  const currentTheta = useRef(0)
  const targetPhi = useRef(Math.PI / 2 - 0.28)
  const currentPhi = useRef(Math.PI / 2 - 0.28)
  const targetRadius = useRef(isMobile ? 4.4 : 4.6)
  const currentRadius = useRef(isMobile ? 4.4 : 4.6)

  // Mouse drag & touch tracking
  const isDraggingRef = useRef(false)
  const lastPointerPosRef = useRef({ x: 0, y: 0 })
  const touchDistanceRef = useRef<number | null>(null)

  // Seed spherical coordinates from wherever the camera currently is (no jump on orbit start)
  const seedOrbitFromCurrentView = useCallback(() => {
    const cyclePos = cyclePosRef.current
    const bikeCenter = new THREE.Vector3(cyclePos.x, cyclePos.y + 0.55, cyclePos.z)
    const offset = new THREE.Vector3().subVectors(currentCamPos.current, bikeCenter)

    const radius = THREE.MathUtils.clamp(offset.length(), 1.8, 25.0)
    targetRadius.current = radius
    currentRadius.current = radius

    const phi = THREE.MathUtils.clamp(
      Math.acos(THREE.MathUtils.clamp(offset.y / radius, -1, 1)),
      0.08,
      Math.PI / 2 - 0.02,
    )
    targetPhi.current = phi
    currentPhi.current = phi

    const theta = Math.atan2(offset.x, offset.z)
    targetTheta.current = theta
    currentTheta.current = theta
  }, [cyclePosRef])

  // Setup interactive OrbitControls-style mouse & touch listeners
  useEffect(() => {
    const state = () => cycleStateRef.current
    const isStationary = () => Math.abs(state().speed) < 0.8 && !state().isAutopilot

    const handlePointerDown = (e: MouseEvent) => {
      if (camLocked()) return
      if (e.button !== 0) return
      // Ignore clicks on UI elements (dialogs, buttons, nav, hints, radar)
      const target = e.target as HTMLElement | null
      if (target?.closest('button, a, [role="dialog"], input, aside, nav, svg')) return

      isDraggingRef.current = true
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY }

      // Holding the drag hands camera control to orbit — even mid-ride.
      // Seeded from the current view so there is never a jump.
      if (!orbitActiveRef.current) seedOrbitFromCurrentView()
      orbitActiveRef.current = true
    }

    const handlePointerMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      const dx = e.clientX - lastPointerPosRef.current.x
      const dy = e.clientY - lastPointerPosRef.current.y
      lastPointerPosRef.current = { x: e.clientX, y: e.clientY }

      if (!orbitActiveRef.current) return

      // Free horizontal azimuth orbit (full 360 degrees)
      targetTheta.current -= dx * 0.005
      targetPhi.current = THREE.MathUtils.clamp(
        targetPhi.current - dy * 0.005,
        0.08,
        Math.PI / 2 - 0.02,
      )
    }

    const handlePointerUp = () => {
      isDraggingRef.current = false
    }

    const handleWheel = (e: WheelEvent) => {
      if (camLocked()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[role="dialog"], .overflow-y-auto')) return
      if (!isStationary()) return

      if (!orbitActiveRef.current) seedOrbitFromCurrentView()
      orbitActiveRef.current = true

      targetRadius.current = THREE.MathUtils.clamp(
        targetRadius.current + e.deltaY * 0.003,
        1.8,
        25.0,
      )
    }

    // Touch: single-finger drag orbits, pinch zooms
    const handleTouchStart = (e: TouchEvent) => {
      if (camLocked()) return
      const target = e.target as HTMLElement | null
      if (target?.closest('button, a, [role="dialog"], input, aside, nav, .pointer-events-auto'))
        return

      if (e.touches.length === 1) {
        isDraggingRef.current = true
        lastPointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        touchDistanceRef.current = null

        // Touch-drag hands camera control to orbit — even mid-ride
        if (!orbitActiveRef.current) seedOrbitFromCurrentView()
        orbitActiveRef.current = true
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        touchDistanceRef.current = Math.hypot(dx, dy)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDraggingRef.current && orbitActiveRef.current) {
        const dx = e.touches[0].clientX - lastPointerPosRef.current.x
        const dy = e.touches[0].clientY - lastPointerPosRef.current.y
        lastPointerPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }

        targetTheta.current -= dx * 0.006
        targetPhi.current = THREE.MathUtils.clamp(
          targetPhi.current - dy * 0.006,
          0.08,
          Math.PI / 2 - 0.02,
        )
      } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
        if (!orbitActiveRef.current) return
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const newDist = Math.hypot(dx, dy)
        const diff = touchDistanceRef.current - newDist
        touchDistanceRef.current = newDist

        targetRadius.current = THREE.MathUtils.clamp(targetRadius.current + diff * 0.015, 1.8, 25.0)
      }
    }

    const handleTouchEnd = () => {
      isDraggingRef.current = false
      touchDistanceRef.current = null
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [cycleStateRef, seedOrbitFromCurrentView])

  useFrame((_, delta) => {
    const cyclePos = cyclePosRef.current
    const tangent = cycleTangentRef.current
    const state = cycleStateRef.current

    // Battle victory: slow cinematic orbit around the loser's wreck
    const focus = battleRuntime.crashFocus
    if (focus) {
      const theta = performance.now() * 0.00035
      const r = 9.0
      const desiredCamPos = scratchCamPos.set(
        focus.x + r * Math.sin(theta),
        3.2,
        focus.z + r * Math.cos(theta),
      )
      const desiredLook = scratchLook.set(focus.x, 0.8, focus.z)
      currentCamPos.current.lerp(desiredCamPos, Math.min(1, delta * 4.0))
      currentLookTarget.current.lerp(desiredLook, Math.min(1, delta * 4.0))
      camera.position.copy(currentCamPos.current)
      camera.lookAt(currentLookTarget.current)
      targetFov.current = THREE.MathUtils.lerp(targetFov.current, baseFov, delta * 4.0)
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== targetFov.current) {
        camera.fov = targetFov.current
        camera.updateProjectionMatrix()
      }
      return
    }

    const isDriving = Math.abs(state.speed) > 0.8 || isJumping || state.isAutopilot
    const userHoldingOrbit = isDraggingRef.current || touchDistanceRef.current !== null

    // Ride motion hands the camera back to Ride View chase framing — but only
    // once the user releases the drag. Holding click/touch keeps orbit in
    // control even while riding.
    if (isDriving && !userHoldingOrbit) {
      orbitActiveRef.current = false
    }

    const bikeCenterY = cyclePos.y + 0.55
    let desiredCamPos: THREE.Vector3
    let desiredLook: THREE.Vector3

    if (orbitActiveRef.current) {
      // ============ ORBIT MODE: free spherical controls around the bike ============
      let thetaDiff = targetTheta.current - currentTheta.current
      while (thetaDiff > Math.PI) thetaDiff -= 2 * Math.PI
      while (thetaDiff < -Math.PI) thetaDiff += 2 * Math.PI
      currentTheta.current += thetaDiff * THREE.MathUtils.clamp(delta * 12.0, 0, 1)

      currentPhi.current = THREE.MathUtils.lerp(
        currentPhi.current,
        targetPhi.current,
        THREE.MathUtils.clamp(delta * 12.0, 0, 1),
      )
      currentRadius.current = THREE.MathUtils.lerp(
        currentRadius.current,
        targetRadius.current,
        THREE.MathUtils.clamp(delta * 12.0, 0, 1),
      )

      const r = currentRadius.current
      const phi = currentPhi.current
      const theta = currentTheta.current

      desiredCamPos = scratchCamPos.set(
        cyclePos.x + r * Math.sin(phi) * Math.sin(theta),
        bikeCenterY + r * Math.cos(phi),
        cyclePos.z + r * Math.sin(phi) * Math.cos(theta),
      )
      desiredCamPos.y = Math.max(0.2, desiredCamPos.y)

      desiredLook = scratchLook.set(cyclePos.x, bikeCenterY, cyclePos.z)
    } else {
      // ============ RIDE MODE: smooth trailing chase camera (primary experience) =======
      desiredCamPos = scratchCamPos.copy(cyclePos).addScaledVector(tangent, -behindDist)
      desiredCamPos.y = cyclePos.y + heightDist

      desiredLook = scratchLook.copy(cyclePos).addScaledVector(tangent, lookAheadDist)
      desiredLook.y = cyclePos.y + lookHeight
    }

    // First frame: snap directly into place; afterwards: fluid smoothed follow
    if (!camInitialized.current) {
      currentCamPos.current.copy(desiredCamPos)
      currentLookTarget.current.copy(desiredLook)
      camInitialized.current = true
    } else {
      const lerpFactor = Math.min(1.0, delta * 10.0)
      currentCamPos.current.lerp(desiredCamPos, lerpFactor)
      currentLookTarget.current.lerp(desiredLook, lerpFactor)
    }

    camera.position.copy(currentCamPos.current)
    camera.lookAt(currentLookTarget.current)

    // Subtle FOV response on boost
    const targetF = isJumping ? baseFov + 3.0 : baseFov
    targetFov.current = THREE.MathUtils.lerp(targetFov.current, targetF, delta * 4.0)

    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== targetFov.current) {
      camera.fov = targetFov.current
      camera.updateProjectionMatrix()
    }
  })

  return null
}
