'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { type Milestone, type MilestoneTask, type Task } from '@/lib/types'

type Props = {
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  tasks: Task[]
  onAdd: (name: string, targetDate: string) => Promise<void>
  onDelete: (milestoneId: string) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUpdateDate: (milestoneId: string, newDate: string) => Promise<void>
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

function getMilestoneStatus(ms: Milestone, linkedTasks: Task[], completedCount: number) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(ms.target_date + 'T00:00:00')
  const diff = diffDays(today, due)
  const allDone = linkedTasks.length > 0 && completedCount === linkedTasks.length
  if (allDone) return { color: '#22c55e', ring: '#bbf7d040' }
  if (diff < 0)  return { color: '#ef4444', ring: '#fecaca40' }
  if (diff <= 7) return { color: '#f59e0b', ring: '#fde68a40' }
  return { color: '#c9a96e', ring: '#f0e4d040' }
}

// ── Layout constants ──────────────────────────────────────────────────────────
const LINE_Y    = 56  // px from top of bar div
const TRACK_H   = 8   // track bar height
const L_SPACING = 30  // px between label levels
const CHAR_PX   = 7.5 // approx px per char at 0.65rem font

function labelOffset(level: 1 | 2 | 3): number {
  return 6 + (level - 1) * L_SPACING  // L1=6, L2=36, L3=66
}

