import Wordmark from '../components/Wordmark'
import StatusPill from '../components/StatusPill'
import Telemetry from '../components/Telemetry'
import FFTReadout from '../components/FFTReadout'
import Player from '../components/Player'
import TrackRow from '../components/TrackRow'
import LibTab from '../components/LibTab'
import AddAudio from '../components/AddAudio'
import Dropzone from '../components/Dropzone'
import Brackets from '../components/Brackets'
import { SAMPLE_TRACKS } from '../data/tracks'
import type { PillState } from '../types'

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 24,
      marginTop: 48,
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--fg-mute)' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
    </div>
  )
}

function Row({ children, gap = 24 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap }}>
      {children}
    </div>
  )
}

function Column({ children, gap = 24, style }: { children: React.ReactNode; gap?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-mute)', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

const PILL_STATES: PillState[] = ['standby', 'analyzing', 'playing', 'paused']

export default function ComponentsSheet() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg)',
      overflowY: 'auto',
      padding: '48px 48px 80px',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 8 }}>
        <Wordmark />
      </div>
      <div style={{
        fontFamily: 'var(--display)',
        fontWeight: 700,
        fontStretch: '75%',
        fontSize: 88,
        letterSpacing: '-0.02em',
        lineHeight: 0.9,
        color: 'var(--fg)',
        marginBottom: 12,
      }}>
        COMPONENTS
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-mute)' }}>
        STICKER SHEET · ALL PRIMITIVES · VERIFY AGAINST COSMIA FRAMES.HTML
      </div>

      {/* ── IDENTITY ── */}
      <SectionLabel label="Identity" />
      <Row>
        <Cell label="Wordmark · default">
          <Wordmark />
        </Cell>
        <Cell label="Brackets utility">
          <Brackets style={{ padding: '8px 14px', display: 'inline-block' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.22em', color: 'var(--fg-mute)', textTransform: 'uppercase' }}>
              © 2035 COSMIA · BUILD 4.21
            </span>
          </Brackets>
        </Cell>
      </Row>

      {/* ── STATUS ── */}
      <SectionLabel label="Status Pill — 4 states" />
      <Row gap={16}>
        {PILL_STATES.map(s => (
          <Cell key={s} label={s}>
            <StatusPill state={s} />
          </Cell>
        ))}
      </Row>

      {/* ── TELEMETRY ── */}
      <SectionLabel label="Telemetry" />
      <div style={{ display: 'inline-block' }}>
        <Telemetry />
      </div>

      {/* ── FFT ── */}
      <SectionLabel label="FFT Readout · 10 bands · 1/3 octave" />
      <div style={{ width: 280 }}>
        <FFTReadout />
      </div>

      {/* ── TRANSPORT ── */}
      <SectionLabel label="Player" />
      <Column style={{ maxWidth: 600 }}>
        <Cell label="Progress 18%">
          <Player progress={0.18} elapsed="01:02" total="05:24" playing={true} />
        </Cell>
        <Cell label="Progress 64%">
          <Player progress={0.64} elapsed="03:27" total="05:24" playing={false} />
        </Cell>
      </Column>

      {/* ── LIBRARY ── */}
      <SectionLabel label="Track List" />
      <div style={{ width: 380, border: '1px solid var(--hair)' }}>
        {/* Divider header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px 10px',
          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.28em', color: 'var(--fg-mute)', textTransform: 'uppercase',
          borderBottom: '1px solid var(--hair)',
        }}>
          <span>LIBRARY</span>
          <div style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
          <span>{String(SAMPLE_TRACKS.length).padStart(2, '0')} TRACKS</span>
        </div>
        {SAMPLE_TRACKS.map((t, i) => (
          <TrackRow key={t.num} {...t} active={i === 0} playing={i === 0} />
        ))}
      </div>

      {/* ── LIBRARY TAB ── */}
      <SectionLabel label="Library Tab (collapsed state)" />
      <LibTab count={SAMPLE_TRACKS.length} />

      {/* ── ADD AUDIO ── */}
      <SectionLabel label="Add Audio" />
      <Row gap={48}>
        <Column>
          <Cell label="Library variant · default">
            <div style={{ width: 340 }}>
              <AddAudio variant="library" />
            </div>
          </Cell>
          <Cell label="Library variant · drag">
            <div style={{ width: 340 }}>
              <AddAudio variant="library" dragOver />
            </div>
          </Cell>
        </Column>
        <Row gap={48}>
          <Cell label="Canvas variant · default">
            <AddAudio variant="canvas" />
          </Cell>
          <Cell label="Canvas variant · drag">
            <AddAudio variant="canvas" dragOver />
          </Cell>
        </Row>
      </Row>

      {/* ── DROPZONE ── */}
      <SectionLabel label="File-drop Overlay" />
      <div style={{ position: 'relative', height: 480, border: '1px solid var(--hair)' }}>
        <Dropzone />
      </div>

      <div style={{ height: 48 }} />
    </div>
  )
}
