// Bike-model load state, read by RideScene's quality warm-up gate and
// RideView's cold-entry veil: the OBJ parse + texture upload + PBR/bloom
// shader compile land as multi-hundred-ms hitches in the first seconds,
// which neither the PerformanceMonitor (it read them as sustained GPU
// weakness and demoted healthy machines to tier 2 before the first ride)
// nor the visitor (a visibly chopped scene) should experience raw.
// Module-level: the proto parses once per page, so this flips at most once
// regardless of how often bikes mount.
export const vehicleStatus = {
  /** performance.now() when the parsed bike was first attached to the scene */
  builtAt: 0,
  /** Player texture maps finished loading (success OR error — a dead network
      must not lock the veil forever). Expected: VEHICLE_MAP_COUNT. */
  mapsLoaded: 0,
  /** performance.now() when the quality ladder armed + resolution prime was
      applied — the veil stays up through this so the prime's buffer-resize
      hitch stays hidden too */
  ladderArmedAt: 0,
}

/** The player's texture set the veil waits on (bike, rider, rider normals, disc) */
export const VEHICLE_MAP_COUNT = 4
