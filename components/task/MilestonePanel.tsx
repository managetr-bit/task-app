'use client'

import { useState } from 'react'
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

function getMilestoneStatus(targetDate: string, linkedTasks: Task[], completedCount: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(targetDate)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
  const allDone = linkedTasks.length > 0 && completedCount === linkedTasks.length

  if (allDone) return { color: '#4ade80', bg: '#f0fdf4', label: '✓ Done', dot: '#4ade80' }
  if (diffDays < 0) return { color: '#ef4444', bg: '#fef2f2', label: `${Math.abs(diffDays)}d overdue`, dot: '#ef4444' }
  if (diffDays === 0) return { color: '#f59e0b', bg: '#fffbeb', label: 'Today', dot: '#f59e0b' }
  if (diffDays <= 7) return { color: '#f59e0b', bg: '#fffbeb', label: `${diffDays}d left`, dot: '#f59e0b' }
  return { color: '#9ca3af', bg: '#f9fafb', label: `${diffDays}d`, dot: '#c9a96e' }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MilestonePanel({ milestones, milestoneTasks, tasks, onAdd, onDelete, onLinkTask, onUnlinkTask }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const sorted = [...milestones].sort((a, b) => a.target_date.localeCompare(b.target_date))

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !date) return
    setAdding(true)
    await onAdd(name.trim(), date)
    setName('')
    setDate('')
    setShowAdd(false)
    setAdding(false)
  }

  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem', marginBottom: '0.375rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>Milestones</span>
          {milestones.length > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#F3F4F6', borderRadius: '10px', padding: '0.1rem 0.45rem', fontWeight: 600 }}>
              {milestones.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(p => !p)}
          style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem 0.3rem', borderRadius: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
        >
          +
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} style={{ background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: '12px', padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            className="input-base"
            placeholder="Milestone name"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            autoFocus
            required
          />
          <input
            className="input-base"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            style={{ padding: '0.375rem 0.625rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn-primary" disabled={adding || !name.trim() || !date} style={{ flex: 1, justifyContent: 'center', padding: '0.4rem', fontSize: '0.8rem' }}>
              {adding ? '…' : 'Add'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setShowAdd(false); setName(''); setDate('') }} style={{ flex: 1, justifyContent: 'center', padding: '0.4rem', fontSize: '0.8rem' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {milestones.length === 0 && !showAdd && (
        <div
          onClick={() => setShowAdd(true)}
          style={{ background: '#F3F4F6', border: '1.5px dashed #E8E5E0', borderRadius: '12px', padding: '1rem', textAlign: 'center', cursor: 'pointer', color: '#c4bfb9', fontSize: '0.75rem' }}
        >
          + Add first milestone
        </div>
      )}

      {/* Milestone list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sorted.map(ms => {
          const linkedTaskIds = milestoneTasks.filter(mt => mt.milestone_id === ms.id).map(mt => mt.task_id)
          const linkedTasks = tasks.filter(t => linkedTaskIds.includes(t.id))
          const completedCount = linkedTasks.filter(t => t.completed_at).length
          const status = getMilestoneStatus(ms.target_date, linkedTasks, completedCount)
          const isExpanded = expandedId === ms.id
          const pct = linkedTasks.length > 0 ? Math.round((completedCount / linkedTasks.length) * 100) : 0

          return (
            <div key={ms.id} style={{ background: '#fff', border: '1.5px solid #E8E5E0', borderLeft: `3px solid ${status.dot}`, borderRadius: '12px', padding: '0.75rem', transition: 'border-color 0.15s' }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : ms.id)}
                >
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3 }}>{ms.name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.2rem' }}>{formatDate(ms.target_date)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: status.color, background: status.bg, borderRadius: '6px', padding: '0.15rem 0.4rem', whiteSpace: 'nowrap' }}>
                    {status.label}
                  </span>
                  {confirmDeleteId === ms.id ? (
                    <>
                      <button onClick={() => { onDelete(ms.id); setConfirmDeleteId(null) }} style={{ fontSize: '0.65rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.65rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(ms.id)} style={{ background: 'none', border: 'none', color: '#d1cdc7', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.1rem', lineHeight: 1 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}
                    >×</button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {linkedTasks.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ height: 4, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: status.color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                    {completedCount}/{linkedTasks.length} tasks done
                  </div>
                </div>
              )}

              {/* Linked task chips (collapsed) */}
              {!isExpanded && linkedTasks.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {linkedTasks.slice(0, 3).map(t => (
                    <span key={t.id} style={{ fontSize: '0.65rem', background: '#F3F4F6', color: '#6b7280', borderRadius: '6px', padding: '0.15rem 0.4rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.completed_at ? 'line-through' : 'none' }}>
                      {t.title}
                    </span>
                  ))}
                  {linkedTasks.length > 3 && (
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', padding: '0.15rem 0.2rem' }}>+{linkedTasks.length - 3}</span>
                  )}
                </div>
              )}

              {/* Expanded: task linking */}
              {isExpanded && (
                <div style={{ marginTop: '0.625rem', borderTop: '1px solid #F3F4F6', paddingTop: '0.625rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.375rem' }}>Link tasks as prerequisites</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 160, overflowY: 'auto' }}>
                    {tasks.filter(t => !t.completed_at || linkedTaskIds.includes(t.id)).map(t => {
                      const linked = linkedTaskIds.includes(t.id)
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.25rem 0.375rem', borderRadius: '8px', background: linked ? '#fdf6ed' : 'transparent', transition: 'background 0.1s' }}>
                          <input
                            type="checkbox"
                            checked={linked}
                            onChange={() => linked ? onUnlinkTask(ms.id, t.id) : onLinkTask(ms.id, t.id)}
                            style={{ accentColor: '#c9a96e', width: 13, height: 13, flexShrink: 0 }}
                          />
                          <span style={{ fontSize: '0.75rem', color: linked ? '#c9a96e' : '#4b5563', fontWeight: linked ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.title}
                          </span>
                        </label>
                      )
                    })}
                    {tasks.filter(t => !t.completed_at || linkedTaskIds.includes(t.id)).length === 0 && (
                      <p style={{ fontSize: '0.72rem', color: '#c4bfb9' }}>No open tasks to link</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
