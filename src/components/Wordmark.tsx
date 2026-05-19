interface Props {
  suffix?: string
}

export default function Wordmark({ suffix = 'GEN.ART.PLAYER' }: Props) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 8,
      fontFamily: 'var(--display)',
      fontWeight: 800,
      fontStretch: '75%',
      fontSize: 16,
      letterSpacing: '0.02em',
      color: 'var(--fg)',
    }}>
      {/* Accent dot — optically centred between baseline and cap height */}
      <span style={{
        width: 5,
        height: 5,
        background: 'var(--accent)',
        borderRadius: '50%',
        display: 'inline-block',
        alignSelf: 'center',
        transform: 'translateY(-1px)',
        flexShrink: 0,
      }} />
      <span>COSMIA</span>
      <span style={{
        fontFamily: 'var(--mono)',
        fontWeight: 400,
        fontSize: 9.5,
        letterSpacing: '0.18em',
        color: 'var(--fg-mute)',
        textTransform: 'uppercase',
        marginLeft: 4,
        transform: 'translateY(-2px)',
        display: 'inline-block',
      }}>
        {suffix}
      </span>
    </div>
  )
}
