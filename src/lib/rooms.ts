import type { HexCoord, RoomTemplate, RoomInstance } from '../algorithms/types'
import {hexKey, hexNeighbour, hexDistance, rotateStructure } from '../algorithms/types'

//---------------------------------------//
//  Placement                            //
//---------------------------------------//

// Template --> World space @ given anchor + rotation
export function placeTemplate(template: RoomTemplate, anchor: HexCoord, rotation: number = 0): RoomInstance {
    const cells = rotateStructure(template.cells, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
    const entrances = rotateStructure(template.entrances, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
    return {
        templateId: template.id,
        tag: template.tag,
        anchor,
        rotation: ((rotation % 6) + 6) % 6,
        cells,
        entrances,
    }
}

// Checks if a set of cells overlap any already occupied cells
export function roomOverlaps(cells: HexCoord[], occupied: Set<string>): boolean {
    return cells.some(c => occupied.has(hexKey(c)))
}

// Marks a room's cells as occupied
export function occupyRoom(cells: HexCoord[], occupied: Set<string>): Set<string> {
    cells.forEach(c => occupied.add(hexKey(c)))
    return occupied
}

// Closest path from any cell of room A and any cell of room B
export function minRoomDistance(a: HexCoord[], b: HexCoord[]): number {
  let min = Infinity
  for (const ca of a) {
    for (const cb of b) {
      const d = hexDistance(ca, cb)
      if (d < min) min = d
    }
  }
  return min
}

// Try every rotation of a template at a given anchor
export function tryPlaceAtAnchor(
    template: RoomTemplate,
    anchor: HexCoord,
    occupied: Set<string>,
    rotations: number[] = [0, 1, 2, 3, 4, 5],
): RoomInstance | null {
    for (const rotation of rotations) {
        const instance = placeTemplate(template, anchor, rotation)
        if (!roomOverlaps(instance.cells, occupied)) return instance
    }
    return null
}


// Search expanding rings for first valid placement of a template
export function findValidPlacement(
  template: RoomTemplate,
  centre: HexCoord,
  occupied: Set<string>,
  searchRadius: number,
  rand: () => number,
): RoomInstance | null {
  const shuffle = <T,>(arr: T[]): T[] => arr.map(v => [rand(), v] as const).sort((a, b) => a[0] - b[0]).map(v => v[1])

  for (let ring = 0; ring <= searchRadius; ring++) {
    const candidates = shuffle(ringAnchors(centre, ring))
    for (const anchor of candidates) {
      const instance = tryPlaceAtAnchor(template, anchor, occupied, shuffle([0, 1, 2, 3, 4, 5]))
      if (instance) return instance
    }
  }
  return null
}

// All hex coordinates exactly {radius} steps from centre.
// radius 0 is just the centre itself.
function ringAnchors(centre: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [centre]
  const results: HexCoord[] = []
  let hex: HexCoord = { q: centre.q, r: centre.r }
  for (let i = 0; i < radius; i++) hex = hexNeighbour(hex, 4) // walk out NW to the ring's start
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push(hex)
      hex = hexNeighbour(hex, side)
    }
  }
  return results
}

//---------------------------------------//
//  Selection                            //
//---------------------------------------//

// Weighted random pick from a pool of templates, skipping any @ maxCount.
export function pickWeightedTemplate(
  pool: RoomTemplate[],
  placedCounts: Record<string, number>,
  rand: () => number,
): RoomTemplate | null {
  const eligible = pool.filter(t => t.maxCount === undefined || (placedCounts[t.id] ?? 0) < t.maxCount)
  const totalWeight = eligible.reduce((sum, t) => sum + (t.weight ?? 1), 0)
  if (eligible.length === 0 || totalWeight <= 0) return null

  let roll = rand() * totalWeight
  for (const t of eligible) {
    roll -= t.weight ?? 1
    if (roll <= 0) return t
  }
  return eligible[eligible.length - 1]
}