import type { HexCoord } from '../algorithms/types'
import { hexKey, hexNeighbours, hexDistance } from '../algorithms/types'

//---------------------------------------//
//  Hex A* Pathfinding                   //
//---------------------------------------//
// Pathfinding algorithm to find shortest, most optimal path between start and end cells

// Straight-line hex distance is an admissible heuristic
// - never overestimates true step cost, since every step moves exactly one hex).
function heuristic(a: HexCoord, b: HexCoord): number {
  return hexDistance(a, b)
}

// Returns:
// - Ordered list of hex cells from start to end (inclusive), or
// - null (if no path exists within budget)
export function hexAStar(
  start: HexCoord,
  end: HexCoord,
  isBlocked: (hex: HexCoord) => boolean,
  maxIterations = 5000
): HexCoord[] | null {
  const startKey = hexKey(start)
  const endKey = hexKey(end)
  if (startKey === endKey) return [start]

  // Lookups keyed by hex string
  const hexByKey = new Map<string, HexCoord>([[startKey, start]])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startKey, 0]])
  const open = new Map<string, number>([[startKey, heuristic(start, end)]]) // key -> fScore
  const closed = new Set<string>()

  let iterations = 0
  while (open.size > 0 && iterations < maxIterations) {
    iterations++

    // Pull the lowest-fScore node.
    // Dungeon-drafting grids are small (tens to low hundreds of cells)
    // thus, linear scan beats bookkeeping cost of a real binary heap.
    let currentKey: string | null = null
    let currentF = Infinity
    for (const [key, f] of open) {
      if (f < currentF) {
        currentF = f
        currentKey = key
      }
    }
    if (currentKey === null) break

    if (currentKey === endKey) {
      const path: HexCoord[] = [hexByKey.get(currentKey)!]
      let k = currentKey
      while (cameFrom.has(k)) {
        k = cameFrom.get(k)!
        path.push(hexByKey.get(k)!)
      }
      path.reverse()
      return path
    }

    open.delete(currentKey)
    closed.add(currentKey)
    const currentHex = hexByKey.get(currentKey)!
    const currentG = gScore.get(currentKey)!

    for (const neighbour of hexNeighbours(currentHex)) {
      const neighbourKey = hexKey(neighbour)
      if (closed.has(neighbourKey)) continue
      // The end cell is always enterable even if it'd otherwise register as blocked
      if (neighbourKey !== endKey && isBlocked(neighbour)) continue

      const tentativeG = currentG + 1
      const existingG = gScore.get(neighbourKey)
      if (existingG === undefined || tentativeG < existingG) {
        hexByKey.set(neighbourKey, neighbour)
        cameFrom.set(neighbourKey, currentKey)
        gScore.set(neighbourKey, tentativeG)
        open.set(neighbourKey, tentativeG + heuristic(neighbour, end))
      }
    }
  }

  return null // no path found within budget
}