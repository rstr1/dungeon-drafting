import type { Connection, Point2D } from '../algorithms/types'
import { hexToPixel } from '../algorithms/types'
import { marchingSquares } from './marchingSquares'

//---------------------------------------//
//  Corridor Fill                        //
//---------------------------------------//
// Turns each Connection from the room graph into an organic tunnel outline.
// - Walk a biased random path between the two entrances
// - Drop metaballs along it
// - Union their fields
// - Extract the boundary with marching squares

const UNIT_RADIUS = 1

export type CorridorOptions = {
  stepSize: number        // worm-walk step length, in hex-radius units
  jitter: number          // 0 = beeline to target, 1 = fully random wander each step
  maxSteps: number        // safety cap so a high-jitter walk can't loop forever
  metaballSpacing: number // arc-length between dropped metaballs along the path
  baseRadius: number      // metaball radius (roughly half the tunnel width)
  radiusJitter: number    // +/- random variation on that radius
  gridResolution: number  // marching squares sampling cell size
}

const DEFAULT_OPTIONS: CorridorOptions = {
  stepSize: 0.15,
  jitter: 0.3,
  maxSteps: 500,
  metaballSpacing: 0.3,
  baseRadius: 0.4,
  radiusJitter: 0.12,
  gridResolution: 0.08,
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function normalise(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y)
  return len > 1e-9 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 }
}
function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y }
}
function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y }
}
function scale(v: Point2D, s: number): Point2D {
  return { x: v.x * s, y: v.y * s }
}


// Biased random walk from start toward end.
// At each step, blend a fully random direction with the direction-to-target by 'jitter'
// 0 gives a straight line, higher values wander more while still making progress.
function walkWorm(start: Point2D, end: Point2D, rand: () => number, opts: CorridorOptions): Point2D[] {
  const path: Point2D[] = [start]
  let current = start
  let steps = 0
  while (dist(current, end) > opts.stepSize && steps < opts.maxSteps) {
    const toTarget = normalise(sub(end, current))
    const angle = rand() * Math.PI * 2
    const randomDir: Point2D = { x: Math.cos(angle), y: Math.sin(angle) }
    const dir = normalise(add(scale(toTarget, 1 - opts.jitter), scale(randomDir, opts.jitter)))
    current = add(current, scale(dir, opts.stepSize))
    path.push(current)
    steps++
  }
  path.push(end)
  return path
}

type Metaball = { center: Point2D; radius: number }

// Drops a metaball roughly every 'metaballSpacing' of arc length along the path
// Each has a jittered radius, so the tunnel varies in width.
function sampleMetaballs(path: Point2D[], rand: () => number, opts: CorridorOptions): Metaball[] {
  const jitteredRadius = () => opts.baseRadius + (rand() * 2 - 1) * opts.radiusJitter
  const balls: Metaball[] = [{ center: path[0], radius: jitteredRadius() }]
  let accumulated = 0
  for (let i = 1; i < path.length; i++) {
    accumulated += dist(path[i - 1], path[i])
    if (accumulated >= opts.metaballSpacing) {
      balls.push({ center: path[i], radius: jitteredRadius() })
      accumulated = 0
    }
  }
  balls.push({ center: path[path.length - 1], radius: jitteredRadius() })
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

// rooms/entrances are addressed purely via each connection's HexEdge
export function carveCorridors(
    connections: Connection[],
    rand: () => number,
    options: Partial<CorridorOptions> = {}
): Point2D[][] {

    const opts: CorridorOptions = { ...DEFAULT_OPTIONS, ...options }
    const outlines: Point2D[][] = []

    for (const connection of connections) {
        const start = hexToPixel(connection.entranceA.cell, UNIT_RADIUS)
        const end = hexToPixel(connection.entranceB.cell, UNIT_RADIUS)

        const path = walkWorm(start, end, rand, opts)
        const balls = sampleMetaballs(path, rand, opts)
        const field = unionSDF(balls)

        const maxRadius = Math.max(...balls.map(b => b.radius))
        const pad = maxRadius + opts.gridResolution * 2
        const xs = balls.map(b => b.center.x)
        const ys = balls.map(b => b.center.y)
        const bounds = {
            minX: Math.min(...xs) - pad,
            maxX: Math.max(...xs) + pad,
            minY: Math.min(...ys) - pad,
            maxY: Math.max(...ys) + pad,
        }

        const loops = marchingSquares(field, bounds, opts.gridResolution)
        if (loops.length === 0) continue

        // a continuous worm path should union into one loop
        // if it is somehow fragmented, only keep the largest piece
        const largest = loops.reduce((a, b) => (b.length > a.length ? b : a))
        outlines.push(largest)
    }
    return outlines
}