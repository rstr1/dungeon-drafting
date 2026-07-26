import Delaunator from 'delaunator'
import { hexToPixel, hexEdgeMidpoint } from '../algorithms/types'
import type { HexCoord, HexEdge, Connection } from '../algorithms/types'

//---------------------------------------//
//  Connection Graph                     //
//---------------------------------------//
// Builds room-to-room connectivity for corridor carving:
//   1. Delaunay triangulate room centroids
//   2. Reduce to a MST (full connectivity)
//   3. Add back some discarded Delaunay edges as loops
//
// This module decides which rooms connect and which entrances each connection routes to.

const TRIANGULATION_RADIUS = 1

type RoomLike = { cells: HexCoord[]; entrances?: HexEdge[] }

type Node = {
    index: number
    centroid: { x: number; y: number }
    entrances: HexEdge[]
}

type Edge = { a: number; b: number; weight: number }

function centroid(cells: HexCoord[]): { x: number; y: number }{
    const pts = cells.map(c => hexToPixel(c, TRIANGULATION_RADIUS))
    const x = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
    const y = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
    return {x, y}
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

// Picks entrance that is closest to a target point --> i.e. entrance that faces the room it's connecting to.
function nearestEntrance(node: Node, target: { x: number; y: number }): HexEdge {
  let best = node.entrances[0]
  let bestDist = Infinity
  for (const e of node.entrances) {
    const d = dist(hexEdgeMidpoint(e, TRIANGULATION_RADIUS), target)
    if (d < bestDist) {
      bestDist = d
      best = e
    }
  }
  return best
}

// Create a connection
function toConnection(nodes: Node[], edge: Edge): Connection {
  const nodeA = nodes[edge.a]
  const nodeB = nodes[edge.b]
  return {
    a: nodeA.index,
    b: nodeB.index,
    entranceA: nearestEntrance(nodeA, nodeB.centroid),
    entranceB: nearestEntrance(nodeB, nodeA.centroid),
  }
}


//---------------------------------------//
//  Union-Find (for Kruskal's MST)       //
//---------------------------------------//
// Used to check if two points are already connected

function makeUnionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i)
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  function union(a: number, b: number): boolean {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return false
    parent[ra] = rb
    return true
  }
  return { union }
}

// Picks which discarded Delauney edges become loops.
// This guarantees at least one loop whenever a discarded edge exists.
// Additional loops are added via loopChance.
function selectLoopEdges(leftoverEdges: Edge[], rand: () => number, loopChance: number): Edge[] {
  if (leftoverEdges.length === 0) return []

  // Seeded Fisher-Yates so which edge lands the guaranteed slot varies by seed
  const shuffled = [...leftoverEdges]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }
  const guaranteedCount = Math.min(1, shuffled.length)
  const guaranteed = shuffled.slice(0, guaranteedCount)
  const rest = shuffled.slice(guaranteedCount).filter(() => rand() < loopChance)
  return [...guaranteed, ...rest]
}

//---------------------------------------//
//  Build Graph                          //
//---------------------------------------//
// rooms         --> DungeonMap.metadata.rooms (order defines the indices used in the returned Connections)
// rand          --> seeded RNG
// loopChance    --> fraction of discarded edges (aside from guaranteed loop) added back for extra cycles

export function buildConnectionGraph(
    rooms: RoomLike[],
    rand: () => number,
    loopChance = 0.15
): Connection[] {

    if (rooms.length < 2) return []

    const nodes: Node[] = rooms.map((r, i) => ({
        index: i,
        centroid: centroid(r.cells),
        entrances: r.entrances && r.entrances.length > 0 ? r.entrances: [{ cell: r.cells[0], direction: 0}],
    }))

    // Delaunator requires >=3 points to triangulate
    if (nodes.length < 3){
        return [toConnection(nodes, { a:0, b:1, weight: dist(nodes[0].centroid, nodes[1].centroid) })]
    }

    const coords = nodes.flatMap(n => [n.centroid.x, n.centroid.y])

    const delaunay = new Delaunator(coords)

    // Dedupe triangulation's edges
    // (each interior edge is shared by 2 triangles)
    const edgeMap = new  Map<string, Edge>()
    const addEdge = (a: number, b: number) => {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!edgeMap.has(key)) {
            edgeMap.set(key, { a, b, weight: dist(nodes[a].centroid, nodes[b].centroid) })
        }
    }

    for (let t = 0; t < delaunay.triangles.length/3; t++) {
        const p0 = delaunay.triangles[t * 3]
        const p1 = delaunay.triangles[t * 3 + 1]
        const p2 = delaunay.triangles[t * 3 + 2]
        addEdge(p0, p1)
        addEdge(p1, p2)
        addEdge(p2, p0)
    }

    // Kruskal's MST --> guarantees every room is reachable with fewest # edges.
    const sortedEdges = Array.from(edgeMap.values()).sort((x, y) => x.weight - y.weight)

    const unionFind = makeUnionFind(nodes.length)

    const mstEdges: Edge[] = []

    const leftoverEdges: Edge[] = []

    for (const edge of sortedEdges) {
        if (unionFind.union(edge.a, edge.b)) {
            mstEdges.push(edge)
        } else {
            leftoverEdges.push(edge)
        }
    }

    // Loop edges --> reintroduce some discarded edges to create cycles
    // Delinearises the map to make it more interesting.
    // Also allows for potential looping/kiting of enemies.
    const loopEdges = selectLoopEdges(leftoverEdges, rand, loopChance)

    return [...mstEdges, ...loopEdges].map(edge => toConnection(nodes, edge))
}