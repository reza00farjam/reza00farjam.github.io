import React, { useState, useEffect, useMemo } from 'react'
import { getSpatialStations, ARENA_HALF_SIZE, SpatialStation } from '../lib/arena'
import { CycleState } from '../lib/cyclePhysics'
import type { TrailRibbon } from '../ride/Trail'
import { useBattleStore } from '../lib/battleStore'
import { remoteRefs } from '../lib/battleNet'

interface RadarProps {
  cycleStateRef: React.MutableRefObject<CycleState>
  /** Live arena trail ribbons (boost-only) — mirrored on the map while they exist */
  ribbonsRef: React.MutableRefObject<TrailRibbon[]>
  onSelectStation: (stationId: string) => void
  /** Mobile/tablet: smaller map (JS-driven so tablets match the mobile HUD) */
  isMobile?: boolean
  className?: string
  /** Grid Battle arena: stations are hidden from the map */
  battle?: boolean
  /** Foe blip / ribbons / canisters only once a challenger actually linked */
  showFoe?: boolean
}

interface MapPoint {
  x: number
  z: number
}

const MAP_STEP = 2 // arena units between map samples — finer detail is sub-pixel at map scale

export const Radar: React.FC<RadarProps> = ({
  cycleStateRef,
  ribbonsRef,
  onSelectStation,
  isMobile = false,
  className = '',
  battle = false,
  showFoe = false,
}) => {
  const stationsList = useMemo(() => getSpatialStations(), [])
  // Battle colors are instance-based: every rider rides cyan and sees the foe
  // orange — identical on both screens (no role theming anywhere)
  const myColor = '#35e4ff'
  const foeColor = '#ff8a1f'
  const [radarState, setRadarState] = useState({
    x: 0,
    z: 0,
    yaw: 0,
    ribbons: [] as MapPoint[][],
    foe: null as (MapPoint & { yaw: number }) | null,
    foeRibbons: [] as MapPoint[][],
    boosters: [] as MapPoint[],
  })

  // Update radar position smoothly on animation frame
  useEffect(() => {
    let animId: number
    // Cheap change fingerprint: a parked bike with settled ribbons skips the
    // decimate work and the React re-render entirely (the old per-frame sig
    // string built garbage every frame even while idle)
    let lastFp = NaN
    const qp = (v: number) => Math.round(v * 20) // 0.05u — sub-pixel at map scale
    const qy = (v: number) => Math.round(v * 100) // 0.01rad heading steps
    const ribbonFp = (fp: number, source: TrailRibbon[]): number => {
      fp = (fp * 31 + source.length) | 0
      for (const r of source) {
        const n = r.points.length
        fp = (fp * 31 + n) | 0
        if (n > 0) {
          fp = (fp * 31 + qp(r.points[n - 1].x) + qp(r.points[n - 1].z)) | 0
        }
      }
      return fp
    }
    const update = () => {
      const c = cycleStateRef.current
      let fp = (qp(c.x) * 7 + qp(c.z) * 13 + qy(c.yaw) * 17) | 0
      fp = ribbonFp(fp, ribbonsRef.current)
      if (battle && showFoe) {
        const r = remoteRefs.cycle.current
        fp = (fp * 31 + qp(r.x) + qp(r.z) + qy(r.yaw)) | 0
        fp = ribbonFp(fp, remoteRefs.ribbons.current)
        let live = 0
        for (const b of useBattleStore.getState().boosters) if (!b.taken) live++
        fp = (fp * 31 + live) | 0
      }

      if (fp !== lastFp) {
        lastFp = fp

        const decimate = (source: TrailRibbon[]): MapPoint[][] => {
          const snap: MapPoint[][] = []
          for (const ribbon of source) {
            const pts = ribbon.points
            if (pts.length < 2) continue
            const line: MapPoint[] = []
            for (let i = 0; i < pts.length; i++) {
              const p = pts[i]
              const lastAdded = line[line.length - 1]
              if (
                i === 0 ||
                i === pts.length - 1 ||
                Math.hypot(p.x - lastAdded.x, p.z - lastAdded.z) >= MAP_STEP
              ) {
                line.push({ x: p.x, z: p.z })
              }
            }
            if (line.length >= 2) snap.push(line)
          }
          return snap
        }

        // Mirror the live arena ribbons (decimated for map scale)
        const snapshot = decimate(ribbonsRef.current)

        let foe: (MapPoint & { yaw: number }) | null = null
        let foeRibbons: MapPoint[][] = []
        let boosters: MapPoint[] = []
        if (battle && showFoe) {
          const r = remoteRefs.cycle.current
          foe = { x: r.x, z: r.z, yaw: r.yaw }
          foeRibbons = decimate(remoteRefs.ribbons.current)
          boosters = useBattleStore
            .getState()
            .boosters.filter((b) => !b.taken)
            .map((b) => ({ x: b.x, z: b.z }))
        }

        setRadarState({
          x: c.x,
          z: c.z,
          yaw: c.yaw,
          ribbons: snapshot,
          foe,
          foeRibbons,
          boosters,
        })
      }
      animId = requestAnimationFrame(update)
    }
    animId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animId)
  }, [cycleStateRef, ribbonsRef, battle, showFoe])

  const size = 150
  const half = size / 2
  const scale = (half - 12) / ARENA_HALF_SIZE

  // Cycle position in radar coordinates
  const cycleRadarX = half + radarState.x * scale
  const cycleRadarY = half + radarState.z * scale // z maps to Y on 2D map

  // Heading direction (-sin, -cos matches the arena's yaw convention):
  // rotate a tip-forward triangle so its point shows the current direction
  const headingAngleDeg =
    (Math.atan2(-Math.cos(radarState.yaw), -Math.sin(radarState.yaw)) * 180) / Math.PI

  return (
    <div
      aria-label="Grid Arena Radar"
      className={`group relative ${
        isMobile ? 'w-[110px] h-[110px]' : 'w-[150px] h-[150px]'
      } bg-deep/25 border border-cyan/40 shadow-[0_0_15px_rgba(53,228,255,0.15)] backdrop-blur-md tron-panel-clip select-none pointer-events-auto cursor-default transition-[background-color] duration-200 hover:bg-deep/85 ${className}`}
    >
      <span className="corner-tick-tl" aria-hidden="true" />
      <span className="corner-tick-br" aria-hidden="true" />

      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full overflow-visible opacity-60 transition-opacity duration-200 group-hover:opacity-100"
      >
        {/* Arena boundary outline */}
        <rect
          x={half - ARENA_HALF_SIZE * scale}
          y={half - ARENA_HALF_SIZE * scale}
          width={ARENA_HALF_SIZE * 2 * scale}
          height={ARENA_HALF_SIZE * 2 * scale}
          fill="none"
          stroke={myColor}
          strokeWidth="1"
          strokeDasharray="2,2"
          strokeOpacity="0.4"
        />

        {/* Concentric radar rings */}
        <circle
          cx={half}
          cy={half}
          r={half * 0.4}
          fill="none"
          stroke={myColor}
          strokeWidth="0.5"
          strokeOpacity="0.2"
        />
        <circle
          cx={half}
          cy={half}
          r={half * 0.8}
          fill="none"
          stroke={myColor}
          strokeWidth="0.5"
          strokeOpacity="0.2"
        />

        {/* Crosshairs */}
        <line
          x1={half}
          y1={6}
          x2={half}
          y2={size - 6}
          stroke={myColor}
          strokeWidth="0.5"
          strokeOpacity="0.2"
        />
        <line
          x1={6}
          y1={half}
          x2={size - 6}
          y2={half}
          stroke={myColor}
          strokeWidth="0.5"
          strokeOpacity="0.2"
        />

        {/* Station Markers (hidden during a Grid Battle) */}
        {!battle &&
          stationsList.map((st: SpatialStation) => {
            const sx = half + st.x * scale
            const sy = half + st.z * scale
            const isNearest = Math.hypot(radarState.x - st.x, radarState.z - st.z) < 25

            return (
              <g
                key={st.id}
                onClick={() => onSelectStation(st.id)}
                className="cursor-pointer group"
              >
                <circle
                  cx={sx}
                  cy={sy}
                  r={isNearest ? 4.5 : 3.5}
                  fill={isNearest ? '#eafcff' : '#35e4ff'}
                  stroke="#03070d"
                  strokeWidth="1"
                />
                <text
                  x={sx}
                  y={sy - 6}
                  fill={isNearest ? '#eafcff' : '#6e95a8'}
                  fontSize="7.5"
                  fontFamily="Saira, sans-serif"
                  textAnchor="middle"
                  className="select-none pointer-events-none uppercase font-semibold"
                >
                  {st.title}
                </text>
              </g>
            )
          })}

        {/* Live boost-trail mirror: only while the arena ribbon exists.
            Brighter toward the head (at the bike), fading toward the tail —
            same along-length fade as the arena shader. Colored to the rider's
            own battle theme. */}
        {radarState.ribbons.map((line, ri) =>
          line.slice(1).map((p, j) => {
            const prevP = line[j]
            const denom = Math.max(1, line.length - 2)
            const opacity = 0.65 * (1 - 0.8 * ((line.length - 2 - j) / denom))
            return (
              <line
                key={`${ri}-${j}`}
                x1={half + prevP.x * scale}
                y1={half + prevP.z * scale}
                x2={half + p.x * scale}
                y2={half + p.z * scale}
                stroke={myColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeOpacity={opacity}
              />
            )
          }),
        )}

        {/* Grid Battle: foe ribbons, booster canisters, foe blip — only once
            the challenger actually linked (nothing while awaiting them) */}
        {battle && showFoe && (
          <>
            {radarState.foeRibbons.map((line, ri) =>
              line.slice(1).map((p, j) => {
                const prevP = line[j]
                return (
                  <line
                    key={`foe-${ri}-${j}`}
                    x1={half + prevP.x * scale}
                    y1={half + prevP.z * scale}
                    x2={half + p.x * scale}
                    y2={half + p.z * scale}
                    stroke={foeColor}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeOpacity="0.7"
                  />
                )
              }),
            )}
            {radarState.boosters.map((b, i) => (
              <rect
                key={`booster-${i}`}
                x={half + b.x * scale - 2}
                y={half + b.z * scale - 2}
                width="4"
                height="4"
                fill="#eafcff"
                opacity="0.9"
              />
            ))}
            {radarState.foe &&
              (() => {
                const fx = half + radarState.foe.x * scale
                const fy = half + radarState.foe.z * scale
                const deg =
                  (Math.atan2(-Math.cos(radarState.foe.yaw), -Math.sin(radarState.foe.yaw)) * 180) /
                  Math.PI
                return (
                  <g transform={`translate(${fx} ${fy}) rotate(${deg})`}>
                    <path
                      d="M 8 0 L -5 4.5 L -5 -4.5 Z"
                      fill={foeColor}
                      stroke="#03070d"
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })()}
          </>
        )}

        {/* Cycle position: direction arrow, tip pointing along heading (the
            rider's battle theme outside duels is plain cyan) */}
        <g transform={`translate(${cycleRadarX} ${cycleRadarY}) rotate(${headingAngleDeg})`}>
          <path
            d="M 8 0 L -5 4.5 L -5 -4.5 Z"
            fill={myColor}
            stroke="#eafcff"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}
