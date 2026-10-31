import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

// Parsed-vehicle cache: a duel mounts TWO bikes (plus StrictMode double-mounts
// in dev) and parsing the 4.4MB OBJ is a 300-600ms main-thread hitch each time.
// The proto parses once per page; consumers clone it (Object3D.clone shares
// geometry buffers; materials are assigned per variant after clone).
let vehicleProtoPromise: Promise<THREE.Group> | null = null
export function loadVehicleProto(objUrl: string): Promise<THREE.Group> {
  vehicleProtoPromise ??= (async () => {
    const loader = new OBJLoader()
    if ('DecompressionStream' in window) {
      try {
        const r = await fetch(`${objUrl}.gz`)
        if (!r.ok) throw new Error(`obj.gz ${r.status}`)
        // A server that marks the reply Content-Encoding: gzip (Vite dev,
        // some CDNs) has already decompressed it in transit — decompressing
        // again would corrupt; raw .gz replies go through the stdlib stream
        const text =
          r.headers.get('content-encoding') === 'gzip'
            ? await r.text()
            : await new Response(r.body!.pipeThrough(new DecompressionStream('gzip'))).text()
        return loader.parse(text)
      } catch {
        // gz path failed (missing file / dead stream) — raw OBJ fallback
      }
    }
    return await new Promise<THREE.Group>((resolve, reject) =>
      loader.load(objUrl, resolve, undefined, reject),
    )
  })()
  return vehicleProtoPromise
}

// Read-view background warm (called by App when the visitor is idle in Read
// mode): fetch + parse the proto ONCE — this shares the exact module cache
// the mount path uses, so the ride entry skips the 300-600ms parse hitch —
// and pull the player texture set into the HTTP cache (the mounted
// TextureLoader then re-fetches from cache: near-zero transfer). Fire and
// forget; failures fall back to the normal mount-time load paths.
export function warmVehicle(): void {
  const base = import.meta.env.BASE_URL
  void loadVehicleProto(`${base}models/light_cycle_with_rider.obj`)
  const textures = [
    'LightCycleSam_color_BLUE_dark_73.jpg',
    'sam_color_BLUE_dark_46.jpg',
    'sam_normals_02_js_165.png',
    'disc_color_sam_blueDark_36.png',
  ]
  for (const f of textures) {
    // Drain the body so the transfer completes and the HTTP cache keeps it
    void fetch(`${base}models/textures/${f}`)
      .then((r) => r.blob())
      .catch(() => {})
  }
}
