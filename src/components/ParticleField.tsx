import { useEffect, useRef } from 'react'

export interface ParticleFieldAudioData {
  /** 0..1 — bass energy drives velocity magnitude */
  bass: number
  /** 0..1 — treble energy drives brightness */
  treble: number
  /** 0..1 — mid energy drives flow-field intensity */
  mid: number
}

interface Props {
  mode: 'sparse' | 'dense'
  /** Seed for the deterministic RNG so layout doesn't shift on re-render */
  seed?: number
  accent?: string
  /** Live FFT data from an AnalyserNode. Pass null/undefined when audio is not wired yet. */
  audioData?: ParticleFieldAudioData | null
  className?: string
  style?: React.CSSProperties
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  hue: 'white' | 'accent'
}

/** Seeded LCG random number generator — same sequence for same seed */
function makeRng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export default function ParticleField({
  mode,
  seed = 1,
  accent = '#C84B30',
  audioData = null,
  className,
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Keep a mutable ref for audioData so the animation loop always reads the latest value
  // without needing to restart the loop when it changes.
  const audioRef = useRef<ParticleFieldAudioData | null>(audioData)
  useEffect(() => { audioRef.current = audioData }, [audioData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Size canvas to its CSS container
    const resize = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const rand = makeRng(seed)

    // Logical dimensions (CSS pixels) — read after resize
    const W = () => canvas.width / dpr
    const H = () => canvas.height / dpr

    const count = mode === 'dense' ? 520 : 140
    const particles: Particle[] = []

    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const radius = mode === 'dense'
        ? rand() * Math.max(W(), H()) * 0.55
        : Math.pow(rand(), 1.4) * 240
      particles.push({
        x: W() / 2 + Math.cos(angle) * radius,
        y: H() / 2 + Math.sin(angle) * radius,
        vx: (rand() - 0.5) * (mode === 'dense' ? 0.6 : 0.15),
        vy: (rand() - 0.5) * (mode === 'dense' ? 0.6 : 0.15),
        size: rand() * (mode === 'dense' ? 1.6 : 1.1) + 0.3,
        life: rand(),
        hue: rand() < 0.04 && mode === 'dense' ? 'accent' : 'white',
      })
    }

    let t = 0
    let rafId = 0

    // Prime background so there's no flash of white
    ctx.fillStyle = '#0A0A0C'
    ctx.fillRect(0, 0, W(), H())

    const draw = () => {
      const w = W()
      const h = H()
      t += 0.005

      // Pull audio scalars (defaults to neutral when not wired)
      const audio = audioRef.current
      const bassBoost   = audio ? 1 + audio.bass * 1.5   : 1   // velocity multiplier
      const trebleBoost = audio ? 1 + audio.treble * 0.8 : 1   // brightness multiplier
      const midBoost    = audio ? 1 + audio.mid * 1.2    : 1   // flow-field intensity

      // Trail fade — denser mode fades faster to keep trails shorter
      ctx.fillStyle = mode === 'dense' ? 'rgba(10,10,12,0.08)' : 'rgba(10,10,12,0.10)'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      for (const p of particles) {
        // Flow field (gentle perlin-ish curl)
        const fx = Math.sin((p.y + t * 40) * 0.005) * 0.04 * midBoost
        const fy = Math.cos((p.x + t * 30) * 0.005) * 0.04 * midBoost
        p.vx = p.vx * 0.985 + fx
        p.vy = p.vy * 0.985 + fy

        // Bass drives velocity magnitude
        p.vx *= bassBoost > 1 ? 1 + (bassBoost - 1) * 0.02 : 1
        p.vy *= bassBoost > 1 ? 1 + (bassBoost - 1) * 0.02 : 1

        // Sparse mode: gentle pull toward center
        if (mode === 'sparse') {
          p.vx += (w / 2 - p.x) * 0.00003
          p.vy += (h / 2 - p.y) * 0.00003
        }

        p.x += p.vx
        p.y += p.vy
        p.life += 0.005

        // Edge wrap
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20

        const baseAlpha = 0.5 + Math.sin(p.life * 2) * 0.25
        const alpha = Math.min(1, baseAlpha * trebleBoost)
        const color = p.hue === 'accent' ? accent : '#F4F2EC'

        // Soft bloom (large radial gradient, additive)
        const bloomR = p.size * 6
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, bloomR)
        const bloomAlphaHex = Math.floor(alpha * 80).toString(16).padStart(2, '0')
        g.addColorStop(0, color + bloomAlphaHex)
        g.addColorStop(1, color + '00')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, bloomR, 0, Math.PI * 2)
        ctx.fill()

        // Hard core dot
        const coreAlphaHex = Math.floor(alpha * 220).toString(16).padStart(2, '0')
        ctx.fillStyle = color + coreAlphaHex
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      rafId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [mode, seed, accent])
  // audioData intentionally excluded — changes are picked up via audioRef without restarting the loop

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        ...style,
      }}
    />
  )
}
