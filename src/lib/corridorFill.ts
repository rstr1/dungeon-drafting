import type { Connection, Point2D, HexCoord } from '../algorithms/types'
import { hexToPixel, hexEdgeMidpoint } from '../algorithms/types'
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

// Distance from hex's centre to edge midpoint
const HEX_INRADIUS = Math.sqrt(3)/2

export type CorridorOptions = {
  stepSize: number        // worm-walk step length, in hex-radius units
  jitter: number          // 0 = beeline to target, 1 = fully random wander each step
  maxSteps: number        // safety cap so a high-jitter walk can't loop forever
  maxStepAttempts: number // retries per step to find a direction that avoids obstacles
  metaballSpacing: number // arc-length between dropped metaballs along the path
  baseRadius: number      // metaball radius (roughly half the tunnel width)
  radiusJitter: number    // +/- random variation on that radius
  gridResolution: number  // marching squares sampling cell size
}

const DEFAULT_OPTIONS: CorridorOptions = {
  stepSize: 0.15,
  jitter: 0.3,
  maxSteps: 500,
  maxStepAttempts: 10,
  metaballSpacing: 0.3,
  baseRadius: 0.4,
  radiusJitter: 0.12,
  gridResolution: 0.18,
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

// Repulsion vector pushing 'current' away from every obstacle within influenceRadius.
// closer --> stronger
function repulsionAt(current: Point2D, obstacles: Point2D[], influenceRadius: number): Point2D {
  let rx = 0, ry = 0
  for (const o of obstacles) {
    const dx = current.x - o.x, dy = current.y - o.y
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && d < influenceRadius) {
      const strength = (influenceRadius - d) / influenceRadius // 0..1, stronger when closer
      rx += (dx / d) * strength
      ry += (dy / d) * strength
    }
  }
  return { x: rx, y: ry }
}

// Biased random walk from start toward end.
// At each step, blend a fully random direction with the direction-to-target by 'jitter'
// 0 gives a straight line, higher values wander more while still making progress.
function walkWorm(
  start: Point2D,
  end: Point2D,
  rand: () => number,
  opts: CorridorOptions,
  obstacles: Point2D[],
  influenceRadius: number,
  isBlocked: (p: Point2D) => boolean
): Point2D[] {
  const path: Point2D[] = [start]
  let current = start
  let steps = 0
  while (dist(current, end) > opts.stepSize && steps < opts.maxSteps) {
    const toTarget = normalise(sub(end, current))
    const repulsion = repulsionAt(current, obstacles, influenceRadius)
    const repulsionMag = Math.hypot(repulsion.x, repulsion.y)
    const repulsionDir = repulsionMag > 1e-6 ? scale(repulsion, 1 / repulsionMag) : { x: 0, y: 0 }

    // Scales w/ how hemmed-in the point is, capped so it can still be blended with the target/jitter directions.
    const repulsionWeight = Math.min(repulsionMag * 1.5, 3)

    let next: Point2D | null = null
    for (let attempt = 0; attempt < opts.maxStepAttempts; attempt++) {
      const localJitter = opts.jitter * (1 - attempt / opts.maxStepAttempts)
      const angle = rand() * Math.PI * 2
      const randomDir: Point2D = { x: Math.cos(angle), y: Math.sin(angle) }
      const blended = add(
        add(scale(toTarget, 1 - localJitter), scale(randomDir, localJitter)),
        scale(repulsionDir, repulsionWeight)
      )
      const dir = normalise(blended)
      const candidate = add(current, scale(dir, opts.stepSize))
      if (!isBlocked(candidate)) {
        next = candidate
        break
      }
    }
    // Last resort-----
    // if every blended attempt was still blocked, push straight away from the nearest obstacle.
    current = next ?? add(current, scale(repulsionMag > 1e-6 ? repulsionDir : toTarget, opts.stepSize))
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
// for each connection --> builds the set of solid room cells the tunnel cannot pass through.
export function carveCorridors(
  rooms: { cells: HexCoord[] }[],
  connections: Connection[],
  rand: () => number,
  options: Partial<CorridorOptions> = {}
): Point2D[][] {
  const opts: CorridorOptions = { ...DEFAULT_OPTIONS, ...options }
  const outlines: Point2D[][] = []

  // A room cell is "solid" out to its inradius; the tunnel's own metaballs add up to (baseRadius + radiusJitter)
  // beyond the path centreline, so push the clearance out that far too
  const clearance = HEX_INRADIUS + opts.baseRadius + opts.radiusJitter
  // Repulsion starts influencing the walk before it's actually at risk of violating clearance --> giving room to steer clear
  const influenceRadius = clearance + 1.0

  for (const connection of connections) {
    const obstacleCenters: Point2D[] = rooms
      .flatMap((room, idx) => (idx === connection.a || idx === connection.b ? [] : room.cells))
      .map(cell => hexToPixel(cell, UNIT_RADIUS))
    const isBlocked = (p: Point2D) => obstacleCenters.some(c => dist(p, c) < clearance)

    const start = hexEdgeMidpoint(connection.entranceA, UNIT_RADIUS)
    const end = hexEdgeMidpoint(connection.entranceB, UNIT_RADIUS)

    const path = walkWorm(start, end, rand, opts, obstacleCenters, influenceRadius, isBlocked)
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