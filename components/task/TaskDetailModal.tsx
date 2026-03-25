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

export function TaskDetailModal({ task, members, currentMember, milestones, milestoneTasks, onClose, onAssign, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const creator = task.created_by ? members.find(m => m.id === task.created_by) : null
  const linkedMilestones = milestones && milestoneTasks
    ? milestones.filter(m => milestoneTasks.some(mt => mt.milestone_id === m.id && mt.task_id === task.id))
    : []

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
      <div className="modal-card" style={{ padding: '2rem', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {editing ? (
            <input
              className="input-base"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              style={{ fontSize: '1rem', fontWeight: 600, flex: 1 }}
            />
          ) : (
            <h2
              style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4, flex: 1, cursor: 'pointer' }}
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
          )}
          <button onClick={onClose} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>

        {/* Due date badge (view mode) */}
        {task.due_date && !editing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', background: '#fffbeb', color: '#d97706', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 500 }}>
              Due {task.due_date}
            </span>
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.375rem' }}>
            Description
          </label>
          {editing ? (
            <textarea
              className="input-base"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Add details…"
              style={{ resize: 'vertical' }}
            />
          ) : (
            <p
              style={{ fontSize: '0.875rem', color: description ? '#4b5563' : '#c4bfb9', cursor: 'pointer', lineHeight: 1.5 }}
              onClick={() => setEditing(true)}
            >
              {description || 'No description — click to add one'}
            </p>
          )}
        </div>

        {/* Due date (edit mode) */}
        {editing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.375rem' }}>
              Due date
            </label>
            <input
              className="input-base"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ padding: '0.375rem 0.625rem' }}
            />
          </div>
        )}

        {/* Assignee */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>
            Assigned to
          </label>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => onAssign(task.id, null)}
              style={{ padding: '0.3rem 0.6rem', borderRadius: '8px', border: `1.5px solid ${!task.assigned_to ? '#c9a96e' : '#E8E5E0'}`, background: !task.assigned_to ? '#fdf6ed' : 'transparent', color: !task.assigned_to ? '#c9a96e' : '#9ca3af', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer' }}
            >
              Unassigned
            </button>
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => onAssign(task.id, m.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.6rem', borderRadius: '8px', border: `1.5px solid ${task.assigned_to === m.id ? m.color : '#E8E5E0'}`, background: task.assigned_to === m.id ? `${m.color}18` : 'transparent', cursor: 'pointer', transition: 'all 0.15s ease' }}
              >
                <Avatar member={m} isCurrent={m.id === currentMember.id} small />
                <span style={{ fontSize: '0.75rem', color: '#4b5563', fontWeight: 500 }}>
                  {m.id === currentMember.id ? `${m.nickname} (you)` : m.nickname}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Linked milestones */}
        {linkedMilestones.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.375rem' }}>
              Milestones
            </label>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {linkedMilestones.map(m => (
                <span key={m.id} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#fdf6ed', color: '#c9a96e', fontWeight: 500, border: '1px solid #f0e4d0', whiteSpace: 'nowrap' }}>
                  {m.name} · {new Date(m.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Delete?</span>
                <button onClick={handleDelete} disabled={deleting} style={{ fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {deleting ? '…' : 'Yes'}
                </button>
                <button onClick={() => setConfirmDelete(false)} style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-ghost" style={{ fontSize: '0.8rem', color: '#c4bfb9', padding: '0.375rem 0.5rem' }}>
                Delete
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {editing ? (
              <>
                <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setTitle(task.title); setDescription(task.description ?? ''); setDueDate(task.due_date ?? '') }} style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button className="btn-primary" onClick={() => setEditing(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', background: '#f3f4f6', color: '#4b5563' }}>
                Edit
              </button>
            )}
          </div>
        </div>

        {creator && (
          <p style={{ marginTop: '1rem', fontSize: '0.7rem', color: '#c4bfb9' }}>
            Created by {creator.nickname} · {new Date(task.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
