import { useState, useCallback, useEffect, useRef } from 'react'
import { ALGORITHMS } from './algorithms/registry'
import type { DungeonMap, Algorithm, RoomTemplate, RoomTag } from './algorithms/types'
import HexGrid from './components/HexGrid'
import RoomEditor from './components/RoomEditor'
import { exportConfig, importConfig } from './lib/persistence'
import { type Palette, DEFAULT_PALETTE, clonePalette } from './lib/palette'

//---------------------------------------//
//  Constants                            //
//---------------------------------------//

const ROOM_TAGS: RoomTag[] = ['spawn', 'exit', 'large', 'small', 'event', 'custom']
const ROOM_TEMPLATES_STORAGE_KEY = 'dungeon-drafting:roomTemplates'


//---------------------------------------//
//  Room Templates                       //
//---------------------------------------//
const DEFAULT_ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'spawn-cell',
    name: 'Spawn Cell',
    tag: 'spawn',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ cell: { q: 0, r: 0 }, direction: 0 }],
    guaranteed: true,
  },
  {
    id: 'exit-cell',
    name: 'Exit Cell',
    tag: 'exit',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ cell: { q: 0, r: 0 }, direction: 0 }],
    guaranteed: true,
  },
]

// Builds a params object from algorithm's param definitions
function buildDefaultParams(algorithm: Algorithm): Record<string, number | boolean> {
  return Object.fromEntries(algorithm.params.map(p => [p.key, p.default]))
}

// Reads saved room templates from localStorage
function loadStoredRoomTemplates(): RoomTemplate[] {
  try {
    const raw = localStorage.getItem(ROOM_TEMPLATES_STORAGE_KEY)
    if (!raw) return DEFAULT_ROOM_TEMPLATES
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RoomTemplate[]) : DEFAULT_ROOM_TEMPLATES
  } catch {
    return DEFAULT_ROOM_TEMPLATES
  }
}

//---------------------------------------//
//  App Function                         //
//---------------------------------------//

