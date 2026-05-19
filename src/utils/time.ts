export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function parseDur(mmss: string): number {
  const [m, s] = mmss.split(':').map(Number)
  return m * 60 + s
}
