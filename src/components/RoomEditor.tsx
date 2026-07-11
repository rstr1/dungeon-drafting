import { useState, useMemo } from 'react'
import type { Palette } from '../lib/palette'
import type { RoomTemplate, RoomTag, HexCoord, HexEdge, DungeonMap } from '../algorithms/types'
import { hexKey, hexDistance } from '../algorithms/types'
import HexGrid from './HexGrid'

//---------------------------------------//
//  Room Editor                          //
//---------------------------------------//
// Authors a RoomTemplate by clicking directly in the 3D view:
//   - click a hex (filled or ghost) to add/remove it from the room
//   - click a wall/entrance marker to toggle it open/closed

const EDIT_RADIUS = 10
const ROOM_TAGS: RoomTag[] = ['spawn', 'exit', 'large', 'small', 'event', 'custom']
const ANCHOR: HexCoord = { q: 0, r: 0 }

type RoomEditorProps = {
  palette: Palette
  wallHeightFraction: number
  roomTemplates: RoomTemplate[]
  onSave: (template: RoomTemplate) => void
  onDelete: (id: string) => void
}

// Turn room name into an id string
function slugify(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug || 'custom-room'
}

// All cells within 'radius' of the anchor (candidate ghost cells).
function candidateCells(radius: number): HexCoord[] {
  const cells: HexCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const cell = { q, r }
      if (hexDistance(ANCHOR, cell) <= radius) cells.push(cell)
    }
  }
  return cells
}

