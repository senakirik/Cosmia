import type { Track } from '../types'
import { fmtTime, parseDur } from '../utils/time'
import Wordmark from './Wordmark'
import StatusPill from './StatusPill'
import Telemetry from './Telemetry'
import FFTReadout from './FFTReadout'
import Player from './Player'
import LibTab from './LibTab'
import AddAudio from './AddAudio'
import Brackets from './Brackets'
import styles from './CanvasOverlay.module.css'

interface Props {
  libOpen: boolean
  currentTrack: Track | null
  currentIdx: number | null
  totalTracks: number
  playing: boolean
  progress: number
  onTogglePlay: () => void
  onSeek: (p: number) => void
  onOpenLib: () => void
  onAdd: () => void
}

export default function CanvasOverlay({
  libOpen, currentTrack, totalTracks,
  playing, progress, onTogglePlay, onSeek, onOpenLib, onAdd,
}: Props) {
  const totalSec  = currentTrack ? parseDur(currentTrack.dur) : 0
  const elapsed   = fmtTime(totalSec * progress)
  const pillState = currentTrack ? (playing ? 'playing' : 'paused') : 'standby'

  return (
    <div className={styles.overlay}>

      {/* ── LIBRARY OPEN: telemetry top-right only ── */}
      {libOpen && (
        <div className={styles.topRightCluster}>
          <Telemetry />
        </div>
      )}

      {/* ── LIBRARY OPEN: vis label bottom-right ── */}
      {libOpen && (
        <div className={styles.visLabel}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-mute)', letterSpacing: '0.32em', textTransform: 'uppercase' }}>
            VISUALIZATION
          </span>
          <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontStretch: '75%', fontSize: 16, color: 'var(--fg)', marginLeft: 14, letterSpacing: '-0.01em' }}>
            ORBITAL FIELD · v2.4
          </span>
        </div>
      )}

      {/* ── LIBRARY CLOSED: all canvas UI ── */}
      {!libOpen && (
        <>
          {/* Top strip: Wordmark | StatusPill | Telemetry */}
          <div className={styles.topStrip}>
            <Wordmark />
            <StatusPill state={pillState} />
            <Telemetry />
          </div>
          <div className={styles.topStripDivider} />

          {/* Track title cluster — only when a track is loaded */}
          {currentTrack && (
            <>
              <div className={styles.canvasTitle}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--accent)', letterSpacing: '0.32em', textTransform: 'uppercase', marginBottom: 12 }}>
                  ● NOW RENDERING · {currentTrack.num} / {String(totalTracks).padStart(2, '0')}
                </div>
                <div className={styles.heroText}>{currentTrack.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginTop: 12 }}>
                  {currentTrack.artist.toUpperCase()} · {currentTrack.tag} · {currentTrack.year ?? '2031'}
                </div>
              </div>

              {/* FFT readout top-right */}
              <div className={styles.canvasFft}>
                <FFTReadout />
              </div>
            </>
          )}

          {/* Empty state: AddAudio glyph centered */}
          {!currentTrack && (
            <>
              <div className={styles.centerGlyph}>
                <AddAudio variant="canvas" onClick={onAdd} />
              </div>
              <div className={styles.centerSubTop}>NO SIGNAL · AWAITING INPUT</div>
            </>
          )}

          {/* Bottom-left: library tab */}
          <div className={styles.libTabWrap}>
            <LibTab count={totalTracks} onClick={onOpenLib} />
          </div>

          {/* Bottom-center: player (only when track loaded) */}
          {currentTrack && (
            <div className={styles.playerWrap}>
              <div className={styles.playerHeader}>
                <span>OUTPUT · STEREO</span>
                <span>VIS · ORBITAL FIELD v2.4</span>
                <span>GAIN -3.0 dB</span>
              </div>
              <Player
                progress={progress}
                elapsed={elapsed}
                total={currentTrack.dur}
                playing={playing}
                onToggle={onTogglePlay}
                onSeek={onSeek}
              />
            </div>
          )}

          {/* Bottom-right: copyright */}
          <div className={styles.copyWrap}>
            <Brackets style={{ display: 'inline-block', padding: '6px 10px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 8.5, color: 'var(--fg-mute)', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
                © 2035 COSMIA · ALL SIGNALS RESERVED
              </span>
            </Brackets>
          </div>
        </>
      )}

    </div>
  )
}
