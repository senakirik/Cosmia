import type * as THREE from 'three'
import type { AudioAnalysis } from '../audio/analyzer'

export interface BloomConfig {
  strength:  number
  radius:    number
  threshold: number
}

export interface VisualizationMode {
  readonly bloom: BloomConfig
  init(
    scene:    THREE.Scene,
    camera:   THREE.OrthographicCamera,
    renderer: THREE.WebGLRenderer,
    W: number, H: number, dpr: number,
  ): void
  update(audioData: AudioAnalysis | null, time: number, deltaTime: number): void
  dispose(): void
}
