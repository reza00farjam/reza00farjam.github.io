import { create } from 'zustand'

export type ViewMode = 'ride' | 'simple'
export type QualityTier = 1 | 2 | 3 | 4

function getInitialMode(): ViewMode {
  if (typeof window === 'undefined') return 'simple'

  // URL parameter check (?mode=simple or ?view=simple)
  try {
    const params = new URLSearchParams(window.location.search)
    const urlMode = params.get('mode') || params.get('view')
    if (urlMode === 'simple' || urlMode === 'ride') {
      return urlMode
    }
  } catch {
    // ignore URL parsing error
  }

  try {
    const stored = window.localStorage.getItem('grid-mode')
    if (stored === 'ride' || stored === 'simple') {
      return stored
    }
  } catch {
    // localStorage may be disabled
  }

  // prefers-reduced-motion check
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'simple'
  }

  // WebGL availability check
  try {
    const canvas = document.createElement('canvas')
    const hasGL = !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
    if (!hasGL) return 'simple'
  } catch {
    return 'simple'
  }

  // First visit default: Read view (visitors can switch to Ride and their
  // choice persists via localStorage)
  return 'simple'
}

interface AppState {
  mode: ViewMode
  setMode: (mode: ViewMode) => void
  activeStationId: string | null
  setActiveStationId: (id: string | null) => void
  activeSubIndex: number
  setActiveSubIndex: (idx: number) => void
  scrollProgress: number
  setScrollProgress: (progress: number) => void
  targetProgress: number | null
  setTargetProgress: (target: number | null) => void
  isJumping: boolean
  setIsJumping: (jumping: boolean) => void
  qualityTier: QualityTier
  setQualityTier: (tier: QualityTier) => void
  isMuted: boolean
  setIsMuted: (muted: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  mode: getInitialMode(),
  setMode: (mode) => {
    try {
      window.localStorage.setItem('grid-mode', mode)
    } catch {
      // ignore storage error
    }
    set({ mode })
  },
  activeStationId: 'intro',
  setActiveStationId: (activeStationId) => set({ activeStationId }),
  activeSubIndex: 0,
  setActiveSubIndex: (activeSubIndex) => set({ activeSubIndex }),
  scrollProgress: 0,
  setScrollProgress: (scrollProgress) => set({ scrollProgress }),
  targetProgress: null,
  setTargetProgress: (targetProgress) => set({ targetProgress }),
  isJumping: false,
  setIsJumping: (isJumping) => set({ isJumping }),
  qualityTier: 1,
  setQualityTier: (qualityTier) => set({ qualityTier }),
  isMuted:
    typeof window !== 'undefined'
      ? window.localStorage.getItem('grid-sound-muted') === 'true'
      : false,
  setIsMuted: (isMuted) => {
    try {
      window.localStorage.setItem('grid-sound-muted', String(isMuted))
    } catch {
      // ignore
    }
    set({ isMuted })
  },
}))

// Dev-only handle for headless verification (same pattern as __battleStore):
// lets test scripts pin qualityTier so PerformanceMonitor can't flip the view
if (import.meta.env.DEV) {
  ;(window as unknown as { __appStore?: typeof useAppStore }).__appStore = useAppStore
}
