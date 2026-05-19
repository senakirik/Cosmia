import type { PillState } from '../types'
import styles from './StatusPill.module.css'

const LABELS: Record<PillState, string> = {
  standby:   'STANDBY',
  analyzing: 'ANALYZING SIGNAL',
  playing:   'PLAYING / 44.1 kHz',
  paused:    'PAUSED',
}

interface Props {
  state?: PillState
  label?: string
}

export default function StatusPill({ state = 'standby', label }: Props) {
  return (
    <div className={`${styles.pill} ${styles[state]}`} role="status" aria-label={`Status: ${label ?? LABELS[state]}`}>
      <span className={styles.led} />
      <span>{label ?? LABELS[state]}</span>
    </div>
  )
}