export function MilestoneTimeline({ milestones, milestoneTasks, tasks, onAdd, onDelete, onLinkTask, onUnlinkTask, onUpdateDate }: Props) {
  const barRef = useRef<HTMLDivElement>(null)

  // ── Bar width tracking for accurate label-width estimation ──
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

  // ── Date range editing (inline in header) ──
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'start' | 'end' | null>(null)

  // ── Drag to reschedule ──
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPct, setDragPct] = useState<number | null>(null)
  const [pendingDrag, setPendingDrag] = useState<{ id: string; date: string; pct: number } | null>(null)
  // Stable ref for values needed in drag effect without stale closures
  const dragRef = useRef<{ pct: number | null; milestones: Milestone[]; startDate: Date; totalDays: number }>({
    pct: null, milestones: [], startDate: new Date(), totalDays: 1,
  })

  // ── Date range ──
  const today = new Date(); today.setHours(0,0,0,0)
  const allDates = milestones.map(m => new Date(m.target_date + 'T00:00:00'))
  // Default: auto-fit all milestones with padding; minimum end = today + 6 months
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

  function pctOf(d: Date) {
    return Math.min(100, Math.max(0, (diffDays(startDate, d) / totalDays) * 100))
  }
  const todayPct = pctOf(today)

  // ── 6-slot label layout (accurate pixel-based) ──
  type SlotKey = 'above-1' | 'above-2' | 'above-3' | 'below-1' | 'below-2' | 'below-3'
  type SlotDef = { key: SlotKey; row: 'above' | 'below'; level: 1 | 2 | 3 }

  const SLOTS: SlotDef[] = [
    { key: 'above-1', row: 'above', level: 1 },
    { key: 'below-1', row: 'below', level: 1 },
    { key: 'above-2', row: 'above', level: 2 },
    { key: 'below-2', row: 'below', level: 2 },
    { key: 'above-3', row: 'above', level: 3 },
    { key: 'below-3', row: 'below', level: 3 },
  ]

  const milestoneLayout: Map<string, { row: 'above' | 'below'; level: 1 | 2 | 3 }> = (() => {
    const MIN_PX = 40  // minimum label half-width in px
    const sorted = [...milestones]
      .map(ms => ({
        id:  ms.id,
        pct: pctOf(new Date(ms.target_date + 'T00:00:00')),
        // hw = half-label-width in pct (using actual bar width)
        hw: Math.max(MIN_PX / barWidth * 100, (ms.name.length * CHAR_PX * 0.5) / barWidth * 100),
      }))
      .sort((a, b) => a.pct - b.pct)

    const lastPct: Record<SlotKey, number> = {
      'above-1': -Infinity, 'above-2': -Infinity, 'above-3': -Infinity,
      'below-1': -Infinity, 'below-2': -Infinity, 'below-3': -Infinity,
    }
    const lastHW: Record<SlotKey, number> = {
      'above-1': 0, 'above-2': 0, 'above-3': 0,
      'below-1': 0, 'below-2': 0, 'below-3': 0,
    }
    const layout = new Map<string, { row: 'above' | 'below'; level: 1 | 2 | 3 }>()
    let lastRow: 'above' | 'below' = 'below'  // first will prefer 'above'

    for (const ms of sorted) {
      const preferRow: 'above' | 'below' = lastRow === 'above' ? 'below' : 'above'

      // Ordered: preferred row (L1, L2, L3), then other row (L1, L2, L3)
      const ordered: SlotDef[] = [
        ...SLOTS.filter(s => s.row === preferRow).sort((a, b) => a.level - b.level),
        ...SLOTS.filter(s => s.row !== preferRow).sort((a, b) => a.level - b.level),
      ]

      let chosen: SlotDef | null = null

      // Pass 1: first slot (preferred row) with sufficient clearance
      for (const slot of ordered.filter(s => s.row === preferRow)) {
        const gap = ms.pct - lastPct[slot.key]
        if (gap >= ms.hw + lastHW[slot.key]) { chosen = slot; break }
      }
      // Pass 2: other row with sufficient clearance
      if (!chosen) {
        for (const slot of ordered.filter(s => s.row !== preferRow)) {
          const gap = ms.pct - lastPct[slot.key]
          if (gap >= ms.hw + lastHW[slot.key]) { chosen = slot; break }
        }
      }
      // Pass 3: all 6 slots crowded → force preferred row L1 (opposite row from last)
      // This GUARANTEES visual separation: above ↔ below labels never overlap
      if (!chosen) chosen = ordered[0]

      layout.set(ms.id, { row: chosen.row, level: chosen.level })
      lastPct[chosen.key] = ms.pct
      lastHW[chosen.key]  = ms.hw
      lastRow = chosen.row
    }
    return layout
  })()

  // Dynamic container sizing based on max level used
  const maxLevel: 1 | 2 | 3 = milestones.length === 0 ? 1 :
    (Math.max(1, ...[...milestoneLayout.values()].map(v => v.level)) as 1 | 2 | 3)
  const aboveNeed   = 11 + labelOffset(maxLevel) + 20 + 12  // div-radius + offset + label-h + breathing
  const belowNeed   = 11 + labelOffset(maxLevel) + 20 + 8
  const paddingTopPx = Math.max(52, aboveNeed)
  const barHeightPx  = Math.max(120, LINE_Y + belowNeed)

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
      // Commit drag on leave (prevents losing the drag if cursor exits bar)
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

  return (
    <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5E0', flexShrink: 0, position: 'relative', zIndex: 10 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.5rem 0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timeline</span>
        {milestones.length > 0 && (
          <span style={{ fontSize: '0.6rem', color: '#c4bfb9', background: '#F3F4F6', borderRadius: 10, padding: '0.05rem 0.45rem', fontWeight: 600 }}>
            {milestones.length}
          </span>
        )}

        {/* ── Inline date range editor ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem' }}>
          {editingField === 'start' ? (
            <input
              type="date"
              value={customStart ?? toDateStr(startDate)}
              onChange={e => setCustomStart(e.target.value)}
              onBlur={() => setEditingField(null)}
              autoFocus
              style={{ fontSize: '0.6rem', color: '#6b7280', border: '1px solid #E8E5E0', borderRadius: 4, padding: '0.1rem 0.25rem', background: '#fff', outline: 'none' }}
            />
          ) : (
            <button
              onClick={() => setEditingField('start')}
              title="Click to change start date"
              style={{ fontSize: '0.6rem', color: '#9ca3af', background: 'none', border: '1px solid transparent', borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer', lineHeight: 1.4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
            >
              {formatLabel(toDateStr(startDate))}
            </button>
          )}
          <span style={{ fontSize: '0.55rem', color: '#d1cdc7' }}>→</span>
          {editingField === 'end' ? (
            <input
              type="date"
              value={customEnd ?? toDateStr(endDate)}
              onChange={e => setCustomEnd(e.target.value)}
              onBlur={() => setEditingField(null)}
              autoFocus
              style={{ fontSize: '0.6rem', color: '#6b7280', border: '1px solid #E8E5E0', borderRadius: 4, padding: '0.1rem 0.25rem', background: '#fff', outline: 'none' }}
            />
          ) : (
            <button
              onClick={() => setEditingField('end')}
              title="Click to change end date"
              style={{ fontSize: '0.6rem', color: '#9ca3af', background: 'none', border: '1px solid transparent', borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer', lineHeight: 1.4 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
            >
              {formatLabel(toDateStr(endDate))}
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.58rem', color: '#d1cdc7', fontStyle: 'italic' }}>
          {milestones.length === 0 ? 'Click track to add' : 'Click to manage · Drag to reschedule'}
        </span>
      </div>

      {/* ── Track area ── */}
      <div style={{ padding: `${paddingTopPx}px 1.5rem 0.75rem`, position: 'relative' }}>
        <div
          ref={barRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleBarClick}
          onMouseUp={handleBarMouseUp}
          style={{
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
              position: 'absolute', left: `${t.pct}%`, top: 0, transform: 'translateX(-50%)',
              fontSize: t.isYearBoundary ? '0.6rem' : '0.55rem',
              color: t.isYearBoundary ? '#9ca3af' : '#d1cdc7',
              fontWeight: t.isYearBoundary ? 600 : 400,
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>{t.label}</div>
          ))}

          {/* Tick hairlines */}
          {monthTicks.map((t, i) => (
            <div key={`l${i}`} style={{
              position: 'absolute', left: `${t.pct}%`,
              top: LINE_Y - 6, width: 1, height: 12,
              background: t.isYearBoundary ? '#d1cdc7' : '#E8E5E0',
              transform: 'translateX(-50%)', pointerEvents: 'none',
            }} />
          ))}

          {/* Track background */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: LINE_Y - Math.floor(TRACK_H / 2),
            height: TRACK_H, background: '#F0EDE8', borderRadius: 5,
          }} />

          {/* Progress fill: start → today */}
          {todayPct > 0 && (
            <div style={{
              position: 'absolute', left: 0, width: `${todayPct}%`,
              top: LINE_Y - Math.floor(TRACK_H / 2), height: TRACK_H,
              background: 'linear-gradient(90deg, #f0e4d0 0%, #c9a96e 100%)', borderRadius: 5,
            }} />
          )}

          {/* Today marker */}
          <div style={{
            position: 'absolute', left: `${todayPct}%`,
            top: LINE_Y - 14, width: 1.5, height: 28,
            background: '#c9a96e', transform: 'translateX(-50%)',
            borderRadius: 1, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', left: `${todayPct}%`, top: LINE_Y - 26,
            transform: 'translateX(-50%)', background: '#c9a96e', color: '#fff',
            fontSize: '0.5rem', fontWeight: 800, padding: '0.1rem 0.35rem',
            borderRadius: 4, whiteSpace: 'nowrap', letterSpacing: '0.05em',
            pointerEvents: 'none', zIndex: 2,
          }}>TODAY</div>

          {/* Hover ghost (only when not dragging) */}
          {hoverPct !== null && hoverDate && pendingPct === null && !draggingId && (
            <>
              <div style={{
                position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 0.5,
                transform: 'translate(-50%, -50%)', width: 20, height: 20,
                borderRadius: '50%', background: '#c9a96e18', border: '1.5px dashed #c9a96e',
                pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.75rem', color: '#c9a96e', fontWeight: 700, lineHeight: 1 }}>+</span>
              </div>
              <div style={{
                position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 17,
                transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#6b7280',
                whiteSpace: 'nowrap', background: '#fff', padding: '0.15rem 0.45rem',
                borderRadius: 5, border: '1px solid #E8E5E0', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                pointerEvents: 'none', fontWeight: 500, zIndex: 3,
              }}>{formatFull(hoverDate)}</div>
            </>
          )}

          {/* ── Milestone diamonds ── */}
          {milestones.map(ms => {
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
            const tooltipLabel = `${formatLabel(ms.target_date)}${linked.length > 0 ? ` · ${done}/${linked.length}` : ''}`

            return (
              <div
                key={ms.id}
                data-ms-dot="1"
                onClick={e => {
                  if (isDragging) return
                  e.stopPropagation()
                  setPendingPct(null)
                  setSelectedId(isSelected ? null : ms.id)
                  setConfirmDeleteId(null)
                }}
                onMouseEnter={() => { if (!draggingId) setHoveredId(ms.id) }}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
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
                  zIndex: isHovered || isSelected || isDragging ? 100 : 4,
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {/* Connector stem for L2/L3 labels */}
                {level > 1 && (
                  <div style={{
                    position: 'absolute',
                    left: '50%', transform: 'translateX(-50%)',
                    width: 1,
                    height: (level - 1) * L_SPACING,
                    background: `${status.color}60`,
                    ...(isAbove
                      ? { bottom: `calc(100% + 6px)` }
                      : { top:    `calc(100% + 6px)` }),
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Static label — name only */}
                <div style={{
                  position: 'absolute',
                  ...(isAbove ? { bottom: `calc(100% + ${offset}px)` } : { top: `calc(100% + ${offset}px)` }),
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}>
                  <div style={{
                    fontSize: '0.65rem', fontWeight: 600,
                    color: isSelected ? status.color : isDragging ? '#c9a96e' : '#374151',
                    opacity: isDragging ? 0.7 : 1,
                  }}>{ms.name}</div>
                </div>

                {/* Diamond */}
                <div style={{
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
                }} />

                {/* Hover tooltip — date + tasks (opposite side from label, high zIndex) */}
                {isHovered && !isSelected && (
                  <div style={{
                    position: 'absolute',
                    ...(isAbove ? { top: 'calc(100% + 7px)' } : { bottom: 'calc(100% + 7px)' }),
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '0.58rem',
                    fontWeight: 500,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 5,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 200,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                  }}>
                    {tooltipLabel}
                  </div>
                )}

                {/* Drag position tooltip */}
                {isDragging && dragPct !== null && (
                  <div style={{
                    position: 'absolute',
                    ...(isAbove ? { top: 'calc(100% + 7px)' } : { bottom: 'calc(100% + 7px)' }),
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#c9a96e',
                    color: '#fff',
                    fontSize: '0.58rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 5,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 200,
                    boxShadow: '0 2px 10px rgba(201,169,110,0.4)',
                  }}>
                    {formatFull(addDays(startDate, Math.round(dragPct / 100 * totalDays)))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pending add dot */}
          {pendingPct !== null && (
            <div style={{
              position: 'absolute', left: `${pendingPct}%`, top: LINE_Y + 0.5,
              transform: 'translate(-50%, -50%)', zIndex: 3,
              width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: '#c9a96e', border: '2px solid #fff', boxShadow: '0 0 0 3px #c9a96e33' }} />
            </div>
          )}
        </div>

        {/* ── Add milestone form ── */}
        {pendingPct !== null && (
          <div
            data-ms-dot="1"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: `clamp(0px, calc(${pendingPct}% - 116px), calc(100% - 1.5rem - 232px))`,
              top: 'calc(100% - 0.75rem)',
              zIndex: 100,
              background: '#fff',
              border: '1.5px solid #E8E5E0',
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
              left: `clamp(8px, calc(1.5rem + ${pct / 100} * (100% - 3rem) - 130px), calc(100% - 268px))`,
              top: 'calc(100% - 16px)',
              zIndex: 50,
              background: '#fff',
              border: '1.5px solid #E8E5E0',
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
              left: `clamp(8px, calc(1.5rem + ${pct / 100} * (100% - 3rem) - 140px), calc(100% - 288px))`,
              top: 'calc(100% - 16px)',
              zIndex: 30,
              background: '#fff',
              border: '1.5px solid #E8E5E0',
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
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMs.name}</div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>
                    {formatLabel(selectedMs.target_date)}
                    {linked.length > 0 && <span style={{ marginLeft: '0.375rem', fontWeight: 600, color: status.color }}>· {done}/{linked.length} done</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                  {confirmDeleteId === selectedMs.id ? (
                    <>
                      <button onClick={() => { onDelete(selectedMs.id); setSelectedId(null); setConfirmDeleteId(null) }} style={{ fontSize: '0.7rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(selectedMs.id)} style={{ fontSize: '1rem', color: '#d1cdc7', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 0.2rem' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}>×</button>
                  )}
                  <button onClick={() => setSelectedId(null)} style={{ fontSize: '0.85rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 0.2rem' }}>✕</button>
                </div>
              </div>
              {linked.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ height: 4, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(done / linked.length) * 100}%`, background: status.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>Prerequisite tasks</div>
              <div style={{ maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                {openTasks.map(t => {
                  const isLinked = linkedIds.includes(t.id)
                  const isDone = !!t.completed_at
                  return (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: 8, background: isLinked ? `${status.color}14` : 'transparent', transition: 'background 0.1s' }}>
                      <input type="checkbox" checked={isLinked} onChange={() => isLinked ? onUnlinkTask(selectedMs.id, t.id) : onLinkTask(selectedMs.id, t.id)} style={{ accentColor: '#c9a96e', width: 13, height: 13, flexShrink: 0 }} />
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
