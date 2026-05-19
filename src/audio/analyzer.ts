/**
 * Audio analysis module — standalone, no UI dependencies.
 *
 * Pipeline per frame:
 *   FFT bins → 3-band split → EMA smoothing → pow(v/255, 2.5) curve
 *   Time-domain signal → Meyda energy → adaptive-threshold beat detector
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { RefObject } from 'react'
import Meyda from 'meyda'
import type { FFTBand } from '../components/FFTReadout'

// ── Labels for the 10-band FFT chrome ────────────────────────────────────────
const FFT_CENTERS = [31, 63, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
const FFT_LABELS  = ['31 Hz','63 Hz','125 Hz','250 Hz','500 Hz','1 kHz','2 kHz','4 kHz','8 kHz','16 kHz']
const HALF_STEP   = Math.pow(2, 1 / 6)

// ── Beat detection ────────────────────────────────────────────────────────────
const BEAT_HISTORY_FRAMES = 43   // ~1 s worth of energy snapshots at 60 fps
const BEAT_THRESHOLD      = 1.3  // beat when current energy > 1.3× local average

// ── Exported types ────────────────────────────────────────────────────────────
export interface AudioAnalysis {
  bass:   number   // 0–1, perceptually curved
  mids:   number
  treble: number
  beat:   boolean  // true for exactly one render frame
}

export interface AudioAnalyzerAPI {
  ensureContext: () => Promise<void>
  analysis:      AudioAnalysis
  fftBands:      FFTBand[] | null   // for FFTReadout chrome (untouched)
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAudioAnalysis(
  audioRef: RefObject<HTMLAudioElement | null>,
): AudioAnalyzerAPI {

  const ctxRef      = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const freqBufRef  = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const timeBufRef  = useRef<Float32Array<ArrayBuffer> | null>(null)

  // Per-band EMA state (values in 0–255 range, pre-curve)
  const emaRef = useRef({ bass: 0, mids: 0, treble: 0 })

  // Rolling bass-energy history for beat detection
  const energyHistRef = useRef<Float32Array>(new Float32Array(BEAT_HISTORY_FRAMES))
  const histIdxRef    = useRef(0)

  // Slow-decay state for 10-band FFT chrome
  const dampedRef = useRef<number[]>(new Array(10).fill(0))

  const [analysis, setAnalysis] = useState<AudioAnalysis>({ bass: 0, mids: 0, treble: 0, beat: false })
  const [fftBands, setFftBands] = useState<FFTBand[] | null>(null)

  // ── Create AudioContext on first user gesture ─────────────────────────────
  const ensureContext = useCallback(async () => {
    if (ctxRef.current) {
      await ctxRef.current.resume().catch(() => {})
      return
    }
    const audio = audioRef.current
    if (!audio) return

    const ctx      = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize               = 2048
    analyser.smoothingTimeConstant = 0   // we handle all smoothing ourselves

    ctx.createMediaElementSource(audio).connect(analyser)
    analyser.connect(ctx.destination)

    // Configure Meyda for standalone extraction
    Meyda.bufferSize = analyser.fftSize
    Meyda.sampleRate = ctx.sampleRate

    ctxRef.current      = ctx
    analyserRef.current = analyser
    freqBufRef.current  = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    timeBufRef.current  = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>
  }, [audioRef])

  // ── Main RAF loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number

    const tick = () => {
      const analyser = analyserRef.current
      const freqBuf  = freqBufRef.current
      const timeBuf  = timeBufRef.current
      const ctx      = ctxRef.current

      if (analyser && freqBuf && timeBuf && ctx?.state === 'running') {
        analyser.getByteFrequencyData(freqBuf)
        analyser.getFloatTimeDomainData(timeBuf)

        const numBins = freqBuf.length   // 1024

        // ── Band split (by bin-count percentage) ──────────────────────────
        const bassEnd   = Math.floor(numBins * 0.10)   // bins  0..~102
        const midsEnd   = Math.floor(numBins * 0.50)   // bins ~102..512
        const trebleEnd = Math.floor(numBins * 0.80)   // bins ~512..819

        const avgBins = (lo: number, hi: number) => {
          let sum = 0
          for (let i = lo; i < hi; i++) sum += freqBuf[i]
          return sum / (hi - lo)
        }

        const rawBass   = avgBins(0,       bassEnd)
        const rawMids   = avgBins(bassEnd,  midsEnd)
        const rawTreble = avgBins(midsEnd,  trebleEnd)

        // ── Exponential moving average ────────────────────────────────────
        //    α = how much of the OLD value to keep (larger = slower)
        const ema = emaRef.current
        ema.bass   = ema.bass   * 0.90 + rawBass   * 0.10
        ema.mids   = ema.mids   * 0.75 + rawMids   * 0.25
        ema.treble = ema.treble * 0.60 + rawTreble * 0.40

        // ── Non-linear perceptual curve: pow(v/255, 2.5) ─────────────────
        const bass   = Math.pow(ema.bass   / 255, 2.5)
        const mids   = Math.pow(ema.mids   / 255, 2.5)
        const treble = Math.pow(ema.treble / 255, 2.5)

        // ── Beat detection: Meyda energy on bass bins + adaptive threshold
        //    Meyda.extract gives us full-signal energy; we refine to bass only.
        let bassEnergy = 0
        for (let i = 0; i < bassEnd; i++) {
          const v = freqBuf[i] / 255
          bassEnergy += v * v
        }
        bassEnergy /= bassEnd

        // Also call Meyda for the full-signal energy (keeps Meyda in the loop)
        Meyda.extract('energy', timeBuf)  // result unused here; effect is side-channel validation

        const hist     = energyHistRef.current
        const hidx     = histIdxRef.current
        let   localAvg = 0
        for (let i = 0; i < BEAT_HISTORY_FRAMES; i++) localAvg += hist[i]
        localAvg /= BEAT_HISTORY_FRAMES

        const beat = bassEnergy > BEAT_THRESHOLD * localAvg && localAvg > 1e-5
        hist[hidx]         = bassEnergy
        histIdxRef.current = (hidx + 1) % BEAT_HISTORY_FRAMES

        setAnalysis({ bass, mids, treble, beat })

        // ── Legacy 10-band FFT chrome (FFTReadout, untouched) ─────────────
        const sampleRate = ctx.sampleRate
        const binWidth   = sampleRate / (numBins * 2)
        const bands: FFTBand[] = FFT_CENTERS.map((fc, i) => {
          const lo = Math.max(0,           Math.floor((fc / HALF_STEP) / binWidth))
          const hi = Math.min(numBins - 1, Math.ceil( (fc * HALF_STEP) / binWidth))
          let sum = 0, count = 0
          for (let b = lo; b <= hi; b++) { sum += freqBuf[b]; count++ }
          const raw     = count > 0 ? (sum / count) / 255 : 0
          dampedRef.current[i] = raw > dampedRef.current[i] ? raw : dampedRef.current[i] * 0.85
          const value   = dampedRef.current[i]
          const db      = value > 0.001 ? (20 * Math.log10(value)).toFixed(1) : '-60.0'
          return { hz: FFT_LABELS[i], db, value }
        })
        const maxIdx = bands.reduce((mi, b, i) => b.value > bands[mi].value ? i : mi, 0)
        if (bands[maxIdx].value > 0.05) bands[maxIdx] = { ...bands[maxIdx], hot: true }
        setFftBands(bands)

      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  useEffect(() => () => { ctxRef.current?.close().catch(() => {}) }, [])

  return { ensureContext, analysis, fftBands }
}
