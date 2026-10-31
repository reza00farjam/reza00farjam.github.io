import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CycleInputs, CycleState } from '../lib/cyclePhysics'
import { loadVehicleProto } from './vehicleProto'
import { vehicleStatus } from './vehicleStatus'

interface CycleProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  cyclePosRef: React.MutableRefObject<THREE.Vector3>
  cycleTangentRef: React.MutableRefObject<THREE.Vector3>
  inputsRef: React.MutableRefObject<CycleInputs>
  /** Battle: the FOE bike rides the orange variant (staged ORANGE textures) —
      every rider sees their own bike cyan and the opponent orange. */
  variant?: 'blue' | 'orange'
}

// Lean lift from the REAR tyre's measured support profile: the lift that puts
// the tyre's lowest surface point exactly on the floor at each lean angle
// (computed per-vertex over wheel_rear in the model). Width-based formulas
// (0.38, then 0.27) hugely overshot the rounded profile and floated the wheel
// 8–12 cm off the ground on every turn. Below ~14° the tyre touches with no
// lift (the profile rounds up slower than the clearance it already has).
const LEAN_LIFT_TABLE: { deg: number; lift: number }[] = [
  { deg: 0, lift: 0 },
  { deg: 14, lift: 0 },
  { deg: 20, lift: 0.0117 },
  { deg: 25, lift: 0.0223 },
  { deg: 28, lift: 0.0286 }, // max lean (drift) — table never extrapolates past this
]

// Touch devices cap anisotropy at 8: 16-tap grazing-angle sampling is a real
// mobile GPU cost and visually indistinguishable at bike scale.
const MAX_ANISO =
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    ? 8
    : 16

function leanLiftFor(lean: number): number {
  const deg = THREE.MathUtils.radToDeg(Math.abs(lean))
  for (let i = 1; i < LEAN_LIFT_TABLE.length; i++) {
    const a = LEAN_LIFT_TABLE[i - 1]
    const b = LEAN_LIFT_TABLE[i]
    if (deg <= b.deg) {
      const t = (deg - a.deg) / (b.deg - a.deg)
      return a.lift + (b.lift - a.lift) * Math.max(0, Math.min(1, t))
    }
  }
  return LEAN_LIFT_TABLE[LEAN_LIFT_TABLE.length - 1].lift
}

