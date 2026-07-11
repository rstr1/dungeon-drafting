import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  type DungeonMap,
  type HexCoord,
  type RoomTag,
  hexToPixel,
  hexCorners,
  hexFromKey,
  hexKey,
  hexNeighbour,
  hexEdgeCorners,
  edgeKey,
} from '../algorithms/types'
import { DEFAULT_PALETTE } from '../lib/palette'

type HexGridProps = {
  dungeon: DungeonMap
  outerRadius?: number
  fillColour?: string
  lineColour?: string
  backgroundColour?: string
  wallColour?: string
  wallHeightFraction?: number
  roomTagColours?: Partial<Record<RoomTag, string>>

  // Editor-only interactivity:
  ghostCells?: HexCoord[]       // extra clickable cells not yet part of dungeon.cells
  onCellClick?: (cell: HexCoord) => void
  onEdgeClick?: (cell: HexCoord, direction: number) => void
  highlightCells?: HexCoord[]   // cells drawn in a distinct colour (e.g. room anchor)
  highlightColour?: string
  fixedCenter?: HexCoord        // lock camera to specific cell (in RoomEditor)
}

//---------------------------------------//
//  Constants                            //
//---------------------------------------//

const DEFAULT_OUTER_RADIUS = 32
const SIDEBAR_WIDTH = 260
const DEFAULT_WALL_HEIGHT_FRACTION = 0.5
const CAMERA_FOV = 40

//---------------------------------------//
//  HexGrid Function                     //
//---------------------------------------//

export default function HexGrid({
  dungeon,
  outerRadius = DEFAULT_OUTER_RADIUS,
  fillColour = DEFAULT_PALETTE.hexFill,
  lineColour = DEFAULT_PALETTE.hexOutline,
  backgroundColour = DEFAULT_PALETTE.background,
  wallColour = DEFAULT_PALETTE.wallColour,
  wallHeightFraction = DEFAULT_WALL_HEIGHT_FRACTION,
  roomTagColours,
  ghostCells,
  onCellClick,
  onEdgeClick,
  highlightCells,
  highlightColour = DEFAULT_PALETTE.accent,
  fixedCenter,
}: HexGridProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef      = useRef<THREE.Scene | null>(null)
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef   = useRef<OrbitControls | null>(null)
  const rafRef        = useRef<number | null>(null)

  // Kept fresh via effects below
  const onCellClickRef = useRef(onCellClick)
  const onEdgeClickRef = useRef(onEdgeClick)
  useEffect(() => { onCellClickRef.current = onCellClick }, [onCellClick])
  useEffect(() => { onEdgeClickRef.current = onEdgeClick }, [onEdgeClick])
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const rect   = container.getBoundingClientRect()
    const width  = rect.width  || window.innerWidth - SIDEBAR_WIDTH
    const height = rect.height || window.innerHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    renderer.setClearColor(backgroundColour)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Perspective camera
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 10000)
    camera.position.set(0, 500, 500)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true
    controlsRef.current = controls

    drawDungeon(scene, dungeon, outerRadius, fillColour, lineColour, wallColour, wallHeightFraction, ghostCells, roomTagColours, highlightCells, highlightColour, fixedCenter)

    // Click-to-select: raycast against tagged meshes (hexCell / hexEdge).
    // Edge hits take priority since edge markers are more specific targets.
    // Uses our own pointerdown/pointerup distance check rather than the
    // browser's native 'click' event — a camera-rotate drag can still
    // register as a "click" under the browser's own (very small) movement
    // threshold, which was placing/toggling cells while just orbiting.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const CLICK_DRAG_THRESHOLD = 6 // pixels
    let pointerDownPos: { x: number; y: number } | null = null

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const start = pointerDownPos
      pointerDownPos = null
      if (!start) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_DRAG_THRESHOLD) return // was a drag, not a click

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, false)

      for (const hit of hits) {
        const edgeData = hit.object.userData['hexEdge'] as { cell: HexCoord; direction: number } | undefined
        if (edgeData && onEdgeClickRef.current) {
          onEdgeClickRef.current(edgeData.cell, edgeData.direction)
          return
        }
        const cellData = hit.object.userData['hexCell'] as HexCoord | undefined
        if (cellData && onCellClickRef.current) {
          onCellClickRef.current(cellData)
          return
        }
      }
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

    // Render loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Return
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      rendererRef.current  = null
      sceneRef.current     = null
      cameraRef.current    = null
      controlsRef.current  = null
    }
  }, [])

  // Redraw on dungeon/radius/colour change, preserve camera position
  useEffect(() => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    const camera = cameraRef.current
    if (!scene || !renderer || !camera) return
    renderer.setClearColor(backgroundColour)
    drawDungeon(scene, dungeon, outerRadius, fillColour, lineColour, wallColour, wallHeightFraction, ghostCells, roomTagColours, highlightCells, highlightColour, fixedCenter)
    renderer.render(scene, camera)
  }, [dungeon, outerRadius, fillColour, lineColour, backgroundColour, wallColour, wallHeightFraction, ghostCells, roomTagColours, highlightCells, highlightColour, fixedCenter])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '600px' }}
    />
  )
}

