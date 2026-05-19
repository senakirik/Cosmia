import { useEffect, useState } from 'react'

function utcString() {
  const now = new Date()
  const yy = now.getUTCFullYear()
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  const ss = String(now.getUTCSeconds()).padStart(2, '0')
  return `${yy}.${mo}.${dd} / ${hh}:${mm}:${ss} UTC`
}

interface Props {
  coords?: string
  session?: string
}

export default function Telemetry({
  coords  = '47.6062° N / 122.3321° W',
  session = 'SES-0428-7F',
}: Props) {
  const [utc, setUtc] = useState(utcString)

  useEffect(() => {
    const id = setInterval(() => setUtc(utcString()), 1000)
    return () => clearInterval(id)
  }, [])

  const rows: [string, string][] = [
    ['COORD',   coords],
    ['UTC',     utc],
    ['SESSION', session],
  ]

  return (
    <div style={{
      fontFamily: 'var(--mono)',
      fontSize: 10,
      letterSpacing: '0.04em',
      color: 'var(--fg-dim)',
      textAlign: 'right',
      lineHeight: 1.6,
    }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
          <span style={{ color: 'var(--fg-mute)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 9.5 }}>{k}</span>
          <span style={{ color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
