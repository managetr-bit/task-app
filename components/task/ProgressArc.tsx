'use client'

type Props = { pct: number; size?: number; onDark?: boolean }

export function ProgressArc({ pct, size = 36, onDark = false }: Props) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const arcColor = pct === 100 ? '#4ade80' : '#C9A86C'
  const trackColor = onDark ? 'rgba(255,255,255,0.15)' : '#E2DFD9'
  const textColor = pct === 100 ? '#4ade80' : (onDark ? '#E8E5E0' : '#111827')

  return (
    <div title={`${pct}% complete`} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={trackColor} strokeWidth={3} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={arcColor} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size < 40 ? '0.5rem' : '0.625rem',
        fontWeight: 700, color: textColor,
        letterSpacing: '-0.01em',
      }}>
        {pct}%
      </span>
    </div>
  )
}
