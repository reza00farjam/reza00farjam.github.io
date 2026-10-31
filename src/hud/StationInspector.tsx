import React from 'react'
import { stations } from '../data/stations'
import { stationRegistry } from '../stations/registry'
import { TerminalDialog } from './TerminalDialog'

interface StationInspectorProps {
  stationId: string | null
  onClose: () => void
  isMobile: boolean
}

export const StationInspector: React.FC<StationInspectorProps> = ({
  stationId,
  onClose,
  isMobile,
}) => {
  const station = stations.find((s) => s.id === stationId)
  if (!station) return null

  const StationComponent = stationRegistry[station.kind]
  if (!StationComponent) return null

  return (
    <TerminalDialog
      title={station.title}
      onClose={onClose}
      isMobile={isMobile}
      refreshKey={station.id}
    >
      <StationComponent station={station} isSimpleView={true} isDialog={true} />
    </TerminalDialog>
  )
}
