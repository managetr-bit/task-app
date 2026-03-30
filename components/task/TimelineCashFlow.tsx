'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { type Milestone, type MilestoneTask, type Task, type CostTransaction, type BudgetLine } from '@/lib/types'

type Props = {
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  tasks: Task[]
  costTransactions?: CostTransaction[]
  budgetLines?: BudgetLine[]
  currency?: 'TRY' | 'USD'
  onAdd: (name: string, targetDate: string) => Promise<void>
  onDelete: (milestoneId: string) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUpdateDate: (milestoneId: string, newDate: string) => Promise<void>
  onUpdateName?: (milestoneId: string, name: string) => Promise<void>
  onComplete?: (milestoneId: string, complete: boolean) => Promise<void>
  onCollapse?: () => void
  onUpdateDependency?: (milestoneId: string, dependsOnId: string | null, offsetDays: number) => Promise<void>
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function formatLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFull(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCfAmount(amount: number, currency: 'TRY' | 'USD' = 'USD') {
  const sym  = currency === 'TRY' ? '₺' : '$'
  const abs  = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}k`
  return `${sign}${sym}${abs.toFixed(0)}`
}

function getMilestoneStatus(ms: Milestone, linkedTasks: Task[], completedCount: number) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(ms.target_date + 'T00:00:00')
  const diff = diffDays(today, due)
  const manuallyDone = !!ms.completed_at
  const allDone = manuallyDone || (linkedTasks.length > 0 && completedCount === linkedTasks.length)
  if (allDone) return { color: '#22c55e', ring: '#bbf7d040', done: true }
  if (diff < 0)  return { color: '#ef4444', ring: '#fecaca40', done: false }
  if (diff <= 7) return { color: '#f59e0b', ring: '#fde68a40', done: false }
  return { color: '#7C3AED', ring: '#EDE9FE40', done: false }
}

// ── Layout constants ──────────────────────────────────────────────────────────
const LINE_Y    = 30  // px from top of bar div — upper portion leaves room for labels below
const TRACK_H   = 36  // track bar height (fits TODAY text)
const L_SPACING = 26  // px between label levels
const CHAR_PX   = 7.5 // approx px per char at 0.65rem font
const DATE_COL  = 56  // px width for start/end date columns flanking the bar

function labelOffset(level: 1 | 2 | 3): number {
  return 8 + (level - 1) * L_SPACING  // L1=8, L2=34, L3=60
}


export function TimelineCashFlow({ milestones, milestoneTasks, tasks, costTransactions, budgetLines, currency = 'USD', onAdd, onDelete, onLinkTask, onUnlinkTask, onUpdateDate, onUpdateName, onComplete, onCollapse, onUpdateDependency }: Props) {
  const barRef = useRef<HTMLDivElement>(null)

  // ── Bar width tracking ──
  const [barWidth, setBarWidth] = useState(900)
  useEffect(() => {
    if (!barRef.current) return
    const ro = new ResizeObserver(entries => setBarWidth(entries[0].contentRect.width))
    ro.observe(barRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Hover / add state ──
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [pendingPct, setPendingPct] = useState<number | null>(null)
  const [pendingDate, setPendingDate] = useState<string>('')
  const [pendingName, setPendingName] = useState('')
  const [adding, setAdding] = useState(false)

  // ── Selection / delete ──
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameDraft, setEditingNameDraft] = useState('')

  // ── Date range editing ──
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null)

  // ── Drag to reschedule ──
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPct, setDragPct] = useState<number | null>(null)
  const [pendingDrag, setPendingDrag] = useState<{ id: string; date: string; pct: number } | null>(null)
  const dragRef = useRef<{ pct: number | null; milestones: Milestone[]; startDate: Date; totalDays: number }>({
    pct: null, milestones: [], startDate: new Date(), totalDays: 1,
  })
  const hasDraggedRef = useRef(false)

  // ── Label drag ──
  const [labelOffsets, setLabelOffsets] = useState<Record<string, { dx: number; dy: number }>>({})
  const labelDragRef = useRef<{ id: string; startX: number; startY: number; startDx: number; startDy: number } | null>(null)
  const labelMovedRef = useRef(false)

  // ── Date editing in panel ──
  const [editingDateId, setEditingDateId] = useState<string | null>(null)

  // ── Cash flow toggles ──
  const cashFlowMode = 'all' as const
  const [cfHoverMonth, setCfHoverMonth]     = useState<string | null>(null)
  const [showMilestones, setShowMilestones] = useState(true)
  const [showCashIn, setShowCashIn]         = useState(true)
  const [showCashOut, setShowCashOut]       = useState(true)
  const [showBalance, setShowBalance]       = useState(true)

  // ── Date range ──
  const today = new Date(); today.setHours(0,0,0,0)
  const allDates = milestones.map(m => new Date(m.target_date + 'T00:00:00'))
  const earliestMs = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today
  const latestMs   = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : today
  const autoStart  = addDays(earliestMs < today ? earliestMs : today, -14)
  const autoEnd    = new Date(Math.max(addDays(latestMs, 30).getTime(), addDays(today, 183).getTime()))
  const startDate  = customStart ? new Date(customStart + 'T00:00:00') : autoStart
  const endDate    = customEnd   ? new Date(customEnd   + 'T00:00:00') : autoEnd
  const totalDays  = Math.max(diffDays(startDate, endDate), 1)

  // Keep dragRef in sync
  useEffect(() => {
    dragRef.current.milestones = milestones
    dragRef.current.startDate  = startDate
    dragRef.current.totalDays  = totalDays
  }, [milestones, startDate, totalDays])

  // Reset label drag offsets when milestone set changes
  const prevMsIds = useRef<string>('')
  useEffect(() => {
    if (barWidth <= 0) return
    const ids = milestones.map(m => m.id).sort().join(',')
    if (ids === prevMsIds.current) return
    prevMsIds.current = ids
    setLabelOffsets({})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, barWidth])

  // Auto-complete milestones when all linked tasks done
  useEffect(() => {
    if (!onComplete) return
    for (const ms of milestones) {
      if (ms.completed_at) continue
      const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === ms.id).map(mt => mt.task_id)
      if (linkedIds.length === 0) continue
      const linkedTasks = tasks.filter(t => linkedIds.includes(t.id))
      const allDone = linkedTasks.length > 0 && linkedTasks.every(t => !!t.completed_at)
      if (allDone) onComplete(ms.id, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, milestoneTasks, milestones])

  function pctOf(d: Date) {
    return Math.min(100, Math.max(0, (diffDays(startDate, d) / totalDays) * 100))
  }
  const todayPct = pctOf(today)
  const todayLabel = 'TODAY'

  // ── 3-level below-only label layout ──
  // Labels always go below the track in 3 staggered rows, purely for legibility.
  const milestoneLayout: Map<string, { row: 'below'; level: 1 | 2 | 3 }> = (() => {
    const MIN_PX = 44
    const DATE_CHARS = 7
    const sorted = [...milestones]
      .map(ms => ({
        id:  ms.id,
        pct: pctOf(new Date(ms.target_date + 'T00:00:00')),
        hw:  Math.max(MIN_PX / barWidth * 100,
               (Math.max(ms.name.length, DATE_CHARS) * CHAR_PX * 0.5) / barWidth * 100),
      }))
      .sort((a, b) => a.pct - b.pct)

    const lastPct: Record<'1'|'2'|'3', number> = { '1': -Infinity, '2': -Infinity, '3': -Infinity }
    const lastHW:  Record<'1'|'2'|'3', number> = { '1': 0, '2': 0, '3': 0 }
    const layout = new Map<string, { row: 'below'; level: 1 | 2 | 3 }>()

    for (const ms of sorted) {
      let chosen: 1 | 2 | 3 = 1
      for (const lvl of [1, 2, 3] as const) {
        const k = String(lvl) as '1'|'2'|'3'
        if (ms.pct - lastPct[k] >= ms.hw + lastHW[k]) { chosen = lvl; break }
      }
      const k = String(chosen) as '1'|'2'|'3'
      layout.set(ms.id, { row: 'below', level: chosen })
      lastPct[k] = ms.pct
      lastHW[k]  = ms.hw
    }
    return layout
  })()

  const paddingTopPx = 20
  const barHeightPx  = 160  // extra room for 3 below-rows

  // ── Tick marks ──
  const useWeekly = totalDays <= 60
  const monthTicks: { label: string; pct: number; isYearBoundary?: boolean }[] = []
  if (useWeekly) {
    const tick = new Date(startDate)
    tick.setDate(tick.getDate() + ((8 - tick.getDay()) % 7 || 7))
    let lastYear = -1
    while (tick <= endDate) {
      const isNewYear = tick.getFullYear() !== lastYear
      monthTicks.push({
        label: tick.toLocaleDateString('en-GB', isNewYear
          ? { day: 'numeric', month: 'short', year: 'numeric' }
          : { day: 'numeric', month: 'short' }),
        pct: pctOf(tick), isYearBoundary: isNewYear,
      })
      lastYear = tick.getFullYear()
      tick.setDate(tick.getDate() + 7)
    }
  } else {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    cursor.setMonth(cursor.getMonth() + 1)
    let lastYear = -1
    while (cursor <= endDate) {
      const isNewYear = cursor.getFullYear() !== lastYear
      monthTicks.push({
        label: cursor.toLocaleDateString('en-GB', isNewYear
          ? { month: 'short', year: 'numeric' }
          : { month: 'short' }),
        pct: pctOf(cursor), isYearBoundary: isNewYear,
      })
      lastYear = cursor.getFullYear()
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  // ── Mouse helpers ──
  function getPctFromEvent(e: React.MouseEvent | MouseEvent) {
    const rect = barRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (draggingId) {
      const p = getPctFromEvent(e) * 100
      dragRef.current.pct = p
      setDragPct(p)
      return
    }
    const pct = getPctFromEvent(e)
    setHoverPct(pct * 100)
    setHoverDate(addDays(startDate, Math.round(pct * totalDays)))
  }

  function handleMouseLeave() {
    if (draggingId) {
      setDraggingId(null)
    }
    setHoverPct(null)
    setHoverDate(null)
  }

  function handleBarClick(e: React.MouseEvent) {
    if (draggingId) return
    if ((e.target as HTMLElement).closest('[data-ms-dot]')) return
    const pct = getPctFromEvent(e)
    const date = addDays(startDate, Math.round(pct * totalDays))
    setPendingPct(pct * 100)
    setPendingDate(toDateStr(date))
    setPendingName('')
    setSelectedId(null)
  }

  function handleBarMouseUp(e: React.MouseEvent) {
    if (!draggingId) return
    e.stopPropagation()
    const p = getPctFromEvent(e) * 100
    const { milestones: ms, startDate: sd, totalDays: td } = dragRef.current
    const orig = ms.find(m => m.id === draggingId)
    if (orig) {
      const origPct = Math.min(100, Math.max(0, (diffDays(sd, new Date(orig.target_date + 'T00:00:00')) / td) * 100))
      if (Math.abs(p - origPct) > 0.5) {
        const newDate = toDateStr(addDays(sd, Math.round(p / 100 * td)))
        setPendingDrag({ id: draggingId, date: newDate, pct: p })
      }
    }
    setDraggingId(null)
    setDragPct(null)
  }

  // Global mouseup in case cursor leaves bar while dragging
  useEffect(() => {
    if (!draggingId) return
    document.body.style.cursor = 'grabbing'
    const onUp = (e: MouseEvent) => {
      if (!barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const p = Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100))
      const { milestones: ms, startDate: sd, totalDays: td } = dragRef.current
      const orig = ms.find(m => m.id === draggingId)
      if (orig) {
        const origPct = Math.min(100, Math.max(0, (diffDays(sd, new Date(orig.target_date + 'T00:00:00')) / td) * 100))
        if (Math.abs(p - origPct) > 0.5) {
          const newDate = toDateStr(addDays(sd, Math.round(p / 100 * td)))
          setPendingDrag({ id: draggingId, date: newDate, pct: p })
        }
      }
      setDraggingId(null)
      setDragPct(null)
    }
    const onMove = (e: MouseEvent) => {
      if (!barRef.current) return
      hasDraggedRef.current = true
      const rect = barRef.current.getBoundingClientRect()
      const p = Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100))
      dragRef.current.pct = p
      setDragPct(p)
    }
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    return () => {
      document.body.style.cursor = ''
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
    }
  }, [draggingId])

  // Label drag
  const SNAP_THRESH = 14
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!labelDragRef.current) return
      labelMovedRef.current = true
      const { id, startX, startY, startDx, startDy } = labelDragRef.current
      let newDx = startDx + e.clientX - startX
      let newDy = startDy + e.clientY - startY
      if (Math.abs(newDx) < SNAP_THRESH) newDx = 0
      if (Math.abs(newDy) < SNAP_THRESH) newDy = 0
      if (newDx !== 0 && newDy !== 0 && Math.abs(Math.abs(newDx) - Math.abs(newDy)) < SNAP_THRESH) {
        const sign = newDx * newDy > 0 ? 1 : -1
        const avg = (Math.abs(newDx) + Math.abs(newDy)) / 2
        newDx = Math.sign(newDx) * avg
        newDy = Math.sign(newDy) * avg
        newDy = sign * newDx
      }
      setLabelOffsets(prev => ({ ...prev, [id]: { dx: newDx, dy: newDy } }))
    }
    const onUp = () => { labelDragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingName.trim() || !pendingDate) return
    setAdding(true)
    await onAdd(pendingName.trim(), pendingDate)
    setPendingPct(null)
    setPendingName('')
    setPendingDate('')
    setAdding(false)
  }, [pendingName, pendingDate, onAdd])

  const handleConfirmDrag = useCallback(async () => {
    if (!pendingDrag) return
    await onUpdateDate(pendingDrag.id, pendingDrag.date)
    setPendingDrag(null)
  }, [pendingDrag, onUpdateDate])

  const selectedMs = milestones.find(m => m.id === selectedId)

  // ── Cash flow data ──
  const budgetLinesWithDate = (budgetLines ?? []).filter(bl => {
    const date = bl.expected_date ?? (bl.milestone_id ? milestones.find(m => m.id === bl.milestone_id)?.target_date : null)
    return !!date
  })
  const hasCfData = !!(costTransactions?.length || budgetLinesWithDate.length)

  const CF_H        = 120
  const CF_CENTER   = 56
  const CF_BAR_MAX  = 44

  const cfByMonth: Record<string, { cashIn: number; cashOut: number; forecastIn: number; forecastOut: number }> = {}
  for (const tx of costTransactions ?? []) {
    const d = new Date(tx.date + 'T00:00:00')
    if (d < startDate || d > endDate) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!cfByMonth[key]) cfByMonth[key] = { cashIn: 0, cashOut: 0, forecastIn: 0, forecastOut: 0 }
    if (tx.type === 'cash_in') {
      if (tx.is_forecast) cfByMonth[key].forecastIn  += tx.amount
      else                cfByMonth[key].cashIn       += tx.amount
    } else {
      if (tx.is_forecast) cfByMonth[key].forecastOut += tx.amount
      else                cfByMonth[key].cashOut      += tx.amount
    }
  }

  for (const bl of budgetLinesWithDate) {
    const dateStr = bl.expected_date ?? milestones.find(m => m.id === bl.milestone_id)?.target_date
    if (!dateStr) continue
    const d = new Date(dateStr + 'T00:00:00')
    if (d < startDate || d > endDate) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!cfByMonth[key]) cfByMonth[key] = { cashIn: 0, cashOut: 0, forecastIn: 0, forecastOut: 0 }
    if (bl.type === 'income') cfByMonth[key].forecastIn  += bl.budgeted_amount
    else                      cfByMonth[key].forecastOut += bl.budgeted_amount
  }

  function cfIn(m: typeof cfByMonth[string])  { return m.cashIn + m.forecastIn }
  function cfOut(m: typeof cfByMonth[string]) { return m.cashOut + m.forecastOut }
  function isForecastOnly(m: typeof cfByMonth[string]) {
    return m.cashIn === 0 && m.cashOut === 0
  }

  const cfMonthKeys = Object.keys(cfByMonth).sort()
  const cfMaxAmount = cfMonthKeys.reduce(
    (max, k) => Math.max(max, cfIn(cfByMonth[k]), cfOut(cfByMonth[k])), 0
  )

  const cfCumPoints: { pct: number; balance: number }[] = [{ pct: 0, balance: 0 }]
  let cfRunning = 0
  for (const key of cfMonthKeys) {
    const [yr, mo] = key.split('-').map(Number)
    cfRunning += cfIn(cfByMonth[key]) - cfOut(cfByMonth[key])
    cfCumPoints.push({ pct: pctOf(new Date(yr, mo, 0)), balance: cfRunning })
  }
  const cfBalanceRange = Math.max(...cfCumPoints.map(p => Math.abs(p.balance)), 1)

  function cfScaleY(balance: number) {
    return CF_CENTER - (balance / cfBalanceRange) * (CF_CENTER - 10)
  }

  // ── KPI totals — respects cashFlowMode same as chart bars ──
  const totalCashIn  = cfMonthKeys.reduce((s, k) => s + cfIn(cfByMonth[k]),  0)
  const totalCashOut = cfMonthKeys.reduce((s, k) => s + cfOut(cfByMonth[k]), 0)
  const runningBalance = totalCashIn - totalCashOut
  const milestoneCount = milestones.length

  return (
    <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0', flexShrink: 0, position: 'relative', zIndex: 10 }}>

      {/* ── KPI bar — always visible ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1rem', flexWrap: 'wrap' }}>
        {/* Collapse button */}
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              fontSize: '0.6rem', fontWeight: 600, padding: '0.25rem 0.6rem',
              border: '1px solid #E8E5F0', borderRadius: 6,
              background: '#F5F4FD', color: '#7C3AED',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#EDE9FE'; b.style.borderColor = '#7C3AED' }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#F5F4FD'; b.style.borderColor = '#E8E5F0' }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2 8.5L6 4.5L10 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Hide
          </button>
        )}
        <div style={{ width: 1, height: 16, background: '#E8E5F0', flexShrink: 0 }} />
        {/* KPI chips — clickable to toggle graph layers */}
        {[
          { label: 'Cash In',    value: formatCfAmount(totalCashIn,  currency), color: '#6ACA9A', bg: '#F0FBF5', on: showCashIn,     set: setShowCashIn },
          { label: 'Cash Out',   value: formatCfAmount(totalCashOut, currency), color: '#E86A8E', bg: '#FDF2F6', on: showCashOut,    set: setShowCashOut },
          { label: 'Balance',    value: (runningBalance >= 0 ? '+' : '') + formatCfAmount(runningBalance, currency), color: runningBalance >= 0 ? '#7C3AED' : '#E86A8E', bg: '#F5F4FD', on: showBalance,    set: setShowBalance },
          { label: 'Milestones', value: String(milestoneCount),                                                     color: '#7C3AED',                                     bg: '#EDE9FE', on: showMilestones, set: setShowMilestones },
        ].map(kpi => (
          <button
            key={kpi.label}
            onClick={() => kpi.set(v => !v)}
            title={kpi.on ? `Hide ${kpi.label}` : `Show ${kpi.label}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: kpi.on ? kpi.bg : '#F9F9F9',
              border: `1px solid ${kpi.on ? kpi.color + '50' : '#E8E5F0'}`,
              borderRadius: 10, padding: '0.2rem 0.6rem',
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: kpi.on ? 1 : 0.5,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.55rem', fontWeight: 600, color: kpi.on ? '#9ca3af' : '#c4c4c4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: kpi.on ? kpi.color : '#c4c4c4' }}>{kpi.value}</span>
          </button>
        ))}
      </div>

      {/* ── Combined chart area ── */}
      <div style={{ padding: `${paddingTopPx}px 1rem 0`, position: 'relative' }}>

        {/* Flex row: [start date col] [bar — flex:1] [end date col] */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* Start date */}
          <div
            onClick={e => { e.stopPropagation(); setEditingField(editingField === 'start' ? null : 'start') }}
            title="Click to change start date"
            style={{
              width: DATE_COL, flexShrink: 0, position: 'relative',
              height: barHeightPx, cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
              paddingTop: LINE_Y - Math.floor(TRACK_H / 2),
              paddingRight: 6,
              boxSizing: 'border-box',
            }}
          >
            {editingField === 'start' ? (
              <input type="date" value={customStart ?? toDateStr(startDate)} onChange={e => setCustomStart(e.target.value)}
                onBlur={() => setEditingField(null)} autoFocus onClick={e => e.stopPropagation()}
                style={{ fontSize: '0.48rem', border: '1px solid #7C3AED', borderRadius: 3, padding: '0.05rem 0.15rem', background: '#fff', outline: 'none', color: '#374151', width: 82 }} />
            ) : (
              <span style={{ fontSize: '0.52rem', fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap', lineHeight: `${TRACK_H}px`, textAlign: 'right' }}>
                {formatLabel(toDateStr(startDate))}
              </span>
            )}
          </div>

          {/* ── Bar / timeline track ── */}
          <div
            ref={barRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleBarClick}
            onMouseUp={handleBarMouseUp}
            style={{
              flex: 1,
              position: 'relative',
              height: barHeightPx,
              cursor: draggingId ? 'grabbing' : 'crosshair',
              userSelect: 'none',
              overflow: 'visible',
            }}
          >
            {/* Tick labels */}
            {monthTicks.map((t, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${t.pct}%`,
                top: LINE_Y - Math.floor(TRACK_H / 2) - 18,
                transform: 'translateX(-50%)',
                fontSize: t.isYearBoundary ? '0.6rem' : '0.55rem',
                color: t.isYearBoundary ? '#9ca3af' : '#C4B5FD',
                fontWeight: t.isYearBoundary ? 600 : 400,
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 40,
              }}>{t.label}</div>
            ))}

            {/* Month grid lines — full height of bar area (unified with CF below) */}
            {monthTicks.map((t, i) => (
              <div key={`l${i}`} style={{
                position: 'absolute', left: `${t.pct}%`,
                top: LINE_Y - Math.floor(TRACK_H / 2) - 6,
                width: 1, height: barHeightPx,
                background: t.isYearBoundary ? '#DDD6FE' : '#EDE9FE',
                transform: 'translateX(-50%)', pointerEvents: 'none',
                opacity: 0.7,
              }} />
            ))}

            {/* Track */}
            <div style={{
              position: 'absolute', left: 0, right: 0,
              top: LINE_Y - Math.floor(TRACK_H / 2),
              height: TRACK_H,
              clipPath: 'polygon(0% 0%, 12px 50%, 0% 100%, calc(100% - 14px) 100%, 100% 50%, calc(100% - 14px) 0%)',
              overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: '#EDE9FE' }} />
              {todayPct > 0 && (
                <div style={{
                  position: 'absolute', left: 0, width: `${todayPct}%`,
                  top: 0, bottom: 0,
                  background: 'linear-gradient(90deg, #DDD6FE 0%, #7C3AED 100%)',
                }} />
              )}
            </div>

            {/* Today marker in timeline track */}
            <div style={{
              position: 'absolute', left: `${todayPct}%`,
              top: 0, height: LINE_Y * 2, width: 1.5,
              background: '#7C3AED30', transform: 'translateX(-50%)',
              borderRadius: 1, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: `${todayPct}%`,
              top: LINE_Y - Math.floor(TRACK_H / 2),
              height: TRACK_H,
              transform: 'translateX(calc(-100% - 4px))',
              display: 'flex', alignItems: 'center',
              color: '#fff',
              fontSize: '0.5rem', fontWeight: 800, padding: '0 0.4rem',
              whiteSpace: 'nowrap', letterSpacing: '0.05em',
              pointerEvents: 'none', zIndex: 5,
            }}>{todayLabel}</div>

            {/* Hover ghost */}
            {hoverPct !== null && hoverDate && pendingPct === null && !draggingId && (
              <>
                <div style={{
                  position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 0.5,
                  transform: 'translate(-50%, -50%)', width: 20, height: 20,
                  borderRadius: '50%', background: '#7C3AED18', border: '1.5px dashed #7C3AED',
                  pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: '0.75rem', color: '#7C3AED', fontWeight: 700, lineHeight: 1 }}>+</span>
                </div>
                <div style={{
                  position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 17,
                  transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#6b7280',
                  whiteSpace: 'nowrap', background: '#fff', padding: '0.15rem 0.45rem',
                  borderRadius: 5, border: '1px solid #E8E5F0', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                  pointerEvents: 'none', fontWeight: 500, zIndex: 30,
                }}>{formatFull(hoverDate)}</div>
              </>
            )}

            {/* ── Milestone diamonds ── */}
            {showMilestones && milestones.map(ms => {
              const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === ms.id).map(mt => mt.task_id)
              const linked = tasks.filter(t => linkedIds.includes(t.id))
              const done = linked.filter(t => t.completed_at).length
              const status = getMilestoneStatus(ms, linked, done)
              const isDragging = draggingId === ms.id
              const pct = isDragging && dragPct !== null ? dragPct : pctOf(new Date(ms.target_date + 'T00:00:00'))
              const isSelected = selectedId === ms.id
              const isHovered  = hoveredId === ms.id && !isDragging
              const layout = milestoneLayout.get(ms.id) ?? { row: 'above', level: 1 as const }
              const isAbove = layout.row === 'above'
              const level   = layout.level
              const offset  = labelOffset(level)

              return (
                <div
                  key={ms.id}
                  data-ms-dot="1"
                  onClick={e => {
                    if (hasDraggedRef.current) return
                    e.stopPropagation()
                    setPendingPct(null)
                    setSelectedId(isSelected ? null : ms.id)
                    setConfirmDeleteId(null)
                  }}
                  onMouseEnter={() => { if (!draggingId) setHoveredId(ms.id) }}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseDown={e => {
                    e.stopPropagation()
                    hasDraggedRef.current = false
                    setDraggingId(ms.id)
                    setDragPct(pct)
                    dragRef.current.pct = pct
                    setSelectedId(null)
                    setPendingPct(null)
                  }}
                  style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    top: LINE_Y + 0.5,
                    transform: 'translate(-50%, -50%)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    zIndex: isHovered || isSelected || isDragging ? 100 : 25,
                    width: 24, height: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {/* Connector line */}
                  {(() => {
                    const lOff = labelOffsets[ms.id] ?? { dx: 0, dy: 0 }
                    const autoY = isAbove ? -(12 + offset + 7) : (12 + offset + 7)
                    const x2 = lOff.dx
                    const y2 = autoY + lOff.dy
                    const y1 = isAbove ? -8 : 8
                    const isDragged = lOff.dx !== 0 || lOff.dy !== 0
                    return (
                      <svg style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', overflow: 'visible', pointerEvents: 'none', zIndex: 0 }} width="1" height="1">
                        <line x1={0} y1={y1} x2={x2} y2={y2}
                          stroke={`${status.color}${isDragged ? 'b0' : '60'}`}
                          strokeWidth={isDragged ? 1.5 : 1}
                          strokeDasharray={isDragged ? '4 3' : '3 3'}
                        />
                      </svg>
                    )
                  })()}

                  {/* Label */}
                  {(() => {
                    const lOff = labelOffsets[ms.id] ?? { dx: 0, dy: 0 }
                    return (
                      <div
                        title="Drag to reposition"
                        onMouseDown={e => {
                          e.stopPropagation()
                          labelMovedRef.current = false
                          labelDragRef.current = { id: ms.id, startX: e.clientX, startY: e.clientY, startDx: lOff.dx, startDy: lOff.dy }
                        }}
                        onClick={e => {
                          if (labelMovedRef.current) { e.stopPropagation(); return }
                        }}
                        style={{
                          position: 'absolute',
                          ...(isAbove ? { bottom: `calc(100% + ${offset}px)` } : { top: `calc(100% + ${offset}px)` }),
                          left: '50%',
                          transform: `translateX(calc(-50% + ${lOff.dx}px)) translateY(${lOff.dy}px)`,
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                          cursor: labelDragRef.current?.id === ms.id ? 'grabbing' : 'grab',
                          zIndex: 1,
                        }}
                      >
                        <div style={{
                          fontSize: '0.65rem', fontWeight: 600,
                          color: isSelected ? status.color : isDragging ? '#7C3AED' : '#374151',
                          opacity: isDragging ? 0.7 : 1,
                          lineHeight: 1.3,
                          textDecoration: status.done ? 'line-through' : 'none',
                        }}>{ms.name}</div>
                      </div>
                    )
                  })()}

                  {/* Diamond */}
                  <div style={{
                    position: 'relative',
                    width: isHovered || isDragging ? 14 : 12,
                    height: isHovered || isDragging ? 14 : 12,
                    transform: 'rotate(45deg)',
                    background: status.color,
                    border: '2.5px solid #fff',
                    boxShadow: isSelected
                      ? `0 0 0 3px ${status.ring}, 0 3px 12px rgba(0,0,0,0.25)`
                      : isHovered || isDragging
                      ? `0 0 0 3px ${status.color}40, 0 2px 10px rgba(0,0,0,0.2)`
                      : '0 1px 5px rgba(0,0,0,0.2)',
                    transition: isDragging ? 'none' : 'all 0.15s ease',
                    flexShrink: 0,
                  }}>
                    {status.done && (
                      <span style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transform: 'rotate(-45deg)',
                        fontSize: '7px', fontWeight: 900, color: '#fff', lineHeight: 1,
                      }}>✓</span>
                    )}
                  </div>

                  {/* Drag tooltip */}
                  {isDragging && dragPct !== null && (
                    <div style={{
                      position: 'absolute',
                      ...(isAbove ? { top: 'calc(100% + 7px)' } : { bottom: 'calc(100% + 7px)' }),
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#7C3AED',
                      color: '#fff',
                      fontSize: '0.58rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.55rem',
                      borderRadius: 5,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      zIndex: 200,
                      boxShadow: '0 2px 10px rgba(124,58,237,0.35)',
                    }}>
                      {formatFull(addDays(startDate, Math.round(dragPct / 100 * totalDays)))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Dependency arrows */}
            {milestones.filter(ms => ms.depends_on_id).map(ms => {
              const depMs = milestones.find(m => m.id === ms.depends_on_id)
              if (!depMs) return null
              const fromPct = pctOf(new Date(depMs.target_date + 'T00:00:00'))
              const toPct = pctOf(new Date(ms.target_date + 'T00:00:00'))
              return (
                <div key={`dep-${ms.id}`} style={{
                  position: 'absolute',
                  left: `${Math.min(fromPct, toPct)}%`,
                  width: `${Math.abs(toPct - fromPct)}%`,
                  top: LINE_Y - 1,
                  height: 2,
                  background: 'linear-gradient(90deg, #7C3AED40, #7C3AED80)',
                  borderTop: '1.5px dashed #7C3AED60',
                  pointerEvents: 'none',
                  zIndex: 3,
                }} />
              )
            })}

            {/* Pending add dot */}
            {pendingPct !== null && (
              <div style={{
                position: 'absolute', left: `${pendingPct}%`, top: LINE_Y + 0.5,
                transform: 'translate(-50%, -50%)', zIndex: 3,
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: '#7C3AED', border: '2px solid #fff', boxShadow: '0 0 0 3px #7C3AED33' }} />
              </div>
            )}
          </div>{/* end barDiv */}

          {/* End date */}
          <div
            onClick={e => { e.stopPropagation(); setEditingField(editingField === 'end' ? null : 'end') }}
            title="Click to change end date"
            style={{
              width: DATE_COL, flexShrink: 0, position: 'relative',
              height: barHeightPx, cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
              paddingTop: LINE_Y - Math.floor(TRACK_H / 2),
              paddingLeft: 6,
              boxSizing: 'border-box',
            }}
          >
            {editingField === 'end' ? (
              <input type="date" value={customEnd ?? toDateStr(endDate)} onChange={e => setCustomEnd(e.target.value)}
                onBlur={() => setEditingField(null)} autoFocus onClick={e => e.stopPropagation()}
                style={{ fontSize: '0.48rem', border: '1px solid #7C3AED', borderRadius: 3, padding: '0.05rem 0.15rem', background: '#fff', outline: 'none', color: '#374151', width: 82 }} />
            ) : (
              <span style={{ fontSize: '0.52rem', fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap', lineHeight: `${TRACK_H}px` }}>
                {formatLabel(toDateStr(endDate))}
              </span>
            )}
          </div>

        </div>{/* end flex row */}

        {/* ── Cash Flow section (inline below track) ── */}
        {(
          <div style={{ display: 'flex', marginBottom: '0.75rem' }}>
            {/* Left label area */}
            <div style={{
              width: DATE_COL, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              paddingRight: 6,
            }}>
              <span style={{
                fontSize: '0.45rem', fontWeight: 700, color: '#C4B5FD',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                userSelect: 'none',
              }}>Cash Flow</span>
            </div>

            {/* CF chart */}
            <div style={{ flex: 1, position: 'relative', height: CF_H, overflow: 'visible' }}>

              {/* Month grid lines — continue from timeline above */}
              {monthTicks.map((t, i) => (
                <div key={i} style={{
                  position: 'absolute', left: `${t.pct}%`,
                  top: 0, bottom: 0, width: 1,
                  background: t.isYearBoundary ? '#DDD6FE' : '#EDE9FE',
                  transform: 'translateX(-50%)', pointerEvents: 'none',
                  opacity: 0.7,
                }} />
              ))}

              {/* Zero line */}
              <div style={{
                position: 'absolute', left: 0, right: 0,
                top: CF_CENTER, height: 1, background: '#DDD6FE',
              }} />

              {/* TODAY line spanning full CF height */}
              {todayPct > 0 && todayPct < 100 && (
                <div style={{
                  position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                  width: 1.5, background: '#7C3AED30', pointerEvents: 'none',
                }} />
              )}

              {/* Bars + hover areas per month */}
              {cfMonthKeys.map(key => {
                const [yr, mo] = key.split('-').map(Number)
                const leftPct  = Math.max(0, pctOf(new Date(yr, mo - 1, 1)))
                const rightPct = Math.min(100, pctOf(new Date(yr, mo, 0)))
                if (rightPct <= leftPct) return null
                const wPct   = rightPct - leftPct
                const data   = cfByMonth[key]
                const inAmt  = cfIn(data)
                const outAmt = cfOut(data)
                const inH    = cfMaxAmount > 0 ? (inAmt  / cfMaxAmount) * CF_BAR_MAX : 0
                const outH   = cfMaxAmount > 0 ? (outAmt / cfMaxAmount) * CF_BAR_MAX : 0
                const net    = inAmt - outAmt
                const faded  = isForecastOnly(data)
                const hovered = cfHoverMonth === key
                const isFcast = isForecastOnly(data)

                return (
                  <div
                    key={key}
                    onMouseEnter={() => setCfHoverMonth(key)}
                    onMouseLeave={() => setCfHoverMonth(null)}
                    style={{ position: 'absolute', left: `${leftPct}%`, width: `${wPct}%`, top: 0, height: CF_H, zIndex: hovered ? 50 : 1 }}
                  >
                    {/* Cash-in bar */}
                    {showCashIn && inH > 0.5 && (
                      <div style={{
                        position: 'absolute',
                        bottom: CF_H - CF_CENTER,
                        left: '8%', right: '8%',
                        height: inH,
                        background: isFcast ? '#A8E6C4' : '#6ACA9A',
                        borderRadius: '3px 3px 0 0',
                        opacity: faded ? 0.35 : 0.75,
                      }} />
                    )}
                    {/* Cash-out bar */}
                    {showCashOut && outH > 0.5 && (
                      <div style={{
                        position: 'absolute',
                        top: CF_CENTER,
                        left: '8%', right: '8%',
                        height: outH,
                        background: isFcast ? '#F4B8C8' : '#E86A8E',
                        borderRadius: '0 0 3px 3px',
                        opacity: faded ? 0.35 : 0.75,
                      }} />
                    )}

                    {/* Hover tooltip */}
                    {hovered && (
                      <div style={{
                        position: 'absolute',
                        bottom: CF_H + 6,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1a1a1a',
                        color: '#fff',
                        borderRadius: 9,
                        padding: '0.45rem 0.625rem',
                        fontSize: '0.65rem',
                        whiteSpace: 'nowrap',
                        zIndex: 300,
                        boxShadow: '0 4px 18px rgba(0,0,0,0.28)',
                        pointerEvents: 'none',
                      }}>
                        <div style={{ fontWeight: 700, color: '#C4B5FD', marginBottom: 4 }}>
                          {new Date(yr, mo - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                        </div>
                        {inAmt > 0  && <div style={{ color: '#6ACA9A' }}>↑ In:  {formatCfAmount(inAmt,  currency)}</div>}
                        {outAmt > 0 && <div style={{ color: '#E86A8E' }}>↓ Out: {formatCfAmount(outAmt, currency)}</div>}
                        <div style={{ borderTop: '1px solid #333', marginTop: 4, paddingTop: 4, fontWeight: 600, color: net >= 0 ? '#6ACA9A' : '#E86A8E' }}>
                          Net: {net >= 0 ? '+' : ''}{formatCfAmount(net, currency)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Cumulative balance polyline */}
              {showBalance && cfCumPoints.length > 1 && (
                <svg
                  viewBox={`0 0 100 ${CF_H}`}
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 10 }}
                >
                  <polyline
                    vectorEffect="non-scaling-stroke"
                    points={cfCumPoints.map(p => `${p.pct},${cfScaleY(p.balance)}`).join(' ')}
                    fill="none"
                    stroke="#7C3AED"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  {cfCumPoints.slice(1).map((p, i) => (
                    <circle
                      key={i}
                      cx={p.pct} cy={cfScaleY(p.balance)} r="1"
                      vectorEffect="non-scaling-stroke"
                      fill="#7C3AED" stroke="#fff" strokeWidth="1.5"
                    />
                  ))}
                </svg>
              )}

              {/* Empty state */}
              {cfMonthKeys.length === 0 && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', color: '#C4B5FD', fontStyle: 'italic',
                }}>
                  {(costTransactions ?? []).length === 0
                    ? 'Add transactions in the Cost tab to see cash flow'
                    : `No transactions in this date range`}
                </div>
              )}
            </div>

            {/* Right spacer */}
            <div style={{ width: DATE_COL, flexShrink: 0 }} />
          </div>
        )}

        {/* ── Add milestone form ── */}
        {pendingPct !== null && (
          <div
            data-ms-dot="1"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: `clamp(${DATE_COL}px, calc(${DATE_COL}px + ${pendingPct / 100} * (100% - ${DATE_COL * 2}px - 2rem) - 116px), calc(100% - ${DATE_COL}px - 1rem - 232px))`,
              top: 'calc(100% - 0.75rem)',
              zIndex: 100,
              background: '#fff',
              border: '1.5px solid #E8E5F0',
              borderRadius: 14,
              padding: '1rem',
              width: 232,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.625rem' }}>New milestone</div>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input className="input-base" placeholder="Milestone name" value={pendingName} onChange={e => setPendingName(e.target.value)} maxLength={60} autoFocus required />
              <input className="input-base" type="date" value={pendingDate} onChange={e => setPendingDate(e.target.value)} required style={{ padding: '0.35rem 0.625rem' }} />
              <div style={{ display: 'flex', gap: '0.375rem', marginTop: 2 }}>
                <button type="submit" className="btn-primary" disabled={adding || !pendingName.trim()} style={{ flex: 1, padding: '0.45rem', fontSize: '0.78rem', justifyContent: 'center' }}>
                  {adding ? '…' : 'Add milestone'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setPendingPct(null); setPendingName(''); setPendingDate('') }} style={{ padding: '0.45rem 0.625rem', fontSize: '0.78rem' }}>✕</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Drag confirmation dialog ── */}
      {pendingDrag && (() => {
        const ms = milestones.find(m => m.id === pendingDrag.id)
        if (!ms) return null
        const pct = pendingDrag.pct
        return (
          <div
            data-ms-dot="1"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: `clamp(${DATE_COL}px, calc(${DATE_COL}px + ${pct / 100} * (100% - ${DATE_COL * 2}px - 2rem) - 130px), calc(100% - ${DATE_COL}px - 1rem - 260px))`,
              top: 'calc(100% - 16px)',
              zIndex: 50,
              background: '#fff',
              border: '1.5px solid #E8E5F0',
              borderRadius: 12,
              padding: '0.875rem',
              width: 260,
              boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.25rem' }}>Move milestone?</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{ms.name}</span>
              {' → '}{formatLabel(pendingDrag.date)}
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button
                onClick={handleConfirmDrag}
                className="btn-primary"
                style={{ flex: 1, padding: '0.4rem', fontSize: '0.75rem', justifyContent: 'center' }}
              >Confirm</button>
              <button
                onClick={() => setPendingDrag(null)}
                className="btn-ghost"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
              >Cancel</button>
            </div>
          </div>
        )
      })()}

      {/* ── Selected milestone panel ── */}
      {selectedMs && (() => {
        const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === selectedMs.id).map(mt => mt.task_id)
        const linked = tasks.filter(t => linkedIds.includes(t.id))
        const done = linked.filter(t => t.completed_at).length
        const status = getMilestoneStatus(selectedMs, linked, done)
        const pct = pctOf(new Date(selectedMs.target_date + 'T00:00:00'))
        const openTasks = tasks.filter(t => !t.completed_at || linkedIds.includes(t.id))

        return (
          <div
            data-ms-dot="1"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: `clamp(${DATE_COL}px, calc(${DATE_COL}px + ${pct / 100} * (100% - ${DATE_COL * 2}px - 2rem) - 140px), calc(100% - ${DATE_COL}px - 1rem - 288px))`,
              top: 'calc(100% - 16px)',
              zIndex: 30,
              background: '#fff',
              border: '1.5px solid #E8E5F0',
              borderRadius: 14,
              width: 288,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              overflow: 'hidden',
            }}
          >
            <div style={{ height: 3, background: status.color }} />
            <div style={{ padding: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingNameId === selectedMs.id ? (
                    <input
                      value={editingNameDraft}
                      onChange={e => setEditingNameDraft(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const name = editingNameDraft.trim()
                          if (name && name !== selectedMs.name && onUpdateName) await onUpdateName(selectedMs.id, name)
                          setEditingNameId(null)
                        }
                        if (e.key === 'Escape') setEditingNameId(null)
                      }}
                      onBlur={async () => {
                        const name = editingNameDraft.trim()
                        if (name && name !== selectedMs.name && onUpdateName) await onUpdateName(selectedMs.id, name)
                        setEditingNameId(null)
                      }}
                      autoFocus
                      maxLength={60}
                      style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a1a', border: 'none', borderBottom: '1.5px solid #7C3AED', outline: 'none', background: 'transparent', width: '100%', padding: 0 }}
                    />
                  ) : (
                    <div
                      title="Click to rename"
                      onClick={() => { setEditingNameId(selectedMs.id); setEditingNameDraft(selectedMs.name) }}
                      style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                    >{selectedMs.name}</div>
                  )}
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2, display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {editingDateId === selectedMs.id ? (
                      <input
                        type="date"
                        defaultValue={selectedMs.target_date}
                        autoFocus
                        onBlur={async e => {
                          const val = e.target.value
                          if (val && val !== selectedMs.target_date) await onUpdateDate(selectedMs.id, val)
                          setEditingDateId(null)
                        }}
                        onKeyDown={e => { if (e.key === 'Escape') setEditingDateId(null) }}
                        style={{ fontSize: '0.65rem', color: '#6b7280', border: '1px solid #E8E5F0', borderRadius: 4, padding: '0.05rem 0.25rem', outline: 'none', background: '#fff' }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingDateId(selectedMs.id)}
                        title="Click to edit date"
                        style={{ fontSize: '0.65rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline dotted' }}
                      >{formatLabel(selectedMs.target_date)}</button>
                    )}
                    {linked.length > 0 && <span style={{ fontWeight: 600, color: status.color }}>· {done}/{linked.length} done</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                  {confirmDeleteId === selectedMs.id ? (
                    <>
                      <button onClick={() => { onDelete(selectedMs.id); setSelectedId(null); setConfirmDeleteId(null) }} style={{ fontSize: '0.7rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(selectedMs.id)} style={{ fontSize: '1rem', color: '#C4B5FD', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 0.2rem' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#C4B5FD' }}>×</button>
                  )}
                </div>
              </div>
              {linked.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ height: 4, background: '#EDE9FE', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(done / linked.length) * 100}%`, background: status.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}
              {/* Manual complete/reopen button */}
              {onComplete && (
                <button
                  type="button"
                  onClick={() => onComplete(selectedMs.id, !selectedMs.completed_at)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    width: '100%', marginBottom: '0.625rem',
                    padding: '0.4rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${status.done ? '#22c55e' : '#E8E5F0'}`,
                    background: status.done ? '#f0fdf4' : '#FAFAFA',
                    color: status.done ? '#16a34a' : '#6b7280',
                    fontSize: '0.75rem', fontWeight: 700,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>{status.done ? '✓' : '○'}</span>
                  {status.done ? (
                    <>
                      <span style={{ flex: 1, textAlign: 'left' }}>Completed</span>
                      <span style={{ fontSize: '0.62rem', fontWeight: 400, color: '#86efac' }}>
                        {selectedMs.completed_at ? new Date(selectedMs.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                      <span style={{ fontSize: '0.62rem', color: '#86efac' }}>· Reopen</span>
                    </>
                  ) : (
                    <span style={{ flex: 1, textAlign: 'left' }}>Mark as complete</span>
                  )}
                </button>
              )}
              {/* Dependency */}
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Depends on milestone
                </div>
                <select
                  value={selectedMs.depends_on_id ?? ''}
                  onChange={async e => {
                    const depId = e.target.value || null
                    if (depId) {
                      const depMs = milestones.find(m => m.id === depId)
                      if (depMs) {
                        const d = new Date(depMs.target_date + 'T00:00:00')
                        d.setDate(d.getDate() + (selectedMs.offset_days ?? 0))
                        await onUpdateDate(selectedMs.id, d.toISOString().slice(0, 10))
                      }
                    }
                    if (onUpdateDependency) await onUpdateDependency(selectedMs.id, depId, selectedMs.offset_days ?? 0)
                  }}
                  style={{ fontSize: '0.72rem', border: '1px solid #E8E5F0', borderRadius: 6, padding: '0.25rem 0.5rem', width: '100%', color: '#374151' }}
                >
                  <option value="">— independent —</option>
                  {milestones.filter(m => m.id !== selectedMs.id).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {selectedMs.depends_on_id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <input
                      type="number"
                      defaultValue={selectedMs.offset_days ?? 0}
                      onBlur={async e => {
                        const days = parseInt(e.target.value) || 0
                        const depMs = milestones.find(m => m.id === selectedMs.depends_on_id)
                        if (depMs) {
                          const d = new Date(depMs.target_date + 'T00:00:00')
                          d.setDate(d.getDate() + days)
                          await onUpdateDate(selectedMs.id, d.toISOString().slice(0, 10))
                        }
                        if (onUpdateDependency) await onUpdateDependency(selectedMs.id, selectedMs.depends_on_id, days)
                      }}
                      style={{ width: 56, padding: '0.2rem 0.4rem', borderRadius: 6, border: '1px solid #E8E5F0', fontSize: '0.8rem', textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                      days {(selectedMs.offset_days ?? 0) >= 0 ? 'after' : 'before'} dependency
                    </span>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem', marginTop: '0.75rem' }}>Prerequisite tasks</div>
              <div style={{ maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                {openTasks.map(t => {
                  const isLinked = linkedIds.includes(t.id)
                  const isDone = !!t.completed_at
                  return (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: 8, background: isLinked ? `${status.color}14` : 'transparent', transition: 'background 0.1s' }}>
                      <input type="checkbox" checked={isLinked} onChange={() => isLinked ? onUnlinkTask(selectedMs.id, t.id) : onLinkTask(selectedMs.id, t.id)} style={{ accentColor: '#7C3AED', width: 13, height: 13, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', color: isLinked ? '#1a1a1a' : '#6b7280', fontWeight: isLinked ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textDecoration: isDone && isLinked ? 'line-through' : 'none', opacity: isDone && isLinked ? 0.6 : 1 }}>{t.title}</span>
                      {isDone && isLinked && <span style={{ fontSize: '0.65rem', color: '#22c55e', flexShrink: 0, fontWeight: 700 }}>✓</span>}
                    </label>
                  )
                })}
                {openTasks.length === 0 && <p style={{ fontSize: '0.72rem', color: '#c4bfb9', padding: '0.25rem 0.4rem' }}>No tasks yet</p>}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Click outside to close ── */}
      {(pendingPct !== null || selectedId !== null || pendingDrag !== null) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          onClick={() => { setPendingPct(null); setSelectedId(null); setConfirmDeleteId(null); setPendingDrag(null) }}
        />
      )}
    </div>
  )
}
