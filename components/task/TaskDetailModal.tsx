'use client'

import { useState } from 'react'
import { type Task, type Column, type Member, type Priority, PRIORITY_CONFIG } from '@/lib/types'
import { Avatar } from './MembersBar'

type Props = {
  task: Task
  columns: Column[]
  members: Member[]
  currentMember: Member
  onClose: () => void
  onMove: (taskId: string, colId: string) => Promise<void>
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onUpdate: (taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date'>>) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
}

export function TaskDetailModal({
  task,
  columns,
  members,
  currentMember,
  onClose,
  onMove,
  onAssign,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const assignee = task.assigned_to ? members.find(m => m.id === task.assigned_to) : null
  const currentCol = columns.find(c => c.id === task.column_id)
  const creator = task.created_by ? members.find(m => m.id === task.created_by) : null

  async function handleSave() {
    setSaving(true)
    await onUpdate(task.id, {
      title: title.trim() || task.title,
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
    })
    setSaving(false)
    setEditing(false)
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(task.id)
  }

  const priorityOptions: { value: Priority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: '#9ca3af' },
    { value: 'medium', label: 'Medium', color: '#f59e0b' },
    { value: 'high', label: 'High', color: '#ef4444' },
  ]

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="modal-card"
        style={{ padding: '2rem', maxWidth: 520 }}
      >
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
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: '#1a1a1a',
                lineHeight: 1.4,
                flex: 1,
                cursor: 'pointer',
              }}
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
          )}
          <button onClick={onClose} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', flexShrink: 0 }}>✕</button>
        </div>

        {/* Column badge + Priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {currentCol && (
            <span style={{ fontSize: '0.75rem', background: '#F3F4F6', color: '#6b7280', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 500 }}>
              {currentCol.name}
            </span>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              background: `${PRIORITY_CONFIG[task.priority].color}18`,
              color: PRIORITY_CONFIG[task.priority].color,
              borderRadius: '6px',
              padding: '0.2rem 0.5rem',
              fontWeight: 600,
            }}
          >
            {PRIORITY_CONFIG[task.priority].label}
          </span>
          {task.due_date && (
            <span style={{ fontSize: '0.75rem', background: '#fffbeb', color: '#d97706', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: 500 }}>
              Due {task.due_date}
            </span>
          )}
        </div>

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

        {/* Assignee row */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>
            Assigned to
          </label>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => onAssign(task.id, null)}
              style={{
                padding: '0.3rem 0.6rem',
                borderRadius: '8px',
                border: `1.5px solid ${!task.assigned_to ? '#c9a96e' : '#E8E5E0'}`,
                background: !task.assigned_to ? '#fdf6ed' : 'transparent',
                color: !task.assigned_to ? '#c9a96e' : '#9ca3af',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Unassigned
            </button>
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => onAssign(task.id, m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '8px',
                  border: `1.5px solid ${task.assigned_to === m.id ? m.color : '#E8E5E0'}`,
                  background: task.assigned_to === m.id ? `${m.color}18` : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Avatar member={m} isCurrent={m.id === currentMember.id} small />
                <span style={{ fontSize: '0.75rem', color: '#4b5563', fontWeight: 500 }}>
                  {m.id === currentMember.id ? `${m.nickname} (you)` : m.nickname}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Move column */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.5rem' }}>
            Move to
          </label>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {columns.map(c => (
              <button
                key={c.id}
                onClick={() => { onMove(task.id, c.id); onClose() }}
                disabled={c.id === task.column_id}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '8px',
                  border: `1.5px solid ${c.id === task.column_id ? '#c9a96e' : '#E8E5E0'}`,
                  background: c.id === task.column_id ? '#fdf6ed' : 'transparent',
                  color: c.id === task.column_id ? '#c9a96e' : '#9ca3af',
                  fontSize: '0.75rem',
                  fontWeight: c.id === task.column_id ? 600 : 400,
                  cursor: c.id === task.column_id ? 'default' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Edit mode extras */}
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* Priority */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.375rem' }}>
                Priority
              </label>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    style={{
                      flex: 1,
                      padding: '0.375rem 0.25rem',
                      border: `1.5px solid ${priority === opt.value ? opt.color : '#E8E5E0'}`,
                      borderRadius: '8px',
                      background: priority === opt.value ? `${opt.color}18` : 'transparent',
                      color: priority === opt.value ? opt.color : '#9ca3af',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Due date */}
            <div>
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
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          {/* Delete */}
          <div>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  {deleting ? '…' : 'Yes'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-ghost"
                style={{ fontSize: '0.8rem', color: '#c4bfb9', padding: '0.375rem 0.5rem' }}
              >
                Delete
              </button>
            )}
          </div>

          {/* Save / Edit */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {editing ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditing(false)
                    setTitle(task.title)
                    setDescription(task.description ?? '')
                    setPriority(task.priority)
                    setDueDate(task.due_date ?? '')
                  }}
                  style={{ padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                className="btn-primary"
                onClick={() => setEditing(true)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', background: '#f3f4f6', color: '#4b5563' }}
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Creator info */}
        {creator && (
          <p style={{ marginTop: '1rem', fontSize: '0.7rem', color: '#c4bfb9' }}>
            Created by {creator.nickname} · {new Date(task.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
