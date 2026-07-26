import type { Connection, Point2D, HexCoord, CorridorPolygon } from '../algorithms/types'
import { hexToPixel, hexEdgeMidpoint, hexKey, hexNeighbour } from '../algorithms/types'
import { marchingSquares } from './marchingSquares'
import { hexAStar } from './hexPathfinding'
import { createNoise2D } from './noise'

//---------------------------------------//
//  Corridor Fill                        //
//---------------------------------------//
// Turns each Connection from the room graph into an organic tunnel outline.
// - A* a discrete hex path between the two entrances (blocked = other rooms' cells)
// - Smooth that path into a continuous-space curve with a Catmull-Rom spline
// - Drop metaballs along the curve
// - Union their fields
// - Extract the boundary with marching squares

const UNIT_RADIUS = 1

// Same defensive merge as cavernFill.ts
function mergeDefined<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults }
  for (const key in overrides) {
    const value = overrides[key]
    if (value !== undefined) result[key] = value as T[typeof key]
  }
  return result
}

export type CorridorOptions = {
  splineSamplesPerSegment: number // curve points generated between each pair of hex waypoints
  metaballSpacing: number // arc-length between dropped metaballs along the path
  baseRadius: number      // metaball radius (roughly half the tunnel width)
  radiusJitter: number    // +/- random variation on that radius
  gridResolution: number  // marching squares sampling cell size
  meanderStrength: number // 0 = pure shortest path --> higher == A* winds around slightly-pricier terrain
  meanderScale: number    // world-units per meander noise feature --> smaller == tighter/twistier wiggles
}

const DEFAULT_OPTIONS: CorridorOptions = {
  splineSamplesPerSegment: 20,
  metaballSpacing: 0.25,
  baseRadius: 0.4,
  radiusJitter: 0.2,
  gridResolution: 0.4,
  meanderStrength: 0.6,
  meanderScale: 3,
}

// Per-cell A* step costs driven by seeded noise.
//
// Cells the noise favours are pricier to enter --> Shortest-cost path will weave around.
function makeMeanderCost(seed: number, strength: number, scale: number): (hex: HexCoord) => number {
  if (strength <= 0) return () => 1
  const noise = createNoise2D(seed)
  return (hex: HexCoord) => {
    const p = hexToPixel(hex, UNIT_RADIUS)
    const n = (noise(p.x / scale, p.y / scale) + 1) / 2 // roughly [0, 1]
    return 1 + strength * n
  }
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function polygonArea(poly: Point2D[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

// Standard ray-casting point-in-polygon test.
function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Catmull-Rom interpolation through p1..p2, using p0/p3 as tangent context.
function catmullRomPoint(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const t2 = t * t
  const t3 = t2 * t
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * t +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  )
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  )
  return { x, y }
}

// Turns a sparse polyline of waypoints (A* hex centres) into a dense, organic curve.
// Duplicates the first/last waypoint as extra control points so curve reaches the true start/end rather than rounding off before it gets there.
function smoothPath(waypoints: Point2D[], samplesPerSegment: number): Point2D[] {
  if (waypoints.length < 2) return waypoints
  const padded = [waypoints[0], ...waypoints, waypoints[waypoints.length - 1]]
  const curve: Point2D[] = [padded[1]]
  for (let i = 1; i < padded.length - 2; i++) {
    const p0 = padded[i - 1], p1 = padded[i], p2 = padded[i + 1], p3 = padded[i + 2]
    for (let s = 1; s <= samplesPerSegment; s++) {
      curve.push(catmullRomPoint(p0, p1, p2, p3, s / samplesPerSegment))
    }
  }
  return curve
}

type Metaball = { center: Point2D; radius: number }

// A hex edge in this unit-radius space has length UNIT_RADIUS (1).
// The 0.9 factor keeps a small safety margin rather than sitting exactly flush.
const MAX_ENTRANCE_RADIUS = UNIT_RADIUS * 0.5 * 0.9

// Drops a metaball roughly every 'metaballSpacing' of arc length along the path
// Each metaball has a slightly variable radius.
// The very first/last ball sits right on a room's entrance-edge midpoint, so its radius is capped to the doorway's own width.
function sampleMetaballs(path: Point2D[], rand: () => number, opts: CorridorOptions): Metaball[] {
  const jitteredRadius = () => opts.baseRadius + (rand() * 2 - 1) * opts.radiusJitter
  const entranceRadius = () => Math.min(jitteredRadius(), MAX_ENTRANCE_RADIUS)
  const balls: Metaball[] = [{ center: path[0], radius: entranceRadius() }]
  let accumulated = 0
  for (let i = 1; i < path.length; i++) {
    accumulated += dist(path[i - 1], path[i])
    if (accumulated >= opts.metaballSpacing) {
      balls.push({ center: path[i], radius: jitteredRadius() })
      accumulated = 0
    }
  }
  balls.push({ center: path[path.length - 1], radius: entranceRadius() })
  return balls
}


// SDF union of circles
function unionSDF(balls: Metaball[]): (p: Point2D) => number {
  return (p: Point2D) => {
    let closest = Infinity
    for (const b of balls) {
      const d = dist(p, b.center) - b.radius
      if (d < closest) closest = d
    }
    return closest
  }
}

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

function computeBounds(balls: Metaball[], padding: number): Bounds {
  const maxRadius = Math.max(...balls.map(b => b.radius))
  const pad = maxRadius + padding
  const xs = balls.map(b => b.center.x)
  const ys = balls.map(b => b.center.y)
  return {
    minX: Math.min(...xs) - pad,
    maxX: Math.max(...xs) + pad,
    minY: Math.min(...ys) - pad,
    maxY: Math.max(...ys) + pad,
  }
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

// Union-find --> corridors whose padded extents touch get grouped into one cluster
class UnionFind {
  private parent: number[]
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]]
      i = this.parent[i]
    }
    return i
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

