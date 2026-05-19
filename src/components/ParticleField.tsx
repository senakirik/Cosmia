/**
 * ParticleField — Three.js / WebGL renderer.
 *
 * Pipeline per frame:
 *   1. Each particle samples a 2D curl-noise field for divergence-free velocity.
 *   2. An attractor at canvas origin creates orbital behaviour.
 *   3. Audio modulates: bass → noise frequency + point size,
 *                       mids → velocity magnitude,
 *                       treble → turbulence octave weight.
 *   4. Beat: bursts 50 accent-coloured particles from center, palette shift
 *      decays over 150 ms.
 *   5. EffectComposer: RenderPass → UnrealBloomPass (str 2.0, thr 0.05) → OutputPass.
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }     from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass }     from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createNoise3D }  from 'simplex-noise'
import type { AudioAnalysis } from '../audio/analyzer'

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_PARTICLES  = 3000
const BASE_LIFE_SEC  = 3.0    // particle lifetime in seconds
const BURST_COUNT    = 50     // particles emitted on beat
const PALETTE_DECAY  = 0.15   // seconds for beat palette to decay back

// ── Particle struct ───────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  r: number; g: number; b: number
  size: number
  alive: boolean
}

// ── Seeded LCG RNG (same as before, for deterministic initial layout) ─────────
function makeRng(seed: number) {
  let s = seed * 9301 + 49297
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

// ── 2D curl noise via finite differences on a 3D simplex field ───────────────
// Returns a divergence-free velocity (vx, vy) at world position (x, y, t).
// curl_x =  ∂F/∂y,  curl_y = -∂F/∂x   where F = noise(x·freq, y·freq, t)
function curlNoise(
  n3:   (x: number, y: number, z: number) => number,
  x:    number,
  y:    number,
  t:    number,
  freq: number,
): [number, number] {
  const e  = 1.0   // epsilon in world-space pixels
  const dx = (n3(x * freq, (y + e) * freq, t) - n3(x * freq, (y - e) * freq, t)) / (2 * e)
  const dy = (n3((x + e) * freq, y * freq, t) - n3((x - e) * freq, y * freq, t)) / (2 * e)
  return [dx, -dy]
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mode:       'sparse' | 'dense'
  seed?:      number
  accent?:    string
  audioData?: AudioAnalysis | null
}

export default function ParticleField({
  mode,
  seed      = 1,
  accent    = '#C84B30',
  audioData = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Keep audio data in a ref so the RAF loop reads live values without restarting
  const audioRef  = useRef<AudioAnalysis | null>(audioData)
  useEffect(() => { audioRef.current = audioData }, [audioData])

  // Bump windowKey on resize → restarts the effect cleanly (avoids DPR bugs)
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
    const W   = canvas.clientWidth  || window.innerWidth
    const H   = canvas.clientHeight || window.innerHeight

    const accentColor = new THREE.Color(accent)
    const rng         = makeRng(seed)
    const noise3D     = createNoise3D(rng)  // seeded via rng

    // ── WebGL renderer ────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    renderer.setPixelRatio(dpr)
    renderer.setSize(W, H, false)   // false = don't mutate canvas CSS style
    renderer.setClearColor(0x0a0a0c)
    renderer.toneMapping         = THREE.ReinhardToneMapping
    renderer.toneMappingExposure = 1.5

    // ── Scene + orthographic camera ───────────────────────────────────────
    // 1 Three.js unit = 1 CSS pixel; canvas center is the world origin.
    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, 0.1, 1000)
    camera.position.z = 100

    // ── Post-processing: RenderPass → UnrealBloom → OutputPass ────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(W * dpr, H * dpr),
      2.0,    // strength  — bright enough to make sparse particles glow
      0.7,    // radius
      0.05,   // threshold — low so even dim particles contribute
    ))
    composer.addPass(new OutputPass())   // tone-map + gamma correct for display

    // ── GPU geometry (updated every frame from CPU pool) ──────────────────
    const positions = new Float32Array(MAX_PARTICLES * 3)
    const alphas    = new Float32Array(MAX_PARTICLES)
    const pColors   = new Float32Array(MAX_PARTICLES * 3)
    const pSizes    = new Float32Array(MAX_PARTICLES)

    const geo     = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    const alpAttr = new THREE.BufferAttribute(alphas,    1).setUsage(THREE.DynamicDrawUsage)
    const colAttr = new THREE.BufferAttribute(pColors,   3).setUsage(THREE.DynamicDrawUsage)
    const sizAttr = new THREE.BufferAttribute(pSizes,    1).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', posAttr)
    geo.setAttribute('aAlpha',   alpAttr)
    geo.setAttribute('aColor',   colAttr)
    geo.setAttribute('aSize',    sizAttr)
    geo.setDrawRange(0, MAX_PARTICLES)

    // ── Shader: soft radial point sprite, additive blending ───────────────
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: /* glsl */`
        attribute float aAlpha;
        attribute vec3  aColor;
        attribute float aSize;
        varying   float vAlpha;
        varying   vec3  vColor;
        void main() {
          vAlpha       = aAlpha;
          vColor       = aColor;
          gl_PointSize = aSize;
          gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        varying vec3  vColor;
        void main() {
          float d     = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float alpha = (1.0 - smoothstep(0.5, 1.0, d)) * vAlpha;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
      transparent: true,
    })

    const points = new THREE.Points(geo, mat)
    scene.add(points)

    // ── CPU particle pool ─────────────────────────────────────────────────
    const pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0,
      life: 9999, maxLife: 1,
      r: 1, g: 1, b: 1,
      size: 2, alive: false,
    }))

    let aliveCount = 0

    const spawn = (override?: Partial<Particle>) => {
      if (aliveCount >= MAX_PARTICLES) return
      const slot = pool.findIndex(p => !p.alive)
      if (slot < 0) return
      const ang = rng() * Math.PI * 2
      const rad = mode === 'dense'
        ? rng() * Math.max(W, H) * 0.42
        : Math.pow(rng(), 1.5) * Math.min(W, H) * 0.36
      pool[slot] = {
        x:       Math.cos(ang) * rad,
        y:       Math.sin(ang) * rad,
        vx:      (rng() - 0.5) * 0.5,
        vy:      (rng() - 0.5) * 0.5,
        life:    0,
        maxLife: BASE_LIFE_SEC * (0.5 + rng() * 1.0),
        r: 1, g: 1, b: 1,
        size:    (2.5 + rng() * (mode === 'dense' ? 4 : 2.5)) * dpr,
        alive:   true,
        ...override,
      }
      aliveCount++
    }

    // Seed initial batch, stagger life so they don't all die at once
    const BASE = mode === 'dense' ? 1400 : 700
    for (let i = 0; i < BASE; i++) {
      spawn()
      // Find the particle we just spawned and stagger its life
      for (let j = 0; j < MAX_PARTICLES; j++) {
        if (pool[j].alive && pool[j].life === 0) {
          pool[j].life = rng() * pool[j].maxLife
          break
        }
      }
    }

    // ── Beat state ─────────────────────────────────────────────────────────
    let paletteShift = 0   // 1.0 on beat → decays to 0 over PALETTE_DECAY s
    let prevBeat     = false

    const burst = () => {
      for (let i = 0; i < BURST_COUNT; i++) {
        const ang   = (i / BURST_COUNT) * Math.PI * 2 + rng() * 0.5
        const speed = 2.5 + rng() * 3.5
        spawn({
          x: 0, y: 0,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: accentColor.r, g: accentColor.g, b: accentColor.b,
          maxLife: 1.0 + rng() * 1.0,
          size:    (3 + rng() * 5) * dpr,
        })
      }
      paletteShift = 1.0
    }

    // ── Attractor radius in world-space pixels ────────────────────────────
    const ATTR_RADIUS = Math.min(W, H) * 0.28

    // ── Main render loop ──────────────────────────────────────────────────
    let t      = 0
    let rafId  = 0
    let lastTs = performance.now()

    const draw = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)   // seconds, ≤50 ms
      lastTs = ts
      t += dt * 0.4   // slow time advance for smooth noise animation

      const audio  = audioRef.current
      const bass   = audio?.bass   ?? 0
      const mids   = audio?.mids   ?? 0
      const treble = audio?.treble ?? 0
      const beat   = audio?.beat   ?? false

      // Beat: burst + palette shift
      if (beat && !prevBeat) burst()
      prevBeat     = beat
      paletteShift = Math.max(0, paletteShift - dt / PALETTE_DECAY)

      // Audio-driven field parameters
      const noiseFreq = 0.001 + bass * 0.004   // 0.001–0.005 (bass tunes curliness)
      const velMult   = 0.8   + mids * 2.2     // 0.8–3.0  (mids drive speed)
      const turbAmt   = treble * 1.2           // 0–1.2    (treble adds high-freq noise)

      // Replenish dead particles to maintain base count
      let needed = BASE - aliveCount
      while (needed-- > 0 && aliveCount < MAX_PARTICLES - BURST_COUNT) spawn()

      aliveCount = 0

      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = pool[i]

        if (!p.alive) {
          positions[i*3] = -1e6; positions[i*3+1] = -1e6; positions[i*3+2] = 0
          alphas[i] = 0
          continue
        }

        p.life += dt
        if (p.life >= p.maxLife) {
          p.alive = false
          positions[i*3] = -1e6; positions[i*3+1] = -1e6; positions[i*3+2] = 0
          alphas[i] = 0
          continue
        }

        aliveCount++

        // ── Curl-noise velocity ───────────────────────────────────────────
        // Each particle samples the curl field at its current position.
        const [cx, cy] = curlNoise(noise3D, p.x, p.y, t, noiseFreq)

        // Second octave for treble-driven turbulence (offset to decorrelate)
        const [tx2, ty2] = turbAmt > 0.05
          ? curlNoise(noise3D, p.x * 2.3 + 73, p.y * 2.3 + 41, t * 1.8, noiseFreq * 2.5)
          : [0, 0]

        // Velocity drifts toward curl target (time constant ~17 frames)
        const targetVx = cx * velMult + tx2 * turbAmt
        const targetVy = cy * velMult + ty2 * turbAmt
        p.vx += (targetVx - p.vx) * 0.06
        p.vy += (targetVy - p.vy) * 0.06

        // ── Attractor: orbit/in-spiral toward world origin ────────────────
        const dist   = Math.sqrt(p.x * p.x + p.y * p.y) + 0.001
        const unitX  = -p.x / dist
        const unitY  = -p.y / dist
        // 7× stronger inside the attractor sphere → spiraling orbital paths
        const aStr   = (dist < ATTR_RADIUS ? 0.20 : 0.03)
        p.vx += unitX * aStr * dt * 60
        p.vy += unitY * aStr * dt * 60

        // Speed cap (frame-rate independent)
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        const max = 4.5 * Math.max(velMult, 0.8)
        if (spd > max) { p.vx *= max / spd; p.vy *= max / spd }

        p.x += p.vx * 60 * dt   // vx unit = pixels/frame @ 60fps
        p.y += p.vy * 60 * dt

        // Edge wrap in orthographic space
        const hw = W / 2 + 60, hh = H / 2 + 60
        if (p.x >  hw) p.x = -hw
        if (p.x < -hw) p.x =  hw
        if (p.y >  hh) p.y = -hh
        if (p.y < -hh) p.y =  hh

        // ── Particle alpha: fade-in over first 15% of life, then fade-out ──
        const lr    = p.life / p.maxLife
        const alpha = Math.min(lr * 6.67, 1.0) * (1.0 - lr) * (0.7 + treble * 0.3)

        // ── Color: shift toward accent on beat pulse ───────────────────────
        const pr = p.r + (accentColor.r - p.r) * paletteShift
        const pg = p.g + (accentColor.g - p.g) * paletteShift
        const pb = p.b + (accentColor.b - p.b) * paletteShift

        positions[i*3]     = p.x
        positions[i*3 + 1] = p.y
        positions[i*3 + 2] = 0
        alphas[i]          = Math.max(0, alpha)
        pColors[i*3]       = pr
        pColors[i*3 + 1]   = pg
        pColors[i*3 + 2]   = pb
        pSizes[i]          = p.size * (1 + bass * 2.0)  // bass pulsates size
      }

      posAttr.needsUpdate = true
      alpAttr.needsUpdate = true
      colAttr.needsUpdate = true
      sizAttr.needsUpdate = true

      // ── composer.render() drives the full post-processing chain ───────────
      composer.render()

      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      renderer.dispose()
      geo.dispose()
      mat.dispose()
      composer.dispose()
    }
  }, [mode, seed, accent, windowKey])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
