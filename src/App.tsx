import { useState, useCallback, useRef } from 'react'
import { ALGORITHMS } from './algorithms/registry'
import type { DungeonMap, Algorithm, RoomTemplate } from './algorithms/types'
import HexGrid from './components/hexgrid'
import { exportConfig, importConfig } from './lib/persistence'
import { type Palette, DEFAULT_PALETTE, clonePalette } from './lib/palette'

function buildDefaultParams(algorithm: Algorithm): Record<string, number | boolean> {
  return Object.fromEntries(algorithm.params.map(p => [p.key, p.default]))
}

//---------------------------------------//
//  Room Templates                       //
//---------------------------------------//
const DEFAULT_ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: 'spawn-cell',
    name: 'Spawn Cell',
    tag: 'spawn',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ q: 0, r: 0 }],
    guaranteed: true,
  },
  {
    id: 'exit-cell',
    name: 'Exit Cell',
    tag: 'exit',
    cells: [{ q: 0, r: 0 }],
    entrances: [{ q: 0, r: 0 }],
    guaranteed: true,
  },
]


//---------------------------------------//
//  App Function                         //
//---------------------------------------//

export default function App() {
  const [selectedId, setSelectedId] = useState(ALGORITHMS[0].id)
  const algorithm = ALGORITHMS.find(a => a.id === selectedId)!

  const [params, setParams] = useState<Record<string, number | boolean>>(
    buildDefaultParams(algorithm)
  )

  const [dungeon, setDungeon] = useState<DungeonMap>(() =>
    algorithm.generate(buildDefaultParams(algorithm))
  )

  const [palette, setPalette] = useState<Palette>(() => clonePalette(DEFAULT_PALETTE))

  const handlePaletteChange = useCallback(
    (key: keyof Omit<Palette, 'roomTagColours'>, value: string) => {
      setPalette(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  const [roomTemplates, setRoomTemplates] = useState<RoomTemplate[]>(DEFAULT_ROOM_TEMPLATES)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAlgorithmChange = useCallback((id: string) => {
    const next = ALGORITHMS.find(a => a.id === id)!
    const defaults = buildDefaultParams(next)
    setSelectedId(id)
    setParams(defaults)
    setDungeon(next.generate(defaults))
  }, [])

  const handleParamChange = useCallback(
    (key: string, value: number | boolean) => {
      setParams(prev => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleRandomiseSeed = useCallback(
    (param: Extract<Algorithm['params'][number], { type: 'number' }>) => {
      const value = Math.floor(Math.random() * (param.max - param.min + 1)) + param.min
      setParams(prev => ({ ...prev, [param.key]: value }))
    },
    []
  )

  const handleGenerate = useCallback(() => {
    setDungeon(algorithm.generate(params))
  }, [algorithm, params])

  const handleExport = useCallback(() => {
    exportConfig({
      algorithmId: selectedId,
      params,
      palette,
      roomTemplates,
    })
  }, [selectedId, params, palette, roomTemplates])

  const handleImportFile = useCallback(async (file: File) => {
    try {
      const config = await importConfig(file)
      const next = ALGORITHMS.find(a => a.id === config.algorithmId)
      if (next) {
        setSelectedId(next.id)
        setParams(config.params)
        setDungeon(next.generate(config.params))
      }
      setPalette(clonePalette(config.palette))
      setRoomTemplates(config.roomTemplates)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import preset.')
    }
  }, [])

  const styles = buildStyles(palette)

  //---------------------------------------//
  //  Return Function                      //
  //---------------------------------------//

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <h1 style={styles.title}>Dungeon Drafting</h1>

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

        {/* Parameter panel */}
        <section style={styles.section}>
          <label style={styles.label}>Parameters</label>
          {algorithm.params.map(param => (
            <div key={param.key} style={styles.paramRow}>
              <div style={styles.paramHeader}>
                <span style={styles.paramLabel}>{param.label}</span>
                {param.type === 'number' && param.key !== 'seed' && (
                  <span style={styles.paramValue}>{params[param.key]}</span>
                )}
              </div>
              {param.type === 'number' && param.key === 'seed' ? (
                <div style={styles.seedRow}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(params[param.key])}
                    onChange={e => {
                      const digitsOnly = e.target.value.replace(/[^0-9]/g, '')
                      if (digitsOnly === '') {
                        handleParamChange(param.key, 0)
                        return
                      }
                      const clamped = Math.min(param.max, Math.max(param.min, Number(digitsOnly)))
                      handleParamChange(param.key, clamped)
                    }}
                    style={styles.seedInput}
                  />
                  <button
                    type="button"
                    style={styles.randomizeButton}
                    onClick={() => handleRandomiseSeed(param)}
                    title="Randomise seed"
                  >
                    🎲
                  </button>
                </div>
              ) : param.type === 'number' ? (
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
        <section style={styles.section}>
          <label style={styles.label}>Colours</label>
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
        </section>

        {/* Preset save/load */}
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

        <button style={styles.button} onClick={handleGenerate}>
          Generate
        </button>
      </aside>

      {/* Canvas */}
      <main style={styles.canvas}>
        <HexGrid
          dungeon={dungeon}
          fillColour={palette.hexFill}
          lineColour={palette.hexOutline}
          backgroundColour={palette.background}
        />
      </main>
    </div>
  )
}

//---------------------------------------//
//  Styles                               //
//---------------------------------------//
// Colours here are sourced from src/lib/palette.ts (DEFAULT_PALETTE)

function buildStyles(palette: Palette): Record<string, React.CSSProperties> {
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
      background: palette.background,
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
      background: palette.background,
      color: palette.textPrimary,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      padding: '6px 8px',
      fontSize: '13px',
      fontFamily: 'monospace',
    },
    randomizeButton: {
      background: palette.background,
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
      background: palette.background,
      color: palette.textPrimary,
      border: `1px solid ${palette.border}`,
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      letterSpacing: '0.03em',
    },
    button: {
      marginTop: 'auto',
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