// rooms/entrances are addressed purely via each connection's HexEdge for each connection
// --> builds the set of solid room cells the tunnel cannot route through.
export function carveCorridors(
  rooms: { cells: HexCoord[] }[],
  connections: Connection[],
  rand: () => number,
  options: Partial<CorridorOptions> = {}
): CorridorPolygon[] {
  const opts: CorridorOptions = mergeDefined(DEFAULT_OPTIONS, options)

  // 1 shared meander field for the whole dungeon:
  // --> winding reads as spatially coherent rather than restarting per corridor.
  // Derived from shared rand()
  const meanderSeed = Math.floor(rand() * 0xffffffff)
  const stepCost = makeMeanderCost(meanderSeed, opts.meanderStrength, opts.meanderScale)

  type ConnectionField = { balls: Metaball[]; bounds: Bounds }
  const perConnection: ConnectionField[] = []

  for (const connection of connections) {
    // Every room cell is impassable
    const entranceAKey = hexKey(connection.entranceA.cell)
    const entranceBKey = hexKey(connection.entranceB.cell)
    const blocked = new Set<string>(rooms.flatMap(room => room.cells.map(hexKey)))
    const isBlocked = (hex: HexCoord) => blocked.has(hexKey(hex))

    // Corridor's first and last hex step must at the hexcell immediately adjacent to the entrance
    const exitA = hexNeighbour(connection.entranceA.cell, connection.entranceA.direction)
    const exitB = hexNeighbour(connection.entranceB.cell, connection.entranceB.direction)

    // Fall back to the entrance cell itself only in the pathological case where the door's
    // own facing neighbour is blocked by some unrelated third room.
    const pathStart = isBlocked(exitA) ? connection.entranceA.cell : exitA
    const pathEnd = isBlocked(exitB) ? connection.entranceB.cell : exitB

    const hexPath = hexAStar(pathStart, pathEnd, isBlocked, { stepCost }) ?? [pathStart, pathEnd]
    const interiorHexes = hexPath.filter(hex => {
      const key = hexKey(hex)
      return key !== entranceAKey && key !== entranceBKey
    })

    // Waypoints in continuous space, still aligned to hexgrid in terms of plotting.
    const waypoints: Point2D[] = [
      hexEdgeMidpoint(connection.entranceA, UNIT_RADIUS),
      ...interiorHexes.map(hex => hexToPixel(hex, UNIT_RADIUS)),
      hexEdgeMidpoint(connection.entranceB, UNIT_RADIUS),
    ]

    const path = smoothPath(waypoints, opts.splineSamplesPerSegment)
    const balls = sampleMetaballs(path, rand, opts)
    const bounds = computeBounds(balls, opts.gridResolution * 2)
    perConnection.push({ balls, bounds })
  }

  if (perConnection.length === 0) return []

  // Cluster connections who overlap share one metaball field.
  const uf = new UnionFind(perConnection.length)
  for (let i = 0; i < perConnection.length; i++) {
    for (let j = i + 1; j < perConnection.length; j++) {
      if (boundsOverlap(perConnection[i].bounds, perConnection[j].bounds)) {
        uf.union(i, j)
      }
    }
  }

  const clusters = new Map<number, number[]>()
  for (let i = 0; i < perConnection.length; i++) {
    const root = uf.find(i)
    const members = clusters.get(root)
    if (members) members.push(i)
    else clusters.set(root, [i])
  }

  const outlines: CorridorPolygon[] = []
  for (const members of clusters.values()) {
    const balls = members.flatMap(i => perConnection[i].balls)
    const bounds = members.map(i => perConnection[i].bounds).reduce(unionBounds)
    const field = unionSDF(balls)
    const loops = marchingSquares(field, bounds, opts.gridResolution)
    if (loops.length === 0) continue

    if (members.length === 1) {
      const largest = loops.reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a))
      outlines.push({ outer: largest, holes: [] })
      continue
    }


    // Sort loops by area (largest first) --> for each loop find smallest enclosing existing polygon
    // This deals with determining where to draw filled backgrounds
    const byArea = loops
      .map(loop => ({ loop, area: polygonArea(loop) }))
      .sort((a, b) => b.area - a.area)
    const polygons: CorridorPolygon[] = []
    for (const candidate of byArea) {
      let parent: CorridorPolygon | null = null
      let parentArea = Infinity
      for (const poly of polygons) {
        if (pointInPolygon(candidate.loop[0], poly.outer)) {
          const area = polygonArea(poly.outer)
          if (area < parentArea) {
            parent = poly
            parentArea = area
          }
        }
      }
      if (parent) parent.holes.push(candidate.loop)
      else polygons.push({ outer: candidate.loop, holes: [] })
    }
    outlines.push(...polygons)
  }
  return outlines
}