//---------------------------------------//
//  Draw Dungeon Function                //
//---------------------------------------//

// Clears + rebuilds all hex floor/outline/wall/entrance/ghost meshes
function drawDungeon(
  scene: THREE.Scene,
  dungeon: DungeonMap,
  outerRadius: number,
  fillColour: string,
  lineColour: string,
  wallColour: string,
  wallHeightFraction: number,
  ghostCells?: HexCoord[],
  roomTagColours?: Partial<Record<RoomTag, string>>,
  highlightCells?: HexCoord[],
  highlightColour?: string,
  fixedCenter?: HexCoord,
) {
  const toRemove = scene.children.filter(c => c.userData['isDungeonHex'])
  toRemove.forEach(c => {
    scene.remove(c)
    if (c instanceof THREE.Mesh) c.geometry.dispose()
    if (c instanceof THREE.Line) c.geometry.dispose()
  })

  const hex_array = Array.from(dungeon.cells).map(hexFromKey)
  const occupiedKeys = new Set(dungeon.cells)

  // Centering --> normally bounding box of occupied cells, recomputed as dungeon changes
  let centerX: number
  let centerY: number
  if (fixedCenter) {
    const p = hexToPixel(fixedCenter, outerRadius)
    centerX = p.x
    centerY = p.y
  } else {
    const anchorPixels = hex_array.length > 0 ? hex_array.map(h => hexToPixel(h, outerRadius)) : [hexToPixel({ q: 0, r: 0 }, outerRadius)]
    const minX = Math.min(...anchorPixels.map(p => p.x))
    const maxX = Math.max(...anchorPixels.map(p => p.x))
    const minY = Math.min(...anchorPixels.map(p => p.y))
    const maxY = Math.max(...anchorPixels.map(p => p.y))
    centerX = (minX + maxX) / 2
    centerY = (minY + maxY) / 2
  }

  const strokeMat = new THREE.LineBasicMaterial({ color: lineColour })
  const wallMat   = new THREE.MeshBasicMaterial({ color: wallColour, side: THREE.DoubleSide })
  const ghostMat  = new THREE.MeshBasicMaterial({ color: fillColour, side: THREE.DoubleSide, transparent: true, opacity: 0.15 })
  const entranceMat = new THREE.MeshBasicMaterial({ color: lineColour, side: THREE.DoubleSide, transparent: true, opacity: 0.35 })
  const wallHeight = outerRadius * wallHeightFraction

  // Fill material cache so per-tag/highlight colours don't allocate a new material per hex.
  const fillMatCache = new Map<string, THREE.MeshBasicMaterial>()
  function getFillMat(colour: string): THREE.MeshBasicMaterial {
    let mat = fillMatCache.get(colour)
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide })
      fillMatCache.set(colour, mat)
    }
    return mat
  }

  // Per-cell colour overrides: highlight >> room tag colour
  const cellColour = new Map<string, string>()
  for (const room of dungeon.metadata?.rooms ?? []) {
    const tagColour = room.tag ? roomTagColours?.[room.tag] : undefined
    if (!tagColour) continue
    for (const c of room.cells) cellColour.set(hexKey(c), tagColour)
  }
  for (const h of highlightCells ?? []) {
    if (highlightColour) cellColour.set(hexKey(h), highlightColour)
  }

  // Edges marked as entrances stay open
  const openEdges = new Set<string>()
  for (const room of dungeon.metadata?.rooms ?? []) {
    for (const entrance of room.entrances ?? []) {
      openEdges.add(edgeKey(entrance))
    }
  }

  // Which room (if any) each carved cell belongs to.
  // - Two carved cells only count as "open floor between them" if they're in the same room/roomless
  const cellRoomId = new Map<string, string>()
  for (const room of dungeon.metadata?.rooms ?? []) {
    for (const c of room.cells) cellRoomId.set(hexKey(c), room.id)
  }
  // Returns a hex's corner points already offset into the scene's local coordinate space
  function localCorners(hex: HexCoord) {
    return hexCorners(hex, outerRadius).map(c => ({ x: c.x - centerX, z: c.y - centerY }))
  }

  for (const hex of hex_array) {
    const pts = localCorners(hex)

    // Filled floor tile (XZ plane)
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].z)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z)
    shape.closePath()

    const fillGeo  = new THREE.ShapeGeometry(shape)
    const fillMesh = new THREE.Mesh(fillGeo, getFillMat(cellColour.get(hexKey(hex)) ?? fillColour))
    fillMesh.rotation.x = Math.PI / 2   // rotate XY → XZ plane
    fillMesh.userData['isDungeonHex'] = true
    fillMesh.userData['hexCell'] = hex
    scene.add(fillMesh)

    // Outline
    const linePoints = [...pts, pts[0]].map(p => new THREE.Vector3(p.x, 0, p.z))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      strokeMat
    )
    line.userData['isDungeonHex'] = true
    scene.add(line)

    // Walls / entrance markers: one per edge that isn't shared open floor.
    // Closed edges get a solid wall; open (entrance) edges get a faint marker.
    for (let dir = 0; dir < 6; dir++) {
      const neighbour = hexNeighbour(hex, dir)
      const neighbourCarved = dungeon.cells.has(hexKey(neighbour))
      const sameOpenSpace = neighbourCarved && cellRoomId.get(hexKey(hex)) === cellRoomId.get(hexKey(neighbour))
      if (sameOpenSpace) continue
      const isOpen = openEdges.has(edgeKey({ cell: hex, direction: dir }))

      const [a, b] = hexEdgeCorners(hex, dir, outerRadius)
      const ax = a.x - centerX, az = a.y - centerY
      const bx = b.x - centerX, bz = b.y - centerY
      const height = isOpen ? wallHeight * 0.3 : wallHeight

      const vertices = new Float32Array([
        ax, 0, az,
        bx, 0, bz,
        bx, height, bz,

        ax, 0, az,
        bx, height, bz,
        ax, height, az,
      ])
      const edgeGeo = new THREE.BufferGeometry()
      edgeGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
      edgeGeo.computeVertexNormals()

      const edgeMesh = new THREE.Mesh(edgeGeo, isOpen ? entranceMat : wallMat)
      edgeMesh.userData['isDungeonHex'] = true
      edgeMesh.userData['hexEdge'] = { cell: hex, direction: dir }
      scene.add(edgeMesh)
    }
  }

  // Corridor tunnels (Step B): organic worm/metaball outlines from the
  // algorithm layer, generated in unit-hex-radius space -- scaled here by
  // the live outerRadius so they land in the same pixel space as the hex
  // mesh above.
  drawCorridors(scene, dungeon, outerRadius, centerX, centerY, getFillMat, fillColour, wallMat, strokeMat, wallHeight)

  // Ghost cells --> faint, clickable placeholders for cells not yet in the room
  for (const hex of ghostCells ?? []) {
    if (occupiedKeys.has(hexKey(hex))) continue
    const pts = localCorners(hex)

    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].z)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z)
    shape.closePath()

    const ghostGeo = new THREE.ShapeGeometry(shape)
    const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat)
    ghostMesh.rotation.x = Math.PI / 2
    ghostMesh.userData['isDungeonHex'] = true
    ghostMesh.userData['hexCell'] = hex
    scene.add(ghostMesh)

    const linePoints = [...pts, pts[0]].map(p => new THREE.Vector3(p.x, 0, p.z))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      strokeMat
    )
    line.userData['isDungeonHex'] = true
    scene.add(line)
  }
}