export const Cycle: React.FC<CycleProps> = ({
  cycleStateRef,
  cyclePosRef,
  cycleTangentRef,
  inputsRef,
  variant = 'blue',
}) => {
  const groupRef = useRef<THREE.Group>(null)
  const vehicleRootRef = useRef<THREE.Group | null>(null)
  const wheelFrontPivotRef = useRef<THREE.Group | null>(null)
  const wheelRearPivotRef = useRef<THREE.Group | null>(null)

  const brakeCenterRef = useRef<THREE.Mesh | null>(null)
  const brakeLeftRef = useRef<THREE.Mesh | null>(null)
  const brakeRightRef = useRef<THREE.Mesh | null>(null)
  const riderPartsRef = useRef<THREE.Mesh[]>([])

  // Load TRON: Legacy 2nd Gen Light Cycle & Sam Flynn model and textures
  useEffect(() => {
    // StrictMode double-mounts effects in dev — a stale OBJ-load callback
    // landing after cleanup would attach a SECOND vehicleRoot (ghost bike)
    let disposed = false
    const basePath = `${import.meta.env.BASE_URL}models/`
    const texLoader = new THREE.TextureLoader()

    const loadTex = (file: string, srgb = true) => {
      // onLoad AND onError count: the cold-entry veil waits on all player
      // maps landing, and a dead network must not lock it forever
      const t = texLoader.load(
        `${basePath}textures/${file}`,
        () => {
          vehicleStatus.mapsLoaded++
        },
        undefined,
        () => {
          vehicleStatus.mapsLoaded++
        },
      )
      t.flipY = false // Mandatory for 1:1 UV alignment with this model
      // sRGB decode so color maps aren't double-encoded (washed out) at output,
      // and max anisotropic filtering so grazing-angle views (engine side
      // panels from the chase cam) keep their detail
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = MAX_ANISO
      return t
    }

    const orange = variant === 'orange'
    const texBike = loadTex(
      orange ? 'LightCycleSam_color_ORANGE_dark_2.jpg' : 'LightCycleSam_color_BLUE_dark_73.jpg',
    )
    const texRider = loadTex(
      orange ? 'sam_color_ORANGE_dark_110.jpg' : 'sam_color_BLUE_dark_46.jpg',
    )
    const texRiderNormal = loadTex('sam_normals_02_js_165.png', false) // normals stay linear
    const texDisc = loadTex(
      orange ? 'disc_color_sam_orangeDark_106.png' : 'disc_color_sam_blueDark_36.png',
    )
    const emissive = new THREE.Color(orange ? 0xff8a1f : 0x00d9ff)

    // HDR emissive: intensity > 1 pushes the circuit-line pixels past
    // postprocessing's luminance threshold so bloom halos them like the grid
    // floor shader lines (body panels stay dark enough to stay unlit)
    const matBike = new THREE.MeshStandardMaterial({
      map: texBike,
      emissiveMap: texBike,
      emissive,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      metalness: 0.85,
    })

    const matRider = new THREE.MeshStandardMaterial({
      map: texRider,
      normalMap: texRiderNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      emissiveMap: texRider,
      emissive,
      emissiveIntensity: 2.0,
      roughness: 0.45,
      metalness: 0.65,
    })

    const matDisc = new THREE.MeshStandardMaterial({
      map: texDisc,
      emissiveMap: texDisc,
      emissive,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      metalness: 0.9,
    })

    // Top-level unified vehicle root: everything is parented here for rigid banking
    const vehicleRoot = new THREE.Group()
    vehicleRoot.name = 'vehicleRoot'
    vehicleRootRef.current = vehicleRoot

    // Rotating hubless wheel pivots (58 cm hollow center opening)
    const wheelFrontPivot = new THREE.Group()
    const wheelRearPivot = new THREE.Group()
    wheelFrontPivot.position.set(0, 0.4065, -0.948)
    wheelRearPivot.position.set(0.0038, 0.4355, 0.912)
    vehicleRoot.add(wheelFrontPivot)
    vehicleRoot.add(wheelRearPivot)
    wheelFrontPivotRef.current = wheelFrontPivot
    wheelRearPivotRef.current = wheelRearPivot

    const buildVehicle = (obj: THREE.Group) => {
      if (disposed || !groupRef.current) return
      const toReParent: { mesh: THREE.Mesh; target: THREE.Group }[] = []
      obj.traverse((child) => {
        if (!('isMesh' in child) || !(child as THREE.Mesh).isMesh) return
        const mesh = child as THREE.Mesh
        mesh.geometry.computeVertexNormals()
        const name = mesh.name.toLowerCase()

        if (name.includes('rider_sam_sub1')) {
          // Identity disc on back
          mesh.material = matDisc
          riderPartsRef.current.push(mesh)
        } else if (name.includes('rider_sam')) {
          // Sam Flynn suit & helmet
          mesh.material = matRider
          riderPartsRef.current.push(mesh)
        } else if (name.includes('wheel_front')) {
          mesh.material = matBike
          mesh.geometry.center() // Center to local hollow axle
          toReParent.push({ mesh, target: wheelFrontPivot })
        } else if (name.includes('wheel_rear')) {
          mesh.material = matBike
          mesh.geometry.center() // Center to local hollow axle
          toReParent.push({ mesh, target: wheelRearPivot })
        } else {
          mesh.material = matBike

          // Brakes measure their bbox BEFORE centering the geometry — but the
          // clone shares buffers with the proto, and the first consumer's
          // center() already translated them. A second mount would measure a
          // centered box and collapse every hinge to the origin, so brake
          // geometries get their own copy per mount (tiny meshes).
          if (
            name.includes('brake_center') ||
            name.includes('brake_left') ||
            name.includes('brake_right')
          ) {
            mesh.geometry = mesh.geometry.clone()
          }

          if (name.includes('brake_center')) {
            brakeCenterRef.current = mesh
            const origBox = new THREE.Box3().setFromObject(mesh)
            const origCenter = origBox.getCenter(new THREE.Vector3())
            mesh.geometry.center()
            mesh.position.copy(origCenter)
          } else if (name.includes('brake_left')) {
            brakeLeftRef.current = mesh
            const origBox = new THREE.Box3().setFromObject(mesh)
            const origCenter = origBox.getCenter(new THREE.Vector3())
            mesh.geometry.center()
            mesh.position.copy(origCenter)
          } else if (name.includes('brake_right')) {
            brakeRightRef.current = mesh
            const origBox = new THREE.Box3().setFromObject(mesh)
            const origCenter = origBox.getCenter(new THREE.Vector3())
            mesh.geometry.center()
            mesh.position.copy(origCenter)
          }
        }
      })

      toReParent.forEach(({ mesh, target }) => target.add(mesh))
      vehicleRoot.add(obj)

      // The bike is attached — the quality ladder may arm (see vehicleStatus)
      vehicleStatus.builtAt = performance.now()

      if (groupRef.current) {
        groupRef.current.add(vehicleRoot)
      }
    }

    // ponytail: the 4.4MB OBJ ships as a 1.0MB .gz, parses once per page
    // (shared proto), and every mount clones it — see loadVehicleProto above.
    loadVehicleProto(`${basePath}light_cycle_with_rider.obj`)
      .then((proto) => {
        if (!disposed) buildVehicle(proto.clone())
      })
      .catch(() => {
        // both the gz and raw-OBJ paths failed inside loadVehicleProto
      })

    const currentGroup = groupRef.current

    return () => {
      disposed = true
      if (currentGroup && vehicleRootRef.current) {
        currentGroup.remove(vehicleRootRef.current)
      }
      matBike.dispose()
      matRider.dispose()
      matDisc.dispose()
      texBike.dispose()
      texRider.dispose()
      texRiderNormal.dispose()
      texDisc.dispose()
    }
  }, [variant])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const state = cycleStateRef.current

    // Idle hum at zero or near-zero speed
    let idleHum = 0
    if (Math.abs(state.speed) < 0.2) {
      idleHum = Math.sin(performance.now() * 0.008) * 0.008
    }

    // Floor is flat everywhere — terminal markers are shapes on the grid
    const currentY = idleHum

    // Set position and rotation in world space
    groupRef.current.position.set(state.x, currentY, state.z)
    groupRef.current.rotation.y = state.yaw

    // Banking lean roll on unified vehicleRoot (keep rotation.y = 0 so bike stays straight on course)
    if (vehicleRootRef.current) {
      vehicleRootRef.current.rotation.y = 0

      // Battle crash: the bike does NOT tip over anymore (2026-11-05, Reza —
      // the "stands up" righting on rematch read worse than no fall at all);
      // a crash just stops the bike where it is

      vehicleRootRef.current.rotation.z = state.lean

      // Dev-only live transform probe for CDP verification
      if (import.meta.env.DEV) {
        ;(window as unknown as { __cycleDebug?: unknown }).__cycleDebug = {
          vehicleRoot: vehicleRootRef.current,
          state: cycleStateRef.current,
        }
      }

      // Subtle suspension / speed vibration at high boost speeds + dynamic lean
      // lift from the measured tyre support profile (exact floor contact).
      const leanLift = leanLiftFor(state.lean)
      if (Math.abs(state.speed) > 30) {
        vehicleRootRef.current.position.y = leanLift + (Math.random() - 0.5) * 0.008
      } else {
        vehicleRootRef.current.position.y = THREE.MathUtils.lerp(
          vehicleRootRef.current.position.y,
          leanLift,
          delta * 8,
        )
      }
    }

    // 1. Spin hollow hubless wheels around local X-axis.
    // Burnout: engine revs against the brake — rear wheel spins in place at
    // throttle speed while the braked front wheel stays planted
    const burnout = !!state.isBurnout
    const angularSpeed = state.speed / 0.42
    const rearSpin = burnout
      ? Math.max(Math.abs(state.speed), inputsRef.current.boost ? 40.0 : 26.0) / 0.42
      : angularSpeed
    if (wheelFrontPivotRef.current) {
      wheelFrontPivotRef.current.rotation.x -= (burnout ? 0 : angularSpeed) * delta
    }
    if (wheelRearPivotRef.current) {
      wheelRearPivotRef.current.rotation.x -= rearSpin * delta
    }

    // 2. Animate Air Brakes (flare open during drift/braking, snap flush during driving)
    const brakePitch = state.isDrifting ? 0.38 : 0.0
    if (brakeCenterRef.current) {
      brakeCenterRef.current.rotation.x = THREE.MathUtils.lerp(
        brakeCenterRef.current.rotation.x,
        -brakePitch,
        delta * 12,
      )
    }
    if (brakeLeftRef.current) {
      brakeLeftRef.current.rotation.x = THREE.MathUtils.lerp(
        brakeLeftRef.current.rotation.x,
        -brakePitch * 0.9,
        delta * 12,
      )
      brakeLeftRef.current.rotation.y = THREE.MathUtils.lerp(
        brakeLeftRef.current.rotation.y,
        brakePitch * 0.4,
        delta * 12,
      )
    }
    if (brakeRightRef.current) {
      brakeRightRef.current.rotation.x = THREE.MathUtils.lerp(
        brakeRightRef.current.rotation.x,
        -brakePitch * 0.9,
        delta * 12,
      )
      brakeRightRef.current.rotation.y = THREE.MathUtils.lerp(
        brakeRightRef.current.rotation.y,
        -brakePitch * 0.4,
        delta * 12,
      )
    }

    // Calculate forward tangent vector (yaw=0 means -Z)
    const dirX = -Math.sin(state.yaw)
    const dirZ = -Math.cos(state.yaw)

    cyclePosRef.current.set(state.x, currentY, state.z)
    cycleTangentRef.current.set(dirX, 0, dirZ).normalize()
  })

  return <group ref={groupRef} />
}
