import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import { LineSegments2 }        from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial }         from 'three/examples/jsm/lines/LineMaterial.js'
import type { AudioAnalysis } from '../../audio/analyzer'
import type { VisualizationMode, BloomConfig } from '../VisualizationMode'

const MAX_P      = 6500
const MAX_NORMAL = 5525
const MAX_ADD    = MAX_P - MAX_NORMAL
const TRAIL_LEN  = 120
const TRAIL_SEG  = TRAIL_LEN - 1
const TOTAL_V_N  = MAX_NORMAL * TRAIL_SEG * 2
const TOTAL_V_A  = MAX_ADD    * TRAIL_SEG * 2

// Spawn range — wide band so density fades in gradually from dark center
const SPAWN_MIN = 80    // inner edge of spawn zone (px)
const SPAWN_MAX = 176   // outer edge of spawn zone (px)

// Inner-zone "core" drifters — give the dark center a sense of life
const CORE_COUNT = 15
const CORE_R_MAX = 64   // px, soft-clamped so they stay near center

// Standby
const STANDBY_COUNT = 120
const STANDBY_WARM  = new THREE.Color(0.957, 0.949, 0.925)

const PALETTE = [
  { r: 0.118, g: 0.227, b: 0.541, weight: 0.35 },
  { r: 0.231, g: 0.510, b: 0.965, weight: 0.25 },
  { r: 0.957, g: 0.949, b: 0.925, weight: 0.20 },
  { r: 0.918, g: 0.345, b: 0.047, weight: 0.15 },
  { r: 0.984, g: 0.749, b: 0.141, weight: 0.05 },
]

function pickColor(r01: number): { r: number; g: number; b: number } {
  let acc = 0
  for (const c of PALETTE) { acc += c.weight; if (r01 < acc) return c }
  return PALETTE[PALETTE.length - 1]
}

// Curl noise — finite difference in NOISE space (nx = x*freq).
// Previous version applied e in world space before multiplying by freq,
// producing gradients of ~freq ≈ 0.003 that were negligible vs 180 px/s radial.
// This version samples at ±0.5 in noise-space → returns values in ≈ [-1, 1].
function curl(
  n3: (x: number, y: number, z: number) => number,
  x: number, y: number, t: number, freq: number,
): [number, number] {
  const nx = x * freq, ny = y * freq
  const e  = 0.5
  const dx = (n3(nx, ny + e, t) - n3(nx, ny - e, t)) / (2 * e)
  const dy = (n3(nx + e, ny, t) - n3(nx - e, ny, t)) / (2 * e)
  return [dx, -dy]
}

export class OrganicFlowMode implements VisualizationMode {
  readonly bloom: BloomConfig = { strength: 0.2, radius: 0.3, threshold: 0.8 }

  private scene!: THREE.Scene
  private noise3D!: ReturnType<typeof createNoise3D>
  private flowGroup!: THREE.Group

  // Active trail rendering
  private normalGeo!: LineSegmentsGeometry
  private normalMat!: LineMaterial
  private normalPosArr!: Float32Array
  private normalColArr!: Float32Array
  private normalPosData!: THREE.InterleavedBuffer
  private normalColData!: THREE.InterleavedBuffer

  private addGeo!: LineSegmentsGeometry
  private addMat!: LineMaterial
  private addPosArr!: Float32Array
  private addColArr!: Float32Array
  private addPosData!: THREE.InterleavedBuffer
  private addColData!: THREE.InterleavedBuffer

  // Main particle state
  private alive    = new Uint8Array(MAX_P)
  private px       = new Float32Array(MAX_P)
  private py       = new Float32Array(MAX_P)
  private pz       = new Float32Array(MAX_P)
  private vx       = new Float32Array(MAX_P)
  private vy       = new Float32Array(MAX_P)
  private life     = new Float32Array(MAX_P)
  private maxLife  = new Float32Array(MAX_P)
  private baseR    = new Float32Array(MAX_P)
  private baseG    = new Float32Array(MAX_P)
  private baseB    = new Float32Array(MAX_P)
  private speedVar = new Float32Array(MAX_P)
  private trailX   = new Float32Array(MAX_P * TRAIL_LEN)
  private trailY   = new Float32Array(MAX_P * TRAIL_LEN)
  private trailCount = new Uint8Array(MAX_P)