//---------------------------------------//
//  Draw Corridors Function              //
//---------------------------------------//

// Renders each corridor tunnel outline (metadata.corridors, from Step B's
// worm/metaball generation) as a filled floor + a perimeter wall, in
// continuous space -- independent of hex cell boundaries.
//
// Known rough edge: this doesn't attempt a proper boolean merge with the
// room hex mesh at the junction. The worm path starts exactly at the
// room's entrance cell, so the tunnel end overlaps the room there, but the
// two meshes' wall lines won't line up perfectly -- acceptable for now,
// worth revisiting if it looks wrong once actually rendered.
function drawCorridors(
  scene: THREE.Scene,
  dungeon: DungeonMap,
  outerRadius: number,
  centerX: number,
  centerY: number,
  getFillMat: (colour: string) => THREE.MeshBasicMaterial,
  fillColour: string,
  wallMat: THREE.MeshBasicMaterial,
  strokeMat: THREE.LineBasicMaterial,
  wallHeight: number,
) {
  for (const polygon of dungeon.metadata?.corridors ?? []) {
    if (polygon.length < 3) continue

    // Corridor points are generated in unit-hex-radius space (see
    // corridorFill.ts) -- scale by the live outerRadius so they land in the
    // same pixel space as hexToPixel(hex, outerRadius) above, then apply
    // the same centering offset as the hex mesh.
    const pts = polygon.map(p => ({ x: p.x * outerRadius - centerX, z: p.y * outerRadius - centerY }))

    // Filled floor (XZ plane), same construction as a hex floor tile.
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].z)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z)
    shape.closePath()
    const fillGeo = new THREE.ShapeGeometry(shape)
    const fillMesh = new THREE.Mesh(fillGeo, getFillMat(fillColour))
    fillMesh.rotation.x = Math.PI / 2
    fillMesh.userData['isDungeonHex'] = true
    scene.add(fillMesh)

    // Outline
    const linePoints = [...pts, pts[0]].map(p => new THREE.Vector3(p.x, 0, p.z))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), strokeMat)
    line.userData['isDungeonHex'] = true
    scene.add(line)

    // Perimeter wall, batched into ONE mesh for the whole loop rather than
    // one mesh per boundary edge -- these outlines can have 500-1500+
    // points, and a separate THREE.Mesh per edge at that count would tank
    // frame rate. One buffer, many triangles, is cheap; many mesh objects
    // is not.
    const wallVerts: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      wallVerts.push(
        a.x, 0, a.z,
        b.x, 0, b.z,
        b.x, wallHeight, b.z,

        a.x, 0, a.z,
        b.x, wallHeight, b.z,
        a.x, wallHeight, a.z,
      )
    }
    const wallGeo = new THREE.BufferGeometry()
    wallGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallVerts), 3))
    wallGeo.computeVertexNormals()
    const wallMesh = new THREE.Mesh(wallGeo, wallMat)
    wallMesh.userData['isDungeonHex'] = true
    scene.add(wallMesh)
  }
}