import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ParticleField from './components/ParticleField'
import LibraryPanel from './components/LibraryPanel'
import CanvasOverlay from './components/CanvasOverlay'
import Dropzone from './components/Dropzone'
import ComponentsSheet from './pages/ComponentsSheet'
import { SAMPLE_TRACKS } from './data/tracks'
import { parseDur } from './utils/time'
import { useAudioEngine } from './hooks/useAudioEngine'
import { dbSaveTrack, dbLoadAllTracks } from './utils/indexedDB'
import type { Track } from './types'

function ComponentsRoute() {
  return <ComponentsSheet />
}

function CosmiaApp() {
  const [libOpen,      setLibOpen]      = useState(true)
  const [tracks,       setTracks]       = useState<Track[]>(SAMPLE_TRACKS)
  const [currentIdx,   setCurrentIdx]   = useState<number | null>(null)
  const [playing,      setPlaying]      = useState(false)
  const [progress,     setProgress]     = useState(0)
  const [dragOver,     setDragOver]     = useState(false)
  const [hasRealAudio, setHasRealAudio] = useState(false)

  const audioRef     = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs so event-listener closures never capture stale state
  const idxRef      = useRef(currentIdx)
  const progressRef = useRef(progress)
  useEffect(() => { idxRef.current      = currentIdx }, [currentIdx])
  useEffect(() => { progressRef.current = progress   }, [progress])

  const { ensureContext, fftBands, audioData } = useAudioEngine(audioRef)

  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null
  const particleMode = currentTrack && playing ? 'dense' : 'sparse'

  // ── Restore user tracks from IndexedDB on mount ────────────────────────
  useEffect(() => {
    dbLoadAllTracks().then(stored => {
      if (stored.length === 0) return
      const restored: Track[] = stored.map((s, i) => ({
        num:    String(SAMPLE_TRACKS.length + i + 1).padStart(2, '0'),
        name:   s.name,
        artist: s.artist,
        tag:    s.tag,
        year:   s.year,
        dur:    s.dur,
        src:    URL.createObjectURL(s.blob),
      }))
      setTracks(prev => [...prev, ...restored])
    }).catch(() => {})
  }, [])

  // ── Load audio src when selected track changes ─────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (currentIdx === null) { audio.src = ''; setHasRealAudio(false); return }
    const track = tracks[currentIdx]
    if (track?.src) {
      audio.src = track.src
      audio.currentTime = 0
      audio.load()
      setHasRealAudio(true)
    } else {
      audio.src = ''
      setHasRealAudio(false)
    }
    setProgress(0)
  }, [currentIdx, tracks])

  // ── Play / pause real audio ────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !hasRealAudio) return
    if (playing) {
      ensureContext()
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }, [playing, hasRealAudio, ensureContext])

  // ── timeupdate + ended ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTimeUpdate = () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration)
    }
    const onEnded = () => {
      setCurrentIdx(i => i === null ? 0 : (i + 1) % tracks.length)
      setProgress(0)
      setPlaying(true)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended',      onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended',      onEnded)
    }
  }, [tracks.length])

  // ── Mock playback timer (demo tracks only) ─────────────────────────────
  useEffect(() => {
    if (!playing || currentIdx === null || hasRealAudio) return
    const totalSec = parseDur(tracks[currentIdx].dur)
    const id = setInterval(() => {
      setProgress(p => {
        const next = p + 250 / 1000 / totalSec
        if (next >= 1) {
          setCurrentIdx(i => ((i ?? 0) + 1) % tracks.length)
          return 0
        }
        return next
      })
    }, 250)
    return () => clearInterval(id)
  }, [playing, currentIdx, tracks, hasRealAudio])

  // ── Seek (real + mock) ─────────────────────────────────────────────────
  const handleSeek = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(1, p))
    setProgress(clamped)
    const audio = audioRef.current
    if (audio && hasRealAudio && audio.duration > 0) {
      audio.currentTime = clamped * audio.duration
    }
  }, [hasRealAudio])

  // ── File ingestion ─────────────────────────────────────────────────────
  const ingestFile = useCallback(async (file: File) => {
    const newIdx = tracks.length
    const url    = URL.createObjectURL(file)

    // Resolve duration via a throwaway Audio element
    const dur = await new Promise<string>((resolve) => {
      const tmp = new Audio()
      tmp.addEventListener('loadedmetadata', () => {
        const s = Math.floor(tmp.duration)
        resolve(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)
      }, { once: true })
      tmp.addEventListener('error', () => resolve('00:00'), { once: true })
      tmp.src = url
    })

    // Parse "Artist - Title" from filename
    const base   = file.name.replace(/\.[^.]+$/, '')
    const parts  = base.split(' - ')
    const artist = (parts.length >= 2 ? parts[0]              : 'Unknown').trim()
    const name   = (parts.length >= 2 ? parts.slice(1).join(' - ') : base).trim()
    const year   = String(new Date().getFullYear())

    await dbSaveTrack({ name, artist, tag: 'USER', year, dur, blob: file })

    const newTrack: Track = {
      num: String(newIdx + 1).padStart(2, '0'),
      name, artist, tag: 'USER', year, dur, src: url,
    }
    setTracks(prev => [...prev, newTrack])
    setCurrentIdx(newIdx)
    setProgress(0)
    setPlaying(true)
  }, [tracks.length])

  // ── Track selection ────────────────────────────────────────────────────
  const handleSelectTrack = (idx: number) => {
    if (idx === currentIdx) {
      setPlaying(p => !p)
    } else {
      setCurrentIdx(idx)
      setProgress(0)
      setPlaying(true)
    }
  }

  const handleTogglePlay = () => { if (currentIdx !== null) setPlaying(p => !p) }
  const handleAdd        = () => fileInputRef.current?.click()

  // ── Keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const idx  = idxRef.current
      const prog = progressRef.current

      if (e.key === ' ' && idx !== null) {
        e.preventDefault()
        setPlaying(p => !p)
      } else if (e.key === 'Escape') {
        setDragOver(false)
      } else if (e.key === 'ArrowLeft' && idx !== null) {
        e.preventDefault()
        handleSeek(Math.max(0, prog - 5 / parseDur(tracks[idx].dur)))
      } else if (e.key === 'ArrowRight' && idx !== null) {
        e.preventDefault()
        handleSeek(Math.min(1, prog + 5 / parseDur(tracks[idx].dur)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentIdx(i => i === null ? 0 : ((i - 1 + tracks.length) % tracks.length))
        setProgress(0); setPlaying(true)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentIdx(i => i === null ? 0 : (i + 1) % tracks.length)
        setProgress(0); setPlaying(true)
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        fileInputRef.current?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tracks, handleSeek])

  // ── Drag & drop ────────────────────────────────────────────────────────
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault(); setDragOver(true)
      }
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (
        e.clientX <= 0 || e.clientY <= 0 ||
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight
      ) setDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files[0]
      if (file && file.type.startsWith('audio/')) ingestFile(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover',  onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop',      onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover',  onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop',      onDrop)
    }
  }, [ingestFile])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0A0A0C' }}>
      {/* Hidden audio engine */}
      <audio ref={audioRef} preload="auto" />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) ingestFile(file)
          e.target.value = ''
        }}
      />

      {/* Layer 0 — full-bleed particle canvas */}
      <ParticleField
        mode={particleMode}
        seed={currentIdx !== null ? (currentIdx + 1) * 3 : 2}
        audioData={hasRealAudio ? audioData : null}
      />

      {/* Layer 10 — canvas overlay UI */}
      <CanvasOverlay
        libOpen={libOpen}
        currentTrack={currentTrack}
        totalTracks={tracks.length}
        playing={playing}
        progress={progress}
        fftBands={hasRealAudio ? fftBands : null}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onOpenLib={() => setLibOpen(true)}
        onAdd={handleAdd}
      />

      {/* Layer 20 — library panel (always in DOM, CSS slide) */}
      <LibraryPanel
        open={libOpen}
        tracks={tracks}
        currentIdx={currentIdx}
        playing={playing}
        progress={progress}
        dragOver={dragOver}
        onCollapse={() => setLibOpen(false)}
        onSelectTrack={handleSelectTrack}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onAdd={handleAdd}
      />

      {/* Layer 50 — file-drop overlay (transient) */}
      {dragOver && <Dropzone />}

      {/* Layer 100 — grain (always on top) */}
      <div className="grain" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"           element={<CosmiaApp />} />
        <Route path="/components" element={<ComponentsRoute />} />
      </Routes>
    </BrowserRouter>
  )
}
