import styles from './Dropzone.module.css'

export default function Dropzone() {
  return (
    <div className={styles.dropzone} role="dialog" aria-label="Drop audio file to analyze">
      <div className={styles.br} />

      <div className={styles.topLeft}>
        <span style={{ color: 'var(--accent)' }}>●</span>&nbsp;&nbsp;BUFFER READY · DRAG TO COMMIT
      </div>
      <div className={styles.topRight}>ESC TO CANCEL</div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--accent)' }}>
        SIGNAL INTAKE
      </div>

      <div className={styles.title}>
        RELEASE TO<br />ANALYZE
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--fg-dim)' }}>
        AUDIO FILE · MAX 240 MB · 44.1 / 48 / 96 kHz
      </div>
    </div>
  )
}
