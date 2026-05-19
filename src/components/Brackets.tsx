import type { ReactNode, CSSProperties } from 'react'

interface Props {
  children: ReactNode
  style?: CSSProperties
  className?: string
}

/**
 * Wraps children in the 6px corner-bracket decoration (defined in index.css as .brackets + .br).
 * Uses --fg-mute coloured L-brackets at all four corners.
 */
export default function Brackets({ children, style, className }: Props) {
  return (
    <div className={`brackets ${className ?? ''}`} style={style}>
      {children}
      <span className="br" aria-hidden="true" />
    </div>
  )
}
