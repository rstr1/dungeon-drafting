import { hexKey } from './types'
import type { Algorithm, DungeonMap, HexCoord, HexEdge, RoomTag, RoomTemplate, RoomInstance } from './types'
import { rng } from '../lib/rng'
import { ANCHOR, placeTemplate, overlaps, tryPlaceAtRandom, pickWeighted, resolveTemplates } from './roomPlacement'
import { buildConnectionGraph } from '../lib/connectionGraph'
import { carveCorridors } from '../lib/corridorFill'

//---------------------------------------//
//  Stage 0: Universal Constants         //
//---------------------------------------//

// Dungeon Verticality
const SECOND_FLOOR_POINT = 10
const THIRD_FLOOR_POINT = 20


// Number of levels this floor gets, based on forced thresholds.
function resolveNumLevels(floorNumber: number): number {
  if (floorNumber > THIRD_FLOOR_POINT) return 3
  if (floorNumber > SECOND_FLOOR_POINT) return 2
  return 1
}

//---------------------------------------//
//  Generate                             //
//---------------------------------------//
// THIS IS THE MAIN FUNCTION
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

  //---------------------------------------//
  //  Guaranteed Room Spawning             //
  //---------------------------------------//

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

  //---------------------------------------//
  //  Optional Room Spawning               //
  //---------------------------------------//

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

    //---------------------------------------//
    //  Room <---> Room Connections          //
    //---------------------------------------//
    // Delaunay --> MST --> loop edges
    const connections = buildConnectionGraph(rooms, rand)

    // Organic tunnel outlines: worm walk + metaball union + marching squares
    // Continuous space independent of hex boundaries
    const corridors = carveCorridors(rooms, connections, rand)

  return {
    cells: occupied,
    metadata: { rooms, connections, corridors, optionalRoomCount, numLevels },
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