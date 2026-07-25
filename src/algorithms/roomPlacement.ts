import { hexKey, hexDistance, hexNeighbour, hexNeighbours, rotateStructure, rotateEdges } from './types'
import type { HexCoord, HexEdge, RoomTemplate, RoomInstance } from './types'
import { randInt } from '../lib/rng'

//---------------------------------------//
//  Stage 1: Prefab Room Placement       //
//---------------------------------------//
// Guaranteed rooms (spawn, exit, event) always placed.
// Non-guaranteed rooms placed according to their min/max.

export const ANCHOR: HexCoord = { q: 0, r: 0 }

const GUARANTEED_TEMPLATES: RoomTemplate[] = [
  {
    id: 'spawn-cell',
    name: 'Spawn Cell',
    tag: 'spawn',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ cell: { q: 0, r: 0 }, direction: 0 }],
    guaranteed: true,
  },
  {
    id: 'exit-cell',
    name: 'Exit Cell',
    tag: 'exit',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ cell: { q: 0, r: 0 }, direction: 0 }],
    guaranteed: true,
  },
  {
    id: 'gambler-cell',
    name: 'Gambler Cell',
    tag: 'event',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ cell: { q: 0, r: 0 }, direction: 0 }],
    guaranteed: true,
  },
]

// Rotates and translates a room template (cells & edges) into world-space
export function placeTemplate(template: RoomTemplate, anchor: HexCoord, rotation: number): RoomInstance {
  const cells = rotateStructure(template.cells, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
  const entrances = rotateEdges(template.entrances, rotation).map(e => ({
    cell: { q: e.cell.q + anchor.q, r: e.cell.r + anchor.r },
    direction: e.direction,
  }))
  return { templateId: template.id, tag: template.tag, anchor, rotation, cells, entrances }
}

// Check for overlaps in a set of cells
export function overlaps(cells: HexCoord[], occupied: Set<string>): boolean {
  return cells.some(c => occupied.has(hexKey(c)))
}

// Check if cell is adjacent to an already occupied cell.
export function adjacentToOccupied(cells: HexCoord[], occupied: Set<string>): boolean {
  const ownKeys = new Set(cells.map(hexKey))
  return cells.some(c =>
    hexNeighbours(c).some(n => {
      const k = hexKey(n)
      return !ownKeys.has(k) && occupied.has(k)
    })
  )
}

// Pick a random anchor coordinate within a given 'spread'
function randomAnchor(rand: () => number, spread: number): HexCoord {
  return { q: randInt(rand, -spread, spread), r: randInt(rand, -spread, spread) }
}

// Distance from the origin to a room's nearest cell.
//-----------------------------------------------------------------------
// 'spread' bounds a room's nearest cell, not its anchor point
function closestCellDistance(cells: HexCoord[]): number {
  return Math.min(...cells.map(c => hexDistance(ANCHOR, c)))
}

// How far a template's own cells reach from its local {0,0} anchor.
//-----------------------------------------------------------------------
// Used to widen the anchor-sampling range so placements near the edge
// of 'spread' are still reachable after accounting for room size.
function templateExtent(template: RoomTemplate): number {
  return Math.max(0, ...template.cells.map(c => hexDistance(ANCHOR, c)))
}

// Try to place a template at a random anchor within 'spread'
// (measured from the room's closest cell, not the anchor)
export function tryPlaceAtRandom(
  template: RoomTemplate,
  spread: number,
  rand: () => number,
  occupied: Set<string>,
  attempts = 100
): RoomInstance | null {
  const samplingRange = spread + templateExtent(template)
  for (let i = 0; i < attempts; i++) {
    const anchor = randomAnchor(rand, samplingRange)
    const rotation = randInt(rand, 0, 5)
    const instance = placeTemplate(template, anchor, rotation)
    if (
      closestCellDistance(instance.cells) <= spread &&
      !overlaps(instance.cells, occupied) &&
      !adjacentToOccupied(instance.cells, occupied)
    ) {
      return instance
    }
  }
  return null
}

// Weighted random pick among templates competing for the same optional slot.
export function pickWeighted(templates: RoomTemplate[], rand: () => number): RoomTemplate | null {
  if (templates.length === 0) return null
  const totalWeight = templates.reduce((sum, t) => sum + (t.weight ?? 1), 0)
  if (totalWeight <= 0) return templates[0]
  let roll = rand() * totalWeight
  for (const t of templates) {
    roll -= t.weight ?? 1
    if (roll <= 0) return t
  }
  return templates[templates.length - 1]
}


// Drop any entrance whose facing neighbour is occupied by a different room.
// adjacentToOccupied should prevent this, but this pass is the defensive backstop.
// If every declared entrance on a room turns out smothered, fall back to scanning the room's own cells.
export function resolveUsableEntrances(
  rooms: { cells: HexCoord[]; entrances?: HexEdge[] }[],
  occupied: Set<string>
): void {
  for (const room of rooms) {
    const ownKeys = new Set(room.cells.map(hexKey))
    const facesOpenSpace = (edge: HexEdge) => {
      const neighbourKey = hexKey(hexNeighbour(edge.cell, edge.direction))
      return !ownKeys.has(neighbourKey) && !occupied.has(neighbourKey)
    }

    const usable = (room.entrances ?? []).filter(facesOpenSpace)
    if (usable.length > 0) {
      room.entrances = usable
      continue
    }

    // Every declared entrance is smothered -- find any cell edge that actually faces
    // open space instead of leaving the room with no usable entrance at all.
    const fallback: HexEdge[] = []
    findOpenEdge:
    for (const cell of room.cells) {
      for (let direction = 0; direction < 6; direction++) {
        const edge: HexEdge = { cell, direction }
        if (facesOpenSpace(edge)) {
          fallback.push(edge)
          break findOpenEdge
        }
      }
    }
    room.entrances = fallback // stays empty only if the room is fully enclosed on every side
  }
}

// Merges built-in guaranteed rooms w/ user-authored guaranteed templates.
export function resolveTemplates(customTemplates: RoomTemplate[] = []): RoomTemplate[] {
  const merged = new Map<string, RoomTemplate>()
  for (const t of GUARANTEED_TEMPLATES) merged.set(t.id, t)
  for (const t of customTemplates) {
    if (t.guaranteed) merged.set(t.id, t)
  }
  return Array.from(merged.values()).sort((a, b) => {
    if (a.tag === 'spawn' && b.tag !== 'spawn') return -1
    if (b.tag === 'spawn' && a.tag !== 'spawn') return 1
    return 0
  })
}