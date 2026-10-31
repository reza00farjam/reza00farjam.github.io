export function getHashStationId(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '').trim()
  if (hash.length === 0 || hash.startsWith('b=')) return null
  return hash
}

/** #b=<peerId> — the Grid Battle invite link fragment (kept minimal: the
    whole link is typed/read by humans on phones). */
export function getBattleIdFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const m = window.location.hash.match(/^#b=([a-z0-9-]+)$/i)
  return m ? m[1] : null
}

export function setBattleHash(battleId: string): void {
  if (typeof window === 'undefined') return
  lastReportedHash = `b=${battleId}`
  const newHash = `#b=${battleId}`
  if (window.location.hash !== newHash) {
    try {
      window.history.replaceState(null, '', newHash)
    } catch {
      window.location.hash = newHash
    }
  }
}

let lastReportedHash = ''

/** #battle — the battle-alley fragment (set while the rider is inside the
    alley; distinct from #b=<id> invite links). The alley poll is its sole
    writer, so it never clobbers an invite link or a station fragment. */
export function updateAlleyHash(inside: boolean) {
  if (typeof window === 'undefined') return
  if (getBattleIdFromHash()) return
  const h = window.location.hash
  if (inside ? h === '#battle' : h !== '#battle') return
  lastReportedHash = ''
  try {
    window.history.replaceState(
      null,
      '',
      inside ? '#battle' : window.location.pathname + window.location.search,
    )
  } catch {
    window.location.hash = inside ? '#battle' : ''
  }
}

/** Clear the fragment when the rider leaves a station space — but never
    touch #b= invite links (the challenge screen owns them) or #battle (the
    alley poll owns it). */
export function clearStationHash() {
  if (typeof window === 'undefined') return
  if (getBattleIdFromHash() || window.location.hash === '#battle') return
  clearUrlHash()
}

/** Strip the fragment entirely — the intro station is represented by a
    fragment-less URL (top of the page in read view, intro terminal in ride).
    Clears ANY hash, including one this page never set (a joiner's dead
    #battle= link must not survive an error). */
export function clearUrlHash() {
  if (typeof window === 'undefined') return
  lastReportedHash = ''

  if (window.location.hash !== '') {
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch {
      window.location.hash = ''
    }
  }
}

export function updateUrlHash(stationId: string) {
  if (typeof window === 'undefined') return
  // Intro never appears in the URL — no fragment means intro
  if (stationId === 'intro') {
    clearUrlHash()
    return
  }
  if (lastReportedHash === stationId) return
  lastReportedHash = stationId

  const newHash = `#${stationId}`
  if (window.location.hash !== newHash) {
    try {
      window.history.replaceState(null, '', newHash)
    } catch {
      window.location.hash = newHash
    }
  }
}
