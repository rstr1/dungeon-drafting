import { hexKey, hexDistance, rotateStructure, rotateEdges } from './types'
import type { Algorithm, DungeonMap, HexCoord, HexEdge, RoomTag, RoomTemplate, RoomInstance } from './types'
import { rng, randInt } from '../lib/rng'

//---------------------------------------//
//  Stage 0: Universal Constants         //
//---------------------------------------//
const ANCHOR: HexCoord = { q: 0, r: 0 }

// Dungeon Verticality
const SECOND_FLOOR_POINT = 10
const THIRD_FLOOR_POINT = 20


//---------------------------------------//
//  Stage 1: Prefab Room Placement       //
//---------------------------------------//
// Guaranteed rooms (spawn, exit, event) always placed.
// Non-guaranteed rooms placed according to their min/max.

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
function placeTemplate(template: RoomTemplate, anchor: HexCoord, rotation: number): RoomInstance {
  const cells = rotateStructure(template.cells, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
  const entrances = rotateEdges(template.entrances, rotation).map(e => ({
    cell: { q: e.cell.q + anchor.q, r: e.cell.r + anchor.r },
    direction: e.direction,
  }))
  return { templateId: template.id, tag: template.tag, anchor, rotation, cells, entrances }
}

// Check for overlaps in a set of cells
function overlaps(cells: HexCoord[], occupied: Set<string>): boolean {
  return cells.some(c => occupied.has(hexKey(c)))
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
function tryPlaceAtRandom(
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
    if (closestCellDistance(instance.cells) <= spread && !overlaps(instance.cells, occupied)) {
      return instance
    }
  }
  return null
}

// Weighted random pick among templates competing for the same optional slot.
function pickWeighted(templates: RoomTemplate[], rand: () => number): RoomTemplate | null {
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

// Merges built-in guaranteed rooms w/ user-authored guaranteed templates.
function resolveTemplates(customTemplates: RoomTemplate[] = []): RoomTemplate[] {
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

// Number of levels this floor gets, based on forced thresholds.
function resolveNumLevels(floorNumber: number): number {
  if (floorNumber > THIRD_FLOOR_POINT) return 3
  if (floorNumber > SECOND_FLOOR_POINT) return 2
  return 1
}

//---------------------------------------//
//  Generate                             //
//---------------------------------------//
// Places guaranted rooms --> fills in optional rooms up to target count
// Returns --> DungeonMap object
function generate(params: Record<string, number | boolean>, customTemplates: RoomTemplate[] = []): DungeonMap {
  const seed = params['seed'] as number
  const spread = params['roomSpread'] as number
  const floorNumber = params['floorNumber'] as number
  const baseRoomCount = params['baseRoomCount'] as number
  const roomsPerFloor = params['roomsPerFloor'] as number

  const rand = rng(seed)

  const optionalRoomCount = baseRoomCount + roomsPerFloor * floorNumber
  const numLevels = resolveNumLevels(floorNumber)

  const occupied = new Set<string>()
  const rooms: { id: string; tag?: RoomTag; cells: HexCoord[]; entrances?: HexEdge[] }[] = []

  for (const template of resolveTemplates(customTemplates)) {
    let placed: RoomInstance | null = null

    if (template.tag === 'spawn') {
      // Spawn always sits at the world origin, unrotated.
      const instance = placeTemplate(template, ANCHOR, 0)
      if (!overlaps(instance.cells, occupied)) placed = instance
    } else {
      placed = tryPlaceAtRandom(template, spread, rand, occupied)
    }

    if (placed) {
      placed.cells.forEach(c => occupied.add(hexKey(c)))
      rooms.push({ id: placed.templateId, tag: placed.tag, cells: placed.cells, entrances: placed.entrances })
    }
  }

  // Optional (non-guaranteed) rooms.
  const optionalTemplates = customTemplates.filter(t => !t.guaranteed)
  if (optionalTemplates.length > 0) {
    const placedCounts = new Map<string, number>()
    let totalPlaced = 0
    const MAX_CONSECUTIVE_FAILURES = 40

    function placeOne(template: RoomTemplate): boolean {
      const instance = tryPlaceAtRandom(template, spread, rand, occupied, 50)
      if (!instance) return false
      instance.cells.forEach(c => occupied.add(hexKey(c)))
      rooms.push({ id: instance.templateId, tag: instance.tag, cells: instance.cells, entrances: instance.entrances })
      placedCounts.set(template.id, (placedCounts.get(template.id) ?? 0) + 1)
      totalPlaced++
      return true
    }

    // Pass 1
    //-----------------------------------------------------------------------
    // Enforce minCount first --> bypassing room count
    for (const template of optionalTemplates) {
      const min = Math.min(template.minCount ?? 0, template.maxCount ?? Infinity)
      for (let i = 0; i < min; i++) {
        placeOne(template)
      }
    }

    // Pass 2
    //-----------------------------------------------------------------------
    // Fill the rest of the room count --> optional rooms up to their maxCount
    let consecutiveFailures = 0
    while (totalPlaced < optionalRoomCount && consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
      const available = optionalTemplates.filter(
        t => (placedCounts.get(t.id) ?? 0) < (t.maxCount ?? Infinity)
      )
      if (available.length === 0) break

      const template = pickWeighted(available, rand)
      if (!template) break

      if (placeOne(template)) {
        consecutiveFailures = 0
      } else {
        consecutiveFailures++
      }
    }
  }

  return {
    cells: occupied,
    metadata: { rooms, optionalRoomCount, numLevels },
  }
}

//---------------------------------------//
//  Algorithm Definition                 //
//---------------------------------------//
export const billyGen: Algorithm = {
  id: 'billy-gen',
  name: 'BillyGen',
  description: 'Prefabbed rooms + carved caverns/corridors + multi-level',
  params: [
    {
      key: 'floorNumber',
      label: 'Floor Number',
      type: 'number',
      min: 0,
      max: 50,
      step: 1,
      default: 0,
    },
    {
      key: 'baseRoomCount',
      label: 'Prefab Room Count',
      type: 'number',
      min: 0,
      max: 50,
      step: 1,
      default: 6,
    },
    {
      key: 'roomsPerFloor',
      label: 'Additional Rooms Per Floor',
      type: 'number',
      min: 0,
      max: 10,
      step: 1,
      default: 1,
    },
    {
      key: 'roomSpread',
      label: 'Room Spread',
      type: 'number',
      min: 5,
      max: 50,
      step: 1,
      default: 20,
    },
    {
      key: 'seed',
      label: 'Seed',
      type: 'number',
      min: 0,
      max: 99999,
      step: 1,
      default: 0,
    },
  ],
  generate,
}