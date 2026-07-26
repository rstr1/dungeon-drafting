import { rng } from './rng'

//---------------------------------------//
//  Noise                                //
//---------------------------------------//
// Seeded 2D Perlin noise + fBm (fractal Brownian motion) via shared mulberry32 rng()

export type NoiseFn = (x: number, y: number) => number

const PERM_SIZE = 256

// 8 evenly-spaced unit gradient vectors
const GRADIENTS: [number, number][] = (
  [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]
).map(([x, y]) => {
  const len = Math.hypot(x, y)
  return [x / len, y / len]
})

// Seeded Fisher-Yates shuffle of 0..255 using the project's shared rng().
function buildPermutation(seed: number): Uint8Array {
  const rand = rng(seed)
  const perm = new Uint8Array(PERM_SIZE)
  for (let i = 0; i < PERM_SIZE; i++) perm[i] = i
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = perm[i]
    perm[i] = perm[j]
    perm[j] = tmp
  }
  return perm
}

function fade(t: number): number {
  // Perlin's improved quintic smootherstep
  // zero 1st & 2nd derivative at 0/1, avoids grid-aligned artifacts you may get from a plain t*t*(3-2t) or linear fade.
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Builds a seeded 2D Perlin noise function.
// Same seed --> identical field every time (deterministic dungeon generation)
export function createNoise2D(seed: number): NoiseFn {
  const perm = buildPermutation(seed)
  const hash = (i: number, j: number) => perm[(perm[i & 255] + j) & 255]
  const gradAt = (i: number, j: number) => GRADIENTS[hash(i, j) % GRADIENTS.length]

  return function noise2D(x: number, y: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y)
    const x1 = x0 + 1, y1 = y0 + 1
    const sx = fade(x - x0), sy = fade(y - y0)

    const dot = (gi: number, gj: number, px: number, py: number) => {
      const [gx, gy] = gradAt(gi, gj)
      return gx * (px - gi) + gy * (py - gj)
    }

    const n00 = dot(x0, y0, x, y)
    const n10 = dot(x1, y0, x, y)
    const n01 = dot(x0, y1, x, y)
    const n11 = dot(x1, y1, x, y)

    const ix0 = lerp(n00, n10, sx)
    const ix1 = lerp(n01, n11, sx)
    return lerp(ix0, ix1, sy)
  }
}

// Fractal Brownian motion
// -  layers several octaves of the base noise so the field
// -  Each octave halves in amplitude (persistence) and doubles in frequency (lacunarity).
export function createFbm2D(
  seed: number,
  octaves = 4,
  persistence = 0.5,
  lacunarity = 2
): NoiseFn {
  const base = createNoise2D(seed)
  return function fbm(x: number, y: number): number {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxAmplitude = 0
    for (let o = 0; o < octaves; o++) {
      total += base(x * frequency, y * frequency) * amplitude
      maxAmplitude += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    return total / maxAmplitude // renormalised back to roughly [-1, 1]
  }
}