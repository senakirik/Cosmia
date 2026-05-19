import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import type { FFTBand } from '../components/FFTReadout'
import type { ParticleFieldAudioData } from '../components/ParticleField'

// Standard 1/3-octave band centres and display labels
const BAND_CENTERS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const BAND_LABELS  = ['31 Hz', '63 Hz', '125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz', '8 kHz', '16 kHz']
const HALF_STEP    = Math.pow(2, 1 / 6)   // 1/3-octave half-bandwidth ratio ≈ 1.1225

export interface AudioEngineAPI {
  /** Call this on the first user-initiated play to create / resume the AudioContext */
  ensureContext: () => void
  /** Live 10-band FFT data — null until context is running */
  fftBands:  FFTBand[] | null
  /** Normalised bass/mid/treble for ParticleField — null until context is running */
  audioData: ParticleFieldAudioData | null
}

export function useAudioEngine(audioRef: RefObject<HTMLAudioElement | null>): AudioEngineAPI {
  const ctxRef      = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rawDataRef  = useRef<Uint8Array<ArrayBuffer> | null>(null)
  // Instant-attack / slow-decay damping state per band
  const dampedRef   = useRef<number[]>(new Array(10).fill(0))

  const [fftBands,  setFftBands]  = useState<FFTBand[] | null>(null)
  const [audioData, setAudioData] = useState<ParticleFieldAudioData | null>(null)

  // Create AudioContext + MediaElementSourceNode on first call (one-time, user-gesture safe)
  const ensureContext = useCallback(() => {
    if (ctxRef.current) {
      ctxRef.current.resume().catch(() => {})
      return
    }
    const audio = audioRef.current
    if (!audio) return

    const ctx      = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    // We apply our own damping so turn off browser smoothing
    analyser.smoothingTimeConstant = 0

    const source = ctx.createMediaElementSource(audio)
    source.connect(analyser)
    analyser.connect(ctx.destination)

    ctxRef.current      = ctx
    analyserRef.current = analyser
    rawDataRef.current  = new Uint8Array(analyser.frequencyBinCount) // 1024 bins
  }, [audioRef])

  // Continuous RAF loop — reads FFT and computes the 10 bands on every frame
  useEffect(() => {
    let rafId: number

    const tick = () => {
      const analyser = analyserRef.current
      const rawData  = rawDataRef.current
      const ctx      = ctxRef.current

      if (analyser && rawData && ctx && ctx.state === 'running') {
        analyser.getByteFrequencyData(rawData)

        const sampleRate = ctx.sampleRate
        const numBins    = rawData.length          // 1024
        const binWidth   = sampleRate / (numBins * 2) // Hz per bin ≈ 21.5 Hz @ 44.1 kHz

        const bands: FFTBand[] = BAND_CENTERS.map((fc, i) => {
          // 1/3-octave boundaries
          const lo = Math.max(0,           Math.floor((fc / HALF_STEP) / binWidth))
          const hi = Math.min(numBins - 1, Math.ceil((fc * HALF_STEP)  / binWidth))

          let sum = 0, count = 0
          for (let b = lo; b <= hi; b++) { sum += rawData[b]; count++ }
          const raw = count > 0 ? (sum / count) / 255 : 0  // normalise 0..1

          // Instant attack, slow decay (classic VU-meter feel)
          dampedRef.current[i] = raw > dampedRef.current[i]
            ? raw
            : dampedRef.current[i] * 0.85

          const value = dampedRef.current[i]
          const db    = value > 0.001 ? (20 * Math.log10(value)).toFixed(1) : '-60.0'
          return { hz: BAND_LABELS[i], db, value }
        })

        // Mark the loudest band as "hot" (accent colour in FFTReadout)
        const maxIdx = bands.reduce((mi, b, i) => b.value > bands[mi].value ? i : mi, 0)
        if (bands[maxIdx].value > 0.05) bands[maxIdx] = { ...bands[maxIdx], hot: true }

        setFftBands(bands)

        // Extract coarse groups for ParticleField
        const bass   = (bands[0].value + bands[1].value + bands[2].value) / 3
        const mid    = (bands[3].value + bands[4].value + bands[5].value + bands[6].value) / 4
        const treble = (bands[7].value + bands[8].value + bands[9].value) / 3
        setAudioData({ bass, mid, treble })
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Close context on unmount
  useEffect(() => {
    return () => { ctxRef.current?.close().catch(() => {}) }
  }, [])

  return { ensureContext, fftBands, audioData }
}
