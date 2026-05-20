import type { Track } from '../types'
import { fmtTime, parseDur } from '../utils/time'
import Wordmark from './Wordmark'
import StatusPill from './StatusPill'
import Telemetry from './Telemetry'
import FFTReadout, { type FFTBand } from './FFTReadout'
import Player from './Player'
import LibTab from './LibTab'
import AddAudio from './AddAudio'
import Brackets from './Brackets'
import styles from './CanvasOverlay.module.css'

interface Props {
  vizMode: 'orbital' | 'organic'
  libOpen: boolean
  currentTrack: Track | null
  totalTracks: number
  playing: boolean
  progress: number
  fftBands?: FFTBand[] | null
  onTogglePlay: () => void
  onSeek: (p: number) => void
  onOpenLib: () => void
  onAdd: () => void
  onVizMode: (m: 'orbital' | 'organic') => void
}

const VIZ_LABEL: Record<'orbital' | 'organic', string> = {
  orbital: 'ORBITAL FIELD · v2.4',
  organic: 'ORGANIC FLOW · v1.0',
}

export default function CanvasOverlay({
  vizMode, libOpen, currentTrack, totalTracks,
  playing, progress, fftBands = null,
  onTogglePlay, onSeek, onOpenLib, onAdd, onVizMode,
}: Props) {
  const totalSec  = currentTrack ? parseDur(currentTrack.dur) : 0
  const elapsed   = fmtTime(totalSec * progress)
  const pillState = currentTrack ? (playing ? 'playing' : 'paused') : 'standby'
  const visLabel  = VIZ_LABEL[vizMode]

  return (
    <div className={styles.overlay}>

      {/* ── LIBRARY OPEN: telemetry top-right only ── */}
      {libOpen && (
        <div className={styles.topRightCluster}>
          <Telemetry />
        </div>
      )}

      {/* ── Viz mode chips — always visible bottom-right ── */}
      <div className={`${styles.vizChips} ${libOpen ? styles.vizChipsLibOpen : ''}`}>
        <div className={styles.vizChipRow}>
          <button
            className={`${styles.vizChip} ${vizMode === 'orbital' ? styles.vizChipActive : ''}`}
            onClick={() => onVizMode('orbital')}
          >
            ORBITAL FIELD
          </button>
          <button
            className={`${styles.vizChip} ${vizMode === 'organic' ? styles.vizChipActive : ''}`}
            onClick={() => onVizMode('organic')}
          >
            ORGANIC FLOW
          </button>
        </div>
        <div className={styles.vizChipLabel}>©2026 COSMIA · MADE BY SENA OZBAYRAM</div>
      </div>

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

              {/* FFT readout top-right — live when audio is wired, static fallback otherwise */}
              <div className={styles.canvasFft}>
                <FFTReadout bands={fftBands} />
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
                <span>VIS · {visLabel}</span>
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
