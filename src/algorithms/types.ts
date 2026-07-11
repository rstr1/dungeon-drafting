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

//---------------------------------------//
//  Neighbour Functions                  //
//---------------------------------------//

// Get HexCoords for neighbouring cells
export function hexNeighbour(hex: HexCoord, direction: number): HexCoord {
    const dir = HEX_DIRECTIONS[direction % 6]
    return { q: hex.q + dir.q, r: hex.r + dir.r }
}

// Get HexCoords for all neighbouring cells
export function hexNeighbours(hex: HexCoord): HexCoord[] {
    return HEX_DIRECTIONS.map((_, i) => hexNeighbour(hex, i))
}

//---------------------------------------//
//  Rotation Functions                   //
//---------------------------------------//

// Rotate a hex coordinate around the origin in 60-degree increments
export function rotateHex(hex: HexCoord, steps: number): HexCoord {
    const n = ((steps % 6) + 6) % 6
    let q = hex.q
    let r = hex.r
    let s = -q -r
    for (let i = 0; i < n; i++) {
        const nq = -s
        const nr = -q
        const ns = -r
        q = nq; r = nr; s = ns
    }
    return { q, r }
}

// Rotate every hex in a structure around a given anchor cell
// (default anchor: origin)
export function rotateStructure(cells: HexCoord[], steps: number, anchor: HexCoord = { q: 0, r: 0 }): HexCoord[] {
    return cells.map(c => {
        const relative = { q: c.q - anchor.q, r: c.r - anchor.r }
        const rotated = rotateHex(relative, steps)
        return { q: rotated.q + anchor.q, r: rotated.r + anchor.r }
    })
}

//---------------------------------------//
//  Distance Functions                   //
//---------------------------------------//

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
//  Edge System                          //
//---------------------------------------//

// HexEdge holds references to its parent HexCell and its direction
export type HexEdge = {
    cell: HexCoord
    direction: number
}

// String key for an edge.
export function edgeKey(edge: HexEdge): string {
    return `${hexKey(edge.cell)}|${edge.direction}`
}

// Rotate a set of edges around an anchor cell
export function rotateEdges(edges: HexEdge[], steps: number, anchor: HexCoord = { q: 0, r: 0 }): HexEdge[] {
    const n = ((steps % 6) + 6) % 6
    return edges.map(e => ({
        cell: rotateStructure([e.cell], n, anchor)[0],
        direction: (e.direction + n) % 6,
    }))
}

// The two corner points shared by a cell and its neighbour in a given direction.
export function hexEdgeCorners(
    hex: HexCoord,
    direction: number,
    outerRadius: number
): [{ x: number; y: number }, { x: number; y: number }] {
    const centre = hexToPixel(hex, outerRadius)
    const corners = hexCorners(hex, outerRadius)
    const dir = HEX_DIRECTIONS[((direction % 6) + 6) % 6]
    const dirVec = hexToPixel(dir, outerRadius)
    const dirAngle = Math.atan2(dirVec.y, dirVec.x)

    let bestIdx = 0
    let bestDiff = Infinity
    for (let i = 0; i < 6; i++) {
        const a = corners[i]
        const b = corners[(i + 1) % 6]
        const midX = (a.x + b.x) / 2 - centre.x
        const midY = (a.y + b.y) / 2 - centre.y
        const edgeAngle = Math.atan2(midY, midX)
        let diff = Math.abs(edgeAngle - dirAngle)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (diff < bestDiff) {
            bestDiff = diff
            bestIdx = i
        }
    }
    return [corners[bestIdx], corners[(bestIdx + 1) % 6]]
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
        rooms?: { id: string; tag?: RoomTag; cells: HexCoord[]; entrances?: HexEdge[] }[]
        connections?: [HexCoord, HexCoord]
        optionalRoomCount?: number
        numLevels?: number
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
    generate: (params: Record<string, number | boolean>, roomTemplates?: RoomTemplate[]) => DungeonMap
}

//---------------------------------------//
//  Room Templates                       //
//---------------------------------------//

// Built-in categories for prefabbed rooms
export type RoomTag = 'spawn' | 'exit' | 'large' | 'small' | 'event' | 'custom'

// Prefabbed room shape (defined relative to [0, 0])
export type RoomTemplate = {
    id: string
    name: string
    tag: RoomTag
    cells: HexCoord[]       // structure/shape of room
    entrances: HexEdge[]    // open walls / attachment points
    guaranteed: boolean     // must always be placed
    minCount?: number       // floor on # of this room template
    maxCount?: number       // cap out on # of this room template
    weight?: number         // for skewing spawn chances
}

// Template placed in the world
export type RoomInstance = {
    templateId: string
    tag: RoomTag
    anchor: HexCoord
    rotation: number        // 0-5 * 60 degree turns
    cells: HexCoord[]       // world-space cells
    entrances: HexEdge[]    // world-space open walls
}

//---------------------------------------//
//  Connection Graph                     //
//---------------------------------------//
// A single edge in the room-connectivity graph

export type Connection = {
    a: number
    b: number
    entranceA: HexEdge
    entranceB: HexEdge
}