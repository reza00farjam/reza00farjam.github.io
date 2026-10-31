import React from 'react'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { useAppStore } from '../lib/store'

export const Effects: React.FC = () => {
  const qualityTier = useAppStore((s) => s.qualityTier)

  // Tier 1 only: bloom IS the Tron look. At tier 2+ the composer unmounts
  // entirely — a composer with just a vignette still pays the fullscreen
  // render-target chain every frame (the #1 mobile heat source after bloom).
  // RideView paints an equivalent CSS vignette overlay for those tiers.
  if (qualityTier !== 1) return null

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.2}
        mipmapBlur
        radius={0.7}
      />
      <Vignette eskil={false} offset={0.3} darkness={0.6} />
    </EffectComposer>
  )
}