  // Core drifters — 15 slow points in the inner zone (palette at 30%)
  private corePX     = new Float32Array(CORE_COUNT)
  private corePY     = new Float32Array(CORE_COUNT)
  private corePZ     = new Float32Array(CORE_COUNT)
  private coreVX     = new Float32Array(CORE_COUNT)
  private coreVY     = new Float32Array(CORE_COUNT)
  private corePosArr = new Float32Array(CORE_COUNT * 3)
  private corePosAttr!: THREE.BufferAttribute
  private corePoints!: THREE.Points

  // Standby points
  private standbyPoints!: THREE.Points
  private standbyPosArr = new Float32Array(STANDBY_COUNT * 3)
  private standbyPosAttr!: THREE.BufferAttribute
  private stdPX = new Float32Array(STANDBY_COUNT)
  private stdPY = new Float32Array(STANDBY_COUNT)
  private stdPZ = new Float32Array(STANDBY_COUNT)
  private stdVX = new Float32Array(STANDBY_COUNT)
  private stdVY = new Float32Array(STANDBY_COUNT)

  // Animation state
  private beatRotVel = 0
  private groupRot   = 0
  private beatPulse  = 1.0
  private prevBeat   = false
  private t          = 0
  private wasStandby = true

  init(scene: THREE.Scene, camera: THREE.OrthographicCamera, _renderer: THREE.WebGLRenderer, W: number, H: number, _dpr: number): void {
    this.scene   = scene
    this.noise3D = createNoise3D(Math.random)

    camera.zoom = 1 / 1.35
    camera.updateProjectionMatrix()

    // Normal blending group
    this.normalPosArr = new Float32Array(TOTAL_V_N * 3)
    this.normalColArr = new Float32Array(TOTAL_V_N * 3)
    for (let k = 2; k < TOTAL_V_N * 3; k += 3) this.normalPosArr[k] = -9999
    this.normalGeo = new LineSegmentsGeometry()
    this.normalGeo.setPositions(this.normalPosArr)
    this.normalGeo.setColors(this.normalColArr)
    this.normalPosData = (this.normalGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data
    this.normalColData = (this.normalGeo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data
    this.normalMat = new LineMaterial({ linewidth: 3.5, vertexColors: true, blending: THREE.NormalBlending, depthWrite: true, depthTest: true })
    this.normalMat.resolution.set(W, H)

    // Additive blending group
    this.addPosArr = new Float32Array(TOTAL_V_A * 3)
    this.addColArr = new Float32Array(TOTAL_V_A * 3)
    for (let k = 2; k < TOTAL_V_A * 3; k += 3) this.addPosArr[k] = -9999
    this.addGeo = new LineSegmentsGeometry()
    this.addGeo.setPositions(this.addPosArr)
    this.addGeo.setColors(this.addColArr)
    this.addPosData = (this.addGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data
    this.addColData = (this.addGeo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data
    this.addMat = new LineMaterial({ linewidth: 3.5, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false })
    this.addMat.resolution.set(W, H)

    const normalLines = new LineSegments2(this.normalGeo, this.normalMat)
    const addLines    = new LineSegments2(this.addGeo,    this.addMat)
    normalLines.frustumCulled = false; addLines.frustumCulled = false
    normalLines.renderOrder = 0;       addLines.renderOrder   = 1

    // Core drifters — palette colors baked at 30% intensity, positions updated each frame
    const coreColArr = new Float32Array(CORE_COUNT * 3)
    for (let i = 0; i < CORE_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2
      const r   = Math.random() * CORE_R_MAX
      this.corePX[i] = Math.cos(ang) * r
      this.corePY[i] = Math.sin(ang) * r
      this.corePZ[i] = (Math.random() - 0.5) * 50
      this.corePosArr[i*3] = this.corePX[i]; this.corePosArr[i*3+1] = this.corePY[i]; this.corePosArr[i*3+2] = this.corePZ[i]
      const col = pickColor(Math.random())
      coreColArr[i*3] = col.r * 0.30; coreColArr[i*3+1] = col.g * 0.30; coreColArr[i*3+2] = col.b * 0.30
    }
    const coreGeo = new THREE.BufferGeometry()
    this.corePosAttr = new THREE.BufferAttribute(this.corePosArr, 3).setUsage(THREE.DynamicDrawUsage)
    coreGeo.setAttribute('position', this.corePosAttr)
    coreGeo.setAttribute('color',    new THREE.BufferAttribute(coreColArr, 3))
    this.corePoints = new THREE.Points(coreGeo, new THREE.PointsMaterial({
      vertexColors: true, size: 4, sizeAttenuation: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    this.corePoints.frustumCulled = false

    this.flowGroup = new THREE.Group()
    this.flowGroup.add(normalLines, addLines, this.corePoints)
    this.flowGroup.visible = false
    scene.add(this.flowGroup)

    // Standby points
    const stdGeo = new THREE.BufferGeometry()
    this.standbyPosAttr = new THREE.BufferAttribute(this.standbyPosArr, 3).setUsage(THREE.DynamicDrawUsage)
    stdGeo.setAttribute('position', this.standbyPosAttr)
    this.standbyPoints = new THREE.Points(stdGeo, new THREE.PointsMaterial({
      color: STANDBY_WARM, size: 3, sizeAttenuation: false, opacity: 0.40, transparent: true, depthWrite: false,
    }))
    this.standbyPoints.frustumCulled = false
    scene.add(this.standbyPoints)

    for (let i = 0; i < STANDBY_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2
      const r   = 60 + Math.random() * 420
      this.stdPX[i] = Math.cos(ang) * r; this.stdPY[i] = Math.sin(ang) * r; this.stdPZ[i] = (Math.random() - 0.5) * 100
      this.standbyPosArr[i*3] = this.stdPX[i]; this.standbyPosArr[i*3+1] = this.stdPY[i]; this.standbyPosArr[i*3+2] = this.stdPZ[i]
    }
  }

  private getPosArr(i: number): Float32Array { return i < MAX_NORMAL ? this.normalPosArr : this.addPosArr }
  private getColArr(i: number): Float32Array { return i < MAX_NORMAL ? this.normalColArr : this.addColArr }
  private getVB(i: number): number {
    return i < MAX_NORMAL ? i * TRAIL_SEG * 2 : (i - MAX_NORMAL) * TRAIL_SEG * 2
  }

  private respawn(i: number, stagger = false): void {
    const ang        = Math.random() * Math.PI * 2
    // Uniform spawn band 80–176 px — no hard shell edge, density fades naturally inward
    const r          = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)
    this.alive[i]    = 1
    this.px[i]       = Math.cos(ang) * r
    this.py[i]       = Math.sin(ang) * r
    this.pz[i]       = (Math.random() - 0.5) * 400
    this.speedVar[i] = 0.70 + Math.random() * 0.60
    const speed      = (180 + Math.random() * 60) * this.speedVar[i]
    const velAng     = ang + (Math.random() - 0.5) * Math.PI * 0.3
    this.vx[i]       = Math.cos(velAng) * speed
    this.vy[i]       = Math.sin(velAng) * speed
    this.life[i]     = stagger ? Math.random() * 7 : 0
    this.maxLife[i]  = 6 + Math.random() * 2
    const col        = pickColor(Math.random())
    this.baseR[i]    = col.r; this.baseG[i] = col.g; this.baseB[i] = col.b
    const tb = i * TRAIL_LEN
    this.trailX[tb] = this.px[i]; this.trailY[tb] = this.py[i]
    this.trailCount[i] = 1
    const vBase = this.getVB(i) * 3
    this.getColArr(i).fill(0, vBase, vBase + TRAIL_SEG * 2 * 3)
  }

  private spawnBurst(count: number, speedMult: number): void {
    let spawned = 0
    for (let i = 0; i < MAX_P && spawned < count; i++) {
      if (!this.alive[i]) {
        this.respawn(i); this.vx[i] *= speedMult; this.vy[i] *= speedMult
        const col = pickColor(0.55 + Math.random() * 0.45)
        this.baseR[i] = col.r; this.baseG[i] = col.g; this.baseB[i] = col.b
        spawned++
      }
    }
  }

  update(audioData: AudioAnalysis | null, _time: number, dt: number): void {
    this.t += dt

    // ── STANDBY ──────────────────────────────────────────────────────────
    if (!audioData) {
      this.flowGroup.visible     = false
      this.standbyPoints.visible = true
      this.wasStandby = true

      const breathing = 1.0 + 0.05 * Math.sin(this.t * Math.PI / 3)
      this.standbyPoints.scale.setScalar(breathing)

      for (let i = 0; i < STANDBY_COUNT; i++) {
        const [cnx, cny] = curl(this.noise3D, this.stdPX[i], this.stdPY[i], this.t * 0.1, 0.003)
        const tvx = cnx * 25, tvy = cny * 25
        this.stdVX[i] += (tvx - this.stdVX[i]) * 0.015
        this.stdVY[i] += (tvy - this.stdVY[i]) * 0.015
        this.stdPX[i] += this.stdVX[i] * dt
        this.stdPY[i] += this.stdVY[i] * dt
        const d = Math.sqrt(this.stdPX[i] ** 2 + this.stdPY[i] ** 2)
        if (d > 550) { this.stdPX[i] *= 0.96; this.stdPY[i] *= 0.96 }
        this.standbyPosArr[i*3] = this.stdPX[i]; this.standbyPosArr[i*3+1] = this.stdPY[i]; this.standbyPosArr[i*3+2] = this.stdPZ[i]
      }
      this.standbyPosAttr.needsUpdate = true
      return
    }

    // ── ACTIVE ────────────────────────────────────────────────────────────
    this.standbyPoints.visible = false
    this.flowGroup.visible     = true

    if (this.wasStandby) {
      this.wasStandby = false
      this.alive.fill(0)
      this.normalColArr.fill(0); this.addColArr.fill(0)
      this.normalColData.needsUpdate = true; this.addColData.needsUpdate = true
      this.beatRotVel = 0; this.groupRot = 0; this.beatPulse = 1.0
      for (let i = 0; i < 2000; i++) this.respawn(i, true)
    }

    const bass   = audioData.bass
    const mids   = audioData.mids
    const treble = audioData.treble
    const beat   = audioData.beat

    if (beat && !this.prevBeat) {
      this.spawnBurst(600, 3.0)
      this.beatRotVel += 1.8
      this.beatPulse   = 1.5
    }
    this.prevBeat = beat

    this.beatRotVel *= Math.pow(0.02, dt)
    this.beatPulse = Math.max(1.0, this.beatPulse - dt / 0.20)

    this.groupRot += (this.beatRotVel + bass * 0.1745) * dt
    this.flowGroup.rotation.z = this.groupRot
    this.flowGroup.scale.setScalar(1.0 + bass * 0.4)

    const baseSpeed   = 180 + bass   * 420
    // Turbulence in px/s — curl() now returns ≈ [-1,1] so these scale correctly
    const turbulence  = 40  + mids   * 250
    const spinAmount  = 0.3 + treble * 2.1
    const noiseFreq   = 0.003
    const targetAlive = Math.min(Math.floor(3000 + bass * 3500), MAX_P)
    const brightBias  = treble > 0.35

    let aliveCount = 0
    for (let i = 0; i < MAX_P; i++) {
      if (!this.alive[i]) {
        if (aliveCount < targetAlive) {
          this.respawn(i)
          if (brightBias && Math.random() < treble * 0.6) {
            const col = pickColor(0.55 + Math.random() * 0.45)
            this.baseR[i] = col.r; this.baseG[i] = col.g; this.baseB[i] = col.b
          }
          aliveCount++
        }
        continue
      }

      this.life[i] += dt
      if (this.life[i] >= this.maxLife[i]) {
        this.alive[i] = 0
        const vBase = this.getVB(i) * 3
        this.getColArr(i).fill(0, vBase, vBase + TRAIL_SEG * 2 * 3)
        continue
      }
      aliveCount++

      const cx0 = this.px[i], cy0 = this.py[i]
      const dist = Math.sqrt(cx0*cx0 + cy0*cy0) + 0.001
      const radX = cx0/dist, radY = cy0/dist
      const tanX = -radY,    tanY =  radX

      const [cnx, cny] = curl(this.noise3D, cx0, cy0, this.t, noiseFreq)

      const sv  = this.speedVar[i]
      const tvx = radX * baseSpeed * sv + tanX * spinAmount * Math.sqrt(dist) + cnx * turbulence
      const tvy = radY * baseSpeed * sv + tanY * spinAmount * Math.sqrt(dist) + cny * turbulence

      this.vx[i] += (tvx - this.vx[i]) * 0.10
      this.vy[i] += (tvy - this.vy[i]) * 0.10
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt

      const tb    = i * TRAIL_LEN
      const count = this.trailCount[i]
      if (count < TRAIL_LEN) {
        this.trailX[tb + count] = this.px[i]; this.trailY[tb + count] = this.py[i]; this.trailCount[i]++
      } else {
        this.trailX.copyWithin(tb, tb + 1, tb + TRAIL_LEN); this.trailY.copyWithin(tb, tb + 1, tb + TRAIL_LEN)
        this.trailX[tb + TRAIL_LEN - 1] = this.px[i]; this.trailY[tb + TRAIL_LEN - 1] = this.py[i]
      }

      const n        = this.trailCount[i]
      const vb       = this.getVB(i)
      const posArr   = this.getPosArr(i)
      const colArr   = this.getColArr(i)
      const pr       = this.baseR[i], pg = this.baseG[i], pb2 = this.baseB[i]
      const z        = this.pz[i]
      const pulse    = this.beatPulse
      const fadeNorm = n > 1 ? n - 1 : 1

      for (let s = 0; s < TRAIL_SEG; s++) {
        const vi0 = (vb + s*2)   * 3
        const vi1 = (vb + s*2+1) * 3

        if (s >= n - 1) {
          posArr[vi0]=0; posArr[vi0+1]=0; posArr[vi0+2]=-9999
          colArr[vi0]=0; colArr[vi0+1]=0; colArr[vi0+2]=0
          posArr[vi1]=0; posArr[vi1+1]=0; posArr[vi1+2]=-9999
          colArr[vi1]=0; colArr[vi1+1]=0; colArr[vi1+2]=0
          continue
        }

        const tA    = s       / fadeNorm
        const tB    = (s + 1) / fadeNorm
        const fadeA = (tA >= 0.8 ? 1.0 - (tA - 0.8) / 0.2 * 0.70 : Math.pow(tA / 0.8, 1.5)) * 0.65 * pulse
        const fadeB = (tB >= 0.8 ? 1.0 - (tB - 0.8) / 0.2 * 0.70 : Math.pow(tB / 0.8, 1.5)) * 0.65 * pulse

        posArr[vi0] = this.trailX[tb+s];   posArr[vi0+1] = this.trailY[tb+s];   posArr[vi0+2] = z
        colArr[vi0] = pr*fadeA; colArr[vi0+1] = pg*fadeA; colArr[vi0+2] = pb2*fadeA

        posArr[vi1] = this.trailX[tb+s+1]; posArr[vi1+1] = this.trailY[tb+s+1]; posArr[vi1+2] = z
        colArr[vi1] = pr*fadeB; colArr[vi1+1] = pg*fadeB; colArr[vi1+2] = pb2*fadeB
      }
    }

    // Core drifters — slow curl in inner zone, 30% palette colors
    for (let i = 0; i < CORE_COUNT; i++) {
      const [cnx, cny] = curl(this.noise3D, this.corePX[i], this.corePY[i], this.t * 0.4, 0.003)
      const tvx = cnx * 18, tvy = cny * 18   // ~18 px/s
      this.coreVX[i] += (tvx - this.coreVX[i]) * 0.02
      this.coreVY[i] += (tvy - this.coreVY[i]) * 0.02
      this.corePX[i] += this.coreVX[i] * dt
      this.corePY[i] += this.coreVY[i] * dt
      // Soft clamp — dampen and push back when leaving core zone
      const d = Math.sqrt(this.corePX[i] ** 2 + this.corePY[i] ** 2)
      if (d > CORE_R_MAX) {
        this.corePX[i] *= 0.90; this.corePY[i] *= 0.90
        this.coreVX[i] *= 0.30; this.coreVY[i] *= 0.30
      }
      this.corePosArr[i*3] = this.corePX[i]; this.corePosArr[i*3+1] = this.corePY[i]; this.corePosArr[i*3+2] = this.corePZ[i]
    }
    this.corePosAttr.needsUpdate = true

    this.normalPosData.needsUpdate = true; this.normalColData.needsUpdate = true
    this.addPosData.needsUpdate    = true; this.addColData.needsUpdate    = true
  }

  dispose(): void {
    this.scene.remove(this.flowGroup)
    this.scene.remove(this.standbyPoints)
    this.normalGeo.dispose(); this.normalMat.dispose()
    this.addGeo.dispose();    this.addMat.dispose()
    this.corePoints.geometry.dispose();   ;(this.corePoints.material as THREE.Material).dispose()
    this.standbyPoints.geometry.dispose(); (this.standbyPoints.material as THREE.Material).dispose()
  }
}
