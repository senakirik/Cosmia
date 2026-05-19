import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js'
import { createNoise3D }   from 'simplex-noise'
import type { AudioAnalysis } from '../audio/analyzer'

// ── Pool sizes ────────────────────────────────────────────────────────────────
const MAX_MAIN     = 2000   // dots + anchors + ring bursts
const MAX_STREAKS  = 400    // velocity-trail particles (rendered as LineSegments)
const MAX_SPARKLES = 500    // fast treble layer
const MAX_CONS     = 3000   // mids connection line pairs
const BASE_MAIN    = 900    // steady-state dots
const BASE_ANCHORS = 130    // steady-state anchors (larger, pulse on beat)
const BASE_STREAKS = 260    // steady-state streaks

// ── Color constants ───────────────────────────────────────────────────────────
// Base warm-white, bass→orange, treble→cyan (each ≤15% saturation shift)
const BASE_R = 0.957, BASE_G = 0.949, BASE_B = 0.925  // #F4F2EC
const WARM_R = 1.000, WARM_G = 0.420, WARM_B = 0.188  // #FF6B30
const COOL_R = 0.502, COOL_G = 0.847, COOL_B = 1.000  // #80D8FF

// ── Structs ───────────────────────────────────────────────────────────────────
interface Dot {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number
  r: number; g: number; b: number
  size: number; isAnchor: boolean; alive: boolean
}
interface Streak {
  x: number; y: number; prevX: number; prevY: number
  vx: number; vy: number
  life: number; maxLife: number; alive: boolean
}
interface Sparkle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; alive: boolean
}

// ── Seeded LCG ───────────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = seed * 9301 + 49297
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

// ── 2D curl of 3D simplex: curl_x=∂F/∂y  curl_y=-∂F/∂x ──────────────────────
function curl(
  n3: (x: number, y: number, z: number) => number,
  x: number, y: number, t: number, freq: number,
): [number, number] {
  const e  = 1.0
  const dx = (n3(x * freq, (y + e) * freq, t) - n3(x * freq, (y - e) * freq, t)) / (2 * e)
  const dy = (n3((x + e) * freq, y * freq, t) - n3((x - e) * freq, y * freq, t)) / (2 * e)
  return [dx, -dy]
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mode: 'sparse' | 'dense'
  seed?: number
  accent?: string
  audioData?: AudioAnalysis | null
}

