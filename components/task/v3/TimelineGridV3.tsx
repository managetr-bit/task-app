'use client'

import React, { useState, useMemo } from 'react'
import {
  type Task, type Column, type Milestone, type MilestoneTask,
  type CostTransaction, type BudgetLine,
} from '@/lib/types'

// ─── types ───────────────────────────────────────────────────────────────────

type Timeframe = 'weekly' | 'monthly' | 'quarterly'

type Period = {
  label: string
  start: Date
  end: Date
  key: string
  isNewYear: boolean
}

type Risk = {
  id: string
  name: string
  severity: 'H' | 'M' | 'L'
  startFrac: number
  endFrac: number
}

export type Props = {
  tasks: Task[]
  columns: Column[]
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  costTransactions: CostTransaction[]
  budgetLines: BudgetLine[]
  currency: 'TRY' | 'USD'
  boardPhotos: string[]
}

// ─── constants ────────────────────────────────────────────────────────────────

const LABEL_W = 128   // px — left label column

const COL_MIN: Record<Timeframe, number> = { weekly: 42, monthly: 62, quarterly: 96 }

const SEV_COLOR: Record<'H' | 'M' | 'L', string> = {
  H: '#DC2626', M: '#D97706', L: '#059669',
}

const DEMO_RISKS: Risk[] = [
  { id: 'r1', name: 'Permit Approval Delay',     severity: 'H', startFrac: 0.00, endFrac: 0.18 },
  { id: 'r2', name: 'Material Cost Overrun',      severity: 'M', startFrac: 0.22, endFrac: 0.52 },
  { id: 'r3', name: 'Weather / Site Disruption',  severity: 'L', startFrac: 0.58, endFrac: 0.78 },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function fmtShort(d: Date, tf: Timeframe): string {
  if (tf === 'monthly')   return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  if (tf === 'quarterly') return `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`
  // weekly — show Mon DD Mon
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function computePeriods(rangeStart: Date, rangeEnd: Date, tf: Timeframe): Period[] {
  const periods: Period[] = []
  let lastYear = -1

  if (tf === 'monthly') {
    const c = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (c <= rangeEnd) {
      const isNewYear = c.getFullYear() !== lastYear
      if (isNewYear) lastYear = c.getFullYear()
      const end = new Date(c.getFullYear(), c.getMonth() + 1, 0)
      periods.push({ label: fmtShort(c, tf), start: new Date(c), end, key: `${c.getFullYear()}-${c.getMonth()}`, isNewYear })
      c.setMonth(c.getMonth() + 1)
    }
  } else if (tf === 'weekly') {
    const c = new Date(rangeStart)
    const dow = c.getDay()
    c.setDate(c.getDate() - (dow === 0 ? 6 : dow - 1)) // align to Monday
    while (c <= rangeEnd) {
      const isNewYear = c.getFullYear() !== lastYear
      if (isNewYear) lastYear = c.getFullYear()
      const end = new Date(c); end.setDate(end.getDate() + 6)
      periods.push({ label: fmtShort(c, tf), start: new Date(c), end: new Date(end), key: c.toISOString().split('T')[0], isNewYear })
      c.setDate(c.getDate() + 7)
    }
  } else {
    // quarterly
    const c = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1)
    while (c <= rangeEnd) {
      const isNewYear = c.getFullYear() !== lastYear
      if (isNewYear) lastYear = c.getFullYear()
      const end = new Date(c.getFullYear(), c.getMonth() + 3, 0)
      periods.push({ label: fmtShort(c, tf), start: new Date(c), end: new Date(end), key: `${c.getFullYear()}-Q${Math.floor(c.getMonth()/3)+1}`, isNewYear })
      c.setMonth(c.getMonth() + 3)
    }
  }

  return periods
}

function taskPeriodRange(task: Task, periods: Period[]): [number, number] | null {
  const s = new Date(task.created_at)
  const e = task.due_date ? new Date(task.due_date + 'T23:59:59') : addDays(s, 28)

  let si = -1
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].end >= s) { si = i; break }
  }
  if (si === -1) return null

  let ei = si
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].start <= e) { ei = i; break }
  }

  return [si, ei]
}

function msPeriodIdx(ms: Milestone, periods: Period[]): number {
  const d = new Date(ms.target_date + 'T00:00:00')
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].start <= d && periods[i].end >= d) return i
  }
  return -1
}

