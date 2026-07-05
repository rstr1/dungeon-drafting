import { hexKey, rotateStructure } from './types'
import { rng, randInt } from '../lib/rng'
import type { Algorithm, DungeonMap, HexCoord, RoomTemplate, RoomInstance } from './types'

//---------------------------------------//
//  Stage 1: Prefab Room Placement       //
//---------------------------------------//
// Guaranteed rooms always placed.
// - spawn, exit, event

const GUARANTEED_TEMPLATES: RoomTemplate[] = [
  {
    id: 'spawn-cell',
    name: 'Spawn Cell',
    tag: 'spawn',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ q: 0, r: 0 }],
    guaranteed: true,
  },
  {
    id: 'exit-cell',
    name: 'Exit Cell',
    tag: 'exit',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ q: 0, r: 0 }],
    guaranteed: true,
  },
  {
    id: 'event-cell',
    name: 'Event Cell',
    tag: 'event',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ q: 0, r: 0 }],
    guaranteed: true,
  },
]

function placeTemplate(template: RoomTemplate, anchor: HexCoord, rotation: number): RoomInstance {
  const cells = rotateStructure(template.cells, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
  const entrances = rotateStructure(template.entrances, rotation).map(c => ({ q: c.q + anchor.q, r: c.r + anchor.r }))
  return { templateId: template.id, tag: template.tag, anchor, rotation, cells, entrances }
}

function overlaps(cells: HexCoord[], occupied: Set<string>): boolean {
  return cells.some(c => occupied.has(hexKey(c)))
}

function randomAnchor(rand: () => number, spread: number): HexCoord {
  return { q: randInt(rand, -spread, spread), r: randInt(rand, -spread, spread) }
}

// Number of levels this floor gets, based on forced thresholds.
function resolveNumLevels(floorNumber: number): number {
  if (floorNumber > 20) return 3
  if (floorNumber > 10) return 2
  return 1
}

function generate(params: Record<string, number | boolean>): DungeonMap {
  const seed = params['seed'] as number
  const spread = params['roomSpread'] as number
  const floorNumber = params['floorNumber'] as number
  const baseCellCount = params['baseCellCount'] as number
  const cellsPerFloor = params['cellsPerFloor'] as number

  const rand = rng(seed)

  const totalCellBudget = baseCellCount + cellsPerFloor * floorNumber
  const numLevels = resolveNumLevels(floorNumber)

  const occupied = new Set<string>()
  const rooms: { id: string; cells: HexCoord[] }[] = []

  for (const template of GUARANTEED_TEMPLATES) {
    let placed: RoomInstance | null = null

    // brute-force retry until a non-overlapping anchor is found
    for (let attempt = 0; attempt < 100 && !placed; attempt++) {
      const anchor = randomAnchor(rand, spread)
      const rotation = randInt(rand, 0, 5)
      const instance = placeTemplate(template, anchor, rotation)
      if (!overlaps(instance.cells, occupied)) placed = instance
    }

    if (placed) {
      placed.cells.forEach(c => occupied.add(hexKey(c)))
      rooms.push({ id: placed.templateId, cells: placed.cells })
    }
  }

  return {
    cells: occupied,
    metadata: { rooms, totalCellBudget, numLevels },
  }
}

export const billyGen: Algorithm = {
  id: 'billy-gen',
  name: 'BillyGen',
  description: 'Prefab rooms + carved caverns + organic corridors, built for multi-level cave dungeons.',
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
      key: 'baseCellCount',
      label: 'Base Cell Count',
      type: 'number',
      min: 1,
      max: 300,
      step: 1,
      default: 15,
    },
    {
      key: 'cellsPerFloor',
      label: 'Cells Per Floor',
      type: 'number',
      min: 0,
      max: 20,
      step: 1,
      default: 5,
    },
    {
      key: 'roomSpread',
      label: 'Room Spread',
      type: 'number',
      min: 1,
      max: 50,
      step: 1,
      default: 5,
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