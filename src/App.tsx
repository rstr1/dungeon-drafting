import { useState, useCallback } from 'react'
import { ALGORITHMS } from './algorithms/registry'
import type { DungeonMap, Algorithm } from './algorithms/types'
import HexGrid from './components/Hexgrid'

function buildDefaultParams(algorithm: Algorithm): Record<string, number | boolean> {
  return Object.fromEntries(algorithm.params.map(p => [p.key, p.default]))
}

const DEFAULT_FILL_COLOUR = '#30220c'
const DEFAULT_LINE_COLOUR = '#eff1f3'

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

  const [fillColour, setFillColour] = useState(DEFAULT_FILL_COLOUR)
  const [lineColour, setLineColour] = useState(DEFAULT_LINE_COLOUR)

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

  const handleRandomizeSeed = useCallback(
    (param: Extract<Algorithm['params'][number], { type: 'number' }>) => {
      const value = Math.floor(Math.random() * (param.max - param.min + 1)) + param.min
      setParams(prev => ({ ...prev, [param.key]: value }))
    },
    []
  )

  const handleGenerate = useCallback(() => {
    setDungeon(algorithm.generate(params))
  }, [algorithm, params])


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
                    onClick={() => handleRandomizeSeed(param)}
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
              value={fillColour}
              onChange={e => setFillColour(e.target.value)}
              style={styles.colourInput}
            />
          </div>
          <div style={styles.colourRow}>
            <span style={styles.paramLabel}>Lines</span>
            <input
              type="color"
              value={lineColour}
              onChange={e => setLineColour(e.target.value)}
              style={styles.colourInput}
            />
          </div>
        </section>

        <button style={styles.button} onClick={handleGenerate}>
          Generate
        </button>
      </aside>

      {/* Canvas */}
      <main style={styles.canvas}>
        <HexGrid dungeon={dungeon} fillColour={fillColour} lineColour={lineColour} />
      </main>
    </div>
  )
}

//---------------------------------------//
//  Styles                               //
//---------------------------------------//
// Need to link up to tailwind or smth

const ACCENT_COLOUR = "#e6880f"
const SIDEBAR_BACKGROUND_COLOUR = "#1a150e"
const BACKGROUND_COLOUR = "#0f0d09"
const SIDEBAR_BUTTON_COLOUR = BACKGROUND_COLOUR
const BORDER_COLOUR = "#3e352a"

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    background: BACKGROUND_COLOUR,
    color: '#e2e8f0',
    fontFamily: 'monospace',
    overflow: 'hidden',
  },
  sidebar: {
    width: '260px',
    minWidth: '260px',
    background: SIDEBAR_BACKGROUND_COLOUR,
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    borderRight: `1px solid ${BORDER_COLOUR}`,
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: ACCENT_COLOUR,
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
    color: '#64748b',
    textTransform: 'uppercase',
  },
  description: {
    fontSize: '12px',
    color: '#64748b',
    lineHeight: 1.5,
    margin: 0,
  },
  select: {
    background: SIDEBAR_BUTTON_COLOUR,
    color: '#e2e8f0',
    border: `1px solid ${BORDER_COLOUR}`,
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
    color: '#cbd5e1',
  },
  paramValue: {
    fontSize: '12px',
    color: ACCENT_COLOUR,
    fontVariantNumeric: 'tabular-nums',
  },
  slider: {
    width: '100%',
    accentColor: ACCENT_COLOUR,
  },
  seedRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  seedInput: {
    flex: 1,
    background: SIDEBAR_BUTTON_COLOUR,
    color: '#e2e8f0',
    border: `1px solid ${BORDER_COLOUR}`,
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  randomizeButton: {
    background: SIDEBAR_BUTTON_COLOUR,
    border: `1px solid ${BORDER_COLOUR}`,
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
    border: `1px solid ${BORDER_COLOUR}`,
    borderRadius: '4px',
    background: 'transparent',
    cursor: 'pointer',
  },
  button: {
    marginTop: 'auto',
    padding: '10px',
    background: ACCENT_COLOUR,
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