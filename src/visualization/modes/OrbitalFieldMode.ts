import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import type { AudioAnalysis } from '../../audio/analyzer'
import type { VisualizationMode, BloomConfig } from '../VisualizationMode'

const MAX_MAIN     = 2000
const MAX_STREAKS  = 400
const MAX_SPARKLES = 500
const MAX_CONS     = 3000
const BASE_MAIN    = 900
const BASE_ANCHORS = 130
const BASE_STREAKS = 260

const BASE_R = 0.957, BASE_G = 0.949, BASE_B = 0.925
const WARM_R = 1.000, WARM_G = 0.420, WARM_B = 0.188
const COOL_R = 0.502, COOL_G = 0.847, COOL_B = 1.000

interface Dot {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number
  r: number; g: number; b: number
  size: number; isAnchor: boolean; alive: boolean
}
interface Streak {
  x: number; y: number; prevX: number; prevY: number
  vx: number; vy: number; life: number; maxLife: number; alive: boolean
}
interface Sparkle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; alive: boolean
}

function makeRng(seed: number) {
  let s = seed * 9301 + 49297
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function curl(
  n3: (x: number, y: number, z: number) => number,
  x: number, y: number, t: number, freq: number,
): [number, number] {
  const e  = 1.0
  const dx = (n3(x * freq, (y + e) * freq, t) - n3(x * freq, (y - e) * freq, t)) / (2 * e)
  const dy = (n3((x + e) * freq, y * freq, t) - n3((x - e) * freq, y * freq, t)) / (2 * e)
  return [dx, -dy]
}

const PT_VERT = /* glsl */`
  attribute float aAlpha; attribute vec3 aColor; attribute float aSize;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vAlpha=aAlpha; vColor=aColor; gl_PointSize=aSize;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }`
const PT_FRAG = /* glsl */`
  varying float vAlpha; varying vec3 vColor;
  void main() {
    float d=length(gl_PointCoord-vec2(0.5))*2.0;
    float a=(1.0-smoothstep(0.5,1.0,d))*vAlpha;
    if(a<0.002)discard;
    gl_FragColor=vec4(vColor,a);
  }`

export class OrbitalFieldMode implements VisualizationMode {
  readonly bloom: BloomConfig = { strength: 2.0, radius: 0.4, threshold: 0.4 }

  private seed: number
  private accentHex: string

  constructor(seed: number, accent: string) {
    this.seed = seed
    this.accentHex = accent
  }

  private scene!: THREE.Scene
  private W = 0; private H = 0; private dpr = 1
  private rng!: () => number
  private noise3D!: ReturnType<typeof createNoise3D>
  private accentColor!: THREE.Color

  private mGeo!: THREE.BufferGeometry; private mMat!: THREE.ShaderMaterial
  private skGeo!: THREE.BufferGeometry; private skMat!: THREE.LineBasicMaterial
  private spGeo!: THREE.BufferGeometry; private spMat!: THREE.ShaderMaterial
  private cnGeo!: THREE.BufferGeometry; private cnMat!: THREE.LineBasicMaterial
  private icoGeo!: THREE.BufferGeometry; private icoWireGeo!: THREE.WireframeGeometry
  private icoMat!: THREE.LineBasicMaterial; private icosahedron!: THREE.LineSegments
  private spkGeo!: THREE.BufferGeometry; private spkMat!: THREE.LineBasicMaterial
  private spikeLines!: THREE.LineSegments; private pGroup!: THREE.Group

  private mPos!: Float32Array; private mAlp!: Float32Array
  private mCol!: Float32Array; private mSiz!: Float32Array
  private mPosA!: THREE.BufferAttribute; private mAlpA!: THREE.BufferAttribute
  private mColA!: THREE.BufferAttribute; private mSizA!: THREE.BufferAttribute
  private skPos!: Float32Array; private skCol!: Float32Array
  private skPosA!: THREE.BufferAttribute; private skColA!: THREE.BufferAttribute
  private spPos!: Float32Array; private spAlp!: Float32Array
  private spCol!: Float32Array; private spSiz!: Float32Array
  private spPosA!: THREE.BufferAttribute; private spAlpA!: THREE.BufferAttribute
  private spColA!: THREE.BufferAttribute; private spSizA!: THREE.BufferAttribute
  private cnPos!: Float32Array; private cnCol!: Float32Array
  private cnPosA!: THREE.BufferAttribute; private cnColA!: THREE.BufferAttribute
  private spkPos!: Float32Array

  private mainPool: Dot[]    = []
  private streakPool: Streak[] = []
  private sparklePool: Sparkle[] = []
  private mainAlive = 0; private streakAlive = 0; private sparkAlive = 0

  private t = 0
  private paletteShift = 0; private lineFlash = 0; private spikeAlpha = 0
  private prevBeat = false; private cumulativeRot = 0

  private attractors: Array<{ bx: number; by: number; str: number; orbitR: number; speed: number; phase: number }> = []
  private attrPos: Array<{ x: number; y: number }> = []

  init(scene: THREE.Scene, _camera: THREE.OrthographicCamera, _renderer: THREE.WebGLRenderer, W: number, H: number, dpr: number): void {
    this.scene = scene; this.W = W; this.H = H; this.dpr = dpr
    this.rng         = makeRng(this.seed)
    this.noise3D     = createNoise3D(this.rng)
    this.accentColor = new THREE.Color(this.accentHex)

    this.pGroup = new THREE.Group()
    scene.add(this.pGroup)

    // [1] Main dots
    this.mPos = new Float32Array(MAX_MAIN * 3); this.mAlp = new Float32Array(MAX_MAIN)
    this.mCol = new Float32Array(MAX_MAIN * 3); this.mSiz = new Float32Array(MAX_MAIN)
    this.mGeo = new THREE.BufferGeometry()
    this.mPosA = new THREE.BufferAttribute(this.mPos, 3).setUsage(THREE.DynamicDrawUsage)
    this.mAlpA = new THREE.BufferAttribute(this.mAlp, 1).setUsage(THREE.DynamicDrawUsage)
    this.mColA = new THREE.BufferAttribute(this.mCol, 3).setUsage(THREE.DynamicDrawUsage)
    this.mSizA = new THREE.BufferAttribute(this.mSiz, 1).setUsage(THREE.DynamicDrawUsage)
    this.mGeo.setAttribute('position', this.mPosA); this.mGeo.setAttribute('aAlpha', this.mAlpA)
    this.mGeo.setAttribute('aColor',   this.mColA); this.mGeo.setAttribute('aSize',  this.mSizA)
    this.mGeo.setDrawRange(0, MAX_MAIN)
    this.mMat = new THREE.ShaderMaterial({ vertexShader: PT_VERT, fragmentShader: PT_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    this.pGroup.add(new THREE.Points(this.mGeo, this.mMat))

    // [2] Streaks
    this.skPos = new Float32Array(MAX_STREAKS * 6); this.skCol = new Float32Array(MAX_STREAKS * 6)
    this.skGeo = new THREE.BufferGeometry()
    this.skPosA = new THREE.BufferAttribute(this.skPos, 3).setUsage(THREE.DynamicDrawUsage)
    this.skColA = new THREE.BufferAttribute(this.skCol, 3).setUsage(THREE.DynamicDrawUsage)
    this.skGeo.setAttribute('position', this.skPosA); this.skGeo.setAttribute('color', this.skColA)
    this.skGeo.setDrawRange(0, MAX_STREAKS * 2)
    this.skMat = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7 })
    this.pGroup.add(new THREE.LineSegments(this.skGeo, this.skMat))

    // [3] Sparkles
    this.spPos = new Float32Array(MAX_SPARKLES * 3); this.spAlp = new Float32Array(MAX_SPARKLES)
    this.spCol = new Float32Array(MAX_SPARKLES * 3); this.spSiz = new Float32Array(MAX_SPARKLES)
    this.spGeo = new THREE.BufferGeometry()
    this.spPosA = new THREE.BufferAttribute(this.spPos, 3).setUsage(THREE.DynamicDrawUsage)
    this.spAlpA = new THREE.BufferAttribute(this.spAlp, 1).setUsage(THREE.DynamicDrawUsage)
    this.spColA = new THREE.BufferAttribute(this.spCol, 3).setUsage(THREE.DynamicDrawUsage)
    this.spSizA = new THREE.BufferAttribute(this.spSiz, 1).setUsage(THREE.DynamicDrawUsage)
    this.spGeo.setAttribute('position', this.spPosA); this.spGeo.setAttribute('aAlpha', this.spAlpA)
    this.spGeo.setAttribute('aColor',   this.spColA); this.spGeo.setAttribute('aSize',  this.spSizA)
    this.spGeo.setDrawRange(0, MAX_SPARKLES)
    this.spMat = new THREE.ShaderMaterial({ vertexShader: PT_VERT, fragmentShader: PT_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    this.pGroup.add(new THREE.Points(this.spGeo, this.spMat))

    // [4] Connection lines
    this.cnPos = new Float32Array(MAX_CONS * 6); this.cnCol = new Float32Array(MAX_CONS * 6)
    this.cnGeo = new THREE.BufferGeometry()
    this.cnPosA = new THREE.BufferAttribute(this.cnPos, 3).setUsage(THREE.DynamicDrawUsage)
    this.cnColA = new THREE.BufferAttribute(this.cnCol, 3).setUsage(THREE.DynamicDrawUsage)
    this.cnGeo.setAttribute('position', this.cnPosA); this.cnGeo.setAttribute('color', this.cnColA)
    this.cnGeo.setDrawRange(0, 0)
    this.cnMat = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.25 })
    this.pGroup.add(new THREE.LineSegments(this.cnGeo, this.cnMat))

    // [5] Icosahedron
    const icoRadius = Math.min(W, H) * 0.22
    this.icoGeo     = new THREE.IcosahedronGeometry(icoRadius, 0)
    this.icoWireGeo = new THREE.WireframeGeometry(this.icoGeo)
    this.icoMat     = new THREE.LineBasicMaterial({ color: 0xF4F2EC, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending })
    this.icosahedron = new THREE.LineSegments(this.icoWireGeo, this.icoMat)
    scene.add(this.icosahedron)

    // [6] Spike lines
    this.spkPos = new Float32Array(12 * 6)
    this.spkGeo = new THREE.BufferGeometry()
    this.spkGeo.setAttribute('position', new THREE.BufferAttribute(this.spkPos, 3))
    this.spkGeo.setDrawRange(0, 0)
    this.spkMat    = new THREE.LineBasicMaterial({ color: this.accentHex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })
    this.spikeLines = new THREE.LineSegments(this.spkGeo, this.spkMat)
    scene.add(this.spikeLines)

    // CPU pools
    this.mainPool    = Array.from({ length: MAX_MAIN    }, () => ({ x:0,y:0,vx:0,vy:0,life:9999,maxLife:1,r:1,g:1,b:1,size:2,isAnchor:false,alive:false }))
    this.streakPool  = Array.from({ length: MAX_STREAKS }, () => ({ x:0,y:0,prevX:0,prevY:0,vx:0,vy:0,life:9999,maxLife:1,alive:false }))
    this.sparklePool = Array.from({ length: MAX_SPARKLES }, () => ({ x:0,y:0,vx:0,vy:0,life:9999,maxLife:0.4,alive:false }))

    this.attractors = [
      { bx:0, by:0, str:0.06,  orbitR:0,                    speed:0,      phase:0 },
      { bx:0, by:0, str:0.04,  orbitR:Math.min(W,H)*0.22,   speed:0.0027, phase:0 },
      { bx:0, by:0, str:0.030, orbitR:Math.min(W,H)*0.34,   speed:0.0018, phase:Math.PI },
    ]
    this.attrPos = this.attractors.map(() => ({ x:0, y:0 }))

    for (let i = 0; i < BASE_MAIN;    i++) { this.spawnDot();    const p = this.mainPool.find(q=>q.alive&&q.life===0);    if(p) p.life = this.rng()*3   }
    for (let i = 0; i < BASE_ANCHORS; i++) this.spawnDot({ isAnchor: true })
    for (let i = 0; i < BASE_STREAKS; i++) { this.spawnStreak(); const p = this.streakPool.find(q=>q.alive&&q.life===0);  if(p) p.life = this.rng()*2.5 }
    for (let i = 0; i < MAX_SPARKLES; i++) { this.spawnSparkle(); const p = this.sparklePool.find(q=>q.alive&&q.life===0); if(p) p.life = this.rng()*0.6 }
  }

  private randPos(): [number,number] {
    const ang = this.rng() * Math.PI * 2
    const rad = Math.sqrt(this.rng()) * Math.max(this.W, this.H) * 0.52
    return [Math.cos(ang)*rad, Math.sin(ang)*rad]
  }

  private spawnDot(over?: Partial<Dot>) {
    if (this.mainAlive >= MAX_MAIN) return
    const slot = this.mainPool.findIndex(p => !p.alive); if (slot < 0) return
    const [x,y] = this.randPos()
    const anch  = over?.isAnchor ?? false
    this.mainPool[slot] = { x,y, vx:(this.rng()-0.5)*0.8, vy:(this.rng()-0.5)*0.8, life:0, maxLife:3*(0.5+this.rng()*1.0), r:1,g:1,b:1, size:anch?(7+this.rng()*7)*this.dpr:(1.5+this.rng()*3)*this.dpr, isAnchor:anch, alive:true, ...over }
    this.mainAlive++
  }
  private spawnStreak(over?: Partial<Streak>) {
    if (this.streakAlive >= MAX_STREAKS) return
    const slot = this.streakPool.findIndex(p => !p.alive); if (slot < 0) return
    const [x,y] = this.randPos()
    const vx = (this.rng()-0.5)*1.2, vy = (this.rng()-0.5)*1.2
    this.streakPool[slot] = { x,y, prevX:x-vx, prevY:y-vy, vx,vy, life:0, maxLife:2.5*(0.4+this.rng()*1.0), alive:true, ...over }
    this.streakAlive++
  }
  private spawnSparkle(over?: Partial<Sparkle>) {
    if (this.sparkAlive >= MAX_SPARKLES) return
    const slot = this.sparklePool.findIndex(p => !p.alive); if (slot < 0) return
    const [x,y] = this.randPos()
    this.sparklePool[slot] = { x,y, vx:(this.rng()-0.5)*4, vy:(this.rng()-0.5)*4, life:0, maxLife:0.6*(0.5+this.rng()), alive:true, ...over }
    this.sparkAlive++
  }

  private beatBurst() {
    const ox = (this.rng()-0.5)*this.W*0.7, oy = (this.rng()-0.5)*this.H*0.7
    for (let i = 0; i < 100; i++) {
      const ang = (i/100)*Math.PI*2 + this.rng()*0.15
      const spd = 3 + this.rng()*3
      this.spawnDot({ x:ox,y:oy, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, r:this.accentColor.r,g:this.accentColor.g,b:this.accentColor.b, maxLife:1.5+this.rng()*0.8, isAnchor:false })
    }
    const nSpikes = 6 + Math.floor(this.rng()*7)
    for (let i = 0; i < nSpikes; i++) {
      const ang = this.rng()*Math.PI*2
      const len = Math.min(this.W,this.H)*(0.12+this.rng()*0.22)
      this.spkPos[i*6]=ox; this.spkPos[i*6+1]=oy; this.spkPos[i*6+2]=0
      this.spkPos[i*6+3]=ox+Math.cos(ang)*len; this.spkPos[i*6+4]=oy+Math.sin(ang)*len; this.spkPos[i*6+5]=0
    }
    this.spkGeo.getAttribute('position').needsUpdate = true
    this.spkGeo.setDrawRange(0, nSpikes*2)
    this.spikeAlpha=1.0; this.paletteShift=1.0; this.lineFlash=1.0
  }

  update(audioData: AudioAnalysis | null, _time: number, dt: number): void {
    this.t += dt * 0.4
    const bass=audioData?.bass??0, mids=audioData?.mids??0, treble=audioData?.treble??0, beat=audioData?.beat??false

    if (beat && !this.prevBeat) this.beatBurst()
    this.prevBeat     = beat
    this.paletteShift = Math.max(0, this.paletteShift - dt/0.15)
    this.lineFlash    = Math.max(0, this.lineFlash    - dt/0.2)
    this.spikeAlpha   = Math.max(0, this.spikeAlpha   - dt/0.6)
    this.spkMat.opacity = this.spikeAlpha * 0.95

    for (let k = 0; k < this.attractors.length; k++) {
      const a = this.attractors[k]
      this.attrPos[k].x = a.bx + Math.cos(this.t*a.speed+a.phase)*a.orbitR
      this.attrPos[k].y = a.by + Math.sin(this.t*a.speed*0.71+a.phase+1.3)*a.orbitR
    }

    const bBlend = bass*0.15 + this.paletteShift*0.15, tBlend = treble*0.15
    const tR = BASE_R+(WARM_R-BASE_R)*bBlend+(COOL_R-BASE_R)*tBlend
    const tG = BASE_G+(WARM_G-BASE_G)*bBlend+(COOL_G-BASE_G)*tBlend
    const tB = BASE_B+(WARM_B-BASE_B)*bBlend+(COOL_B-BASE_B)*tBlend

    const noiseFreq = 0.001+bass*0.004, velMult=0.8+mids*2.2, turbAmt=treble*1.2

    const applyForces = (px:number, py:number, vx:number, vy:number, strength=1.0): [number,number] => {
      const [cx,cy] = curl(this.noise3D,px,py,this.t,noiseFreq)
      const [tx2,ty2] = turbAmt>0.05 ? curl(this.noise3D,px*2.3+73,py*2.3+41,this.t*1.8,noiseFreq*2.5) : [0,0]
      let nvx = vx+((cx*velMult*strength+tx2*turbAmt)-vx)*0.06
      let nvy = vy+((cy*velMult*strength+ty2*turbAmt)-vy)*0.06
      for (let k = 0; k < this.attractors.length; k++) {
        const ap=this.attrPos[k], adx=ap.x-px, ady=ap.y-py
        const adst=Math.sqrt(adx*adx+ady*ady)+0.001
        nvx += (adx/adst)*this.attractors[k].str*dt*60
        nvy += (ady/adst)*this.attractors[k].str*dt*60
      }
      const spd=Math.sqrt(nvx*nvx+nvy*nvy), max=5*Math.max(velMult,0.8)
      if(spd>max){nvx*=max/spd;nvy*=max/spd}
      return [nvx,nvy]
    }

    // [1] Main pool
    this.mainAlive = 0
    const needed = BASE_MAIN+BASE_ANCHORS-this.mainPool.filter(p=>p.alive&&!p.isAnchor).length
    for (let i=0;i<Math.min(needed,4);i++) this.spawnDot()
    for (let i=0;i<MAX_MAIN;i++) {
      const p=this.mainPool[i]
      if(!p.alive){this.mPos[i*3]=-1e6;this.mPos[i*3+1]=-1e6;this.mPos[i*3+2]=0;this.mAlp[i]=0;continue}
      p.life+=dt
      if(p.life>=p.maxLife){p.alive=false;this.mPos[i*3]=-1e6;this.mPos[i*3+1]=-1e6;this.mPos[i*3+2]=0;this.mAlp[i]=0;continue}
      this.mainAlive++;
      [p.vx,p.vy]=applyForces(p.x,p.y,p.vx,p.vy)
      p.x+=p.vx*60*dt; p.y+=p.vy*60*dt
      const hw=this.W/2+80, hh=this.H/2+80
      if(p.x>hw)p.x=-hw;if(p.x<-hw)p.x=hw;if(p.y>hh)p.y=-hh;if(p.y<-hh)p.y=hh
      const lr=p.life/p.maxLife, alpha=Math.min(lr*6.67,1)*(1-lr)*(0.7+treble*0.3)
      const pr=p.r<0.5?this.accentColor.r:tR+(this.accentColor.r-tR)*this.paletteShift*0.25
      const pg=p.g<0.5?this.accentColor.g:tG+(this.accentColor.g-tG)*this.paletteShift*0.25
      const pb=p.b<0.5?this.accentColor.b:tB+(this.accentColor.b-tB)*this.paletteShift*0.25
      const anchorBoost=p.isAnchor?1+this.paletteShift*2.5:1
      this.mPos[i*3]=p.x;this.mPos[i*3+1]=p.y;this.mPos[i*3+2]=0
      this.mAlp[i]=Math.max(0,alpha);this.mCol[i*3]=pr;this.mCol[i*3+1]=pg;this.mCol[i*3+2]=pb
      this.mSiz[i]=p.size*(1+bass*2)*anchorBoost
    }
    this.mPosA.needsUpdate=true;this.mAlpA.needsUpdate=true;this.mColA.needsUpdate=true;this.mSizA.needsUpdate=true

    // [2] Streaks
    this.streakAlive=0
    for(let i=0;i<BASE_STREAKS-this.streakPool.filter(p=>p.alive).length;i++) this.spawnStreak()
    for(let i=0;i<MAX_STREAKS;i++){
      const p=this.streakPool[i]
      if(!p.alive){this.skPos[i*6]=-1e6;this.skPos[i*6+1]=-1e6;this.skPos[i*6+2]=0;this.skPos[i*6+3]=-1e6;this.skPos[i*6+4]=-1e6;this.skPos[i*6+5]=0;continue}
      p.life+=dt
      if(p.life>=p.maxLife){p.alive=false;this.skPos[i*6]=-1e6;this.skPos[i*6+1]=-1e6;this.skPos[i*6+2]=0;this.skPos[i*6+3]=-1e6;this.skPos[i*6+4]=-1e6;this.skPos[i*6+5]=0;continue}
      this.streakAlive++;p.prevX=p.x;p.prevY=p.y;
      [p.vx,p.vy]=applyForces(p.x,p.y,p.vx,p.vy,1.4)
      p.x+=p.vx*60*dt;p.y+=p.vy*60*dt
      const hw=this.W/2+80,hh=this.H/2+80
      if(p.x>hw)p.x=-hw;if(p.x<-hw)p.x=hw;if(p.y>hh)p.y=-hh;if(p.y<-hh)p.y=hh
      const lr=p.life/p.maxLife, a=Math.min(lr*5,1)*(1-lr)*0.55
      this.skPos[i*6]=p.prevX;this.skPos[i*6+1]=p.prevY;this.skPos[i*6+2]=0
      this.skPos[i*6+3]=p.x;this.skPos[i*6+4]=p.y;this.skPos[i*6+5]=0
      this.skCol[i*6]=tR*a;this.skCol[i*6+1]=tG*a;this.skCol[i*6+2]=tB*a
      this.skCol[i*6+3]=tR*a*0.3;this.skCol[i*6+4]=tG*a*0.3;this.skCol[i*6+5]=tB*a*0.3
    }
    this.skPosA.needsUpdate=true;this.skColA.needsUpdate=true

    // [3] Sparkles
    this.sparkAlive=0
    const sparkTarget=Math.floor(MAX_SPARKLES*(0.3+treble*0.7))
    for(let i=0;i<sparkTarget-this.sparklePool.filter(p=>p.alive).length;i++) this.spawnSparkle()
    for(let i=0;i<MAX_SPARKLES;i++){
      const p=this.sparklePool[i]
      if(!p.alive){this.spPos[i*3]=-1e6;this.spPos[i*3+1]=-1e6;this.spPos[i*3+2]=0;this.spAlp[i]=0;continue}
      p.life+=dt
      if(p.life>=p.maxLife){p.alive=false;this.spPos[i*3]=-1e6;this.spPos[i*3+1]=-1e6;this.spPos[i*3+2]=0;this.spAlp[i]=0;continue}
      this.sparkAlive++
      const [cx2,cy2]=curl(this.noise3D,p.x*0.8+200,p.y*0.8+300,this.t*2.5,noiseFreq*4)
      p.vx+=(cx2*6*(0.5+treble*3)-p.vx)*0.15;p.vy+=(cy2*6*(0.5+treble*3)-p.vy)*0.15
      p.x+=p.vx*60*dt;p.y+=p.vy*60*dt
      const hw=this.W/2+80,hh=this.H/2+80
      if(p.x>hw)p.x=-hw;if(p.x<-hw)p.x=hw;if(p.y>hh)p.y=-hh;if(p.y<-hh)p.y=hh
      const lr=p.life/p.maxLife, alp=Math.min(lr*8,1)*(1-lr)*(0.4+treble*0.6)
      this.spPos[i*3]=p.x;this.spPos[i*3+1]=p.y;this.spPos[i*3+2]=0
      this.spAlp[i]=Math.max(0,alp)
      this.spCol[i*3]=COOL_R;this.spCol[i*3+1]=COOL_G;this.spCol[i*3+2]=COOL_B
      this.spSiz[i]=1.5*this.dpr*(1+treble*2)
    }
    this.spPosA.needsUpdate=true;this.spAlpA.needsUpdate=true;this.spColA.needsUpdate=true;this.spSizA.needsUpdate=true

    // [4] Connection lines
    const maxDist=Math.min(this.W,this.H)*(0.09+mids*0.14), maxD2=maxDist*maxDist
    let nCon=0; const CHECK=Math.min(280,MAX_MAIN)
    for(let a=0;a<CHECK&&nCon<MAX_CONS;a++){
      const pa=this.mainPool[a]; if(!pa.alive)continue
      for(let b=a+1;b<CHECK&&nCon<MAX_CONS;b++){
        const pb=this.mainPool[b]; if(!pb.alive)continue
        if((pa.x-pb.x)**2+(pa.y-pb.y)**2>maxD2)continue
        const ci=nCon*6
        this.cnPos[ci]=pa.x;this.cnPos[ci+1]=pa.y;this.cnPos[ci+2]=0
        this.cnPos[ci+3]=pb.x;this.cnPos[ci+4]=pb.y;this.cnPos[ci+5]=0
        this.cnCol[ci]=tR;this.cnCol[ci+1]=tG;this.cnCol[ci+2]=tB
        this.cnCol[ci+3]=tR;this.cnCol[ci+4]=tG;this.cnCol[ci+5]=tB
        nCon++
      }
    }
    this.cnGeo.setDrawRange(0,nCon*2);this.cnPosA.needsUpdate=true;this.cnColA.needsUpdate=true
    this.cnMat.opacity=this.lineFlash>0?this.lineFlash*0.9:0.12+mids*0.18

    // [5] Icosahedron
    this.icosahedron.rotation.x+=0.0025*dt*60;this.icosahedron.rotation.y+=0.0018*dt*60;this.icosahedron.rotation.z+=0.0010*dt*60
    this.icosahedron.scale.setScalar(1+bass*0.25)

    // [6] Group rotation
    this.cumulativeRot+=(0.0001+bass*0.0025)*dt*60
    this.pGroup.rotation.z=this.cumulativeRot
  }

  dispose(): void {
    this.scene.remove(this.pGroup)
    this.scene.remove(this.icosahedron)
    this.scene.remove(this.spikeLines)
    ;[this.mGeo,this.skGeo,this.spGeo,this.cnGeo,this.icoGeo,this.icoWireGeo,this.spkGeo].forEach(g=>g.dispose())
    ;[this.mMat,this.skMat,this.spMat,this.cnMat,this.icoMat,this.spkMat].forEach(m=>m.dispose())
  }
}
