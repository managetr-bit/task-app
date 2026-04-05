'use client'

import React, { useState, useMemo } from 'react'
import {
  type Task, type Column, type Milestone, type MilestoneTask,
  type CostTransaction, type BudgetLine,
} from '@/lib/types'

// ─── types ────────────────────────────────────────────────────────────────────

type Timeframe = 'weekly' | 'monthly' | 'quarterly'
type LayerKey  = 'photos' | 'milestones' | 'risks'

type Period = { label: string; start: Date; end: Date; key: string }

type Risk = {
  id: string; name: string
  severity: 'H' | 'M' | 'L'
  startFrac: number; endFrac: number
}

export type WorkStreamGanttProps = {
  tasks: Task[]
  columns: Column[]
  milestones: Milestone[]
  milestoneTasks?: MilestoneTask[]
  costTransactions?: CostTransaction[]
  budgetLines?: BudgetLine[]
  currency?: 'TRY' | 'USD'
  boardPhotos?: string[]
  onAddMilestone?: (name: string, date: string) => Promise<void>
  onUpdateMilestoneDate?: (id: string, date: string) => Promise<void>
}

// ─── constants ────────────────────────────────────────────────────────────────

const LABEL_W = 148  // px

const COL_W: Record<Timeframe, number> = { weekly: 44, monthly: 64, quarterly: 100 }

const SEV: Record<'H' | 'M' | 'L', { bg: string; text: string }> = {
  H: { bg: '#FEE2E2', text: '#DC2626' },
  M: { bg: '#FEF3C7', text: '#D97706' },
  L: { bg: '#D1FAE5', text: '#059669' },
}

const DEMO_RISKS: Risk[] = [
  { id: 'r1', name: 'Permit Approval Delay',    severity: 'H', startFrac: 0.02, endFrac: 0.20 },
  { id: 'r2', name: 'Material Cost Overrun',     severity: 'M', startFrac: 0.25, endFrac: 0.55 },
  { id: 'r3', name: 'Weather / Site Disruption', severity: 'L', startFrac: 0.60, endFrac: 0.80 },
]

const STRIPE =
  'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.28) 3px,rgba(255,255,255,0.28) 6px)'

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function computePeriods(start: Date, end: Date, tf: Timeframe): Period[] {
  const periods: Period[] = []
  if (tf === 'monthly') {
    const c = new Date(start.getFullYear(), start.getMonth(), 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 1, 0)
      periods.push({
        label: c.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        start: new Date(c), end: pEnd,
        key: `${c.getFullYear()}-${c.getMonth()}`,
      })
      c.setMonth(c.getMonth() + 1)
    }
  } else if (tf === 'quarterly') {
    const q = Math.floor(start.getMonth() / 3)
    const c = new Date(start.getFullYear(), q * 3, 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 3, 0)
      const qNum = Math.floor(c.getMonth() / 3) + 1
      periods.push({
        label: `Q${qNum} '${String(c.getFullYear()).slice(2)}`,
        start: new Date(c), end: pEnd,
        key: `${c.getFullYear()}-Q${qNum}`,
      })
      c.setMonth(c.getMonth() + 3)
    }
  } else {
    const c = new Date(start)
    // align to Monday
    c.setDate(c.getDate() - ((c.getDay() + 6) % 7))
    while (c <= end) {
      const pEnd = addDays(c, 6)
      periods.push({
        label: c.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        start: new Date(c), end: pEnd,
        key: c.toISOString().split('T')[0],
      })
      c.setDate(c.getDate() + 7)
    }
  }
  return periods
}

function colBarStyle(colName: string): { bg: string; stripe: boolean; dashed: boolean } {
  const n = colName.toLowerCase()
  if (n.includes('done') || n.includes('complet'))
    return { bg: '#10B981', stripe: false, dashed: false }
  if (n.includes('doing') || n.includes('progress'))
    return { bg: '#3B82F6', stripe: true,  dashed: false }
  if (n.includes('todo') || n.includes('to do') || n.includes('to-do'))
    return { bg: '#94A3B8', stripe: false, dashed: false }
  return { bg: '#CBD5E1', stripe: false, dashed: true }
}

// ─── component ────────────────────────────────────────────────────────────────

