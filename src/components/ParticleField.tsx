import { useEffect, useRef, useState } from 'react'

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
  seed?: number
  accent?: string
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

function makeRng(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export default function ParticleField({ mode, seed = 1, accent = '#C84B30', audioData = null, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<ParticleFieldAudioData | null>(audioData)
  useEffect(() => { audioRef.current = audioData }, [audioData])

  // Re-run the animation when the window is resized so the canvas stays full-bleed
  const [windowKey, setWindowKey] = useState(0)
  useEffect(() => {
    const onResize = () => setWindowKey(k => k + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Read CSS dimensions as constants — avoids ResizeObserver transform bugs.
    // Fall back to window dimensions in case the element isn't laid out yet.
    const W = canvas.clientWidth  || window.innerWidth
    const H = canvas.clientHeight || window.innerHeight

    // Set physical resolution and apply scale once — never touch it again.
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const rand = makeRng(seed)
    const count = mode === 'dense' ? 520 : 140
    const particles: Particle[] = []

    for (let i = 0; i < count; i++) {
      const angle  = rand() * Math.PI * 2
      const radius = mode === 'dense'
        ? rand() * Math.max(W, H) * 0.55
        : Math.pow(rand(), 1.4) * 240
      particles.push({
        x:    W / 2 + Math.cos(angle) * radius,
        y:    H / 2 + Math.sin(angle) * radius,
        vx:   (rand() - 0.5) * (mode === 'dense' ? 0.6 : 0.15),
        vy:   (rand() - 0.5) * (mode === 'dense' ? 0.6 : 0.15),
        size: rand() * (mode === 'dense' ? 1.6 : 1.1) + 0.3,
        life: rand(),
        hue:  rand() < 0.04 && mode === 'dense' ? 'accent' : 'white',
      })
    }

    // Prime solid background so there's no transparent flash
    ctx.fillStyle = '#0A0A0C'
    ctx.fillRect(0, 0, W, H)

    let t = 0
    let rafId = 0

    const draw = () => {
      t += 0.005

      const audio = audioRef.current
      const bassBoost   = audio ? 1 + audio.bass   * 1.5 : 1
      const trebleBoost = audio ? 1 + audio.treble * 0.8 : 1
      const midBoost    = audio ? 1 + audio.mid    * 1.2 : 1

      // Fade trail (slower fade = longer trails)
      ctx.fillStyle = mode === 'dense' ? 'rgba(10,10,12,0.08)' : 'rgba(10,10,12,0.10)'
      ctx.fillRect(0, 0, W, H)

      ctx.globalCompositeOperation = 'lighter'

      for (const p of particles) {
        // Curl-like flow field
        const fx = Math.sin((p.y + t * 40) * 0.005) * 0.04 * midBoost
        const fy = Math.cos((p.x + t * 30) * 0.005) * 0.04 * midBoost
        p.vx = p.vx * 0.985 + fx
        p.vy = p.vy * 0.985 + fy

        // Bass nudges velocity magnitude slightly each frame
        if (bassBoost > 1) {
          p.vx += p.vx * (bassBoost - 1) * 0.02
          p.vy += p.vy * (bassBoost - 1) * 0.02
        }

        // Sparse: gentle restoring pull toward center
        if (mode === 'sparse') {
          p.vx += (W / 2 - p.x) * 0.00003
          p.vy += (H / 2 - p.y) * 0.00003
        }

        p.x   += p.vx
        p.y   += p.vy
        p.life += 0.005

        // Edge wrap
        if (p.x < -20)    p.x = W + 20
        if (p.x > W + 20) p.x = -20
        if (p.y < -20)    p.y = H + 20
        if (p.y > H + 20) p.y = -20

        const baseAlpha = 0.5 + Math.sin(p.life * 2) * 0.25
        const alpha     = Math.min(1, baseAlpha * trebleBoost)
        const color     = p.hue === 'accent' ? accent : '#F4F2EC'

        // Soft radial bloom (additive — overlapping particles glow brighter)
        const bloomR = p.size * 6
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, bloomR)
        const bloomHex = Math.floor(alpha * 80).toString(16).padStart(2, '0')
        g.addColorStop(0, color + bloomHex)
        g.addColorStop(1, color + '00')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, bloomR, 0, Math.PI * 2)
        ctx.fill()

        // Hard core
        const coreHex = Math.floor(alpha * 220).toString(16).padStart(2, '0')
        ctx.fillStyle = color + coreHex
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'
      rafId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(rafId)
  }, [mode, seed, accent, windowKey])

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