// Editor component --> used to draft a room prefab
// Renders control panel + live preview
export default function RoomEditor({
  palette,
  wallHeightFraction,
  roomTemplates,
  onSave,
  onDelete,
}: RoomEditorProps) {
  const [cells, setCells] = useState<HexCoord[]>([ANCHOR])
  const [entrances, setEntrances] = useState<HexEdge[]>([])
  const [name, setName] = useState('New Room')
  const [tag, setTag] = useState<RoomTag>('custom')
  const [guaranteed, setGuaranteed] = useState(false)
  const [weight, setWeight] = useState(1)
  const [minCount, setMinCount] = useState(0)
  const [maxCount, setMaxCount] = useState<number | ''>('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const resetDraft = () => {
    setCells([ANCHOR])
    setEntrances([])
    setName('New Room')
    setTag('custom')
    setGuaranteed(false)
    setWeight(1)
    setMinCount(0)
    setMaxCount('')
    setEditingId(null)
  }

  // Load an existing saved template into draft for editing
  const loadTemplate = (template: RoomTemplate) => {
    setCells(template.cells)
    setEntrances(template.entrances)
    setName(template.name)
    setTag(template.tag)
    setGuaranteed(template.guaranteed)
    setWeight(template.weight ?? 1)
    setMinCount(template.minCount ?? 0)
    setMaxCount(template.maxCount ?? '')
    setEditingId(template.id)
  }

  const allCandidates = useMemo(() => candidateCells(EDIT_RADIUS), [])

  const ghostCells = useMemo(() => {
    const occupied = new Set(cells.map(hexKey))
    return allCandidates.filter(c => !occupied.has(hexKey(c)))
  }, [allCandidates, cells])

  // Adds/removes a clicked cell from the room
  const handleCellClick = (cell: HexCoord) => {
    if (hexKey(cell) === hexKey(ANCHOR)) return // anchor is always part of the room
    const key = hexKey(cell)
    const included = cells.some(c => hexKey(c) === key)
    if (included) {
      setCells(prev => prev.filter(c => hexKey(c) !== key))
      setEntrances(prev => prev.filter(e => hexKey(e.cell) !== key))
    } else {
      setCells(prev => [...prev, cell])
    }
  }

  // Toggles a clicked edge between wall & entrance
  const handleEdgeClick = (cell: HexCoord, direction: number) => {
    setEntrances(prev =>
      prev.some(e => hexKey(e.cell) === hexKey(cell) && e.direction === direction)
        ? prev.filter(e => !(hexKey(e.cell) === hexKey(cell) && e.direction === direction))
        : [...prev, { cell, direction }]
    )
  }

  const draftMap: DungeonMap = useMemo(
    () => ({
      cells: new Set(cells.map(hexKey)),
      metadata: { rooms: [{ id: 'draft', cells, entrances }] },
    }),
    [cells, entrances]
  )

  // Packages draft into a RoomTemplate and hand it to onSave
  const handleSave = () => {
    if (cells.length === 0) return
    const id = editingId ?? slugify(name)
    onSave({
      id,
      name: name.trim() || 'Untitled Room',
      tag,
      cells,
      entrances,
      guaranteed,
      weight,
      minCount: minCount > 0 ? minCount : undefined,
      maxCount: maxCount === '' ? undefined : maxCount,
    })
    setEditingId(id)
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: palette.textMuted,
    display: 'block',
    marginBottom: '4px',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    fontFamily: 'monospace',
    borderRadius: '4px',
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.textPrimary,
  }
  const hintStyle: React.CSSProperties = {
    fontSize: '12px',
    color: palette.textMuted,
    lineHeight: 1.5,
    margin: 0,
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Editor controls */}
      <div
        style={{
          width: '320px',
          minWidth: '320px',
          padding: '20px 16px',
          overflowY: 'auto',
          borderRight: `1px solid ${palette.border}`,
          background: palette.sidebarBackground,
          color: palette.textPrimary,
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div>
          <label style={labelStyle}>How to use</label>
          <p style={hintStyle}>Click a hex to add/remove it from the room. Click a wall to toggle it into a doorway.</p>
        </div>

        <div>
          <label style={labelStyle}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Tag</label>
          <select value={tag} onChange={e => setTag(e.target.value as RoomTag)} style={inputStyle}>
            {ROOM_TAGS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="guaranteed-checkbox"
            checked={guaranteed}
            onChange={e => setGuaranteed(e.target.checked)}
          />
          <label htmlFor="guaranteed-checkbox" style={{ fontSize: '13px' }}>Guaranteed spawn</label>
        </div>

        {!guaranteed && (
          <>
            <div>
              <label style={labelStyle}>Weight</label>
              <input
                type="number"
                min={0}
                value={weight}
                onChange={e => setWeight(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Min Count</label>
                <input
                  type="number"
                  min={0}
                  value={minCount}
                  onChange={e => setMinCount(Math.max(0, Number(e.target.value)))}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max Count</label>
                <input
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={maxCount}
                  onChange={e => setMaxCount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label style={labelStyle}>Cells ({cells.length})</label>
          <p style={hintStyle}>{cells.map(c => `${c.q},${c.r}`).join('  ')}</p>
        </div>

        <div>
          <label style={labelStyle}>Entrances ({entrances.length})</label>
          <p style={hintStyle}>
            {entrances.length === 0
              ? 'None yet — click a wall in the preview.'
              : entrances.map(e => `${e.cell.q},${e.cell.r}:${e.direction}`).join('  ')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              flex: 1,
              padding: '10px',
              background: palette.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            {editingId ? 'Save Changes' : 'Save Room Template'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetDraft}
              style={{
                padding: '10px',
                background: 'transparent',
                color: palette.textMuted,
                border: `1px solid ${palette.border}`,
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Discard and start a new room"
            >
              New
            </button>
          )}
        </div>

        <div>
          <label style={labelStyle}>Saved Templates</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {roomTemplates.length === 0 && (
              <span style={{ fontSize: '12px', color: palette.textMuted }}>None yet.</span>
            )}
            {roomTemplates.map(t => (
              <div
                key={t.id}
                onClick={() => loadTemplate(t)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: editingId === t.id ? palette.accent : 'transparent',
                  color: editingId === t.id ? '#fff' : palette.textPrimary,
                }}
                title="Click to edit"
              >
                <span>{t.name} ({t.tag})</span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    if (editingId === t.id) resetDraft()
                    onDelete(t.id)
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live 3D preview — reuses HexGrid so walls/entrances render identically to the main view */}
      <div style={{ flex: 1 }}>
        <HexGrid
          dungeon={draftMap}
          fillColour={palette.hexFill}
          lineColour={palette.hexOutline}
          backgroundColour={palette.background}
          wallColour={palette.wallColour}
          wallHeightFraction={wallHeightFraction}
          ghostCells={ghostCells}
          onCellClick={handleCellClick}
          onEdgeClick={handleEdgeClick}
          fixedCenter={ANCHOR}
          highlightCells={[ANCHOR]}
          highlightColour={palette.accent}
          roomTagColours={palette.roomTagColours}
        />
      </div>
    </div>
  )
}