export default function App() {

  // CONSTANTS
  const [activeTab, setActiveTab] = useState<'generator' | 'roomEditor'>('generator')
  const [selectedId, setSelectedId] = useState(ALGORITHMS[0].id)
  const algorithm = ALGORITHMS.find(a => a.id === selectedId)!
  const [params, setParams] = useState<Record<string, number | boolean>>(
    buildDefaultParams(algorithm)
  )
  const [roomTemplates, setRoomTemplates] = useState<RoomTemplate[]>(loadStoredRoomTemplates)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dungeon, setDungeon] = useState<DungeonMap>(() =>
    algorithm.generate(buildDefaultParams(algorithm), roomTemplates)
  )

  useEffect(() => {
    console.log('rooms:', dungeon.metadata?.rooms?.length)
    console.log('connections:', dungeon.metadata?.connections?.length)
    console.log('corridors:', dungeon.metadata?.corridors?.length)
  }, [dungeon])

  const [palette, setPalette] = useState<Palette>(() => clonePalette(DEFAULT_PALETTE))
  const [wallHeightFraction, setWallHeightFraction] = useState(0.5)

  // UseEffects
  useEffect(() => {
    try {
      localStorage.setItem(ROOM_TEMPLATES_STORAGE_KEY, JSON.stringify(roomTemplates))
    } catch {
      //
    }
  }, [roomTemplates])

  // Updates a top-level palette colour field
  const handlePaletteChange = useCallback(
    (key: keyof Omit<Palette, 'roomTagColours'>, value: string) => {
      setPalette(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  // Updates one room tag's colour inside palette.roomTagColours
  const handleRoomTagColourChange = useCallback((tag: RoomTag, value: string) => {
    setPalette(prev => ({ ...prev, roomTagColours: { ...prev.roomTagColours, [tag]: value } }))
  }, [])

  // Inserts a new room template or overwrites an existing one by id
  const handleSaveRoomTemplate = useCallback((template: RoomTemplate) => {
    setRoomTemplates(prev => {
      const exists = prev.some(t => t.id === template.id)
      return exists ? prev.map(t => (t.id === template.id ? template : t)) : [...prev, template]
    })
  }, [])

  //Removes a room template by id
  const handleDeleteRoomTemplate = useCallback((id: string) => {
    setRoomTemplates(prev => prev.filter(t => t.id !== id))
  }, [])

  // Switches active algorithm --> regenerates with defaults
  const handleAlgorithmChange = useCallback((id: string) => {
    const next = ALGORITHMS.find(a => a.id === id)!
    const defaults = buildDefaultParams(next)
    setSelectedId(id)
    setParams(defaults)
    setDungeon(next.generate(defaults, roomTemplates))
  }, [roomTemplates])

  // Updates a algorithm parameter value
  const handleParamChange = useCallback(
    (key: string, value: number | boolean) => {
      setParams(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  // Rolls a random seed
  const handleRandomiseSeed = useCallback(
    (param: Extract<Algorithm['params'][number], { type: 'number' }>) => {
      const value = Math.floor(Math.random() * (param.max - param.min + 1)) + param.min
      setParams(prev => ({ ...prev, [param.key]: value }))
    },
    []
  )

  //Rerun the current algo w/ current params/templates
  const handleGenerate = useCallback(() => {
    setDungeon(algorithm.generate(params, roomTemplates))
  }, [algorithm, params, roomTemplates])

  // Downloads current config as JSON
  const handleExport = useCallback(() => {
    exportConfig({
      algorithmId: selectedId,
      params,
      palette,
      wallHeightFraction,
      roomTemplates,
    })
  }, [selectedId, params, palette, wallHeightFraction, roomTemplates])

  // Parse an uploaded file --> apply to application state
  const handleImportFile = useCallback(async (file: File) => {
    try {
      const config = await importConfig(file)
      const next = ALGORITHMS.find(a => a.id === config.algorithmId)
      if (next) {
        setSelectedId(next.id)
        setParams(config.params)
        setDungeon(next.generate(config.params, config.roomTemplates))
      }
      setPalette(clonePalette(config.palette))
      setWallHeightFraction(config.wallHeightFraction)
      setRoomTemplates(config.roomTemplates)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import preset.')
    }
  }, [])

  //---------------------------------------//
  //  Return Function                      //
  //---------------------------------------//

  const styles = buildStyles(palette)

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <h1 style={styles.title}>Dungeon Drafting</h1>

        {/* Tab switcher */}
        <div style={styles.tabRow}>
          <button
            type="button"
            style={activeTab === 'generator' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('generator')}
          >
            Generator
          </button>
          <button
            type="button"
            style={activeTab === 'roomEditor' ? styles.tabButtonActive : styles.tabButton}
            onClick={() => setActiveTab('roomEditor')}
          >
            Room Editor
          </button>
        </div>

        {activeTab === 'generator' && (
        <>
        {/* Algorithm picker */}
        <section style={styles.section}>
          <label style={styles.label}>Algorithm</label>
          <select
            style={styles.select}
            value={selectedId}
            onChange={e => handleAlgorithmChange(e.target.value)}
          >
            {ALGORITHMS.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p style={styles.description}>{algorithm.description}</p>
        </section>

        {/* Seed + Generate */}
        <section style={styles.section}>
          <label style={styles.label}>Seed</label>
          {(() => {
            const seedParam = algorithm.params.find(
              (p): p is Extract<Algorithm['params'][number], { type: 'number' }> =>
                p.key === 'seed' && p.type === 'number'
            )
            if (!seedParam) return null
            return (
              <div style={styles.seedRow}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(params[seedParam.key])}
                  onChange={e => {
                    const digitsOnly = e.target.value.replace(/[^0-9]/g, '')
                    if (digitsOnly === '') {
                      handleParamChange(seedParam.key, 0)
                      return
                    }
                    const clamped = Math.min(seedParam.max, Math.max(seedParam.min, Number(digitsOnly)))
                    handleParamChange(seedParam.key, clamped)
                  }}
                  style={styles.seedInput}
                />
                <button
                  type="button"
                  style={styles.randomiseButton}
                  onClick={() => handleRandomiseSeed(seedParam)}
                  title="Randomise seed"
                >
                  🎲
                </button>
              </div>
            )
          })()}
          <button style={styles.button} onClick={handleGenerate}>
            Generate
          </button>
        </section>

        {/* Parameter panel */}
        <section style={styles.section}>
          <label style={styles.label}>Parameters</label>
          {algorithm.params
            .filter(param => param.key !== 'seed')
            .map(param => (
            <div key={param.key} style={styles.paramRow}>
              <div style={styles.paramHeader}>
                <span style={styles.paramLabel}>{param.label}</span>
                {param.type === 'number' && (
                  <span style={styles.paramValue}>{params[param.key]}</span>
                )}
              </div>
              {param.type === 'number' ? (
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={params[param.key] as number}
                  onChange={e => handleParamChange(param.key, Number(e.target.value))}
                  style={styles.slider}
                />
              ) : (
                <input
                  type="checkbox"
                  checked={params[param.key] as boolean}
                  onChange={e => handleParamChange(param.key, e.target.checked)}
                />
              )}
            </div>
          ))}
        </section>

        {/* Colour pickers */}
        <details style={styles.details}>
          <summary style={styles.detailsSummary}>Colours</summary>
          <div style={styles.detailsBody}>
            <div style={styles.colourRow}>
              <span style={styles.paramLabel}>Fill</span>
              <input
                type="color"
                value={palette.hexFill}
                onChange={e => handlePaletteChange('hexFill', e.target.value)}
                style={styles.colourInput}
              />
            </div>
            <div style={styles.colourRow}>
              <span style={styles.paramLabel}>Lines</span>
              <input
                type="color"
                value={palette.hexOutline}
                onChange={e => handlePaletteChange('hexOutline', e.target.value)}
                style={styles.colourInput}
              />
            </div>
            <div style={styles.colourRow}>
              <span style={styles.paramLabel}>Walls</span>
              <input
                type="color"
                value={palette.wallColour}
                onChange={e => handlePaletteChange('wallColour', e.target.value)}
                style={styles.colourInput}
              />
            </div>

            <label style={{ ...styles.label, marginTop: '8px' }}>Room Tag Colours</label>
            {ROOM_TAGS.map(t => (
              <div key={t} style={styles.colourRow}>
                <span style={styles.paramLabel}>{t}</span>
                <input
                  type="color"
                  value={palette.roomTagColours[t]}
                  onChange={e => handleRoomTagColourChange(t, e.target.value)}
                  style={styles.colourInput}
                />
              </div>
            ))}
          </div>
        </details>

        {/* Wall height */}
        <section style={styles.section}>
          <label style={styles.label}>Walls</label>
          <div style={styles.paramRow}>
            <div style={styles.paramHeader}>
              <span style={styles.paramLabel}>Wall Height</span>
              <span style={styles.paramValue}>{wallHeightFraction.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={wallHeightFraction}
              onChange={e => setWallHeightFraction(Number(e.target.value))}
              style={styles.slider}
            />
          </div>
        </section>
        </>
        )}

        {/* Preset save/load (shared across both tabs) */}
        <section style={styles.section}>
          <label style={styles.label}>Preset</label>
          <div style={styles.presetRow}>
            <button type="button" style={styles.secondaryButton} onClick={handleExport}>
              Export JSON
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}>
              Import JSON
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              e.target.value = ''
            }}
          />
        </section>
      </aside>

      {/* Canvas */}
      <main style={styles.canvas}>
        {activeTab === 'generator' ? (
          <HexGrid
            dungeon={dungeon}
            fillColour={palette.hexFill}
            lineColour={palette.hexOutline}
            backgroundColour={palette.background}
            wallColour={palette.wallColour}
            wallHeightFraction={wallHeightFraction}
            roomTagColours={palette.roomTagColours}
            fixedCenter={{ q: 0, r: 0 }}
          />
        ) : (
          <RoomEditor
            palette={palette}
            wallHeightFraction={wallHeightFraction}
            roomTemplates={roomTemplates}
            onSave={handleSaveRoomTemplate}
            onDelete={handleDeleteRoomTemplate}
          />
        )}
      </main>
    </div>
  )
}

//---------------------------------------//
//  Styles                               //
//---------------------------------------//
// Colours sourced from src/lib/palette.ts

// Build sidebar's inline style object from current palette
function buildStyles(palette: Palette): Record<string, React.CSSProperties> {
  const sidebarButtonColour = palette.background

  return {
    root: {
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: palette.background,
      color: palette.textPrimary,
      fontFamily: 'monospace',
      overflow: 'hidden',
    },
    sidebar: {
      width: '260px',
      minWidth: '260px',
      background: palette.sidebarBackground,
      padding: '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      overflowY: 'auto',
      borderRight: `1px solid ${palette.border}`,
    },
    title: {
      fontSize: '18px',
      fontWeight: 700,
      color: palette.accent,
      margin: '0 0 16px 0',
      letterSpacing: '0.05em',
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginBottom: '16px',
    },
    details: {
      marginBottom: '16px',
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      padding: '8px 10px',
    },
    detailsSummary: {
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.1em',
      color: palette.textMuted,
      textTransform: 'uppercase',
      cursor: 'pointer',
    },
    detailsBody: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      marginTop: '10px',
    },
    tabRow: {
      display: 'flex',
      gap: '4px',
      marginBottom: '16px',
    },
    tabButton: {
      flex: 1,
      padding: '8px',
      background: 'transparent',
      color: palette.textMuted,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      letterSpacing: '0.03em',
    },
    tabButtonActive: {
      flex: 1,
      padding: '8px',
      background: palette.accent,
      color: '#fff',
      border: `1px solid ${palette.accent}`,
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      letterSpacing: '0.03em',
    },
    label: {
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.1em',
      color: palette.textMuted,
      textTransform: 'uppercase',
    },
    description: {
      fontSize: '12px',
      color: palette.textMuted,
      lineHeight: 1.5,
      margin: 0,
    },
    select: {
      background: sidebarButtonColour,
      color: palette.textPrimary,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      padding: '6px 8px',
      fontSize: '13px',
      cursor: 'pointer',
    },
    paramRow: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    paramHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    paramLabel: {
      fontSize: '13px',
      color: palette.textPrimary,
    },
    paramValue: {
      fontSize: '12px',
      color: palette.accent,
      fontVariantNumeric: 'tabular-nums',
    },
    slider: {
      width: '100%',
      accentColor: palette.accent,
    },
    seedRow: {
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
    },
    seedInput: {
      flex: 1,
      background: sidebarButtonColour,
      color: palette.textPrimary,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      padding: '6px 8px',
      fontSize: '13px',
      fontFamily: 'monospace',
    },
    randomiseButton: {
      background: sidebarButtonColour,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      padding: '4px 8px',
      fontSize: '14px',
      cursor: 'pointer',
      lineHeight: 1,
    },
    colourRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '4px',
    },
    colourInput: {
      width: '36px',
      height: '24px',
      padding: 0,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      background: 'transparent',
      cursor: 'pointer',
    },
    presetRow: {
      display: 'flex',
      gap: '8px',
    },
    secondaryButton: {
      flex: 1,
      padding: '8px',
      background: sidebarButtonColour,
      color: palette.textPrimary,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      letterSpacing: '0.03em',
    },
    button: {
      padding: '10px',
      background: palette.accent,
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      letterSpacing: '0.05em',
    },
    canvas: {
      flex: 1,
      overflow: 'hidden',
    },
  }
}