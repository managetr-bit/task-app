'use client'

import { useState } from 'react'
import { type Column, type Member, type Priority } from '@/lib/types'

type Props = {
  columnId: string
  columns: Column[]
  members: Member[]
  currentMember: Member
  initialTitle?: string
  onClose: () => void
  onSubmit: (params: {
    columnId: string
    title: string
    priority: Priority
    dueDate: string | null
    description: string
  }) => Promise<void>
}

export function AddTaskModal({ columnId, columns, initialTitle, onClose, onSubmit }: Props) {
  const [title, setTitle] = useState(initialTitle ?? '')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const col = columns.find(c => c.id === columnId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit({
      columnId,
      title: title.trim(),
      priority: 'normal',
      dueDate: dueDate || null,
      description: description.trim(),
    })
    setSubmitting(false)
  }

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

          {/* Description */}
          <textarea
            className="input-base"
            placeholder="Add details (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            style={{ resize: 'vertical', minHeight: 64 }}
          />

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
