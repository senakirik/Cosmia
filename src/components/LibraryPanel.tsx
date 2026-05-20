import { useEffect, useRef } from 'react'
import type { Track } from '../types'
import { fmtTime, parseDur } from '../utils/time'
import Wordmark from './Wordmark'
import Player from './Player'
import TrackRow from './TrackRow'
import AddAudio from './AddAudio'
import styles from './LibraryPanel.module.css'

const ChevronLeft = () => (
  <svg viewBox="0 0 12 12" width={12} height={12} fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
    <polyline points="8,2 4,6 8,10" />
  </svg>
)

interface Props {
  open: boolean
  tracks: Track[]
  currentIdx: number | null
  playing: boolean
  progress: number
  dragOver: boolean
  onCollapse: () => void
  onSelectTrack: (idx: number) => void
  onTogglePlay: () => void
  onSeek: (p: number) => void
  onAdd: () => void
}

export default function LibraryPanel({
  open, tracks, currentIdx, playing, progress, dragOver,
  onCollapse, onSelectTrack, onTogglePlay, onSeek, onAdd,
}: Props) {
  const tracksRef = useRef<HTMLDivElement>(null)

  // Scroll the active track into view whenever selection changes
  useEffect(() => {
    if (currentIdx === null) return
    const container = tracksRef.current
    if (!container) return
    const rows = container.querySelectorAll('button')
    rows[currentIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [currentIdx])

  const current = currentIdx !== null ? tracks[currentIdx] : null
  const totalSec = current ? parseDur(current.dur) : 0
  const elapsed = fmtTime(totalSec * progress)

  return (
    <aside className={`${styles.panel} ${open ? styles.open : styles.closed}`} aria-label="Library panel">
      {/* ── Header ── */}
      <div className={styles.header}>
        <Wordmark />
        <button className={styles.collapseBtn} onClick={onCollapse} aria-label="Collapse library">
          <ChevronLeft />
        </button>
      </div>

      {/* ── Now-playing / Standby ── */}
      <div className={styles.current}>
        {current ? (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 12 }}>
              ▸ NOW RENDERING
            </div>
            <div className={styles.nowTitle} style={{ color: 'var(--fg)' }}>{current.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginTop: 10 }}>
              {current.artist.toUpperCase()} · {current.tag}
            </div>
            <div style={{ marginTop: 22 }}>
              <Player
                progress={progress}
                elapsed={elapsed}
                total={current.dur}
                playing={playing}
                onToggle={onTogglePlay}
                onSeek={onSeek}
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-mute)', letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 12 }}>
              ▸ NO SIGNAL
            </div>
            <div className={styles.nowTitle} style={{ color: 'var(--fg-dim)' }}>Standby</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-mute)', marginTop: 10 }}>
              SELECT A TRACK OR DROP A FILE
            </div>
          </>
        )}
      </div>

      {/* ── Add Audio ── */}
      <div className={styles.addWrap}>
        <AddAudio variant="library" dragOver={dragOver} onClick={onAdd} />
      </div>

      {/* ── Divider ── */}
      <div className={styles.divider}>
        <span>LIBRARY</span>
        <div className={styles.dividerLine} />
        <span>{String(tracks.length).padStart(2, '0')} TRACKS</span>
      </div>

      {/* ── Track list ── */}
      <div className={styles.tracks} ref={tracksRef}>
        {tracks.map((t, i) => (
          <TrackRow
            key={t.num}
            {...t}
            active={i === currentIdx}
            playing={playing}
            onClick={() => onSelectTrack(i)}
          />
        ))}
      </div>

    </aside>
  )
}
