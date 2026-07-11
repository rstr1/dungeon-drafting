import type { Point2D } from '../algorithms/types'

//---------------------------------------//
//  Marching Squares                     //
//---------------------------------------//
// Turns a scalar field into closed polygon outline(s).
// Shared by corridorFill.ts and later, cavernFill.ts
//
// Correctness note:
// A shared interior grid edge is sampled independently by its two neighbouring cells.
// Both computations are mathematically the same point but can land a few floating-point bits apart
// This breaks exact-match chaining into hundreds of fragments.
// Coordinates are quantised before being used as chain keys to collapse those near-duplicates.

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

const QUANTISE = 1e6

function quantiseKey(p: Point2D): string {
  return `${Math.round(p.x * QUANTISE)}|${Math.round(p.y * QUANTISE)}`
}

function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

// sampleFn: negative = inside the shape, positive = outside(a signed field).
//
// Returns one polygon per closed contour found.
// Loops under minLoopPoints are boundary/degenerate artifacts and are dropped.
export function marchingSquares(
  sampleFn: (p: Point2D) => number,
  bounds: Bounds,
  cellSize: number,
  minLoopPoints = 10
): Point2D[][] {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cellSize)
  const rows = Math.ceil((bounds.maxY - bounds.minY) / cellSize)

  // Pre-sample the whole grid once so each corner is evaluated exactly once.
  const grid: number[][] = []
  for (let j = 0; j <= rows; j++) {
    const row: number[] = []
    for (let i = 0; i <= cols; i++) {
      row.push(sampleFn({ x: bounds.minX + i * cellSize, y: bounds.minY + j * cellSize }))
    }
    grid.push(row)
  }

  // For each cell, walk its 4 edges in perimeter order and record where the field crosses zero.
  // 2 crossings -> one boundary segment through the cell.
  // 4 crossings -> two segments, paired in the order encountered.
  const segments: [Point2D, Point2D][] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x0 = bounds.minX + i * cellSize
      const y0 = bounds.minY + j * cellSize
      const corners: Point2D[] = [
        { x: x0, y: y0 },
        { x: x0 + cellSize, y: y0 },
        { x: x0 + cellSize, y: y0 + cellSize },
        { x: x0, y: y0 + cellSize },
      ]
      const values = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]

      const crossings: Point2D[] = []
      for (let k = 0; k < 4; k++) {
        const a = k, b = (k + 1) % 4
        const va = values[a], vb = values[b]
        if ((va < 0) !== (vb < 0)) {
          crossings.push(lerp(corners[a], corners[b], va / (va - vb)))
        }
      }
      if (crossings.length === 2) {
        segments.push([crossings[0], crossings[1]])
      } else if (crossings.length === 4) {
        segments.push([crossings[0], crossings[1]])
        segments.push([crossings[2], crossings[3]])
      }
    }
  }

  // Chain segments into closed loops via shared (quantised) endpoints.
  const bucket = new Map<string, { idx: number; end: 0 | 1 }[]>()
  segments.forEach((seg, idx) => {
    for (const end of [0, 1] as const) {
      const k = quantiseKey(seg[end])
      const list = bucket.get(k)
      if (list) list.push({ idx, end })
      else bucket.set(k, [{ idx, end }])
    }
  })

  const usedSeg = new Set<number>()
  const loops: Point2D[][] = []
  for (let s = 0; s < segments.length; s++) {
    if (usedSeg.has(s)) continue
    usedSeg.add(s)
    const loop: Point2D[] = [segments[s][0], segments[s][1]]
    let guard = 0
    while (guard++ < segments.length * 2) {
      const candidates = bucket.get(quantiseKey(loop[loop.length - 1])) ?? []
      const next = candidates.find(c => !usedSeg.has(c.idx))
      if (!next) break // dangling end -- shouldn't happen with a well-padded field, stop defensively
      usedSeg.add(next.idx)
      const seg = segments[next.idx]
      const other = next.end === 0 ? seg[1] : seg[0]
      if (quantiseKey(other) === quantiseKey(loop[0])) break // closed
      loop.push(other)
    }
    if (loop.length >= minLoopPoints) loops.push(loop)
  }
  return loops
}