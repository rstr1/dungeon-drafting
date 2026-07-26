import type { HexCoord, Point2D, CorridorPolygon } from '../algorithms/types'
import { hexToPixel, hexCorners } from '../algorithms/types'
import { marchingSquares } from './marchingSquares'
import { createFbm2D } from './noise'

//---------------------------------------//
//  Cavern Fill                          //
//---------------------------------------//
// Noise-field-driven caverns filling leftover space, independent of the room/connection graph.
// Reuses the exact same marchingSquares.ts machinery corridors use.
// Caverns are unioned to Corridors to ensure walls remain consistent.
// The returned polygons represent the FULL organic floor (corridors ∪ caverns, minus rooms)

const UNIT_RADIUS = 1

function mergeDefined<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults }
  for (const key in overrides) {
    const value = overrides[key]
    if (value !== undefined) result[key] = value as T[typeof key]
  }
  return result
}

export type CavernOptions = {
  noiseScale: number                // world-units per noise feature --> bigger == larger blobs
  threshold: number                 // fBm cutoff in roughly [-1, 1] --> higher == sparser caverns
  octaves: number                   // How many noise layers get summed --> higher == sharper generation
  persistence: number               // How much each extra layer contributes relative to the last.
  lacunarity: number                // How much finer each successive layer gets --> higher == sharper
  gridResolution: number            // marching squares sampling cell size
  cavernReach: number               // distance from the nearest room/corridor feature within which caverns can appear at full density
  edgeFeather: number               // extra distance beyond cavernReach over which density tapers smoothly to zero
  roomClearance: number             // buffer around every room cell
  requireCorridorAdjacency: boolean // discard merged pockets that never touch a corridor
}

const DEFAULT_OPTIONS: CavernOptions = {
  noiseScale: 4,
  threshold: 0.15,
  octaves: 4,
  persistence: 0.5,
  lacunarity: 2,
  gridResolution: 0.4,
  cavernReach: 4,
  edgeFeather: 3,
  roomClearance: 0.5,
  requireCorridorAdjacency: true,
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

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

function boundsOf(points: Point2D[]): Bounds {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}


// Lower bounds distance from 'p' to anything inside a bounding box.
// -  if p is inside the box --> 0
// -  always <= true distance to whatever polygon the box encloses (safe for pruning)
function bboxDistance(p: Point2D, b: Bounds): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX)
  const dy = Math.max(b.minY - p.y, 0, p.y - b.maxY)
  return Math.hypot(dx, dy)
}

function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const abx = b.x - a.x, aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

// Signed distance from p --> CorridorPolygon's boundary.
// -  negative when p is on solid floor
// -  positive otherwise
function polygonSDF(p: Point2D, polygon: CorridorPolygon): number {
  const inside = pointInPolygon(p, polygon.outer) && !polygon.holes.some(h => pointInPolygon(p, h))
  let minDist = Infinity
  const ringDist = (ring: Point2D[]) => {
    for (let i = 0; i < ring.length; i++) {
      const d = pointToSegmentDistance(p, ring[i], ring[(i + 1) % ring.length])
      if (d < minDist) minDist = d
    }
  }
  ringDist(polygon.outer)
  for (const hole of polygon.holes) ringDist(hole)
  return inside ? -minDist : minDist
}

type IndexedCorridor = { polygon: CorridorPolygon; bounds: Bounds }


// Signed-distance union accross every corridor polygon
function makeCorridorField(corridors: CorridorPolygon[]): (p: Point2D) => number {
  const indexed: IndexedCorridor[] = corridors
    .filter(c => c.outer.length >= 3)
    .map(polygon => ({ polygon, bounds: boundsOf(polygon.outer) }))

  return (p: Point2D) => {
    let best = Infinity
    for (const { polygon, bounds } of indexed) {
      const insideBbox = p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY
      if (!insideBbox && bboxDistance(p, bounds) >= best) continue // can't beat current best
      const d = polygonSDF(p, polygon)
      if (d < best) best = d
    }
    return best
  }
}

// Signed distance to the nearest room cell, minus clearance
// - negative --> "too close to room, must stay carved out"
// Approximates each HexCell as a circle of UNIT_RADIUS
function makeRoomField(rooms: { cells: HexCoord[] }[], clearance: number): (p: Point2D) => number {
  const centres = rooms.flatMap(room => room.cells.map(c => hexToPixel(c, UNIT_RADIUS)))
  const radius = UNIT_RADIUS + clearance
  return (p: Point2D) => {
    let closest = Infinity
    for (const c of centres) {
      const d = dist(p, c) - radius
      if (d < closest) closest = d
    }
    return closest
  }
}


