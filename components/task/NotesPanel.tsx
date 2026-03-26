'use client'

import { useState, useRef } from 'react'
import { type BoardNote, type Column } from '@/lib/types'

type Props = {
  notes: BoardNote[]
  columns: Column[]
  boardId: string
  authorName: string
  onAddNote: (content: string) => Promise<void>
  onDeleteNote: (noteId: string) => Promise<void>
  onConvertToTask: (content: string) => void  // opens add-task flow with pre-filled text
  onCollapse?: () => void
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function NotesPanel({ notes, boardId: _boardId, authorName: _authorName, onAddNote, onDeleteNote, onConvertToTask, onCollapse }: Props) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const sorted = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  async function handleSave() {
    const content = draft.trim()
    if (!content) return
    setSaving(true)
    await onAddNote(content)
    setDraft('')
    setSaving(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAFA', borderLeft: '1.5px solid #E8E5E0', width: 300, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '0.35rem 0.75rem 0.35rem', borderBottom: '1px solid #F0EDE8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</span>
        {notes.length > 0 && <span style={{ fontSize: '0.6rem', color: '#c4bfb9', background: '#F3F4F6', borderRadius: 10, padding: '0.05rem 0.45rem', fontWeight: 600 }}>{notes.length}</span>}
        {onCollapse && (
          <button onClick={onCollapse} title="Collapse notes" style={{ marginLeft: 'auto', color: '#c9a96e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* New note input */}
      <div style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid #F0EDE8', flexShrink: 0 }}>
        <textarea
          ref={textRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Quick note… (⌘↵ to save)"
          rows={3}
          style={{
            width: '100%', resize: 'none', border: '1.5px solid #E8E5E0', borderRadius: 10,
            padding: '0.5rem 0.625rem', fontSize: '0.8rem', color: '#1a1a1a',
            background: '#fff', outline: 'none', fontFamily: 'inherit', lineHeight: 1.45,
            boxSizing: 'border-box',
          }}
          onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#c9a96e' }}
          onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#E8E5E0' }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !draft.trim()}
          style={{
            marginTop: '0.375rem', width: '100%', padding: '0.4rem',
            background: draft.trim() ? '#c9a96e' : '#E8E5E0', color: draft.trim() ? '#fff' : '#c4bfb9',
            border: 'none', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
            cursor: draft.trim() ? 'pointer' : 'default', transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : '+ Save note'}
        </button>
      </div>

      {/* Notes list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#c4bfb9', fontSize: '0.75rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📝</div>
            No notes yet
          </div>
        )}
        {sorted.map(note => (
          <div
            key={note.id}
            style={{
              background: '#fff', border: '1.5px solid #F0EDE8', borderRadius: 10,
              padding: '0.625rem 0.75rem', position: 'relative',
            }}
          >
            {/* Note body */}
            <p style={{
              margin: 0, fontSize: '0.8rem', color: '#1a1a1a', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {note.content}
            </p>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#c4bfb9' }}>
                {note.author_name ? `${note.author_name} · ` : ''}{timeAgo(note.created_at)}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {/* Convert to task */}
                <button
                  onClick={() => onConvertToTask(note.content)}
                  title="Convert to task"
                  style={{
                    fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6,
                    border: '1px solid #E8E5E0', background: '#F9F7F5', color: '#c9a96e',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0' }}
                >
                  → Task
                </button>
                {/* Delete */}
                {confirmDeleteId === note.id ? (
                  <>
                    <button
                      onClick={async () => { await onDeleteNote(note.id); setConfirmDeleteId(null) }}
                      style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ✓ Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6, border: '1px solid #E8E5E0', background: '#F9F7F5', color: '#9ca3af', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(note.id)}
                    title="Delete note"
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#d1cdc7', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
