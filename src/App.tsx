import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ParticleField from './components/ParticleField'
import LibraryPanel from './components/LibraryPanel'
import CanvasOverlay from './components/CanvasOverlay'
import Dropzone from './components/Dropzone'
import ComponentsSheet from './pages/ComponentsSheet'
import { SAMPLE_TRACKS } from './data/tracks'
import { parseDur } from './utils/time'

// ── Sticker-sheet reference route ──────────────────────────────────────────
function ComponentsRoute() {
  return <ComponentsSheet />
}

// ── Main player app ─────────────────────────────────────────────────────────
function CosmiaApp() {
  const [libOpen,        setLibOpen]        = useState(true)
  const [currentIdx,     setCurrentIdx]     = useState<number | null>(null)
  const [playing,        setPlaying]        = useState(false)
  const [progress,       setProgress]       = useState(0)
  const [dragOver,       setDragOver]       = useState(false)

  const tracks      = SAMPLE_TRACKS
  const currentTrack = currentIdx !== null ? tracks[currentIdx] : null
  const particleMode = currentTrack && playing ? 'dense' : 'sparse'

  // Use refs so event-listener callbacks never capture stale state
  const idxRef      = useRef(currentIdx)
  const playingRef  = useRef(playing)
  const progressRef = useRef(progress)
  useEffect(() => { idxRef.current = currentIdx },    [currentIdx])
  useEffect(() => { playingRef.current = playing },   [playing])
  useEffect(() => { progressRef.current = progress }, [progress])

  // ── Mock playback timer ────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || currentIdx === null) return
    const totalSec = parseDur(tracks[currentIdx].dur)
    const id = setInterval(() => {
      setProgress(p => {
        const next = p + 250 / 1000 / totalSec
        if (next >= 1) {
          // Advance to next track and loop
          setCurrentIdx(i => ((i ?? 0) + 1) % tracks.length)
          return 0
        }
        return next
      })
    }, 250)
    return () => clearInterval(id)
  }, [playing, currentIdx, tracks])

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

  const handleTogglePlay = () => {
    if (currentIdx === null) return
    setPlaying(p => !p)
  }

  const handleSeek = (p: number) => setProgress(Math.max(0, Math.min(1, p)))

  // In Step 4 "Add Audio" loads the first demo track; Step 5 wires a real file picker
  const handleAdd = () => {
    if (currentIdx === null) {
      setCurrentIdx(0); setProgress(0); setPlaying(true)
    } else {
      setDragOver(true)
      setTimeout(() => setDragOver(false), 1500)
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────
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
        const total = parseDur(tracks[idx].dur)
        setProgress(Math.max(0, prog - 5 / total))
      } else if (e.key === 'ArrowRight' && idx !== null) {
        e.preventDefault()
        const total = parseDur(tracks[idx].dur)
        setProgress(Math.min(1, prog + 5 / total))
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
        // Step 5 will open a real file dialog here
        handleAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tracks])     // tracks is stable; state reads via refs

  // ── Drag & drop ───────────────────────────────────────────────────────
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
      // Step 5 reads e.dataTransfer.files and stores blobs; for now load demo track
      setCurrentIdx(0); setProgress(0); setPlaying(true)
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
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0A0A0C' }}>

      {/* Layer 0 — full-bleed particle canvas */}
      <ParticleField mode={particleMode} seed={currentIdx !== null ? (currentIdx + 1) * 3 : 2} />

      {/* Layer 10 — canvas overlay UI (z-index set inside component) */}
      <CanvasOverlay
        libOpen={libOpen}
        currentTrack={currentTrack}
        currentIdx={currentIdx}
        totalTracks={tracks.length}
        playing={playing}
        progress={progress}
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

// ── Router ──────────────────────────────────────────────────────────────────
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
