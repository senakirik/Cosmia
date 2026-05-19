import styles from './AddAudio.module.css'

const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 14 14" width={size} height={size} stroke="currentColor" strokeWidth="1" fill="none" aria-hidden="true">
    <line x1="7" y1="1" x2="7" y2="13" />
    <line x1="1" y1="7" x2="13" y2="7" />
  </svg>
)

interface CanvasProps {
  variant: 'canvas'
  dragOver?: boolean
  onClick?: () => void
}

interface LibProps {
  variant: 'library'
  dragOver?: boolean
  onClick?: () => void
}

type Props = CanvasProps | LibProps

export default function AddAudio({ variant, dragOver = false, onClick }: Props) {
  if (variant === 'library') {
    return (
      <button
        className={`${styles.lib} ${dragOver ? styles.libDrag : ''}`}
        onClick={onClick}
        aria-label="Add audio file"
      >
        <span className={styles.libRing}><PlusIcon size={14} /></span>
        <span className={styles.libText}>
          <span className={styles.libLabel}>ADD AUDIO FILE</span>
          <span className={styles.libSub}>.WAV · .MP3 · .FLAC · MAX 240 MB</span>
        </span>
        <span className={styles.libCta}>DROP&nbsp;&nbsp;or&nbsp;&nbsp;⌘O</span>
      </button>
    )
  }

  return (
    <button
      className={`${styles.canvas} ${dragOver ? styles.drag : ''}`}
      onClick={onClick}
      aria-label="Add audio file"
    >
      <div className={styles.ring}>
        <div className={styles.orbit} aria-hidden="true" />
      </div>
      <div className={styles.canvasLabel}>ADD AUDIO FILE</div>
      <div className={styles.canvasSub}>.WAV · .MP3 · .FLAC · .AIFF</div>
    </button>
  )
}
