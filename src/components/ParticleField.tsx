import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass }      from 'three/examples/jsm/postprocessing/OutputPass.js'
import { OrbitalFieldMode } from '../visualization/modes/OrbitalFieldMode'
import { OrganicFlowMode }  from '../visualization/modes/OrganicFlowMode'
import type { VisualizationMode } from '../visualization/VisualizationMode'
import type { AudioAnalysis } from '../audio/analyzer'

interface Props {
  vizMode:   'orbital' | 'organic'
  mode?:     'sparse' | 'dense'
  seed?:     number
  accent?:   string
  audioData?: AudioAnalysis | null
}

export default function ParticleField({
  vizMode, seed = 1, accent = '#C84B30', audioData = null,
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

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    renderer.setPixelRatio(dpr)
    renderer.setSize(W, H, false)
    renderer.setClearColor(0x000000, 1)
    renderer.toneMapping = THREE.NoToneMapping

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-W/2, W/2, H/2, -H/2, 0.1, 1000)
    camera.position.z = 100

    const composer   = new EffectComposer(renderer)
    const bloomPass  = new UnrealBloomPass(new THREE.Vector2(W * dpr, H * dpr), 2.0, 0.4, 0.4)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())

    const currentMode: VisualizationMode = vizMode === 'orbital'
      ? new OrbitalFieldMode(seed, accent)
      : new OrganicFlowMode()

    currentMode.init(scene, camera, renderer, W, H, dpr)
    bloomPass.strength  = currentMode.bloom.strength
    bloomPass.radius    = currentMode.bloom.radius
    bloomPass.threshold = currentMode.bloom.threshold

    let rafId  = 0
    let lastTs = performance.now()
    let time   = 0

    const draw = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts
      time  += dt
      currentMode.update(audioRef.current, time, dt)
      composer.render()
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      currentMode.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [vizMode, seed, accent, windowKey])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
