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
  const [title, setTitle]           = useState(initialTitle ?? '')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate]       = useState('')
  const [priority, setPriority]     = useState<Priority>('normal')
  const [submitting, setSubmitting] = useState(false)

  const col = columns.find(c => c.id === columnId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    await onSubmit({ columnId, title: title.trim(), priority, dueDate: dueDate || null, description: description.trim() })
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E8E5F0',
        }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>
              New Task
            </h2>
            {col && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>→</span>
                <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 500 }}>{col.name}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="btn-icon" style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <div>
            <label className="form-label">Task title <span style={{ color: '#DC2626' }}>*</span></label>
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
            <label className="form-label">Details</label>
            <textarea
              className="input-base"
              placeholder="Add notes or context (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              style={{ resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
            />
          </div>

          {/* Priority + Due date row */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Priority</label>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {(['normal', 'high'] as Priority[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1, padding: '0.4375rem 0.5rem',
                      borderRadius: 7, border: '1.5px solid',
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      borderColor: priority === p ? (p === 'high' ? '#EF4444' : '#7C3AED') : '#E8E5F0',
                      background: priority === p ? (p === 'high' ? '#FEF2F2' : '#EDE9FE') : 'transparent',
                      color: priority === p ? (p === 'high' ? '#EF4444' : '#6D28D9') : '#6B7280',
                      transition: 'all 0.12s ease',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    }}
                  >
                    {p === 'high' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />}
                    {p === 'normal' ? 'Normal' : 'High'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <label className="form-label">Due date</label>
              <input
                className="input-base"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ padding: '0.4375rem 0.75rem' }}
              />
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '0.5625rem' }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !title.trim()}
              style={{ flex: 2, justifyContent: 'center', padding: '0.5625rem' }}
            >
              {submitting ? (
                <>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', display: 'inline-block' }} className="animate-spin" />
                  Adding…
                </>
              ) : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
