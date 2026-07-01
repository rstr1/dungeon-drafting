// Generates random number using mulberry32
export function rng(seed: number): () => number {
    // unsigned right shift --> treat as unsigned 32-bit int
    let s = seed >>> 0
    return function rand(): number {
        s += 0x6d2b79f5
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
        return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff
    }
}

// Returns a random int from [min, max] inclusive.
export function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}