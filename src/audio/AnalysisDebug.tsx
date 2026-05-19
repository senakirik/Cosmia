import { useState, useEffect } from 'react'
import type { AudioAnalysis } from './analyzer'

// ── Helpers ───────────────────────────────────────────────────────────────────
function bar(value: number, cols = 18): string {
  const filled = Math.round(value * cols)
  return '█'.repeat(filled) + '░'.repeat(cols - filled)
}

function pct(value: number): string {
  return String(Math.round(value * 100)).padStart(3)
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AnalysisDebug({ bass, mids, treble, beat }: AudioAnalysis) {
  // Stretch a one-frame beat flag into a 160 ms visible flash
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!beat) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 160)
    return () => clearTimeout(t)
  }, [beat])

  const accent  = '#C84B30'
  const dim     = 'rgba(244,242,236,0.30)'
  const body    = 'rgba(244,242,236,0.65)'

  return (
    <div
      style={{
        position:        'fixed',
        top:             16,
        right:           16,
        zIndex:          200,
        background:      'rgba(10,10,12,0.88)',
        border:          `1px solid ${flash ? accent : 'rgba(244,242,236,0.10)'}`,
        padding:         '10px 14px 12px',
        fontFamily:      '"JetBrains Mono", ui-monospace, monospace',
        fontSize:        10.5,
        lineHeight:      1.9,
        letterSpacing:   '0.06em',
        color:           body,
        whiteSpace:      'pre',
        pointerEvents:   'none',
        userSelect:      'none',
        transition:      'border-color 0.06s ease',
        backdropFilter:  'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      {/* Header */}
      <div style={{ color: dim, fontSize: 9, letterSpacing: '0.28em', marginBottom: 6, textTransform: 'uppercase' }}>
        Audio Analysis
      </div>

      {/* Bars */}
      <div>BASS&nbsp;&nbsp;&nbsp;{bar(bass)}&nbsp;&nbsp;{pct(bass)}%</div>
      <div>MIDS&nbsp;&nbsp;&nbsp;{bar(mids)}&nbsp;&nbsp;{pct(mids)}%</div>
      <div>TREBLE&nbsp;{bar(treble)}&nbsp;&nbsp;{pct(treble)}%</div>

      {/* Beat indicator */}
      <div
        style={{
          marginTop:  6,
          color:      flash ? accent : dim,
          transition: 'color 0.06s ease',
        }}
      >
        {flash ? '● BEAT' : '○ ────'}
      </div>
    </div>
  )
}
