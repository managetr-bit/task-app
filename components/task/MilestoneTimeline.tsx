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
  if (allDone) return { color: '#4ade80', ring: '#bbf7d0' }
  if (diff < 0)  return { color: '#ef4444', ring: '#fecaca' }
  if (diff <= 7) return { color: '#f59e0b', ring: '#fde68a' }
  return { color: '#c9a96e', ring: '#f0e4d0' }
}

export function MilestoneTimeline({ milestones, milestoneTasks, tasks, onAdd, onDelete, onLinkTask, onUnlinkTask }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)

  // pending: click on empty spot → show name input
  const [pendingPct, setPendingPct] = useState<number | null>(null)
  const [pendingDate, setPendingDate] = useState<string>('')
  const [pendingName, setPendingName] = useState('')
  const [adding, setAdding] = useState(false)

  // selected milestone → show task-link popover
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // editable range endpoints
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

  // ── Tick marks: weekly if span ≤ 60 days, monthly otherwise ──
  const useWeekly = totalDays <= 60
  const monthTicks: { label: string; pct: number }[] = []
  if (useWeekly) {
    // Start from first Monday on or after startDate
    const tick = new Date(startDate)
    tick.setDate(tick.getDate() + ((8 - tick.getDay()) % 7 || 7))
    while (tick <= endDate) {
      monthTicks.push({ label: tick.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), pct: pctOf(tick) })
      tick.setDate(tick.getDate() + 7)
    }
  } else {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    cursor.setMonth(cursor.getMonth() + 1)
    while (cursor <= endDate) {
      monthTicks.push({ label: cursor.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), pct: pctOf(cursor) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  // ── Mouse handlers on bar ──
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
    // Don't trigger if clicking on a milestone dot
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

  return (
    <div style={{ padding: '1rem 1.5rem 0', flexShrink: 0, position: 'relative' }}>
      {/* Timeline bar */}
      <div
        ref={barRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleBarClick}
        style={{ position: 'relative', height: 64, cursor: 'crosshair', userSelect: 'none' }}
      >
        {/* Month labels */}
        {monthTicks.map((t, i) => (
          <div key={i} style={{ position: 'absolute', left: `${t.pct}%`, top: 0, transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#c4bfb9', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {t.label}
          </div>
        ))}

        {/* The line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 28, height: 2, background: '#E8E5E0', borderRadius: 2 }} />

        {/* Start handle */}
        <div
          data-ms-dot="1"
          title="Click to set start date"
          onClick={e => { e.stopPropagation(); setEditingRange('start'); setPendingPct(null); setSelectedId(null) }}
          style={{ position: 'absolute', left: 0, top: 20, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 3 }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8E5E0', border: '2px solid #c9a96e', transition: 'all 0.15s' }} />
          {editingRange === 'start' && (
            <div style={{ position: 'absolute', top: 18, left: 0, zIndex: 10, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 8, padding: '0.4rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              <input type="date" value={customStart ?? toDateStr(startDate)} onChange={e => setCustomStart(e.target.value)} className="input-base" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: 130 }} autoFocus />
              <button onClick={() => setEditingRange(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          )}
        </div>

        {/* End handle */}
        <div
          data-ms-dot="1"
          title="Click to set end date"
          onClick={e => { e.stopPropagation(); setEditingRange('end'); setPendingPct(null); setSelectedId(null) }}
          style={{ position: 'absolute', right: 0, top: 20, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 3 }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8E5E0', border: '2px solid #c9a96e', transition: 'all 0.15s' }} />
          {editingRange === 'end' && (
            <div style={{ position: 'absolute', top: 18, right: 0, zIndex: 10, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 8, padding: '0.4rem', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              <input type="date" value={customEnd ?? toDateStr(endDate)} onChange={e => setCustomEnd(e.target.value)} className="input-base" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: 130 }} autoFocus />
              <button onClick={() => setEditingRange(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
            </div>
          )}
        </div>

        {/* Today marker */}
        <div style={{ position: 'absolute', left: `${todayPct}%`, top: 20, width: 2, height: 18, background: '#c9a96e', borderRadius: 2, transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', left: `${todayPct}%`, top: 10, transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#c9a96e', fontWeight: 700, whiteSpace: 'nowrap' }}>today</div>

        {/* Hover ghost dot */}
        {hoverPct !== null && hoverDate && pendingPct === null && (
          <>
            <div style={{ position: 'absolute', left: `${hoverPct}%`, top: 22, width: 12, height: 12, borderRadius: '50%', background: '#E8E5E0', border: '2px dashed #c9a96e', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: `${hoverPct}%`, top: 40, transform: 'translateX(-50%)', fontSize: '0.65rem', color: '#9ca3af', whiteSpace: 'nowrap', background: '#fff', padding: '0.1rem 0.3rem', borderRadius: 4, border: '1px solid #E8E5E0', pointerEvents: 'none' }}>
              {formatFull(hoverDate)}
            </div>
          </>
        )}

        {/* Milestone dots */}
        {milestones.map(ms => {
          const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === ms.id).map(mt => mt.task_id)
          const linked = tasks.filter(t => linkedIds.includes(t.id))
          const done = linked.filter(t => t.completed_at).length
          const status = getMilestoneStatus(ms, linked, done)
          const pct = pctOf(new Date(ms.target_date))
          const isSelected = selectedId === ms.id

          return (
            <div
              key={ms.id}
              data-ms-dot="1"
              onClick={e => { e.stopPropagation(); setPendingPct(null); setSelectedId(isSelected ? null : ms.id); setConfirmDeleteId(null) }}
              style={{ position: 'absolute', left: `${pct}%`, top: 22, transform: 'translate(-50%, -50%)', cursor: 'pointer', zIndex: 2 }}
            >
              {/* Dot */}
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: status.color, border: `3px solid ${isSelected ? '#fff' : status.ring}`, boxShadow: isSelected ? `0 0 0 3px ${status.color}` : 'none', transition: 'all 0.15s ease' }} />
              {/* Label below */}
              <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#1a1a1a', marginTop: 2 }}>{ms.name}</div>
                <div style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{formatLabel(ms.target_date)}{linked.length > 0 ? ` · ${done}/${linked.length}` : ''}</div>
              </div>
            </div>
          )
        })}

        {/* Pending add dot */}
        {pendingPct !== null && (
          <div style={{ position: 'absolute', left: `${pendingPct}%`, top: 22, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#c9a96e', border: '3px solid #fdf6ed' }} />
          </div>
        )}
      </div>

      {/* Pending: add milestone form (floating) */}
      {pendingPct !== null && (
        <div
          style={{
            position: 'absolute',
            left: `clamp(8px, calc(${pendingPct}% + 1.5rem - 100px), calc(100% - 220px))`,
            top: 72,
            zIndex: 30,
            background: '#fff',
            border: '1.5px solid #E8E5E0',
            borderRadius: 12,
            padding: '0.75rem',
            width: 220,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          }}
        >
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
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button type="submit" className="btn-primary" disabled={adding || !pendingName.trim()} style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem', justifyContent: 'center' }}>
                {adding ? '…' : 'Add'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setPendingPct(null); setPendingName(''); setPendingDate('') }} style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem', justifyContent: 'center' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected milestone popover */}
      {selectedMs && (() => {
        const linkedIds = milestoneTasks.filter(mt => mt.milestone_id === selectedMs.id).map(mt => mt.task_id)
        const pct = pctOf(new Date(selectedMs.target_date))
        return (
          <div
            style={{
              position: 'absolute',
              left: `clamp(8px, calc(${pct}% + 1.5rem - 130px), calc(100% - 270px))`,
              top: 72,
              zIndex: 30,
              background: '#fff',
              border: '1.5px solid #E8E5E0',
              borderRadius: 12,
              padding: '0.75rem',
              width: 260,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a1a1a' }}>{selectedMs.name}</div>
                <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{formatLabel(selectedMs.target_date)}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {confirmDeleteId === selectedMs.id ? (
                  <>
                    <button onClick={() => { onDelete(selectedMs.id); setSelectedId(null); setConfirmDeleteId(null) }} style={{ fontSize: '0.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.7rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(selectedMs.id)} style={{ fontSize: '0.75rem', color: '#d1cdc7', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}
                  >×</button>
                )}
                <button onClick={() => setSelectedId(null)} style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.25rem' }}>✕</button>
              </div>
            </div>

            {/* Task linking */}
            <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.375rem' }}>Prerequisite tasks</div>
            <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {tasks.filter(t => !t.completed_at || linkedIds.includes(t.id)).map(t => {
                const linked = linkedIds.includes(t.id)
                return (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.25rem 0.375rem', borderRadius: 8, background: linked ? '#fdf6ed' : 'transparent' }}>
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={() => linked ? onUnlinkTask(selectedMs.id, t.id) : onLinkTask(selectedMs.id, t.id)}
                      style={{ accentColor: '#c9a96e', width: 13, height: 13, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.75rem', color: linked ? '#c9a96e' : '#4b5563', fontWeight: linked ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                  </label>
                )
              })}
              {tasks.filter(t => !t.completed_at || linkedIds.includes(t.id)).length === 0 && (
                <p style={{ fontSize: '0.72rem', color: '#c4bfb9' }}>No open tasks yet</p>
              )}
            </div>
          </div>
        )
      })()}

      {/* Click outside to close */}
      {(pendingPct !== null || selectedId !== null || editingRange !== null) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          onClick={() => { setPendingPct(null); setSelectedId(null); setConfirmDeleteId(null); setEditingRange(null) }}
        />
      )}

      {/* Hint */}
      {milestones.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#c4bfb9', marginTop: '0.25rem', paddingBottom: '0.5rem' }}>
          Click anywhere on the timeline to add a milestone
        </div>
      )}
    </div>
  )
}