export default function ParticleField({
  mode, seed = 1, accent = '#C84B30', audioData = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef  = useRef<AudioAnalysis | null>(audioData)
  useEffect(() => { audioRef.current = audioData }, [audioData])

  const [windowKey, setWindowKey] = useState(0)
  useEffect(() => {
    const fn = () => setWindowKey(k => k + 1)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W   = canvas.clientWidth  || window.innerWidth
    const H   = canvas.clientHeight || window.innerHeight

    const accentColor = new THREE.Color(accent)
    const rng         = makeRng(seed)
    const noise3D     = createNoise3D(rng)

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    renderer.setPixelRatio(dpr)
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x0a0a0c)
    renderer.toneMapping         = THREE.ReinhardToneMapping
    renderer.toneMappingExposure = 1.5

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, 0.1, 1000)
    camera.position.z = 100

    // ── Post-processing ───────────────────────────────────────────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W * dpr, H * dpr), 2.0, 0.7, 0.05))
    composer.addPass(new OutputPass())

    // ── Particle group (rotates with bass) ────────────────────────────────
    const pGroup = new THREE.Group()
    scene.add(pGroup)

    // ── Shared point shader ───────────────────────────────────────────────
    const ptVert = /* glsl */`
      attribute float aAlpha;
      attribute vec3  aColor;
      attribute float aSize;
      varying   float vAlpha;
      varying   vec3  vColor;
      void main() {
        vAlpha = aAlpha; vColor = aColor; gl_PointSize = aSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`
    const ptFrag = /* glsl */`
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float a = (1.0 - smoothstep(0.5, 1.0, d)) * vAlpha;
        if (a < 0.002) discard;
        gl_FragColor = vec4(vColor, a);
      }`

    // ── [1] Main dots + anchors ───────────────────────────────────────────
    const mPos = new Float32Array(MAX_MAIN * 3)
    const mAlp = new Float32Array(MAX_MAIN)
    const mCol = new Float32Array(MAX_MAIN * 3)
    const mSiz = new Float32Array(MAX_MAIN)
    const mGeo = new THREE.BufferGeometry()
    const mPosA = new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage)
    const mAlpA = new THREE.BufferAttribute(mAlp, 1).setUsage(THREE.DynamicDrawUsage)
    const mColA = new THREE.BufferAttribute(mCol, 3).setUsage(THREE.DynamicDrawUsage)
    const mSizA = new THREE.BufferAttribute(mSiz, 1).setUsage(THREE.DynamicDrawUsage)
    mGeo.setAttribute('position', mPosA)
    mGeo.setAttribute('aAlpha',   mAlpA)
    mGeo.setAttribute('aColor',   mColA)
    mGeo.setAttribute('aSize',    mSizA)
    mGeo.setDrawRange(0, MAX_MAIN)
    const mMat = new THREE.ShaderMaterial({
      vertexShader: ptVert, fragmentShader: ptFrag,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    })
    pGroup.add(new THREE.Points(mGeo, mMat))

    // ── [2] Streak particles (velocity trails as LineSegments) ────────────
    const skPos = new Float32Array(MAX_STREAKS * 6)  // 2 endpoints each
    const skCol = new Float32Array(MAX_STREAKS * 6)
    const skGeo = new THREE.BufferGeometry()
    const skPosA = new THREE.BufferAttribute(skPos, 3).setUsage(THREE.DynamicDrawUsage)
    const skColA = new THREE.BufferAttribute(skCol, 3).setUsage(THREE.DynamicDrawUsage)
    skGeo.setAttribute('position', skPosA)
    skGeo.setAttribute('color',    skColA)
    skGeo.setDrawRange(0, MAX_STREAKS * 2)
    const skMat = new THREE.LineBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.7,
    })
    pGroup.add(new THREE.LineSegments(skGeo, skMat))

    // ── [3] Sparkle layer (treble-driven, fast) ───────────────────────────
    const spPos = new Float32Array(MAX_SPARKLES * 3)
    const spAlp = new Float32Array(MAX_SPARKLES)
    const spCol = new Float32Array(MAX_SPARKLES * 3)
    const spSiz = new Float32Array(MAX_SPARKLES)
    const spGeo = new THREE.BufferGeometry()
    const spPosA = new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage)
    const spAlpA = new THREE.BufferAttribute(spAlp, 1).setUsage(THREE.DynamicDrawUsage)
    const spColA = new THREE.BufferAttribute(spCol, 3).setUsage(THREE.DynamicDrawUsage)
    const spSizA = new THREE.BufferAttribute(spSiz, 1).setUsage(THREE.DynamicDrawUsage)
    spGeo.setAttribute('position', spPosA)
    spGeo.setAttribute('aAlpha',   spAlpA)
    spGeo.setAttribute('aColor',   spColA)
    spGeo.setAttribute('aSize',    spSizA)
    spGeo.setDrawRange(0, MAX_SPARKLES)
    const spMat = new THREE.ShaderMaterial({
      vertexShader: ptVert, fragmentShader: ptFrag,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    })
    pGroup.add(new THREE.Points(spGeo, spMat))

    // ── [4] Connection lines (mids-driven) ────────────────────────────────
    const cnPos = new Float32Array(MAX_CONS * 6)
    const cnCol = new Float32Array(MAX_CONS * 6)
    const cnGeo = new THREE.BufferGeometry()
    const cnPosA = new THREE.BufferAttribute(cnPos, 3).setUsage(THREE.DynamicDrawUsage)
    const cnColA = new THREE.BufferAttribute(cnCol, 3).setUsage(THREE.DynamicDrawUsage)
    cnGeo.setAttribute('position', cnPosA)
    cnGeo.setAttribute('color',    cnColA)
    cnGeo.setDrawRange(0, 0)
    const cnMat = new THREE.LineBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.25,
    })
    pGroup.add(new THREE.LineSegments(cnGeo, cnMat))

    // ── [5] Wireframe icosahedron (background) ────────────────────────────
    const icoRadius = Math.min(W, H) * 0.22
    const icoGeo  = new THREE.IcosahedronGeometry(icoRadius, 0)
    const icoWire = new THREE.WireframeGeometry(icoGeo)
    const icoMat  = new THREE.LineBasicMaterial({
      color: 0xF4F2EC, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending,
    })
    const icosahedron = new THREE.LineSegments(icoWire, icoMat)
    scene.add(icosahedron)  // not in pGroup — doesn't rotate with particles

    // ── [6] Spike lines (beat events, fade over 600 ms) ───────────────────
    const MAX_SPIKES = 12
    const spkPos = new Float32Array(MAX_SPIKES * 6)
    const spkGeo = new THREE.BufferGeometry()
    spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3))
    spkGeo.setDrawRange(0, 0)
    const spkMat = new THREE.LineBasicMaterial({
      color: accent, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending,
    })
    const spikeLines = new THREE.LineSegments(spkGeo, spkMat)
    scene.add(spikeLines)

    // ── CPU pools ─────────────────────────────────────────────────────────
    const mainPool: Dot[] = Array.from({ length: MAX_MAIN }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 9999, maxLife: 1,
      r: 1, g: 1, b: 1, size: 2, isAnchor: false, alive: false,
    }))
    const streakPool: Streak[] = Array.from({ length: MAX_STREAKS }, () => ({
      x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
      life: 9999, maxLife: 1, alive: false,
    }))
    const sparklePool: Sparkle[] = Array.from({ length: MAX_SPARKLES }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 9999, maxLife: 0.4, alive: false,
    }))

    let mainAlive = 0, streakAlive = 0, sparkAlive = 0

    // Spread across whole frame with uniform disk + corner coverage
    const randPos = () => {
      const ang = rng() * Math.PI * 2
      const rad = Math.sqrt(rng()) * Math.max(W, H) * 0.52
      return [Math.cos(ang) * rad, Math.sin(ang) * rad] as [number, number]
    }

    const spawnDot = (over?: Partial<Dot>) => {
      if (mainAlive >= MAX_MAIN) return
      const slot = mainPool.findIndex(p => !p.alive)
      if (slot < 0) return
      const [x, y] = randPos()
      const anch = over?.isAnchor ?? false
      mainPool[slot] = {
        x, y, vx: (rng()-0.5)*0.8, vy: (rng()-0.5)*0.8,
        life: 0, maxLife: 3 * (0.5 + rng() * 1.0),
        r: 1, g: 1, b: 1,
        size: anch ? (7 + rng() * 7) * dpr : (1.5 + rng() * 3) * dpr,
        isAnchor: anch, alive: true, ...over,
      }
      mainAlive++
    }

    const spawnStreak = (over?: Partial<Streak>) => {
      if (streakAlive >= MAX_STREAKS) return
      const slot = streakPool.findIndex(p => !p.alive)
      if (slot < 0) return
      const [x, y] = randPos()
      const vx = (rng()-0.5)*1.2, vy = (rng()-0.5)*1.2
      streakPool[slot] = {
        x, y, prevX: x - vx, prevY: y - vy, vx, vy,
        life: 0, maxLife: 2.5 * (0.4 + rng() * 1.0), alive: true, ...over,
      }
      streakAlive++
    }

    const spawnSparkle = (over?: Partial<Sparkle>) => {
      if (sparkAlive >= MAX_SPARKLES) return
      const slot = sparklePool.findIndex(p => !p.alive)
      if (slot < 0) return
      const [x, y] = randPos()
      sparklePool[slot] = {
        x, y, vx: (rng()-0.5)*4, vy: (rng()-0.5)*4,
        life: 0, maxLife: 0.6 * (0.5 + rng()), alive: true, ...over,
      }
      sparkAlive++
    }

    // Seed initial particles, stagger life so they don't all die at once
    for (let i = 0; i < BASE_MAIN;    i++) { spawnDot();    mainPool.find(p=>p.alive&&p.life===0)!.life   = rng()*3 }
    for (let i = 0; i < BASE_ANCHORS; i++) { spawnDot({ isAnchor: true }); }
    for (let i = 0; i < BASE_STREAKS; i++) { spawnStreak(); streakPool.find(p=>p.alive&&p.life===0)!.life = rng()*2.5 }
    for (let i = 0; i < MAX_SPARKLES; i++) { spawnSparkle(); sparklePool.find(p=>p.alive&&p.life===0)!.life = rng()*0.6 }

    // ── Multiple attractors ────────────────────────────────────────────────
    // Center is weak (70% reduced from prior), 2 secondary drift around it
    const attractors = [
      { bx: 0,                    by: 0,                     str: 0.06, orbitR: 0,                         speed: 0,     phase: 0 },
      { bx: 0,                    by: 0,                     str: 0.04, orbitR: Math.min(W,H) * 0.22,       speed: 0.0027, phase: 0 },
      { bx: 0,                    by: 0,                     str: 0.030, orbitR: Math.min(W,H) * 0.34,      speed: 0.0018, phase: Math.PI },
    ]
    // Runtime positions
    const attrPos = attractors.map(() => ({ x: 0, y: 0 }))

    // ── Beat / palette state ───────────────────────────────────────────────
    let paletteShift = 0
    let lineFlash    = 0   // flash all connection opacity to 100% on beat
    let spikeAlpha   = 0
    let prevBeat     = false
    let cumulativeRot = 0

    const beatBurst = () => {
      // Ring of 100 particles from a random canvas point
      const ox = (rng()-0.5) * W * 0.7
      const oy = (rng()-0.5) * H * 0.7
      for (let i = 0; i < 100; i++) {
        const ang   = (i / 100) * Math.PI * 2 + rng() * 0.15
        const speed = 3 + rng() * 3
        spawnDot({
          x: ox, y: oy,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: accentColor.r, g: accentColor.g, b: accentColor.b,
          maxLife: 1.5 + rng() * 0.8, isAnchor: false,
        })
      }
      // Spike lines from same origin
      const nSpikes = 6 + Math.floor(rng() * 7)
      for (let i = 0; i < nSpikes; i++) {
        const ang = rng() * Math.PI * 2
        const len = Math.min(W, H) * (0.12 + rng() * 0.22)
        spkPos[i*6]     = ox;             spkPos[i*6+1] = oy;             spkPos[i*6+2] = 0
        spkPos[i*6+3]   = ox + Math.cos(ang)*len; spkPos[i*6+4] = oy + Math.sin(ang)*len; spkPos[i*6+5] = 0
      }
      spkGeo.getAttribute('position').needsUpdate = true
      spkGeo.setDrawRange(0, nSpikes * 2)
      spikeAlpha   = 1.0
      paletteShift = 1.0
      lineFlash    = 1.0
    }

    // ── Render loop ───────────────────────────────────────────────────────
    let t      = 0
    let rafId  = 0
    let lastTs = performance.now()

    const draw = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      t += dt * 0.4

      const audio  = audioRef.current
      const bass   = audio?.bass   ?? 0
      const mids   = audio?.mids   ?? 0
      const treble = audio?.treble ?? 0
      const beat   = audio?.beat   ?? false

      if (beat && !prevBeat) beatBurst()
      prevBeat     = beat
      paletteShift = Math.max(0, paletteShift - dt / 0.15)
      lineFlash    = Math.max(0, lineFlash    - dt / 0.2)
      spikeAlpha   = Math.max(0, spikeAlpha   - dt / 0.6)
      spkMat.opacity = spikeAlpha * 0.95

      // ── Update attractor positions (slow drift) ──────────────────────
      for (let k = 0; k < attractors.length; k++) {
        const a = attractors[k]
        attrPos[k].x = a.bx + Math.cos(t * a.speed + a.phase)              * a.orbitR
        attrPos[k].y = a.by + Math.sin(t * a.speed * 0.71 + a.phase + 1.3) * a.orbitR
      }

      // ── Per-frame tint color (bass → warm, treble → cool, ≤15% each) ──
      const bBlend = bass   * 0.15 + paletteShift * 0.15
      const tBlend = treble * 0.15
      let tR = BASE_R + (WARM_R - BASE_R) * bBlend + (COOL_R - BASE_R) * tBlend
      let tG = BASE_G + (WARM_G - BASE_G) * bBlend + (COOL_G - BASE_G) * tBlend
      let tB = BASE_B + (WARM_B - BASE_B) * bBlend + (COOL_B - BASE_B) * tBlend

      // ── Audio-driven field params ────────────────────────────────────
      const noiseFreq = 0.001 + bass   * 0.004   // 0.001–0.005
      const velMult   = 0.8   + mids   * 2.2     // 0.8–3.0
      const turbAmt   = treble * 1.2             // 0–1.2

      // ── Apply velocity from curl + attractors (shared inline) ─────────
      const applyForces = (
        px: number, py: number, vx: number, vy: number,
        strength = 1.0,
      ): [number, number] => {
        const [cx, cy] = curl(noise3D, px, py, t, noiseFreq)
        const [tx2, ty2] = turbAmt > 0.05
          ? curl(noise3D, px * 2.3 + 73, py * 2.3 + 41, t * 1.8, noiseFreq * 2.5)
          : [0, 0]
        const tvx = cx * velMult * strength + tx2 * turbAmt
        const tvy = cy * velMult * strength + ty2 * turbAmt
        let nvx = vx + (tvx - vx) * 0.06
        let nvy = vy + (tvy - vy) * 0.06

        // Sum all attractor forces
        for (const a of attrPos) {
          const adx  = a.x - px
          const ady  = a.y - py
          const adst = Math.sqrt(adx*adx + ady*ady) + 0.001
          // Attractor uses constant-magnitude force (str/dist gives inverse falloff)
          nvx += (adx/adst) * attractors[attrPos.indexOf(a)].str * dt * 60
          nvy += (ady/adst) * attractors[attrPos.indexOf(a)].str * dt * 60
        }

        const spd = Math.sqrt(nvx*nvx + nvy*nvy)
        const max = 5 * Math.max(velMult, 0.8)
        if (spd > max) { nvx *= max/spd; nvy *= max/spd }
        return [nvx, nvy]
      }

      // ── [1] Main pool update ────────────────────────────────────────
      mainAlive = 0
      const needed = BASE_MAIN + BASE_ANCHORS - mainPool.filter(p=>p.alive&&!p.isAnchor).length + 0
      for (let i = 0; i < Math.min(needed, 4); i++) spawnDot()

      for (let i = 0; i < MAX_MAIN; i++) {
        const p = mainPool[i]
        if (!p.alive) { mPos[i*3]=-1e6; mPos[i*3+1]=-1e6; mPos[i*3+2]=0; mAlp[i]=0; continue }
        p.life += dt
        if (p.life >= p.maxLife) {
          p.alive = false; mPos[i*3]=-1e6; mPos[i*3+1]=-1e6; mPos[i*3+2]=0; mAlp[i]=0; continue
        }
        mainAlive++
        ;[p.vx, p.vy] = applyForces(p.x, p.y, p.vx, p.vy)
        p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt

        const hw=W/2+80, hh=H/2+80
        if(p.x> hw)p.x=-hw; if(p.x<-hw)p.x=hw; if(p.y> hh)p.y=-hh; if(p.y<-hh)p.y=hh

        const lr    = p.life / p.maxLife
        const alpha = Math.min(lr * 6.67, 1) * (1 - lr) * (0.7 + treble * 0.3)

        // Color: accent particles stay accent; white particles get tinted
        const pr = p.r < 0.5 ? accentColor.r : tR + (accentColor.r - tR) * paletteShift * 0.25
        const pg = p.g < 0.5 ? accentColor.g : tG + (accentColor.g - tG) * paletteShift * 0.25
        const pb = p.b < 0.5 ? accentColor.b : tB + (accentColor.b - tB) * paletteShift * 0.25

        const anchorBoost = p.isAnchor ? 1 + paletteShift * 2.5 : 1
        mPos[i*3]=p.x; mPos[i*3+1]=p.y; mPos[i*3+2]=0
        mAlp[i]   = Math.max(0, alpha)
        mCol[i*3]=pr; mCol[i*3+1]=pg; mCol[i*3+2]=pb
        mSiz[i]   = p.size * (1 + bass * 2) * anchorBoost
      }
      mPosA.needsUpdate=true; mAlpA.needsUpdate=true; mColA.needsUpdate=true; mSizA.needsUpdate=true

      // ── [2] Streak pool update ──────────────────────────────────────
      streakAlive = 0
      for (let i = 0; i < BASE_STREAKS - streakPool.filter(p=>p.alive).length; i++) spawnStreak()

      for (let i = 0; i < MAX_STREAKS; i++) {
        const p = streakPool[i]
        if (!p.alive) { skPos[i*6]=-1e6;skPos[i*6+1]=-1e6;skPos[i*6+2]=0;skPos[i*6+3]=-1e6;skPos[i*6+4]=-1e6;skPos[i*6+5]=0; continue }
        p.life += dt
        if (p.life >= p.maxLife) {
          p.alive = false
          skPos[i*6]=-1e6;skPos[i*6+1]=-1e6;skPos[i*6+2]=0;skPos[i*6+3]=-1e6;skPos[i*6+4]=-1e6;skPos[i*6+5]=0
          continue
        }
        streakAlive++
        p.prevX = p.x; p.prevY = p.y
        ;[p.vx, p.vy] = applyForces(p.x, p.y, p.vx, p.vy, 1.4)  // slightly faster
        p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt
        const hw=W/2+80, hh=H/2+80
        if(p.x> hw)p.x=-hw; if(p.x<-hw)p.x=hw; if(p.y> hh)p.y=-hh; if(p.y<-hh)p.y=hh

        const lr = p.life / p.maxLife
        const a  = Math.min(lr * 5, 1) * (1 - lr) * 0.55

        skPos[i*6]  =p.prevX; skPos[i*6+1]=p.prevY; skPos[i*6+2]=0
        skPos[i*6+3]=p.x;     skPos[i*6+4]=p.y;     skPos[i*6+5]=0
        skCol[i*6]=tR*a; skCol[i*6+1]=tG*a; skCol[i*6+2]=tB*a
        skCol[i*6+3]=tR*a*0.3; skCol[i*6+4]=tG*a*0.3; skCol[i*6+5]=tB*a*0.3
      }
      skPosA.needsUpdate=true; skColA.needsUpdate=true

      // ── [3] Sparkle pool update (treble-driven surge) ───────────────
      sparkAlive = 0
      const sparkTarget = Math.floor(MAX_SPARKLES * (0.3 + treble * 0.7))
      for (let i = 0; i < sparkTarget - sparklePool.filter(p=>p.alive).length; i++) spawnSparkle()

      for (let i = 0; i < MAX_SPARKLES; i++) {
        const p = sparklePool[i]
        if (!p.alive) { spPos[i*3]=-1e6; spPos[i*3+1]=-1e6; spPos[i*3+2]=0; spAlp[i]=0; continue }
        p.life += dt
        if (p.life >= p.maxLife) {
          p.alive=false; spPos[i*3]=-1e6; spPos[i*3+1]=-1e6; spPos[i*3+2]=0; spAlp[i]=0; continue
        }
        sparkAlive++
        // Fast curl at higher frequency
        const [cx2, cy2] = curl(noise3D, p.x * 0.8 + 200, p.y * 0.8 + 300, t * 2.5, noiseFreq * 4)
        p.vx += (cx2 * 6 * (0.5 + treble * 3) - p.vx) * 0.15
        p.vy += (cy2 * 6 * (0.5 + treble * 3) - p.vy) * 0.15
        p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt
        const hw=W/2+80, hh=H/2+80
        if(p.x> hw)p.x=-hw; if(p.x<-hw)p.x=hw; if(p.y> hh)p.y=-hh; if(p.y<-hh)p.y=hh

        const lr  = p.life / p.maxLife
        const alp = Math.min(lr * 8, 1) * (1 - lr) * (0.4 + treble * 0.6)
        spPos[i*3]=p.x; spPos[i*3+1]=p.y; spPos[i*3+2]=0
        spAlp[i]  = Math.max(0, alp)
        // Sparkles tint toward cyan
        spCol[i*3]=COOL_R; spCol[i*3+1]=COOL_G; spCol[i*3+2]=COOL_B
        spSiz[i]  = 1.5 * dpr * (1 + treble * 2)
      }
      spPosA.needsUpdate=true; spAlpA.needsUpdate=true; spColA.needsUpdate=true; spSizA.needsUpdate=true

      // ── [4] Connection lines (mids) ────────────────────────────────
      const maxDist = Math.min(W, H) * (0.09 + mids * 0.14)
      const maxD2   = maxDist * maxDist
      let   nCon    = 0
      const CHECK   = Math.min(280, MAX_MAIN)   // O(280²/2) ≈ 39K checks/frame
      for (let a = 0; a < CHECK && nCon < MAX_CONS; a++) {
        const pa = mainPool[a]
        if (!pa.alive) continue
        for (let b = a + 1; b < CHECK && nCon < MAX_CONS; b++) {
          const pb = mainPool[b]
          if (!pb.alive) continue
          const dx2 = (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2
          if (dx2 > maxD2) continue
          const ci = nCon * 6
          cnPos[ci]  =pa.x; cnPos[ci+1]=pa.y; cnPos[ci+2]=0
          cnPos[ci+3]=pb.x; cnPos[ci+4]=pb.y; cnPos[ci+5]=0
          // Line color: average of two particles, modulated by mids
          const cr = (tR + tR) * 0.5
          const cg = (tG + tG) * 0.5
          const cb = (tB + tB) * 0.5
          cnCol[ci]=cr;  cnCol[ci+1]=cg;  cnCol[ci+2]=cb
          cnCol[ci+3]=cr;cnCol[ci+4]=cg;  cnCol[ci+5]=cb
          nCon++
        }
      }
      cnGeo.setDrawRange(0, nCon * 2)
      cnPosA.needsUpdate = true; cnColA.needsUpdate = true
      // Beat flashes lines to full opacity briefly, mids scale opacity otherwise
      cnMat.opacity = lineFlash > 0
        ? lineFlash * 0.9
        : 0.12 + mids * 0.18

      // ── [5] Icosahedron: slow rotation + bass scale ─────────────────
      icosahedron.rotation.x += 0.0025 * dt * 60
      icosahedron.rotation.y += 0.0018 * dt * 60
      icosahedron.rotation.z += 0.0010 * dt * 60
      icosahedron.scale.setScalar(1 + bass * 0.25)

      // ── [6] Whole particle group rotates with bass ──────────────────
      // Low bass = large slow structures, high bass = faster field rotation
      cumulativeRot += (0.0001 + bass * 0.0025) * dt * 60
      pGroup.rotation.z = cumulativeRot

      // ── Render ─────────────────────────────────────────────────────
      composer.render()
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      renderer.dispose()
      ;[mGeo, skGeo, spGeo, cnGeo, icoGeo, icoWire, spkGeo].forEach(g => g.dispose())
      ;[mMat, skMat, spMat, cnMat, icoMat, spkMat].forEach(m => m.dispose())
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
