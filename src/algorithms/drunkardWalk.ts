import { hexNeighbour, hexKey } from './types'
import { rng, randInt} from '../lib/rng'
import type { Algorithm, DungeonMap, HexCoord } from './types'

function generate(params: Record<string, number | boolean>): DungeonMap {
  const cellCount = params['cellCount'] as number
  const seed = params['seed'] as number
  const rand = rng(seed)
  const cells = new Set<string>()

  // walker at origin
  let current: HexCoord = { q: 0, r: 0 }
  cells.add(hexKey(current))

  while (cells.size < cellCount) {
    // Pick random neighbour direction
    const direction = randInt(rand, 0, 5)
    current = hexNeighbour(current, direction)
    cells.add(hexKey(current))
  }
  return { cells }
}


export const drunkardWalk: Algorithm = {
    id: 'drunkard-walk',
    name: "Drunkard's Walk",
    description: "A walker steps randomly until target cell count is reached.",
    params: [
    {
      key: 'cellCount',
      label: 'Cell Count',
      type: 'number',
      min: 10,
      max: 200,
      step: 1,
      default: 30,
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