function colTheme(name: string) {
  const n = name.toLowerCase()
  if (n === 'done' || n === 'completed')
    return { color: '#15803d', bg: '#F0FDF4', bar: '#22c55e', text: '#fff' }
  if (['doing', 'in progress', 'in-progress', 'in_progress'].some(k => n.includes(k)))
    return { color: '#1d4ed8', bg: '#EFF6FF', bar: '#3b82f6', text: '#fff' }
  if (['todo', 'to do', 'to-do', 'to_do'].some(k => n.includes(k)))
    return { color: '#374151', bg: '#F9FAFB', bar: '#9CA3AF', text: '#fff' }
  return { color: '#6B7280', bg: '#F9FAFB', bar: '#D1D5DB', text: '#374151' }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, icon, color, bg, span }: {
  label: string; icon?: string; color: string; bg: string; span: number
}) {
  return (
    <div style={{
      gridColumn: `1 / ${span + 2}`,
      height: 20,
      background: bg,
      borderRight: '1px solid #E8E5F0',
      borderBottom: '1.5px solid ' + color + '50',
      display: 'flex', alignItems: 'center',
      padding: '0 0.625rem', gap: '0.4rem',
      fontSize: '0.58rem', fontWeight: 800,
      color, textTransform: 'uppercase', letterSpacing: '0.08em',
    }}>
      {icon && <span style={{ fontSize: '0.7rem' }}>{icon}</span>}
      {label}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function TimelineGridV3({
  tasks, columns, milestones, milestoneTasks,
  costTransactions, budgetLines, currency, boardPhotos,
}: Props) {

  const [tf, setTf] = useState<Timeframe>('monthly')
  const sym = currency === 'TRY' ? '₺' : '$'

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  // ── date range ──────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const pts: number[] = [today.getTime()]
    for (const t of tasks) {
      pts.push(new Date(t.created_at).getTime())
      if (t.due_date) pts.push(new Date(t.due_date + 'T00:00:00').getTime())
    }
    for (const m of milestones) pts.push(new Date(m.target_date + 'T00:00:00').getTime())
    for (const tx of costTransactions) pts.push(new Date(tx.date + 'T00:00:00').getTime())
    const mn = new Date(Math.min(...pts))
    const mx = new Date(Math.max(...pts))
    const pad = tf === 'weekly' ? 14 : tf === 'quarterly' ? 90 : 30
    return { rangeStart: addDays(mn, -pad), rangeEnd: addDays(mx, pad) }
  }, [tasks, milestones, costTransactions, today, tf])

  const periods = useMemo(() => computePeriods(rangeStart, rangeEnd, tf), [rangeStart, rangeEnd, tf])
  const N = periods.length

  // ── today column ─────────────────────────────────────────────────────────
  const todayIdx = useMemo(() => {
    for (let i = 0; i < periods.length; i++) {
      if (periods[i].start <= today && periods[i].end >= today) return i
    }
    return -1
  }, [periods, today])

  // ── financials per period ───────────────────────────────────────────────
  const fin = useMemo(() => {
    return periods.map(p => {
      let cashIn = 0, cashOut = 0
      for (const tx of costTransactions) {
        if (tx.is_forecast) continue
        const d = new Date(tx.date + 'T00:00:00')
        if (d < p.start || d > p.end) continue
        if (tx.type === 'cash_in')  cashIn  += tx.amount
        else                        cashOut += tx.amount
      }
      return { cashIn, cashOut, net: cashIn - cashOut }
    })
  }, [periods, costTransactions])

  const cumNet = useMemo(() => {
    let r = 0
    return fin.map(f => { r += f.net; return r })
  }, [fin])

  function fmt(n: number): string {
    if (n === 0) return '—'
    const sign = n < 0 ? '-' : ''
    const a = Math.abs(n)
    if (a >= 1_000_000) return `${sign}${sym}${(a / 1_000_000).toFixed(1)}M`
    if (a >= 1_000)     return `${sign}${sym}${(a / 1_000).toFixed(0)}K`
    return `${sign}${sym}${a.toFixed(0)}`
  }

  // ── visual stages (dominant column per period) ──────────────────────────
  const visualStages = useMemo(() => periods.map((_, pi) => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      const range = taskPeriodRange(t, periods)
      if (!range) continue
      if (pi >= range[0] && pi <= range[1]) counts.set(t.column_id, (counts.get(t.column_id) ?? 0) + 1)
    }
    if (counts.size === 0) return null
    let max = 0, best = ''
    counts.forEach((v, k) => { if (v > max) { max = v; best = k } })
    return best
  }), [periods, tasks])

  // ── risk ranges ──────────────────────────────────────────────────────────
  const risks = useMemo(() => DEMO_RISKS.map(r => ({
    ...r,
    si: Math.round(r.startFrac * (N - 1)),
    ei: Math.round(r.endFrac  * (N - 1)),
  })), [N])

  // ── milestone map ────────────────────────────────────────────────────────
  const msIdxMap = useMemo(() => {
    const m = new Map<string, number>()
    milestones.forEach(ms => m.set(ms.id, msPeriodIdx(ms, periods)))
    return m
  }, [milestones, periods])

  // ── grid cell style helpers ──────────────────────────────────────────────
  const CELL_H  = 26
  const HDR_H   = 28

  const border = '1px solid #E8E5F0'

  const cellBase: React.CSSProperties = {
    borderRight: border, borderBottom: border,
    minWidth: 0, overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: CELL_H,
  }

  const labelBase: React.CSSProperties = {
    ...cellBase, justifyContent: 'flex-start',
    padding: '0 0.5rem',
    background: '#FAFAFA',
    fontSize: '0.6rem', color: '#374151', fontWeight: 500,
    whiteSpace: 'nowrap',
  }

  const numCell = (v: number, pos: boolean, bg: string, fg: string): React.CSSProperties => ({
    ...cellBase,
    background: v !== 0 ? bg : 'transparent',
    fontSize: '0.58rem', fontWeight: v !== 0 ? 700 : 400,
    color: v !== 0 ? fg : '#D1D5DB',
  })

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${LABEL_W}px repeat(${N}, 1fr)`,
    borderLeft: border, borderTop: border,
  }

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fff', flexShrink: 0 }}>

      {/* ── Controls bar ── */}
      <div style={{
        padding: '0.4rem 1rem',
        borderBottom: '1.5px solid #E8E5F0',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: '#FAFAFA',
      }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          Timeline
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.58rem', color: '#9CA3AF' }}>Timeframe</span>
        {(['weekly', 'monthly', 'quarterly'] as Timeframe[]).map(t => (
          <button key={t} onClick={() => setTf(t)} style={{
            padding: '0.18rem 0.6rem', borderRadius: 4,
            fontSize: '0.6rem', fontWeight: tf === t ? 700 : 500,
            background: tf === t ? '#7C3AED' : '#F3F4F6',
            color: tf === t ? '#fff' : '#6B7280',
            border: 'none', cursor: 'pointer',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span style={{ fontSize: '0.55rem', color: '#C4B5FD', marginLeft: '0.25rem' }}>
          = {tf.charAt(0).toUpperCase() + tf.slice(1)} · {N} columns
        </span>
      </div>

      {/* ── Grid ── */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: LABEL_W + N * COL_MIN[tf] }}>
      <div style={gridStyle}>

        {/* ════ HEADER ROW ════ */}
        <div style={{
          ...cellBase, justifyContent: 'flex-start',
          height: HDR_H, padding: '0 0.625rem',
          background: '#1E1B4B',
          fontSize: '0.55rem', fontWeight: 700, color: '#A5B4FC',
          textTransform: 'uppercase', letterSpacing: '0.09em',
        }}>
          Timeline
        </div>
        {periods.map((p, i) => (
          <div key={p.key} style={{
            ...cellBase,
            height: HDR_H,
            borderRight: `1px solid ${i === todayIdx ? '#DDD6FE' : p.isNewYear ? '#4338CA' : '#2D2A7A'}`,
            background: i === todayIdx ? '#EDE9FE' : p.isNewYear ? '#2D2A7A' : '#1E1B4B',
          }}>
            <span style={{
              fontSize: tf === 'weekly' ? '0.48rem' : '0.56rem',
              fontWeight: i === todayIdx || p.isNewYear ? 700 : 400,
              color: i === todayIdx ? '#7C3AED' : p.isNewYear ? '#C7D2FE' : '#818CF8',
              whiteSpace: 'nowrap',
            }}>
              {p.label}
              {i === todayIdx && <span style={{ display: 'block', fontSize: '0.42rem', letterSpacing: '0.06em', marginTop: 1 }}>NOW</span>}
            </span>
          </div>
        ))}

        {/* ════ PHOTO STORY ════ */}
        <div style={{ ...labelBase, background: '#F9FAFB' }}>
          <span style={{ marginRight: 4 }}>📷</span> Photo Story
        </div>
        {periods.map((p, i) => (
          <div key={p.key} style={{
            ...cellBase, height: 52, padding: 3, background: '#F9FAFB',
            borderRight: border, borderBottom: border,
          }}>
            {boardPhotos[i % boardPhotos.length] && i < boardPhotos.length && (
              <img
                src={boardPhotos[i]}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 2, border: '1px solid #E5E7EB' }}
              />
            )}
          </div>
        ))}

        {/* ════ VISUAL STAGES ════ */}
        <div style={{ ...labelBase, background: '#F5F4FD', color: '#7C3AED', fontWeight: 600 }}>
          Visual Stages
        </div>
        {periods.map((p, i) => {
          const colId = visualStages[i]
          const col   = colId ? columns.find(c => c.id === colId) : null
          const th    = col ? colTheme(col.name) : null
          return (
            <div key={p.key} style={{
              ...cellBase, height: CELL_H, padding: 0,
              background: i === todayIdx ? '#EDE9FE20' : 'transparent',
              borderRight: border, borderBottom: border,
            }}>
              {th && (
                <div style={{ width: '100%', height: '100%', background: th.bar, opacity: 0.28 }} />
              )}
            </div>
          )
        })}

        {/* ════ TASK SECTIONS (per column) ════ */}
        {columns.map(col => {
          const th       = colTheme(col.name)
          const colTasks = tasks.filter(t => t.column_id === col.id)

          return (
            <React.Fragment key={col.id}>
              {/* Section header */}
              <SectionHeader
                label={`${col.name}  (${colTasks.length})`}
                color={th.color}
                bg={th.bg}
                span={N}
              />

              {/* Tasks — show up to 6 */}
              {colTasks.slice(0, 6).map(task => {
                const range   = taskPeriodRange(task, periods)
                const overdue = !task.completed_at && task.due_date && new Date(task.due_date + 'T00:00:00') < today

                return (
                  <React.Fragment key={task.id}>
                    {/* label */}
                    <div style={{ ...labelBase, color: overdue ? '#DC2626' : '#6B7280', fontWeight: 400, fontStyle: 'italic' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.title}>{task.title}</span>
                    </div>

                    {/* period cells */}
                    {periods.map((p, i) => {
                      const active = range !== null && i >= range[0] && i <= range[1]
                      const isS    = range !== null && i === range[0]
                      const isE    = range !== null && i === range[1]
                      return (
                        <div key={p.key} style={{
                          ...cellBase,
                          position: 'relative',
                          background: active ? (overdue ? '#FFF1F1' : th.bg) : i === todayIdx ? '#FAFAFE' : 'transparent',
                        }}>
                          {active && (
                            <div style={{
                              position: 'absolute',
                              top: 4, bottom: 4,
                              left: isS ? 3 : 0, right: isE ? 3 : 0,
                              background: overdue ? '#EF4444' : th.bar,
                              opacity: 0.78,
                              borderRadius: `${isS ? 3 : 0}px ${isE ? 3 : 0}px ${isE ? 3 : 0}px ${isS ? 3 : 0}px`,
                            }} />
                          )}
                          {/* task label only in start cell */}
                          {active && isS && (
                            <span style={{
                              position: 'absolute', left: 6, right: 4,
                              fontSize: '0.48rem', fontWeight: 700,
                              color: overdue ? '#fff' : th.text,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              zIndex: 2,
                            }}>
                              {task.title}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </React.Fragment>
                )
              })}

              {/* If no tasks, show a placeholder row */}
              {colTasks.length === 0 && (
                <React.Fragment>
                  <div style={{ ...labelBase, color: '#D1D5DB', fontStyle: 'italic' }}>No tasks</div>
                  {periods.map(p => <div key={p.key} style={{ ...cellBase }} />)}
                </React.Fragment>
              )}
            </React.Fragment>
          )
        })}

        {/* ════ MILESTONES ════ */}
        <SectionHeader label={`Milestones  (${milestones.length})`} icon="◆" color="#7C3AED" bg="#F5F4FD" span={N} />
        <div style={{ ...labelBase, background: '#F9F8FF', color: '#7C3AED', fontWeight: 600 }}>Milestones</div>
        {periods.map((p, i) => {
          const inPeriod = milestones.filter(ms => msIdxMap.get(ms.id) === i)
          return (
            <div key={p.key} style={{
              ...cellBase, gap: 2,
              background: i === todayIdx ? '#F5F4FD' : '#FAFAFA',
            }}>
              {inPeriod.map(ms => {
                const done    = !!ms.completed_at
                const overdue = !done && new Date(ms.target_date + 'T00:00:00') < today
                const c       = done ? '#16a34a' : overdue ? '#DC2626' : '#7C3AED'
                return (
                  <div
                    key={ms.id}
                    title={ms.name}
                    style={{ width: 9, height: 9, background: c, transform: 'rotate(45deg)', borderRadius: 1.5, flexShrink: 0 }}
                  />
                )
              })}
            </div>
          )
        })}

        {/* ════ RISKS ════ */}
        <SectionHeader label="Risks  (demo)" icon="⚠" color="#DC2626" bg="#FEF2F2" span={N} />
        {risks.map(r => (
          <React.Fragment key={r.id}>
            <div style={{ ...labelBase, background: '#FFFAFA', gap: '0.35rem' }}>
              <span style={{
                fontSize: '0.46rem', fontWeight: 900, lineHeight: '14px',
                background: SEV_COLOR[r.severity], color: '#fff',
                borderRadius: 2, padding: '0 3px', flexShrink: 0,
              }}>{r.severity}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: '#7F1D1D', fontSize: '0.58rem' }} title={r.name}>{r.name}</span>
            </div>
            {periods.map((p, i) => {
              const active = i >= r.si && i <= r.ei
              const isS    = i === r.si
              const isE    = i === r.ei
              return (
                <div key={p.key} style={{
                  ...cellBase,
                  position: 'relative',
                  background: active ? '#FEF2F2' : 'transparent',
                }}>
                  {active && (
                    <div style={{
                      position: 'absolute', top: 5, bottom: 5,
                      left: isS ? 3 : 0, right: isE ? 3 : 0,
                      background: SEV_COLOR[r.severity], opacity: 0.3,
                      borderRadius: `${isS ? 3 : 0}px ${isE ? 3 : 0}px ${isE ? 3 : 0}px ${isS ? 3 : 0}px`,
                    }} />
                  )}
                </div>
              )
            })}
          </React.Fragment>
        ))}

        {/* ════ CASH FLOW ════ */}
        <SectionHeader label="Cash Flow" icon="💰" color="#059669" bg="#F0FDF4" span={N} />

        {/* Cash Out */}
        <div style={{ ...labelBase, background: '#FFF5F5', color: '#DC2626', fontWeight: 700 }}>Cash Out</div>
        {fin.map((f, i) => (
          <div key={periods[i].key} style={numCell(f.cashOut, false, '#FFF5F5', '#DC2626')}>
            {fmt(f.cashOut)}
          </div>
        ))}

        {/* Cash In */}
        <div style={{ ...labelBase, background: '#F0FDF4', color: '#059669', fontWeight: 700 }}>Cash In</div>
        {fin.map((f, i) => (
          <div key={periods[i].key} style={numCell(f.cashIn, true, '#F0FDF4', '#059669')}>
            {fmt(f.cashIn)}
          </div>
        ))}

        {/* Net Cash */}
        <div style={{ ...labelBase, background: '#F5F4FD', color: '#7C3AED', fontWeight: 700 }}>Net Cash</div>
        {fin.map((f, i) => (
          <div key={periods[i].key} style={numCell(Math.abs(f.net), f.net >= 0, f.net > 0 ? '#F0FDF4' : f.net < 0 ? '#FFF5F5' : 'transparent', f.net > 0 ? '#059669' : f.net < 0 ? '#DC2626' : '#D1D5DB')}>
            {fmt(f.net)}
          </div>
        ))}

        {/* Cumulative Net Cash */}
        <div style={{ ...labelBase, background: '#F5F4FD', color: '#6D28D9', fontWeight: 700, fontSize: '0.56rem' }}>Cum. Net Cash</div>
        {cumNet.map((v, i) => (
          <div key={periods[i].key} style={{
            ...numCell(Math.abs(v), v >= 0, v > 0 ? '#EDE9FE' : v < 0 ? '#FFF5F5' : 'transparent', v > 0 ? '#6D28D9' : v < 0 ? '#DC2626' : '#D1D5DB'),
            borderBottom: '2px solid #E8E5F0',
          }}>
            {fmt(v)}
          </div>
        ))}

      </div>
      </div>
      </div>
    </div>
  )
}
