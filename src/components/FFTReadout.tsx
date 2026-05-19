import styles from './FFTReadout.module.css'

export interface FFTBand {
  hz: string
  db: string
  /** 0..1 — normalised level for the bar */
  value: number
  hot?: boolean
}

const STATIC_BANDS: FFTBand[] = [
  { hz: '31 Hz',  db: '-48.2', value: 0.10 },
  { hz: '63 Hz',  db: '-28.4', value: 0.42 },
  { hz: '125 Hz', db: '-12.8', value: 0.78, hot: true },
  { hz: '250 Hz', db: '-18.1', value: 0.62 },
  { hz: '500 Hz', db: '-22.7', value: 0.52 },
  { hz: '1 kHz',  db: '-19.3', value: 0.58 },
  { hz: '2 kHz',  db: '-26.0', value: 0.44 },
  { hz: '4 kHz',  db: '-31.6', value: 0.34 },
  { hz: '8 kHz',  db: '-38.9', value: 0.22 },
  { hz: '16 kHz', db: '-46.5', value: 0.14 },
]

interface Props {
  /** Live FFT data from AnalyserNode — falls back to static bands when null */
  bands?: FFTBand[] | null
}

export default function FFTReadout({ bands = null }: Props) {
  const data = bands ?? STATIC_BANDS

  return (
    <div className={styles.fft}>
      <div className={styles.head}>FFT · 1/3 OCTAVE · RMS</div>
      {data.map((b) => (
        <div key={b.hz} className={`${styles.row} ${b.hot ? styles.hot : ''}`}>
          <span>{b.hz}</span>
          <span>{b.db}</span>
          <div className={styles.bar}>
            <div className={styles.fill} style={{ width: `${b.value * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