export function WorkStreamGantt({
  tasks,
  columns,
  milestones,
  costTransactions = [],
  budgetLines = [],
  currency = 'USD',
  boardPhotos = [],
}: WorkStreamGanttProps) {

  const [filter,    setFilter]    = useState<string>('all')
  const [layers,    setLayers]    = useState<Record<LayerKey, boolean>>({
    photos: false, milestones: true, risks: false,
  })
  const [tf,        setTf]        = useState<Timeframe>('monthly')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // ── date range ───────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates: number[] = []
    tasks.forEach(t => { if (t.due_date) dates.push(new Date(t.due_date + 'T00:00:00').getTime()) })
    milestones.forEach(m => dates.push(new Date(m.target_date + 'T00:00:00').getTime()))
    costTransactions.forEach(t => dates.push(new Date(t.date + 'T00:00:00').getTime()))
    if (dates.length === 0) {
      const now = new Date()
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const e = new Date(now.getFullYear(), now.getMonth() + 10, 0)
      return { rangeStart: s, rangeEnd: e }
    }
    const minMs = Math.min(...dates), maxMs = Math.max(...dates)
    const s = new Date(minMs); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(maxMs); e.setMonth(e.getMonth() + 1); e.setDate(0)
    return { rangeStart: s, rangeEnd: e }
  }, [tasks, milestones, costTransactions])

  const periods = useMemo(
    () => computePeriods(rangeStart, rangeEnd, tf),
    [rangeStart, rangeEnd, tf],
  )

  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100))

  const today      = new Date()
  const todayPct   = pct(today)
  const todayInRange = todayPct > 0 && todayPct < 100

  // ── filter ────────────────────────────────────────────────────────────────
  const visibleColumns = useMemo(() => {
    if (filter === 'all') return columns
    return columns.filter(c => c.id === filter)
  }, [columns, filter])

  const tasksByCol = useMemo(() => {
    const map: Record<string, Task[]> = {}
    columns.forEach(c => { map[c.id] = [] })
    tasks.forEach(t => {
      if (map[t.column_id] !== undefined && t.due_date)
        map[t.column_id].push(t)
    })
    return map
  }, [tasks, columns])

  // cash flow
  const cashIn  = costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast)
  const cashOut = costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast)
  const showFlow = cashIn.length > 0 || cashOut.length > 0

  const colW = COL_W[tf]
  const totalW = LABEL_W + periods.length * colW

  // ── shared today line ─────────────────────────────────────────────────────
  const TodayLine = () => todayInRange
    ? <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: '#2563EB', opacity: 0.5, pointerEvents: 'none', zIndex: 2 }} />
    : null

  const GridLines = () => (
    <>
      {periods.map(p => {
        const isNow = today >= p.start && today <= p.end
        return (
          <div key={p.key} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(p.start)}%`,
            width: `${pct(p.end) - pct(p.start)}%`,
            background: isNow ? 'rgba(37,99,235,0.04)' : 'transparent',
            borderRight: '1px solid #F1F5F9',
            pointerEvents: 'none',
          }} />
        )
      })}
    </>
  )

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8FAFC', borderTop: '1.5px solid #E2E8F0' }}>

      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap',
        padding: '0.5rem 1rem', background: '#fff', borderBottom: '1px solid #E2E8F0',
      }}>
        {/* STATUS pills */}
        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
          {[{ id: 'all', label: 'All' }, ...columns.map(c => ({ id: c.id, label: c.name }))].map(opt => {
            const active = filter === opt.id
            return (
              <button key={opt.id} onClick={() => setFilter(opt.id)} style={{
                padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600,
                cursor: 'pointer', border: 'none', transition: 'all 0.12s',
                background: active ? '#0F172A' : '#F1F5F9',
                color:      active ? '#fff'    : '#64748B',
              }}>{opt.label}</button>
            )
          })}
        </div>

        <div style={{ width: 1, height: 18, background: '#E2E8F0', margin: '0 0.25rem', flexShrink: 0 }} />

        {/* LAYER toggles */}
        {(['photos', 'milestones', 'risks'] as LayerKey[]).map(k => {
          const active = layers[k]
          return (
            <button key={k} onClick={() => setLayers(p => ({ ...p, [k]: !p[k] }))} style={{
              padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.12s',
              background: active ? '#0EA5E9' : '#F1F5F9',
              color:      active ? '#fff'    : '#64748B',
            }}>{k.charAt(0).toUpperCase() + k.slice(1)}</button>
          )
        })}

        <div style={{ flex: 1 }} />

        {/* Timeframe switcher */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2, gap: 1 }}>
          {(['weekly', 'monthly', 'quarterly'] as Timeframe[]).map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.67rem', fontWeight: 600,
              cursor: 'pointer', border: 'none', transition: 'all 0.12s',
              background: tf === t ? '#fff'    : 'transparent',
              color:      tf === t ? '#0F172A' : '#64748B',
              boxShadow:  tf === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Gantt area */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: totalW }}>

          {/* Header row */}
          <div style={{ display: 'flex', height: 38, background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{
              width: LABEL_W, flexShrink: 0,
              borderRight: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', padding: '0 0.75rem',
              background: '#F1F5F9',
            }}>
              <span style={{ fontSize: '0.57rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Work Stream</span>
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
              {periods.map(p => {
                const isNow = today >= p.start && today <= p.end
                return (
                  <div key={p.key} style={{
                    flex: 1, borderRight: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isNow ? '#EFF6FF' : 'transparent',
                  }}>
                    <span style={{
                      fontSize: '0.58rem', fontWeight: isNow ? 800 : 500,
                      color: isNow ? '#2563EB' : '#94A3B8',
                      whiteSpace: 'nowrap', letterSpacing: isNow ? '-0.01em' : 0,
                    }}>
                      {p.label}{isNow ? ' · Now' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Site Chronicle */}
          {layers.photos && boardPhotos.length > 0 && (
            <div style={{ display: 'flex', height: 64, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>📷 Site Chronicle</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#F8FAFC' }}>
                <GridLines />
                {boardPhotos.slice(0, 6).map((url, i) => {
                  const frac = (i + 0.5) / boardPhotos.slice(0, 6).length
                  return (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `calc(${frac * 100}% - 20px)`,
                      top: 6, width: 40, height: 52,
                      borderRadius: 4, overflow: 'hidden',
                      border: '2px solid #fff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      zIndex: 1,
                    }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )
                })}
                <TodayLine />
              </div>
            </div>
          )}

          {/* Work stream rows */}
          {visibleColumns.map(col => {
            const colTasks = tasksByCol[col.id] ?? []
            const style    = colBarStyle(col.name)
            const isOpen   = !collapsed[col.id]

            const colDates = colTasks.map(t => new Date(t.due_date! + 'T00:00:00').getTime())
            const spanL = colDates.length ? pct(new Date(Math.min(...colDates))) : null
            const spanR = colDates.length ? pct(new Date(Math.max(...colDates))) : null

            return (
              <React.Fragment key={col.id}>
                {/* Column header row */}
                <div
                  onClick={() => setCollapsed(p => ({ ...p, [col.id]: !p[col.id] }))}
                  style={{ display: 'flex', height: 36, borderBottom: '1px solid #E2E8F0', cursor: 'pointer', background: '#fff' }}
                >
                  <div style={{
                    width: LABEL_W, flexShrink: 0,
                    borderRight: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0 0.75rem',
                  }}>
                    <span style={{
                      fontSize: '0.6rem', color: '#94A3B8', flexShrink: 0,
                      transition: 'transform 0.15s',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}>▾</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: style.bg, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#1E293B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {col.name}
                    </span>
                    <span style={{ fontSize: '0.57rem', color: '#94A3B8', flexShrink: 0 }}>{colTasks.length}</span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <GridLines />
                    {spanL !== null && spanR !== null && (
                      <div style={{
                        position: 'absolute',
                        left: `${spanL}%`,
                        width: `${Math.max(spanR - spanL, 0.6)}%`,
                        top: '22%', height: '56%', borderRadius: 3,
                        background: style.dashed ? 'transparent' : style.bg,
                        backgroundImage: style.stripe ? STRIPE : 'none',
                        border: style.dashed ? `1.5px dashed #94A3B8` : 'none',
                        opacity: 0.85, zIndex: 1,
                      }} />
                    )}
                    <TodayLine />
                  </div>
                </div>

                {/* Task sub-rows */}
                {isOpen && colTasks.map(task => {
                  const d  = new Date(task.due_date! + 'T00:00:00')
                  const s  = addDays(d, -7)
                  const bL = pct(s), bR = pct(d)
                  return (
                    <div key={task.id} style={{ display: 'flex', height: 26, borderBottom: '1px solid #F8FAFC', background: '#FAFBFD' }}>
                      <div style={{
                        width: LABEL_W, flexShrink: 0,
                        borderRight: '1px solid #E2E8F0',
                        display: 'flex', alignItems: 'center', padding: '0 0.75rem 0 2rem',
                      }}>
                        <span style={{ fontSize: '0.62rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.title}
                        </span>
                      </div>
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                          position: 'absolute',
                          left: `${bL}%`,
                          width: `${Math.max(bR - bL, 0.4)}%`,
                          top: '15%', height: '70%', borderRadius: 2,
                          background: style.bg, opacity: 0.55,
                          backgroundImage: style.stripe ? STRIPE : 'none',
                          zIndex: 1,
                        }} />
                        <TodayLine />
                      </div>
                    </div>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* Milestones row */}
          {layers.milestones && milestones.length > 0 && (
            <div style={{ display: 'flex', height: 34, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>◈ Milestones</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridLines />
                {milestones.map(m => {
                  const p = pct(new Date(m.target_date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  return (
                    <div key={m.id} title={`${m.name} · ${m.target_date}`} style={{
                      position: 'absolute',
                      left: `${p}%`, top: '50%',
                      transform: 'translate(-50%, -50%) rotate(45deg)',
                      width: 10, height: 10, zIndex: 2,
                      background: m.completed_at ? '#10B981' : '#F59E0B',
                      border: '2px solid #fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                    }} />
                  )
                })}
                <TodayLine />
              </div>
            </div>
          )}

          {/* Risk rows */}
          {layers.risks && (
            <>
              {DEMO_RISKS.map(risk => (
                <div key={risk.id} style={{ display: 'flex', height: 30, borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0',
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.75rem', background: '#fff',
                  }}>
                    <span style={{
                      fontSize: '0.5rem', fontWeight: 800, borderRadius: 3,
                      padding: '0.1rem 0.3rem',
                      background: SEV[risk.severity].bg,
                      color: SEV[risk.severity].text,
                    }}>{risk.severity}</span>
                    <span style={{ fontSize: '0.6rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {risk.name}
                    </span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                    <GridLines />
                    <div style={{
                      position: 'absolute',
                      left: `${risk.startFrac * 100}%`,
                      width: `${(risk.endFrac - risk.startFrac) * 100}%`,
                      top: '20%', height: '60%', borderRadius: 2,
                      background: SEV[risk.severity].text + '22',
                      borderLeft: `3px solid ${SEV[risk.severity].text}`,
                      zIndex: 1,
                    }} />
                    <TodayLine />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Financial Flow row */}
          {showFlow && (
            <div style={{ display: 'flex', height: 44, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>💰 Financial Flow</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridLines />
                {cashOut.map(t => {
                  const p = pct(new Date(t.date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  const h = Math.max(6, Math.min(32, 4 + t.amount / 200000))
                  return (
                    <div key={t.id} title={`Cash Out: ${t.amount}`} style={{
                      position: 'absolute', bottom: 2,
                      left: `${p}%`, transform: 'translateX(-4px)',
                      width: 5, height: h,
                      background: '#EF4444', borderRadius: '2px 2px 0 0', opacity: 0.8, zIndex: 1,
                    }} />
                  )
                })}
                {cashIn.map(t => {
                  const p = pct(new Date(t.date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  const h = Math.max(6, Math.min(32, 4 + t.amount / 200000))
                  return (
                    <div key={t.id} title={`Cash In: ${t.amount}`} style={{
                      position: 'absolute', top: 2,
                      left: `${p}%`, transform: 'translateX(1px)',
                      width: 5, height: h,
                      background: '#10B981', borderRadius: '0 0 2px 2px', opacity: 0.8, zIndex: 1,
                    }} />
                  )
                })}
                <TodayLine />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
