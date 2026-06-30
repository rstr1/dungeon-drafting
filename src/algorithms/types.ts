//---------------------------------------//
//  Hexagonal System                     //
//---------------------------------------//
// reference --> https://www.redblobgames.com/grids/hexagons/
// using flat-top orientation for North and South faces

// Coordinate System
// 's' --> s = -q -r
export type HexCoord = {
    q: number // column
    r: number // row
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


//---------------------------------------//
//  Dungeon System                       //
//---------------------------------------//




//---------------------------------------//
//  Algorithms                           //
//---------------------------------------//