// Used for density falloff
function subsample(points: Point2D[], maxCount: number): Point2D[] {
  if (points.length <= maxCount) return points
  const step = points.length / maxCount
  const out: Point2D[] = []
  for (let i = 0; i < maxCount; i++) out.push(points[Math.floor(i * step)])
  return out
}

// Taper off the outer edges
function makeLayoutFalloff(
  rooms: { cells: HexCoord[] }[],
  corridors: CorridorPolygon[],
  reach: number,
  feather: number
): (p: Point2D) => number {
  const featurePoints: Point2D[] = [
    ...rooms.flatMap(room => room.cells.map(c => hexToPixel(c, UNIT_RADIUS))),
    ...corridors.flatMap(c => subsample(c.outer, 40)),
  ]
  return (p: Point2D) => {
    if (featurePoints.length === 0) return 1
    let d = Infinity
    for (const f of featurePoints) {
      const dd = dist(p, f)
      if (dd < d) d = dd
    }
    if (d <= reach) return 1
    if (feather <= 0 || d >= reach + feather) return 0
    return 1 - (d - reach) / feather
  }
}

// Group raw marching-squares loops into outer/hole polygons by nesting.
function nestLoops(loops: Point2D[][]): CorridorPolygon[] {
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
  return polygons
}

// Check that the polygon is accessible from a corridor --> need a path back to the room.
function polygonTouchesCorridor(poly: CorridorPolygon, corridorField: (p: Point2D) => number): boolean {
  const xs = poly.outer.map(p => p.x), ys = poly.outer.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const steps = 14
  const stepX = (maxX - minX) / steps || 1
  const stepY = (maxY - minY) / steps || 1
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: minX + i * stepX, y: minY + j * stepY }
      if (!pointInPolygon(p, poly.outer)) continue
      if (poly.holes.some(h => pointInPolygon(p, h))) continue
      if (corridorField(p) < -0.05) return true
    }
  }
  return false
}


// Rooms are carved out; corridors are unioned.
export function carveCaverns(
  rooms: { cells: HexCoord[] }[],
  corridors: CorridorPolygon[],
  rand: () => number,
  options: Partial<CavernOptions> = {}
): CorridorPolygon[] {
  const opts: CavernOptions = mergeDefined(DEFAULT_OPTIONS, options)
  if (rooms.length === 0 && corridors.length === 0) return []

  const featurePts: Point2D[] = [
    ...rooms.flatMap(room => room.cells.flatMap(c => hexCorners(c, UNIT_RADIUS))),
    ...corridors.flatMap(c => c.outer),
  ]
  const boundsPadding = opts.cavernReach + opts.edgeFeather + 1
  const rawBounds = featurePts.length > 0 ? boundsOf(featurePts) : { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  const bounds: Bounds = {
    minX: rawBounds.minX - boundsPadding,
    maxX: rawBounds.maxX + boundsPadding,
    minY: rawBounds.minY - boundsPadding,
    maxY: rawBounds.maxY + boundsPadding,
  }

  // Derive noise seed from the shared rand() to keep the pipeline deterministic.
  const noiseSeed = Math.floor(rand() * 0xffffffff)
  const fbm = createFbm2D(noiseSeed, opts.octaves, opts.persistence, opts.lacunarity)
  const corridorField = makeCorridorField(corridors)
  const roomField = makeRoomField(rooms, opts.roomClearance)
  const falloff = makeLayoutFalloff(rooms, corridors, opts.cavernReach, opts.edgeFeather)

  const field = (p: Point2D) => {
    // Push threshold out of noise's [-1, 1] range as falloff -> 0
    // --> noise term can't dip inside once it goes past cavernReach + edgeFeather.
    const effectiveThreshold = opts.threshold + (1 - falloff(p)) * 2
    const noiseField = effectiveThreshold - fbm(p.x / opts.noiseScale, p.y / opts.noiseScale)


    // Rooms only ever carve into the Noise portion.
    // Corridors already carry their own correct, intentional room-entrance overlap.
    const noiseCarved = Math.max(noiseField, -roomField(p))

    // Union with corridors, corridors untouched by the room subtraction.
    return Math.min(noiseCarved, corridorField(p))
  }

  const loops = marchingSquares(field, bounds, opts.gridResolution)
  if (loops.length === 0) return []
  const polygons = nestLoops(loops)

  if (!opts.requireCorridorAdjacency) return polygons
  return polygons.filter(poly => polygonTouchesCorridor(poly, corridorField))
}