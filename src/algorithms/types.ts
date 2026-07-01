//---------------------------------------//
//  Hexagonal System                     //
//---------------------------------------//
// reference --> https://www.redblobgames.com/grids/hexagons/
// using flat-top orientation for North and South faces

// Coordinate System
// 's' --> s = -q -r
// see reference to understand
export type HexCoord = {
    q: number
    r: number
}

// 6 Axial Directions
export const HEX_DIRECTIONS: HexCoord[] = [
    { q: 0, r: -1 },  // N  = 0
    { q: +1, r: -1 }, // NE = 1
    { q: +1, r: 0 },  // SE = 2
    { q: 0, r: +1 },  // S  = 3
    { q: -1, r: +1 }, // SW = 4
    { q: -1, r: 0 },  // NW = 5
]

// string representation of hex coord
export function hexKey(hex: HexCoord): string {
    return `${hex.q}, ${hex.r}`
}

// HexCoord from string
export function hexFromKey(key: string): HexCoord {
    const [q, r] = key.split(',').map(Number)
    return { q, r }
}

// Get HexCoords for neighbouring cells
export function hexNeighbour(hex: HexCoord, direction: number): HexCoord {
    const dir = HEX_DIRECTIONS[direction % 6]
    return { q: hex.q + dir.q, r: hex.r + dir.r }
}

// Get HexCoords for all neighbouring cells
export function hexNeighbours(hex: HexCoord): HexCoord[] {
    return HEX_DIRECTIONS.map((_, i) => hexNeighbour(hex, i))
}

// Manhattan distance between hexes
export function hexDistance(a: HexCoord, b: HexCoord): number {
    return (
        (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r))/2
    )
}


//---------------------------------------//
//  Drawing System                       //
//---------------------------------------//

// HexCoord --> pixel position
export function hexToPixel(hex: HexCoord, outerRadius: number): { x: number; y: number } {
    const x = outerRadius * 1.5 * hex.q
    const y = outerRadius * ((Math.sqrt(3)/2) * hex.q + Math.sqrt(3) * hex.r)
    return {x, y}
}

// 6 corners of a hex in pixel space
export function hexCorners(hex: HexCoord, outerRadius: number): { x: number; y: number}[] {
    const corners: { x: number; y: number}[] = []
    const centre = hexToPixel(hex, outerRadius)
    for (let i = 0; i < 6; i++) {
        const angleRadians = (Math.PI / 180) * 60 * i
        corners.push({
            x: centre.x + outerRadius * Math.cos(angleRadians),
            y: centre.y + outerRadius * Math.sin(angleRadians),
        })
    }
    return corners
}

//---------------------------------------//
//  Dungeon System                       //
//---------------------------------------//

// Dungeon map --> metadata to define rooms and hallways
// This is what gets rendered.
// Every algorithm implementation should output one of these
export type DungeonMap = {
    cells: Set<string>
    metadata?: {
        rooms?: { id: string; cells: HexCoord[] }[]
        connections?: [HexCoord, HexCoord]
    }
}


//---------------------------------------//
//  Algorithms                           //
//---------------------------------------//

// Single user-adjustable parameter for an algorithm.
export type ParamDefinition =
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: 'boolean'; default: boolean }

// Algorithm type
export type Algorithm = {
    id: string
    name: string
    description: string
    params: ParamDefinition[]
    generate: (params: Record<string, number | boolean>) => DungeonMap
}