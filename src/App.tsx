
export default function App() {



  return (
    <div style={styles.root}>
      {/* Heading */}
      <h1 style={styles.heading1}>Dungeon Drafting</h1>

      <section>
        <label style={styles.label}>Algorithm</label>
        <select>

        </select>
      </section>

      {/* Dungeon Generation Button */}
      <button>
        Generate
      </button>

      {/* Canvas */}
      <main>
        canvas
      </main>

    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display:      'flex',
    height:       '100vh',
    width:        '100vw',
    background:   '#ffffff',
    color:        '#000000',
    fontFamily:   'monospace',
    overflow:     'hidden',
  },
  heading1: {
    display:      'flex',
    fontSize:     '30px',
    fontWeight:   700,
    color:        '#000000',
    margin:       '0 0 16px 0',
    letterSpacing:'0.05em',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#64748b',
    textTransform: 'uppercase',
  },
}