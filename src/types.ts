export interface Track {
  num: string
  name: string
  artist: string
  dur: string
  tag: string
  year?: string
  src?: string
}

export type PillState = 'standby' | 'analyzing' | 'playing' | 'paused'
