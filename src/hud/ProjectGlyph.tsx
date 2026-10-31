import React from 'react'

interface ProjectGlyphProps {
  id: string
  className?: string
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export const ProjectGlyph: React.FC<ProjectGlyphProps> = ({ id, className = '' }) => {
  const hash = hashString(id)

  const vpX = 160
  const vpY = 25
  const horizonY = 35

  const hLines = [45, 65, 95, 135, 175]
  const brightHIndex = hash % hLines.length

  const vEndPoints = [20, 60, 100, 140, 180, 220, 260, 300]
  const brightVIndex = (hash >> 3) % vEndPoints.length

  // Deterministic node placement at an intersection
  const nodeLineY = hLines[(hash >> 2) % hLines.length]
  const nodeEnd = vEndPoints[(hash >> 4) % vEndPoints.length]
  const t = (nodeLineY - vpY) / (180 - vpY)
  const nodeX = vpX + (nodeEnd - vpX) * t

  return (
    <svg
      viewBox="0 0 320 180"
      className={`w-full aspect-video bg-deep/50 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="320" height="180" fill="#071a2b" fillOpacity="0.6" />
      {/* Horizon line */}
      <line
        x1="0"
        y1={horizonY}
        x2="320"
        y2={horizonY}
        stroke="#35e4ff"
        strokeOpacity="0.25"
        strokeWidth="1"
      />

      {/* Perspective vertical grid lines */}
      {vEndPoints.map((x, idx) => {
        const isBright = idx === brightVIndex
        return (
          <line
            key={`v-${idx}`}
            x1={vpX}
            y1={vpY}
            x2={x}
            y2="180"
            stroke="#35e4ff"
            strokeOpacity={isBright ? 0.8 : 0.25}
            strokeWidth={isBright ? 1.5 : 1}
          />
        )
      })}

      {/* Perspective horizontal lines */}
      {hLines.map((y, idx) => {
        const isBright = idx === brightHIndex
        return (
          <line
            key={`h-${idx}`}
            x1="0"
            y1={y}
            x2="320"
            y2={y}
            stroke="#35e4ff"
            strokeOpacity={isBright ? 0.8 : 0.25}
            strokeWidth={isBright ? 1.5 : 1}
          />
        )
      })}

      {/* Grid intersection node */}
      <circle cx={nodeX} cy={nodeLineY} r="4" fill="#eafcff" stroke="#35e4ff" strokeWidth="1.5" />
      <circle cx={nodeX} cy={nodeLineY} r="8" fill="none" stroke="#35e4ff" strokeOpacity="0.4" />
    </svg>
  )
}
