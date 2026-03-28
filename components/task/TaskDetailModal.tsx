'use client'

import { useState } from 'react'
import { type Task, type Member, type Milestone, type MilestoneTask } from '@/lib/types'
import { Avatar } from './MembersBar'

type Props = {
  task: Task
  members: Member[]
  currentMember: Member
  milestones?: Milestone[]
  milestoneTasks?: MilestoneTask[]
  onClose: () => void
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onUpdate: (taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'due_date'>>) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
}

function formatDue(dateStr: string) {
  const due  = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff  = Math.round((due.getTime() - today.getTime()) / 86400000)
  const label = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (diff < 0)  return { label: `Overdue · ${label}`,   cls: 'badge badge-red'   }
  if (diff === 0) return { label: `Due today · ${label}`, cls: 'badge badge-amber' }
  if (diff <= 7)  return { label,                         cls: 'badge badge-amber' }
  return                  { label,                         cls: 'badge badge-gray'  }
}

export function TaskDetailModal({ task, members, currentMember, milestones, milestoneTasks, onClose, onAssign, onUpdate, onDelete }: Props) {
  const [editing, setEditing]         = useState(false)
  const [title, setTitle]             = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [dueDate, setDueDate]         = useState(task.due_date ?? '')
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const creator = task.created_by ? members.find(m => m.id === task.created_by) : null
  const linkedMilestones = milestones && milestoneTasks
    ? milestones.filter(m => milestoneTasks.some(mt => mt.milestone_id === m.id && mt.task_id === task.id))
    : []
  const dueBadge = task.due_date && !editing ? formatDue(task.due_date) : null

  async function handleSave() {
    setSaving(true)
    await onUpdate(task.id, {
      title: title.trim() || task.title,
      description: description.trim() || null,
      due_date: dueDate || null,
    })
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(task.id)
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: 520 }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E8E5F0',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input
                className="input-base"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
                style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em' }}
              />
            ) : (
              <h2
                onClick={() => setEditing(true)}
                style={{
                  fontSize: '1rem', fontWeight: 700, color: '#111827',
                  lineHeight: 1.4, cursor: 'pointer', letterSpacing: '-0.01em',
                  wordBreak: 'break-word',
                }}
                title="Click to edit"
              >
                {task.title}
              </h2>
            )}
            {/* Status badges row */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem' }}>
              {dueBadge && (
                <span className={dueBadge.cls}>{dueBadge.label}</span>
              )}
              {task.priority === 'high' && (
                <span className="badge badge-red">
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                  High priority
                </span>
              )}
              {task.completed_at && (
                <span className="badge badge-green">✓ Completed</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Description */}
          <div>
            <label className="form-label">Details</label>
            {editing ? (
              <textarea
                className="input-base"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Add description or notes…"
                style={{ resize: 'vertical', lineHeight: 1.5 }}
              />
            ) : (
              <p
                onClick={() => setEditing(true)}
                style={{
                  fontSize: '0.875rem',
                  color: description ? '#374151' : '#C4BFBA',
                  cursor: 'pointer', lineHeight: 1.6,
                }}
              >
                {description || 'No details — click to add'}
              </p>
            )}
          </div>

          {/* Due date (edit mode) */}
          {editing && (
            <div>
              <label className="form-label">Due date</label>
              <input
                className="input-base"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ padding: '0.4375rem 0.75rem' }}
              />
            </div>
          )}

          {/* Assignee */}
          <div>
            <label className="form-label">Assigned to</label>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => onAssign(task.id, null)}
                style={{
                  padding: '0.3rem 0.625rem', borderRadius: '7px',
                  border: `1.5px solid ${!task.assigned_to ? '#7C3AED' : '#E8E5F0'}`,
                  background: !task.assigned_to ? '#EDE9FE' : 'transparent',
                  color: !task.assigned_to ? '#6D28D9' : '#6B7280',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.12s ease',
                }}
              >
                Unassigned
              </button>
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => onAssign(task.id, m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.3rem 0.625rem', borderRadius: '7px',
                    border: `1.5px solid ${task.assigned_to === m.id ? m.color : '#E8E5F0'}`,
                    background: task.assigned_to === m.id ? `${m.color}18` : 'transparent',
                    cursor: 'pointer', transition: 'all 0.12s ease', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (task.assigned_to !== m.id) (e.currentTarget as HTMLButtonElement).style.borderColor = m.color }}
                  onMouseLeave={e => { if (task.assigned_to !== m.id) (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5F0' }}
                >
                  <Avatar member={m} isCurrent={m.id === currentMember.id} small />
                  <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 500 }}>
                    {m.id === currentMember.id ? `${m.nickname} (you)` : m.nickname}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Linked milestones */}
          {linkedMilestones.length > 0 && (
            <div>
              <label className="form-label">Milestones</label>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {linkedMilestones.map(m => (
                  <span key={m.id} className="badge badge-purple">
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1l1.18 2.39 2.64.38-1.91 1.86.45 2.63L5 7.1 2.64 8.26l.45-2.63L1.18 3.77l2.64-.38z" fill="currentColor"/>
                    </svg>
                    {m.name} · {new Date(m.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          padding: '0.875rem 1.5rem',
          borderTop: '1px solid #E2DFD9',
          background: '#F5F3FF', borderRadius: '0 0 16px 16px',
        }}>
          <div>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Delete this task?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {deleting ? '…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ fontSize: '0.75rem', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  fontSize: '0.75rem', fontWeight: 500, color: '#9CA3AF',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
              >
                Delete task
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {creator && (
              <span style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginRight: '0.25rem' }}>
                by {creator.nickname}
              </span>
            )}
            {editing ? (
              <>
                <button
                  type="button" className="btn-secondary"
                  onClick={() => { setEditing(false); setTitle(task.title); setDescription(task.description ?? ''); setDueDate(task.due_date ?? '') }}
                  style={{ padding: '0.4375rem 0.875rem', fontSize: '0.875rem' }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: '0.4375rem 1rem', fontSize: '0.875rem' }}
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setEditing(true)}
                style={{ padding: '0.4375rem 0.875rem', fontSize: '0.875rem' }}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
