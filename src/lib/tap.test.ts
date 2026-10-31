import { describe, expect, it } from 'vitest'
import { isTapGesture } from './tap'

describe('isTapGesture', () => {
  it('accepts stationary short presses', () => {
    expect(isTapGesture(0, 0, 0)).toBe(true)
    expect(isTapGesture(6, 8, 400)).toBe(true) // 10px diagonal at the slop edge
  })

  it('rejects scroll drags and long presses', () => {
    expect(isTapGesture(11, 0, 100)).toBe(false) // past the 10px slop
    expect(isTapGesture(0, 0, 501)).toBe(false) // past the 500ms window
  })
})
