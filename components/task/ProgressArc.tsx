'use client'

type Props = { pct: number; size?: number }

export function ProgressArc({ pct, size = 36 }: Props) {
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const color = pct === 100 ? '#4ade80' : pct >= 60 ? '#c9a96e' : pct >= 30 ? '#fbbf24' : '#E8E5E0'

  return (
    <div title={`${pct}% complete`} style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E8E5E0"
          strokeWidth={3}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      {/* Percentage label */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size < 40 ? '0.55rem' : '0.625rem',
          fontWeight: 700,
          color: pct === 100 ? '#4ade80' : '#1a1a1a',
        }}
      >
        {pct}%
      </span>
    </div>
  )
}
