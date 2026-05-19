import styles from './Player.module.css'

interface Props {
  progress?: number
  elapsed?: string
  total?: string
  playing?: boolean
  onToggle?: () => void
  onSeek?: (progress: number) => void
}

const PauseIcon = () => (
  <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor">
    <rect x="2" y="1" width="2" height="8" />
    <rect x="6" y="1" width="2" height="8" />
  </svg>
)

const PlayIcon = () => (
  <svg viewBox="0 0 10 10" width={10} height={10} fill="currentColor">
    <polygon points="2,1 9,5 2,9" />
  </svg>
)

export default function Player({
  progress = 0,
  elapsed  = '00:00',
  total    = '00:00',
  playing  = false,
  onToggle,
  onSeek,
}: Props) {
  const pct = `${Math.max(0, Math.min(1, progress)) * 100}%`

  const handleScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const p = (e.clientX - rect.left) / rect.width
    onSeek?.(Math.max(0, Math.min(1, p)))
  }

  return (
    <div className={styles.player}>
      <button
        className={styles.playBtn}
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <span className={styles.time}>{elapsed}</span>

      <div
        className={styles.scrub}
        onClick={handleScrubClick}
        role="slider"
        aria-label="Playback position"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.scrubTrack}>
          <div className={styles.scrubFill} style={{ width: pct }} />
        </div>
        <div className={styles.scrubHead} style={{ left: pct }} />
      </div>

      <span className={`${styles.time} ${styles.total}`}>{total}</span>
    </div>
  )
}
