// ============================================================================
// TronNavArrow — TRON: Legacy navigation arrow HUD (Three.js, zero deps)
// ----------------------------------------------------------------------------
// Reconstructed from the original game object (tron.unity3d):
//   • Mesh "ARROW" (id 170): flat 3-tone chevron (blue body / white core /
//     white highlight) — authentic unlit colors, exported to tron_nav_arrow.obj
//   • "ArrowHolder" was parented to the CAMERA at (0, 0.18, 0.49) → the arrow
//     floats TOP-CENTER of the screen like a HUD element
//   • Script "SmoothLookAt" (damping 6.0) smoothly rotated it to point at the
//     destination object — that is how the game guided you to a location
//
// Vendored 2026-11-05 from the extracted game assets (export_for_agent),
// converted to TypeScript. Usage:
//   const arrow = new TronNavArrow(camera, { url: '...obj' });
//   arrow.setTarget(obj3D_or_Vector3); arrow.update(delta); arrow.dispose();
// ============================================================================

import * as THREE from 'three'

// Authentic unlit tones per material group (exact values from the game)
const AUTHENTIC = { arrow_blue: 0x649399, arrow_white: 0xd9d9d9, arrow_hilight: 0xffffff }

export interface TronNavArrowOpts {
  url: string
  /** camera-space position — default (0, 0.48, -1.2) = top-center ~12% from top */
  offset?: THREE.Vector3
  /** uniform scale — default 0.026 (≈13% of screen height, authentic) */
  scale?: number
  /** SmoothLookAt damping — 6.0 authentic */
  damping?: number
  /** true = render on top, never depth-clipped (default) */
  hud?: boolean
}

export class TronNavArrow {
  private camera: THREE.Camera
  private damping: number
  private target: THREE.Vector3 | null = null
  private _bob = 0
  private _baseY: number | undefined
  private _loaded = false

  root: THREE.Group
  spinner: THREE.Group
  materials: Record<string, THREE.MeshBasicMaterial>

  constructor(camera: THREE.Camera, opts: TronNavArrowOpts) {
    this.camera = camera
    this.damping = opts.damping != null ? opts.damping : 6.0

    // ---- root, parented to the camera exactly like ArrowHolder ----
    // NOTE: the original Unity offset was (0, 0.18, +0.494) — Unity cameras
    // look down +Z. Three.js cameras look down -Z, so the equivalent
    // in-front-of-the-lens placement is z = -1.2 (top-center of view).
    this.root = new THREE.Group()
    this.root.position.copy(opts.offset ?? new THREE.Vector3(0, 0.48, -1.2))
    this.root.scale.setScalar(opts.scale != null ? opts.scale : 0.026)
    camera.add(this.root)

    // spinner sits inside root: root = placement, spinner = aim
    this.spinner = new THREE.Group()
    this.root.add(this.spinner)

    // ---- authentic unlit materials (no textures in the original) ----
    const isHud = opts.hud !== false
    const mat = (hex: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
        depthTest: !isHud,
        depthWrite: false, // HUD mode: never depth-clipped
      })
    if (isHud) this.root.renderOrder = 999
    this.materials = {
      arrow_blue: mat(0x649399, 0.96), // (0.394, 0.576, 0.600) authentic
      arrow_white: mat(0xd9d9d9, 0.98), // (0.85, 0.85, 0.85)
      arrow_hilight: mat(0xffffff, 1.0),
    }

    this._load(opts.url)
  }

  // ---- minimal OBJ parser (v / vn / f + usemtl groups) ----
  private _load(url: string): void {
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.text()
      })
      .then((text) => this._parse(text))
      .catch((err) => console.error('TronNavArrow: failed to load', url, err))
  }

  private _parse(text: string): void {
    const verts: number[][] = []
    const norms: number[][] = []
    const groupFaces: { mtl: string; tris: [number, number][][] }[] = []
    let current: { mtl: string; tris: [number, number][][] } | null = null
    for (let line of text.split('\n')) {
      line = line.trim()
      if (!line || line[0] === '#') continue
      const p = line.split(/\s+/)
      if (p[0] === 'v') verts.push([+p[1], +p[2], +p[3]])
      else if (p[0] === 'vn') norms.push([+p[1], +p[2], +p[3]])
      else if (p[0] === 'usemtl') {
        current = { mtl: p[1], tris: [] }
        groupFaces.push(current)
      } else if (p[0] === 'f' && current) {
        const idx: [number, number][] = p.slice(1).map((tok) => {
          const i = tok.split('/')
          return [parseInt(i[0]) - 1, i[2] ? parseInt(i[2]) - 1 : -1]
        })
        for (let k = 2; k < idx.length; k++) current.tris.push([idx[0], idx[k - 1], idx[k]]) // fan-triangulate
      }
    }
    for (const g of groupFaces) {
      const pos: number[] = []
      const nor: number[] = []
      for (const tri of g.tris)
        for (const [vi, ni] of tri) {
          pos.push(...verts[vi])
          nor.push(...(ni >= 0 ? norms[ni] : [0, 1, 0]))
        }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
      const mtl = this.materials[g.mtl] ?? this.materials.arrow_blue
      const mesh = new THREE.Mesh(geo, mtl)
      if (this.root.renderOrder) mesh.renderOrder = this.root.renderOrder
      this.spinner.add(mesh)
    }
    this._loaded = true
  }

  /** Distance-spectrum tint (0 = authentic 3-tone, 1 = fully `hex`): each
      material keeps its authentic tone as the base and lerps toward the
      given color, so the chevron reads as the foe's theme up close. */
  setSpectrum(t: number, hex: number): void {
    const k = Math.max(0, Math.min(1, t))
    const foe = new THREE.Color(hex)
    const bright = foe.clone().lerp(new THREE.Color(0xffffff), 0.35)
    for (const key of Object.keys(this.materials) as (keyof typeof AUTHENTIC)[]) {
      const target = key === 'arrow_blue' ? foe : bright
      this.materials[key].color.setHex(AUTHENTIC[key])
      this.materials[key].color.lerp(target, k)
    }
  }

  /** Guide toward a target point (re-read live every update — pass one
      long-lived Vector3 and mutate it). */
  setTarget(t: THREE.Vector3): void {
    this.target = t
  }

  clearTarget(): void {
    this.target = null
  }

  /** True once the mesh parsed — target tracking starts only then. */
  get loaded(): boolean {
    return this._loaded
  }

  /** Call each frame. SmoothLookAt (damping 6) toward the target, in
      camera-local space so the arrow stays glued to the top-center HUD slot. */
  update(delta: number): void {
    this._bob += delta
    // subtle authentic-style float (keep the configured y offset as the base)
    this._baseY ??= this.root.position.y
    this.root.position.y = this._baseY + Math.sin(this._bob * 2.2) * 0.008

    if (!this.target || !this._loaded) return

    // world position of target (live Object3D or static point)
    const wp = (this.target as THREE.Vector3).clone()

    // direction in CAMERA space (arrow is a child of the camera)
    const local = this.camera.worldToLocal(wp)
    if (local.lengthSq() < 1e-6) return
    local.normalize()

    // desired orientation: mesh +Z (the tip) points at the target
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), local)

    // frame-rate-independent damping (authentic damping = 6)
    const t = 1 - Math.exp(-this.damping * delta)
    this.spinner.quaternion.slerp(q, t)
  }

  dispose(): void {
    this.camera.remove(this.root)
    this.spinner.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose()
    })
    Object.values(this.materials).forEach((m) => m.dispose())
  }
}
