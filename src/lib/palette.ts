import type { RoomTag } from '../algorithms/types'

//---------------------------------------//
//  Palette                              //
//---------------------------------------//
// Holds colour values

export type Palette = {
  // UI
  background: string          // app background / canvas clear colour
  sidebarBackground: string
  border: string
  accent: string               // buttons, active states, highlighted values
  textPrimary: string
  textMuted: string

  // Hex renderer defaults
  hexFill: string
  hexOutline: string
  wallColour: string

  // Per-tag room colours (used once room-tag-aware rendering lands)
  roomTagColours: Record<RoomTag, string>
}

export const DEFAULT_PALETTE: Palette = {
  background: '#0f0d09',
  sidebarBackground: '#1a150e',
  border: '#3e352a',
  accent: '#e6880f',
  textPrimary: '#e2e8f0',
  textMuted: '#64748b',

  hexFill: '#302b25',
  hexOutline: '#eff1f3',
  wallColour: '#24211e',

  roomTagColours: {
    spawn: '#3ddcdc',
    exit: '#e69b39',
    large: '#999999',
    small: '#575757',
    event: '#dd4e4e',
    custom: '#ffffff',
  },
}

// Shallow clone so callers can freely mutate a working copy without touching DEFAULT_PALETTE.
export function clonePalette(palette: Palette = DEFAULT_PALETTE): Palette {
  return {
    ...palette,
    roomTagColours: { ...palette.roomTagColours },
  }
}