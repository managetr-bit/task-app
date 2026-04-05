'use client'

import React, { useState, useMemo } from 'react'
import {
  type Task, type Column, type Milestone, type MilestoneTask,
  type CostTransaction, type BudgetLine,
} from '@/lib/types'

type Props = {
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

type LayerKey = 'tasks' | 'milestones' | 'expenses' | 'income' | 'photos'

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: 'tasks',      label: 'Tasks' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'expenses',   label: 'Expenses' },
  { key: 'income',     label: 'Income' },
  { key: 'photos',     label: 'Photos' },
]

// ─── helpers ────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
function fmtAxisDate(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}
function fmtFull(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

type ColStyle = { fill: string; stripe: boolean; dashed: boolean; dot: string }

function colStyle(name: string): ColStyle {
  const n = name.toLowerCase()
  if (n === 'done' || n === 'completed')
    return { fill: '#16a34a', stripe: false, dashed: false, dot: '#16a34a' }
  if (['doing', 'in progress', 'in-progress', 'in_progress'].some(k => n.includes(k)))
    return { fill: '#3b82f6', stripe: true,  dashed: false, dot: '#3b82f6' }
  if (['todo', 'to do', 'to-do', 'to_do'].some(k => n.includes(k)))
    return { fill: '#d1d5db', stripe: false, dashed: false, dot: '#d1d5db' }
  // backlog / other
  return { fill: '#f3f4f6', stripe: false, dashed: true,  dot: '#9ca3af' }
}

const STRIPE_BG =
  'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.30) 3px,rgba(255,255,255,0.30) 6px)'

const LABEL_W = 130  // px width of the left label column

// ─── component ──────────────────────────────────────────────────────────────

export function GanttV2({
  tasks,
  columns,
  milestones,
  milestoneTasks = [],
  costTransactions = [],
  budgetLines = [],
  currency = 'USD',
  boardPhotos = [],
}: Props) {

  const [filter, setFilter]   = useState<string>('all')
  const [layers, setLayers]   = useState<Record<LayerKey, boolean>>({
    tasks: true, milestones: true, expenses: false, income: false, photos: false,
  })

  function toggleLayer(k: LayerKey) {
    setLayers(p => ({ ...p, [k]: !p[k] }))
  }

  // ── date range ────────────────────────────────────────────────────────────
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])

  const { startDate, endDate, totalDays } = useMemo(() => {
    const pts: number[] = [today.getTime()]
    for (const t of tasks) {
      pts.push(new Date(t.created_at).getTime())
      if (t.due_date) pts.push(new Date(t.due_date + 'T00:00:00').getTime())
    }
    for (const m of milestones) pts.push(new Date(m.target_date + 'T00:00:00').getTime())
    for (const tx of costTransactions) pts.push(new Date(tx.date + 'T00:00:00').getTime())
    for (const bl of budgetLines) if (bl.expected_date) pts.push(new Date(bl.expected_date + 'T00:00:00').getTime())

    const start = addDays(new Date(Math.min(...pts)), -21)
    const end   = addDays(new Date(Math.max(...pts)), 35)
    const days  = Math.max(diffDays(start, end), 1)
    return { startDate: start, endDate: end, totalDays: days }
  }, [tasks, milestones, costTransactions, budgetLines, today])

  function pctOf(d: Date): number {
    return Math.min(100, Math.max(0, (diffDays(startDate, d) / totalDays) * 100))
  }

  const todayPct = pctOf(today)

  // ── month ticks ───────────────────────────────────────────────────────────
  const monthTicks = useMemo(() => {
    const ticks: { label: string; pct: number; isYear: boolean }[] = []
    const c = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    c.setMonth(c.getMonth() + 1)
    let lastYear = startDate.getFullYear()
    while (c <= endDate) {
      const isYear = c.getFullYear() !== lastYear
      if (isYear) lastYear = c.getFullYear()
      ticks.push({ label: fmtAxisDate(c), pct: pctOf(c), isYear })
      c.setMonth(c.getMonth() + 1)
    }
    return ticks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, totalDays])

  // ── tasks by column ───────────────────────────────────────────────────────
  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const col of columns) map.set(col.id, [])
    for (const t of tasks) {
      if (!map.has(t.column_id)) map.set(t.column_id, [])
      map.get(t.column_id)!.push(t)
    }
    return map
  }, [tasks, columns])

  const visibleColumns = filter === 'all' ? columns : columns.filter(c => c.id === filter)

  // ── expense / income bars (per transaction) ────────────────────────────────
  const expenseTxs = costTransactions.filter(t => t.type === 'cash_out')
  const incomeTxs  = costTransactions.filter(t => t.type === 'cash_in')

  // ── max expense for bar height scaling ────────────────────────────────────
  const maxTxAmt = useMemo(() => {
    const all = [...expenseTxs, ...incomeTxs].map(t => t.amount)
    return Math.max(...all, 1)
  }, [expenseTxs, incomeTxs])

  function fmtAmt(n: number) {
    const s = currency === 'TRY' ? '₺' : '$'
    if (n >= 1_000_000) return `${s}${(n/1_000_000).toFixed(1)}M`
    if (n >= 1_000)     return `${s}${(n/1_000).toFixed(0)}k`
    return `${s}${n.toFixed(0)}`
  }

  // ── milestone color ────────────────────────────────────────────────────────
  function msColor(ms: Milestone) {
    if (ms.completed_at) return '#16a34a'
    const due = new Date(ms.target_date + 'T00:00:00')
    const diff = diffDays(today, due)
    if (diff < 0)  return '#ef4444'
    if (diff <= 7) return '#f59e0b'
    return '#7C3AED'
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#fff', flexShrink: 0 }}>

      {/* ── Controls row ── */}
      <div style={{
        padding: '0.45rem 1rem',
        borderBottom: '1.5px solid #E8E5F0',
        display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap',
        background: '#FAFAFA',
      }}>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {(['all', ...columns.map(c => c.id)] as string[]).map(id => {
            const label = id === 'all' ? 'All' : (columns.find(c => c.id === id)?.name ?? id)
            const active = filter === id
            const cs = id === 'all' ? null : colStyle(label)
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                style={{
                  padding: '0.18rem 0.55rem',
                  borderRadius: 20,
                  fontSize: '0.62rem',
                  fontWeight: active ? 700 : 500,
                  background: active ? (cs ? cs.fill : '#7C3AED') : '#F3F4F6',
                  color: active ? (cs && !cs.dashed ? '#fff' : '#374151') : '#6B7280',
                  border: active && cs?.dashed ? `1.5px dashed #D1D5DB` : `1.5px solid ${active ? 'transparent' : '#E5E7EB'}`,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >{label}</button>
            )
          })}
        </div>

        <span style={{ color: '#E5E7EB' }}>|</span>

        {/* Layer toggles */}
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          {LAYERS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => toggleLayer(key)}
                style={{
                  width: 13, height: 13, borderRadius: 3,
                  border: `1.5px solid ${layers[key] ? '#7C3AED' : '#D1D5DB'}`,
                  background: layers[key] ? '#7C3AED' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                {layers[key] && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1.5 4L3.5 6L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize: '0.62rem', fontWeight: layers[key] ? 600 : 400, color: layers[key] ? '#374151' : '#9CA3AF' }}>{label}</span>
            </label>
          ))}
        </div>

        {/* Date range hint */}
        <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: '#C4B5FD', whiteSpace: 'nowrap' }}>
          {fmtFull(startDate)} – {fmtFull(endDate)}
        </span>
      </div>

      {/* ── Timeline grid ── */}
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <div style={{ minWidth: 680, position: 'relative' }}>

          {/* Date axis row */}
          <div style={{ display: 'flex', height: 26, background: '#FAFAFA', borderBottom: '1px solid #F3F4F6', position: 'sticky', top: 0, zIndex: 20 }}>
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0', display: 'flex', alignItems: 'center', paddingLeft: 12 }}>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>TIMELINE</span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              {monthTicks.map((t, i) => (
                <React.Fragment key={i}>
                  <div style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    width: t.isYear ? 1.5 : 1,
                    background: t.isYear ? '#DDD6FE' : '#E5E7EB',
                    transform: 'translateX(-50%)', pointerEvents: 'none',
                  }} />
                  <div style={{
                    position: 'absolute', left: `${t.pct}%`, top: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: t.isYear ? '0.58rem' : '0.55rem',
                    fontWeight: t.isYear ? 700 : 400,
                    color: t.isYear ? '#9CA3AF' : '#C4B5FD',
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    background: '#FAFAFA', padding: '0 3px',
                  }}>{t.label}</div>
                </React.Fragment>
              ))}
              {/* Today label */}
              <div style={{
                position: 'absolute', left: `${todayPct}%`, top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '0.5rem', fontWeight: 800, color: '#7C3AED',
                background: '#EDE9FE', borderRadius: 3, padding: '0 4px',
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5,
              }}>TODAY</div>
            </div>
          </div>

          {/* ── Shared overlay: grid lines + today line (renders behind rows) ── */}
          {/* We render these per-row instead for correct z-ordering */}

          {/* ── Task rows (per column) ── */}
          {layers.tasks && visibleColumns.map(col => {
            const colTasks = tasksByColumn.get(col.id) ?? []
            if (colTasks.length === 0) return null
            const cs = colStyle(col.name)

            return (
              <React.Fragment key={col.id}>
                {/* Column group header */}
                <div style={{ display: 'flex', height: 22, background: '#F9FAFB', borderBottom: '1px solid #F3F4F6', borderTop: '1px solid #F0EDE8' }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                    display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0 0.625rem',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                      background: cs.dashed ? 'transparent' : cs.fill,
                      border: cs.dashed ? `1.5px dashed #9CA3AF` : 'none',
                    }} />
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {col.name}
                    </span>
                    <span style={{ fontSize: '0.52rem', color: '#9CA3AF', marginLeft: 'auto', flexShrink: 0 }}>{colTasks.length}</span>
                  </div>
                  {/* grid lines in header */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    {monthTicks.map((t, i) => (
                      <div key={i} style={{
                        position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                        width: 1, background: t.isYear ? '#E5E7EB' : '#F3F4F6',
                        transform: 'translateX(-50%)', pointerEvents: 'none',
                      }} />
                    ))}
                    <div style={{
                      position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                      width: 1.5, background: '#7C3AED30',
                      transform: 'translateX(-50%)', pointerEvents: 'none',
                    }} />
                  </div>
                </div>

                {/* Individual task rows */}
                {colTasks.map(task => {
                  const s = new Date(task.created_at)
                  const e = task.due_date ? new Date(task.due_date + 'T00:00:00') : addDays(s, 14)
                  const sp = pctOf(s)
                  const ep = pctOf(e)
                  const wp = Math.max(ep - sp, 0.6)
                  const overdue = !task.completed_at && task.due_date && new Date(task.due_date + 'T00:00:00') < today

                  return (
                    <div key={task.id} style={{
                      display: 'flex', height: 24,
                      borderBottom: '1px solid #F9FAFB',
                    }}>
                      {/* Label */}
                      <div style={{
                        width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                        display: 'flex', alignItems: 'center', padding: '0 0.625rem',
                        background: overdue ? '#FFF5F5' : '#fff',
                      }}>
                        <span style={{
                          fontSize: '0.6rem', color: overdue ? '#EF4444' : '#6B7280',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={task.title}>{task.title}</span>
                      </div>
                      {/* Bar area */}
                      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                        {/* grid lines */}
                        {monthTicks.map((t, i) => (
                          <div key={i} style={{
                            position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                            width: 1, background: t.isYear ? '#E5E7EB' : '#F9FAFB',
                            transform: 'translateX(-50%)', pointerEvents: 'none',
                          }} />
                        ))}
                        {/* today line */}
                        <div style={{
                          position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                          width: 1.5, background: '#7C3AED25',
                          transform: 'translateX(-50%)', pointerEvents: 'none',
                        }} />
                        {/* Task bar */}
                        <div
                          title={`${task.title}${task.due_date ? ' · due ' + task.due_date : ''}`}
                          style={{
                            position: 'absolute',
                            left: `${sp}%`, width: `${wp}%`,
                            top: 4, bottom: 4,
                            background: cs.dashed ? 'transparent' : cs.fill,
                            border: cs.dashed ? '1.5px dashed #D1D5DB' : overdue ? '1.5px solid #EF444460' : 'none',
                            borderRadius: 3,
                            overflow: 'hidden',
                            minWidth: 6,
                            cursor: 'default',
                          }}
                        >
                          {cs.stripe && (
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: STRIPE_BG }} />
                          )}
                          {/* Task label inside bar (only if wide enough) */}
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', paddingLeft: 4,
                            overflow: 'hidden',
                          }}>
                            <span style={{
                              fontSize: '0.52rem', fontWeight: 600,
                              color: cs.dashed ? '#9CA3AF' : 'rgba(255,255,255,0.85)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{task.title}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* ── Photos row ── */}
          {layers.photos && boardPhotos.length > 0 && (
            <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', borderTop: '1px solid #F0EDE8' }}>
              <div style={{
                width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                display: 'flex', alignItems: 'center', padding: '0 0.625rem',
                background: '#FAFAFA',
              }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Photos</span>
                <span style={{ fontSize: '0.52rem', color: '#9CA3AF', marginLeft: 'auto' }}>{boardPhotos.length}</span>
              </div>
              <div style={{ flex: 1, height: 56, display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.5rem', overflowX: 'auto', position: 'relative' }}>
                {monthTicks.map((t, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    width: 1, background: '#F3F4F6',
                    transform: 'translateX(-50%)', pointerEvents: 'none',
                  }} />
                ))}
                <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#7C3AED25', transform: 'translateX(-50%)' }} />
                {boardPhotos.slice(0, 8).map((url, i) => (
                  <img key={i} src={url} alt="" style={{
                    height: 42, width: 58, objectFit: 'cover',
                    borderRadius: 5, flexShrink: 0,
                    border: '1.5px solid #E5E7EB',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    position: 'relative', zIndex: 2,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Milestones row ── */}
          {layers.milestones && milestones.length > 0 && (
            <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', borderTop: '1px solid #F0EDE8' }}>
              <div style={{
                width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                display: 'flex', alignItems: 'center', padding: '0 0.625rem',
                background: '#FAFAFA',
              }}>
                <div style={{ width: 8, height: 8, background: '#7C3AED', transform: 'rotate(45deg)', borderRadius: 1, flexShrink: 0, marginRight: 6 }} />
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Milestones</span>
                <span style={{ fontSize: '0.52rem', color: '#9CA3AF', marginLeft: 'auto' }}>{milestones.length}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 44 }}>
                {monthTicks.map((t, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    width: 1, background: '#F3F4F6',
                    transform: 'translateX(-50%)', pointerEvents: 'none',
                  }} />
                ))}
                <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#7C3AED30', transform: 'translateX(-50%)', zIndex: 1 }} />
                {milestones.map(ms => {
                  const pct = pctOf(new Date(ms.target_date + 'T00:00:00'))
                  const color = msColor(ms)
                  const linked = (milestoneTasks ?? []).filter(mt => mt.milestone_id === ms.id).length
                  return (
                    <div
                      key={ms.id}
                      title={`${ms.name} · ${ms.target_date}${linked ? ` · ${linked} tasks` : ''}`}
                      style={{
                        position: 'absolute', left: `${pct}%`, top: '50%',
                        transform: 'translate(-50%, -50%) rotate(45deg)',
                        width: 11, height: 11,
                        background: color,
                        borderRadius: 2,
                        boxShadow: `0 0 0 2px ${color}30`,
                        cursor: 'default',
                        zIndex: 2,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Expenses row ── */}
          {layers.expenses && expenseTxs.length > 0 && (
            <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', borderTop: '1px solid #F0EDE8' }}>
              <div style={{
                width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                display: 'flex', alignItems: 'center', padding: '0 0.625rem',
                background: '#FFF8F8',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#EF4444', flexShrink: 0, marginRight: 6 }} />
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expenses</span>
                <span style={{ fontSize: '0.52rem', color: '#9CA3AF', marginLeft: 'auto' }}>{expenseTxs.length}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 48, background: '#FFF8F8' }}>
                {monthTicks.map((t, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    width: 1, background: '#FDE8E8',
                    transform: 'translateX(-50%)', pointerEvents: 'none',
                  }} />
                ))}
                <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#7C3AED30', transform: 'translateX(-50%)' }} />
                {expenseTxs.map(tx => {
                  const pct = pctOf(new Date(tx.date + 'T00:00:00'))
                  const barH = Math.max(4, Math.round((tx.amount / maxTxAmt) * 36))
                  return (
                    <div
                      key={tx.id}
                      title={`${tx.description ?? 'Expense'}: ${fmtAmt(tx.amount)}`}
                      style={{
                        position: 'absolute', left: `${pct}%`,
                        bottom: 6, width: 7, height: barH,
                        background: tx.is_forecast ? '#FCA5A5' : '#EF4444',
                        borderRadius: '2px 2px 0 0',
                        transform: 'translateX(-50%)',
                        opacity: tx.is_forecast ? 0.6 : 1,
                        cursor: 'default',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Income row ── */}
          {layers.income && incomeTxs.length > 0 && (
            <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', borderTop: '1px solid #F0EDE8' }}>
              <div style={{
                width: LABEL_W, flexShrink: 0, borderRight: '1.5px solid #E8E5F0',
                display: 'flex', alignItems: 'center', padding: '0 0.625rem',
                background: '#F0FBF5',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#10B981', flexShrink: 0, marginRight: 6 }} />
                <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Income</span>
                <span style={{ fontSize: '0.52rem', color: '#9CA3AF', marginLeft: 'auto' }}>{incomeTxs.length}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 48, background: '#F0FBF5' }}>
                {monthTicks.map((t, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    width: 1, background: '#D1FAE5',
                    transform: 'translateX(-50%)', pointerEvents: 'none',
                  }} />
                ))}
                <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#7C3AED30', transform: 'translateX(-50%)' }} />
                {incomeTxs.map(tx => {
                  const pct = pctOf(new Date(tx.date + 'T00:00:00'))
                  const barH = Math.max(4, Math.round((tx.amount / maxTxAmt) * 36))
                  return (
                    <div
                      key={tx.id}
                      title={`${tx.description ?? 'Income'}: ${fmtAmt(tx.amount)}`}
                      style={{
                        position: 'absolute', left: `${pct}%`,
                        bottom: 6, width: 7, height: barH,
                        background: tx.is_forecast ? '#6EE7B7' : '#10B981',
                        borderRadius: '2px 2px 0 0',
                        transform: 'translateX(-50%)',
                        opacity: tx.is_forecast ? 0.6 : 1,
                        cursor: 'default',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {layers.tasks && tasks.length === 0 && (
            <div style={{ display: 'flex', height: 80, alignItems: 'center', justifyContent: 'center', color: '#D1D5DB', fontSize: '0.72rem' }}>
              No tasks yet — create tasks to see them on the timeline
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
