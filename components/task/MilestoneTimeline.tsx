'use client'

import { useState, useRef, useCallback } from 'react'
import { type Milestone, type MilestoneTask, type Task } from '@/lib/types'

type Props = {
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  tasks: Task[]
  onAdd: (name: string, targetDate: string) => Promise<void>
  onDelete: (milestoneId: string) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
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
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFull(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getMilestoneStatus(ms: Milestone, linkedTasks: Task[], completedCount: number) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(ms.target_date)
  const diff = diffDays(today, due)
  const allDone = linkedTasks.length > 0 && completedCount === linkedTasks.length
  if (allDone) return { color: '#22c55e', ring: '#bbf7d040' }
  if (diff < 0)  return { color: '#ef4444', ring: '#fecaca40' }
  if (diff <= 7) return { color: '#f59e0b', ring: '#fde68a40' }
  return { color: '#c9a96e', ring: '#f0e4d040' }
}

export function MilestoneTimeline({ milestones, milestoneTasks, tasks, onAdd, onDelete, onLinkTask, onUnlinkTask }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)

  const [pendingPct, setPendingPct] = useState<number | null>(null)
  const [pendingDate, setPendingDate] = useState<string>('')
  const [pendingName, setPendingName] = useState('')
  const [adding, setAdding] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const [editingRange, setEditingRange] = useState<'start' | 'end' | null>(null)
  const [customStart, setCustomStart] = useState<string | null>(null)
  const [customEnd, setCustomEnd] = useState<string | null>(null)

  // ── Date range ──
  const today = new Date(); today.setHours(0,0,0,0)
  const allDates = milestones.map(m => new Date(m.target_date))
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : today
  const startDate = customStart ? new Date(customStart) : addDays(minDate < today ? minDate : today, -21)
  const endDate   = customEnd   ? new Date(customEnd)   : addDays(maxDate > today ? maxDate : today, 60)
  const totalDays = Math.max(diffDays(startDate, endDate), 1)

  function pctOf(d: Date) {
    return Math.min(100, Math.max(0, (diffDays(startDate, d) / totalDays) * 100))
  }
  const todayPct = pctOf(today)

  // ── 4-slot label layout to prevent overlap ──
  // Slots: above-1 (near), below-1 (near), above-2 (far), below-2 (far)
  // Key guarantee: adjacent milestones always get OPPOSITE ROWS (above vs below
  // can never visually overlap regardless of horizontal distance). Level-2 is used
  // only when both near-slots of a row are crowded by earlier milestones.
  const milestoneLayout: Map<string, { row: 'above' | 'below'; level: 1 | 2 }> = (() => {
    const CHAR_PCT = 0.8   // ~1 char ≈ 0.8% of a ~900px timeline (conservative)
    const MIN_HW   = 4     // minimum half-width buffer in pct

    const sorted = [...milestones]
      .map(ms => ({
        id:  ms.id,
        pct: pctOf(new Date(ms.target_date)),
        hw:  Math.max(MIN_HW, (ms.name.length * CHAR_PCT) / 2),
      }))
      .sort((a, b) => a.pct - b.pct)

    type SlotKey = 'above-1' | 'above-2' | 'below-1' | 'below-2'
    type SlotDef = { key: SlotKey; row: 'above' | 'below'; level: 1 | 2 }

    const SLOTS: SlotDef[] = [
      { key: 'above-1', row: 'above', level: 1 },
      { key: 'below-1', row: 'below', level: 1 },
      { key: 'above-2', row: 'above', level: 2 },
      { key: 'below-2', row: 'below', level: 2 },
    ]

    const lastPct: Record<SlotKey, number> = { 'above-1': -Infinity, 'above-2': -Infinity, 'below-1': -Infinity, 'below-2': -Infinity }
    const lastHW:  Record<SlotKey, number> = { 'above-1': 0, 'above-2': 0, 'below-1': 0, 'below-2': 0 }
    const layout = new Map<string, { row: 'above' | 'below'; level: 1 | 2 }>()

    // Track last assigned row: adjacent milestones will always get the opposite
    let lastRow: 'above' | 'below' = 'below'  // first milestone → above

    for (const ms of sorted) {
      const preferRow: 'above' | 'below' = lastRow === 'above' ? 'below' : 'above'

      // Slot preference: preferred-row L1, preferred-row L2, other-row L1, other-row L2
      const ordered: SlotDef[] = [
        ...SLOTS.filter(s => s.row === preferRow).sort((a, b) => a.level - b.level),
        ...SLOTS.filter(s => s.row !== preferRow).sort((a, b) => a.level - b.level),
      ]

      let chosen: SlotDef | null = null

      // Pass 1: find first slot in preferred row with enough clearance
      for (const slot of ordered.filter(s => s.row === preferRow)) {
        const gap = ms.pct - lastPct[slot.key]
        if (gap >= ms.hw + lastHW[slot.key]) { chosen = slot; break }
      }

      // Pass 2: if preferred row is fully crowded, try other row (still better than overlap)
      if (!chosen) {
        for (const slot of ordered.filter(s => s.row !== preferRow)) {
          const gap = ms.pct - lastPct[slot.key]
          if (gap >= ms.hw + lastHW[slot.key]) { chosen = slot; break }
        }
      }

      // Pass 3: all 4 slots crowded → FORCE opposite row from last (visual separation
      // guaranteed since above-labels and below-labels can never overlap each other)
      if (!chosen) {
        // Pick preferRow L1 as forced choice — opposite row from last assignment
        chosen = ordered[0]
      }

      layout.set(ms.id, { row: chosen.row, level: chosen.level })
      lastPct[chosen.key] = ms.pct
      lastHW[chosen.key]  = ms.hw
      lastRow = chosen.row
    }

    return layout
  })()

  // ── Tick marks ──
  const useWeekly = totalDays <= 60
  const monthTicks: { label: string; pct: number; isYearBoundary?: boolean }[] = []
  if (useWeekly) {
    const tick = new Date(startDate)
    tick.setDate(tick.getDate() + ((8 - tick.getDay()) % 7 || 7))
    let lastYear = -1
    while (tick <= endDate) {
      const isNewYear = tick.getFullYear() !== lastYear
      const label = isNewYear
        ? tick.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : tick.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      monthTicks.push({ label, pct: pctOf(tick), isYearBoundary: isNewYear })
      lastYear = tick.getFullYear()
      tick.setDate(tick.getDate() + 7)
    }
  } else {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    cursor.setMonth(cursor.getMonth() + 1)
    let lastYear = -1
    while (cursor <= endDate) {
      const isNewYear = cursor.getFullYear() !== lastYear
      const label = isNewYear
        ? cursor.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        : cursor.toLocaleDateString('en-GB', { month: 'short' })
      monthTicks.push({ label, pct: pctOf(cursor), isYearBoundary: isNewYear })
      lastYear = cursor.getFullYear()
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  // ── Mouse handlers ──
  function getPctFromEvent(e: React.MouseEvent) {
    const rect = barRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  function handleMouseMove(e: React.MouseEvent) {
    const pct = getPctFromEvent(e)
    setHoverPct(pct * 100)
    setHoverDate(addDays(startDate, Math.round(pct * totalDays)))
  }

  function handleMouseLeave() {
    setHoverPct(null)
    setHoverDate(null)
  }

  function handleBarClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-ms-dot]')) return
    const pct = getPctFromEvent(e)
    const date = addDays(startDate, Math.round(pct * totalDays))
    setPendingPct(pct * 100)
    setPendingDate(toDateStr(date))
    setPendingName('')
    setSelectedId(null)
  }

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

  const selectedMs = milestones.find(m => m.id === selectedId)

  // ── Layout constants ──
  // LINE_Y = vertical center of the track within the bar div
  // paddingTop reserves space for 2 levels of above-labels
  const LINE_Y    = 52
  const TRACK_H   = 7
  const BAR_H     = 150
  // L1 label offset from hit-div edge (22px div → 11px radius)
  const L1_OFFSET = 4   // px gap between div edge and label
  // L2 label offset: far enough to clear L1 label (~24px tall) + gap
  const L2_OFFSET = 30

  return (
    <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5E0', flexShrink: 0, position: 'relative', zIndex: 10 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem 0' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timeline</span>
        {milestones.length > 0 && (
          <span style={{ fontSize: '0.6rem', color: '#c4bfb9', background: '#F3F4F6', borderRadius: 10, padding: '0.05rem 0.45rem', fontWeight: 600 }}>
            {milestones.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.58rem', color: '#d1cdc7', fontStyle: 'italic' }}>
          {milestones.length === 0 ? 'Click the track to add your first milestone' : 'Click track to add · Click dot to manage'}
        </span>
      </div>

      {/* ── Track area ── */}
      {/* paddingTop: 4.5rem reserves ~72px for 2 above-label levels */}
      <div style={{ padding: '4.5rem 1.5rem 0.625rem', position: 'relative' }}>

        {/* Bar */}
        <div
          ref={barRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleBarClick}
          style={{ position: 'relative', height: BAR_H, cursor: 'crosshair', userSelect: 'none', overflow: 'visible' }}
        >
          {/* Tick labels */}
          {monthTicks.map((t, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${t.pct}%`,
              top: 0,
              transform: 'translateX(-50%)',
              fontSize: t.isYearBoundary ? '0.6rem' : '0.55rem',
              color: t.isYearBoundary ? '#9ca3af' : '#d1cdc7',
              fontWeight: t.isYearBoundary ? 600 : 400,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              {t.label}
            </div>
          ))}

          {/* Tick hairlines */}
          {monthTicks.map((t, i) => (
            <div key={`line-${i}`} style={{
              position: 'absolute',
              left: `${t.pct}%`,
              top: LINE_Y - 5,
              width: 1,
              height: 10,
              background: t.isYearBoundary ? '#d1cdc7' : '#E8E5E0',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }} />
          ))}

          {/* Track background — 7px bar */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: LINE_Y - Math.floor(TRACK_H / 2),
            height: TRACK_H, background: '#F0EDE8', borderRadius: 4,
          }} />

          {/* Progress fill: start → today */}
          {todayPct > 0 && (
            <div style={{
              position: 'absolute',
              left: 0,
              width: `${todayPct}%`,
              top: LINE_Y - Math.floor(TRACK_H / 2),
              height: TRACK_H,
              background: 'linear-gradient(90deg, #f0e4d0 0%, #c9a96e 100%)',
              borderRadius: 4,
            }} />
          )}

          {/* ── Start marker ── */}
          <div
            data-ms-dot="1"
            title="Click to edit start date"
            onClick={e => { e.stopPropagation(); setEditingRange('start'); setPendingPct(null); setSelectedId(null) }}
            style={{ position: 'absolute', left: 0, top: LINE_Y + 0.5, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 5 }}
          >
            <div style={{ position: 'absolute', bottom: 'calc(100% + 5px)', left: 0, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Start</div>
              <div style={{ fontSize: '0.55rem', color: '#c4bfb9', marginTop: 1 }}>{formatLabel(toDateStr(startDate))}</div>
            </div>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2px solid #c9a96e', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', transition: 'all 0.15s' }} />
            {editingRange === 'start' && (
              <div data-ms-dot="1" style={{ position: 'absolute', top: 18, left: 0, zIndex: 40, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 10, padding: '0.5rem', boxShadow: '0 6px 24px rgba(0,0,0,0.1)', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <input type="date" value={customStart ?? toDateStr(startDate)} onChange={e => setCustomStart(e.target.value)} className="input-base" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: 130 }} autoFocus />
                <button onClick={() => setEditingRange(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
              </div>
            )}
          </div>

          {/* ── Finish marker ── */}
          <div
            data-ms-dot="1"
            title="Click to edit finish date"
            onClick={e => { e.stopPropagation(); setEditingRange('end'); setPendingPct(null); setSelectedId(null) }}
            style={{ position: 'absolute', left: '100%', top: LINE_Y + 0.5, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 5 }}
          >
            <div style={{ position: 'absolute', bottom: 'calc(100% + 5px)', right: 0, whiteSpace: 'nowrap', pointerEvents: 'none', textAlign: 'right' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Finish</div>
              <div style={{ fontSize: '0.55rem', color: '#c4bfb9', marginTop: 1 }}>{formatLabel(toDateStr(endDate))}</div>
            </div>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2px solid #c4bfb9', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', transition: 'all 0.15s' }} />
            {editingRange === 'end' && (
              <div data-ms-dot="1" style={{ position: 'absolute', top: 18, right: 0, zIndex: 40, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 10, padding: '0.5rem', boxShadow: '0 6px 24px rgba(0,0,0,0.1)', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <input type="date" value={customEnd ?? toDateStr(endDate)} onChange={e => setCustomEnd(e.target.value)} className="input-base" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: 130 }} autoFocus />
                <button onClick={() => setEditingRange(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
              </div>
            )}
          </div>

          {/* ── Today marker ── */}
          <div style={{ position: 'absolute', left: `${todayPct}%`, top: LINE_Y - 12, width: 1.5, height: 24, background: '#c9a96e', transform: 'translateX(-50%)', borderRadius: 1, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: `${todayPct}%`, top: LINE_Y - 24, transform: 'translateX(-50%)', background: '#c9a96e', color: '#fff', fontSize: '0.5rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: 4, whiteSpace: 'nowrap', letterSpacing: '0.05em', pointerEvents: 'none' }}>
            TODAY
          </div>

          {/* ── Hover ghost ── */}
          {hoverPct !== null && hoverDate && pendingPct === null && (
            <>
              <div style={{ position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 0.5, transform: 'translate(-50%, -50%)', width: 18, height: 18, borderRadius: '50%', background: '#c9a96e18', border: '1.5px dashed #c9a96e', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#c9a96e', fontWeight: 700, lineHeight: 1 }}>+</span>
              </div>
              <div style={{ position: 'absolute', left: `${hoverPct}%`, top: LINE_Y + 16, transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#6b7280', whiteSpace: 'nowrap', background: '#fff', padding: '0.15rem 0.45rem', borderRadius: 5, border: '1px solid #E8E5E0', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', pointerEvents: 'none', fontWeight: 500 }}>
                {formatFull(hoverDate)}
              </div>
            </>
          )}

          {/* ── Milestone diamonds ── */}
          {milestones.map(ms => {
            const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === ms.id).map(mt => mt.task_id)
            const linked = tasks.filter(t => linkedIds.includes(t.id))
            const done = linked.filter(t => t.completed_at).length
            const status = getMilestoneStatus(ms, linked, done)
            const pct = pctOf(new Date(ms.target_date))
            const isSelected = selectedId === ms.id
            const isHovered  = hoveredId === ms.id
            const layout = milestoneLayout.get(ms.id) ?? { row: 'above', level: 1 }
            const isAbove = layout.row === 'above'
            const isL2    = layout.level === 2
            const tooltipLabel = `${formatLabel(ms.target_date)}${linked.length > 0 ? ` · ${done}/${linked.length}` : ''}`

            // Label CSS offset from the 22px hit-div (11px radius)
            const labelOffset = isL2 ? L2_OFFSET : L1_OFFSET

            return (
              <div
                key={ms.id}
                data-ms-dot="1"
                onClick={e => { e.stopPropagation(); setPendingPct(null); setSelectedId(isSelected ? null : ms.id); setConfirmDeleteId(null) }}
                onMouseEnter={() => setHoveredId(ms.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ position: 'absolute', left: `${pct}%`, top: LINE_Y + 0.5, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 4, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {/* Connector stem for L2 labels */}
                {isL2 && isAbove && (
                  <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 1, height: L2_OFFSET - L1_OFFSET, background: `${status.color}70`, bottom: `calc(100% + ${L1_OFFSET}px)`, pointerEvents: 'none' }} />
                )}
                {isL2 && !isAbove && (
                  <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 1, height: L2_OFFSET - L1_OFFSET, background: `${status.color}70`, top: `calc(100% + ${L1_OFFSET}px)`, pointerEvents: 'none' }} />
                )}

                {/* Static label — name only, no date */}
                <div style={{
                  position: 'absolute',
                  ...(isAbove
                    ? { bottom: `calc(100% + ${labelOffset}px)` }
                    : { top:    `calc(100% + ${labelOffset}px)` }),
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: isSelected ? status.color : '#374151' }}>{ms.name}</div>
                </div>

                {/* Diamond */}
                <div style={{
                  width: 11,
                  height: 11,
                  transform: 'rotate(45deg)',
                  background: status.color,
                  border: '2.5px solid #fff',
                  boxShadow: isSelected
                    ? `0 0 0 3px ${status.ring}, 0 2px 10px rgba(0,0,0,0.2)`
                    : isHovered
                    ? `0 0 0 2px ${status.color}50, 0 2px 8px rgba(0,0,0,0.2)`
                    : '0 1px 5px rgba(0,0,0,0.18)',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }} />

                {/* Hover tooltip — date + task count, opposite side from label */}
                {isHovered && !isSelected && (
                  <div style={{
                    position: 'absolute',
                    ...(isAbove
                      ? { top: 'calc(100% + 6px)' }     // below diamond (opposite side from above-label)
                      : { bottom: 'calc(100% + 6px)' }), // above diamond (opposite side from below-label)
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1a1a1a',
                    color: '#fff',
                    fontSize: '0.58rem',
                    fontWeight: 500,
                    padding: '0.18rem 0.5rem',
                    borderRadius: 5,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 50,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                  }}>
                    {tooltipLabel}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pending add dot */}
          {pendingPct !== null && (
            <div style={{ position: 'absolute', left: `${pendingPct}%`, top: LINE_Y + 0.5, transform: 'translate(-50%, -50%)', zIndex: 3, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: '#c9a96e', border: '2px solid #fff', boxShadow: '0 0 0 3px #c9a96e33' }} />
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
              top: 'calc(100% - 0.625rem)',
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
              <input
                className="input-base"
                placeholder="Milestone name"
                value={pendingName}
                onChange={e => setPendingName(e.target.value)}
                maxLength={60}
                autoFocus
                required
              />
              <input
                className="input-base"
                type="date"
                value={pendingDate}
                onChange={e => setPendingDate(e.target.value)}
                required
                style={{ padding: '0.35rem 0.625rem' }}
              />
              <div style={{ display: 'flex', gap: '0.375rem', marginTop: 2 }}>
                <button type="submit" className="btn-primary" disabled={adding || !pendingName.trim()} style={{ flex: 1, padding: '0.45rem', fontSize: '0.78rem', justifyContent: 'center' }}>
                  {adding ? '…' : 'Add milestone'}
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setPendingPct(null); setPendingName(''); setPendingDate('') }} style={{ padding: '0.45rem 0.625rem', fontSize: '0.78rem' }}>
                  ✕
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Selected milestone panel ── */}
      {selectedMs && (() => {
        const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === selectedMs.id).map(mt => mt.task_id)
        const linked = tasks.filter(t => linkedIds.includes(t.id))
        const done = linked.filter(t => t.completed_at).length
        const status = getMilestoneStatus(selectedMs, linked, done)
        const pct = pctOf(new Date(selectedMs.target_date))
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
            {/* Color status bar */}
            <div style={{ height: 3, background: status.color }} />

            <div style={{ padding: '0.875rem' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedMs.name}</div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2 }}>
                    {formatLabel(selectedMs.target_date)}
                    {linked.length > 0 && (
                      <span style={{ marginLeft: '0.375rem', fontWeight: 600, color: status.color }}>
                        · {done}/{linked.length} done
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center', flexShrink: 0, marginLeft: '0.5rem' }}>
                  {confirmDeleteId === selectedMs.id ? (
                    <>
                      <button onClick={() => { onDelete(selectedMs.id); setSelectedId(null); setConfirmDeleteId(null) }} style={{ fontSize: '0.7rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(selectedMs.id)}
                      style={{ fontSize: '1rem', color: '#d1cdc7', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 0.2rem' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}
                    >×</button>
                  )}
                  <button onClick={() => setSelectedId(null)} style={{ fontSize: '0.85rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 0.2rem' }}>✕</button>
                </div>
              </div>

              {/* Task progress bar */}
              {linked.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ height: 4, background: '#F0EDE8', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(done / linked.length) * 100}%`, background: status.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              {/* Task list */}
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
                Prerequisite tasks
              </div>
              <div style={{ maxHeight: 168, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                {openTasks.map(t => {
                  const isLinked = linkedIds.includes(t.id)
                  const isDone = !!t.completed_at
                  return (
                    <label
                      key={t.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.3rem 0.4rem', borderRadius: 8, background: isLinked ? `${status.color}14` : 'transparent', transition: 'background 0.1s' }}
                    >
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={() => isLinked ? onUnlinkTask(selectedMs.id, t.id) : onLinkTask(selectedMs.id, t.id)}
                        style={{ accentColor: '#c9a96e', width: 13, height: 13, flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '0.78rem', color: isLinked ? '#1a1a1a' : '#6b7280', fontWeight: isLinked ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textDecoration: isDone && isLinked ? 'line-through' : 'none', opacity: isDone && isLinked ? 0.6 : 1 }}>
                        {t.title}
                      </span>
                      {isDone && isLinked && (
                        <span style={{ fontSize: '0.65rem', color: '#22c55e', flexShrink: 0, fontWeight: 700 }}>✓</span>
                      )}
                    </label>
                  )
                })}
                {openTasks.length === 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#c4bfb9', padding: '0.25rem 0.4rem' }}>No tasks yet — add some to the board first</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Click outside to close ── */}
      {(pendingPct !== null || selectedId !== null || editingRange !== null) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          onClick={() => { setPendingPct(null); setSelectedId(null); setConfirmDeleteId(null); setEditingRange(null) }}
        />
      )}
    </div>
  )
}
