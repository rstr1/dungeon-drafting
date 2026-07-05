import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { type DungeonMap, hexToPixel, hexCorners, hexFromKey } from '../algorithms/types'
import { DEFAULT_PALETTE } from '../lib/palette'

type HexGridProps = {
  dungeon: DungeonMap
  outerRadius?: number
  fillColour?: string
  lineColour?: string
  backgroundColour?: string
}

//---------------------------------------//
//  Constants                            //
//---------------------------------------//

const DEFAULT_OUTER_RADIUS = 32
const SIDEBAR_WIDTH = 260

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
}: HexGridProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef      = useRef<THREE.Scene | null>(null)
  const cameraRef     = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef   = useRef<OrbitControls | null>(null)
  const rafRef        = useRef<number | null>(null)

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

    drawDungeon(scene, dungeon, outerRadius, fillColour, lineColour)

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
    drawDungeon(scene, dungeon, outerRadius, fillColour, lineColour)
    renderer.render(scene, camera)
  }, [dungeon, outerRadius, fillColour, lineColour, backgroundColour])

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
function drawDungeon(
  scene: THREE.Scene,
  dungeon: DungeonMap,
  outerRadius: number,
  fillColour: string,
  lineColour: string,
) {
  const toRemove = scene.children.filter(c => c.userData['isDungeonHex'])
  toRemove.forEach(c => {
    scene.remove(c)
    if (c instanceof THREE.Mesh) c.geometry.dispose()
    if (c instanceof THREE.Line) c.geometry.dispose()
  })

  const hex_array = Array.from(dungeon.cells).map(hexFromKey)
  if (hex_array.length === 0) return

  const pixels  = hex_array.map(h => hexToPixel(h, outerRadius))
  const minX    = Math.min(...pixels.map(p => p.x))
  const maxX    = Math.max(...pixels.map(p => p.x))
  const minY    = Math.min(...pixels.map(p => p.y))
  const maxY    = Math.max(...pixels.map(p => p.y))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const fillMat   = new THREE.MeshBasicMaterial({ color: fillColour, side: THREE.DoubleSide })
  const strokeMat = new THREE.LineBasicMaterial({ color: lineColour })

  for (const hex of hex_array) {
    const corners = hexCorners(hex, outerRadius)

    // Map hex XY (screen space, Y-down) → Three.js XZ plane (Y-up world)
    const pts = corners.map(c => ({
      x: c.x - centerX,
      z: c.y - centerY,
    }))

    // Filled floor tile (XZ plane)
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].z)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z)
    shape.closePath()

    const fillGeo  = new THREE.ShapeGeometry(shape)
    const fillMesh = new THREE.Mesh(fillGeo, fillMat)
    fillMesh.rotation.x = Math.PI / 2   // rotate XY → XZ plane
    fillMesh.userData['isDungeonHex'] = true
    scene.add(fillMesh)

    // Outline
    const linePoints = [...pts, pts[0]].map(p => new THREE.Vector3(p.x, 0, p.z))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePoints),
      strokeMat
    )
    line.userData['isDungeonHex'] = true
    scene.add(line)
  }
}