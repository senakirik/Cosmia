import type { Track } from '../types'
import styles from './TrackRow.module.css'

interface Props extends Track {
  active?: boolean
  playing?: boolean
  onClick?: () => void
}

function EqGlyph() {
  return (
    <span className={styles.eq} aria-hidden="true">
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
    </span>
  )
}

export default function TrackRow({ num, name, artist, tag, dur, active = false, playing = false, onClick }: Props) {
  return (
    <button
      className={`${styles.track} ${active ? styles.active : ''}`}
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
    >
      <span className={styles.num}>
        {active && playing ? <EqGlyph /> : num}
      </span>
      <div className={styles.body}>
        <div className={styles.name}>{name}</div>
        <div className={styles.sub}>{artist.toUpperCase()} · {tag}</div>
      </div>
      <span className={styles.dur}>{dur}</span>
    </button>
  )
}
