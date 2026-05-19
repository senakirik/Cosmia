export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      {/* Grain overlay — sits above everything */}
      <div className="grain" />

      {/* Font proof — will be removed in Step 2 */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        alignItems: 'center',
      }}>
        {/* Display font proof */}
        <div style={{
          fontFamily: 'var(--display)',
          fontWeight: 800,
          fontStretch: '75%',
          fontSize: 48,
          letterSpacing: '-0.02em',
          color: 'var(--fg)',
        }}>
          COSMIA
        </div>
        {/* Mono font proof */}
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'var(--fg-mute)',
        }}>
          GEN.ART.PLAYER · FONT OK
        </div>
        {/* Accent dot */}
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--accent)',
        }} />
      </div>
    </div>
  )
}
