interface Props {
  count?: number
  onClick?: () => void
}

const ChevronRight = () => (
  <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <polyline points="4,2 8,6 4,10" />
  </svg>
)

export default function LibTab({ count = 0, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label="Open library"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        border: '1px solid var(--hair)',
        borderRadius: 0,
        background: 'rgba(10,10,12,0.55)',
        backdropFilter: 'blur(8px)',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: 'var(--fg-dim)',
        cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        font: 'inherit',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--fg)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--fg-faint)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--fg-dim)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--hair)' }}
    >
      <span style={{ color: 'var(--fg-mute)' }}><ChevronRight /></span>
      <span>LIBRARY</span>
      <span style={{ color: 'var(--fg-mute)' }}>·</span>
      <span style={{ color: 'var(--fg)' }}>{String(count).padStart(2, '0')} TRACKS</span>
    </button>
  )
}
