'use client'

import { useState } from 'react'
import { type Column, type Member, type Priority } from '@/lib/types'

type Props = {
  columnId: string
  columns: Column[]
  members: Member[]
  currentMember: Member
  onClose: () => void
  onSubmit: (params: {
    columnId: string
    title: string
    priority: Priority
    dueDate: string | null
    description: string
  }) => Promise<void>
}

export function AddTaskModal({ columnId, columns, members, currentMember, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState(columnId)
  const [submitting, setSubmitting] = useState(false)

  const col = columns.find(c => c.id === selectedColumnId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit({
      columnId: selectedColumnId,
      title: title.trim(),
      priority,
      dueDate: dueDate || null,
      description: description.trim(),
    })
    setSubmitting(false)
  }

  const priorityOptions: { value: Priority; label: string; color: string }[] = [
    { value: 'normal', label: 'Normal', color: '#9ca3af' },
    { value: 'high',   label: 'High',   color: '#ef4444' },
  ]

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1a1a1a' }}>
            New task
            {col && (
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 400, marginLeft: '0.5rem' }}>
                in {col.name}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '0.25rem 0.5rem', fontSize: '1rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <div>
            <input
              className="input-base"
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div>
            <textarea
              className="input-base"
              placeholder="Add details (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              style={{ resize: 'vertical', minHeight: 64 }}
            />
          </div>

          {/* Priority + Due date row */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {/* Priority */}
            <div style={{ flex: 1 }}>
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
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: opt.color }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Due date */}
            <div style={{ flex: 1 }}>
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

          {/* Column selector (if multiple columns) */}
          {columns.length > 1 && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: '0.375rem' }}>
                Column
              </label>
              <select
                className="input-base"
                value={selectedColumnId}
                onChange={e => setSelectedColumnId(e.target.value)}
                style={{ padding: '0.375rem 0.625rem' }}
              >
                {columns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Submit */}
          <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.25rem' }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              style={{ flex: 1, justifyContent: 'center', padding: '0.625rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !title.trim()}
              style={{
                flex: 2,
                justifyContent: 'center',
                padding: '0.625rem',
                opacity: submitting || !title.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
