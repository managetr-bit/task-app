'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type LocalNote = {
  id: string
  content: string
  author_name: string
  created_at: string
}

type Props = {
  boardId: string
  authorName: string
  onConvertToTask: (content: string) => void
  onCollapse?: () => void
  cloudScriptUrl?: string
  driveFolderId?: string
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

function storageKey(boardId: string) {
  return `notes_${boardId}`
}

function loadNotes(boardId: string): LocalNote[] {
  try {
    const raw = localStorage.getItem(storageKey(boardId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNotes(boardId: string, notes: LocalNote[]) {
  try { localStorage.setItem(storageKey(boardId), JSON.stringify(notes)) } catch { /* ignore */ }
}

export function NotesPanel({ boardId, authorName, onConvertToTask, onCollapse, cloudScriptUrl, driveFolderId }: Props) {
  const [notes, setNotes] = useState<LocalNote[]>([])
  const [draft, setDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle')
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Load from localStorage on mount
  useEffect(() => { setNotes(loadNotes(boardId)) }, [boardId])

  const addNote = useCallback((content: string) => {
    const note: LocalNote = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      content,
      author_name: authorName,
      created_at: new Date().toISOString(),
    }
    setNotes(prev => {
      const updated = [note, ...prev]
      saveNotes(boardId, updated)
      return updated
    })
  }, [boardId, authorName])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const updated = prev.filter(n => n.id !== id)
      saveNotes(boardId, updated)
      return updated
    })
  }, [boardId])

  function handleSave() {
    const content = draft.trim()
    if (!content) return
    addNote(content)
    setDraft('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
  }

  async function exportToDrive() {
    if (!cloudScriptUrl || notes.length === 0) return
    setDriveStatus('uploading')
    const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
    const text = notes
      .map(n => `[${new Date(n.created_at).toLocaleString('en-GB')}] ${n.author_name}\n${n.content}`)
      .join('\n\n---\n\n')
    try {
      const res = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: cloudScriptUrl,
          fileName: `notes-${date}.txt`,
          data: text,
          folder: 'notes',
          parentFolderId: driveFolderId,
        }),
      })
      const json = await res.json()
      setDriveStatus(json.success ? 'ok' : 'error')
    } catch {
      setDriveStatus('error')
    }
    setTimeout(() => setDriveStatus('idle'), 3000)
  }

  const sorted = [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAFA', borderLeft: '1.5px solid #E8E5E0', width: 300, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: '0.35rem 0.75rem', borderBottom: '1px solid #F0EDE8', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</span>
        {notes.length > 0 && (
          <span style={{ fontSize: '0.6rem', color: '#c4bfb9', background: '#F3F4F6', borderRadius: 10, padding: '0.05rem 0.45rem', fontWeight: 600 }}>{notes.length}</span>
        )}
        {/* Export to Drive */}
        {cloudScriptUrl && notes.length > 0 && (
          <button
            onClick={exportToDrive}
            disabled={driveStatus === 'uploading'}
            title="Export all notes to Drive"
            style={{
              fontSize: '0.6rem', padding: '0.15rem 0.4rem', borderRadius: 6,
              border: '1px solid #E8E5E0', background: '#fff',
              color: driveStatus === 'ok' ? '#22c55e' : driveStatus === 'error' ? '#ef4444' : '#9ca3af',
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            {driveStatus === 'uploading' ? '…' : driveStatus === 'ok' ? '✓ Drive' : driveStatus === 'error' ? '✗' : '↑ Drive'}
          </button>
        )}
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
          disabled={!draft.trim()}
          style={{
            marginTop: '0.375rem', width: '100%', padding: '0.4rem',
            background: draft.trim() ? '#c9a96e' : '#E8E5E0',
            color: draft.trim() ? '#fff' : '#c4bfb9',
            border: 'none', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600,
            cursor: draft.trim() ? 'pointer' : 'default', transition: 'background 0.15s',
          }}
        >
          + Save note
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
            style={{ background: '#fff', border: '1.5px solid #F0EDE8', borderRadius: 10, padding: '0.625rem 0.75rem' }}
          >
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#1a1a1a', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {note.content}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#c4bfb9' }}>
                {note.author_name ? `${note.author_name} · ` : ''}{timeAgo(note.created_at)}
              </span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  onClick={() => onConvertToTask(note.content)}
                  title="Convert to task"
                  style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6, border: '1px solid #E8E5E0', background: '#F9F7F5', color: '#c9a96e', cursor: 'pointer', fontWeight: 600 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0' }}
                >
                  → Task
                </button>
                {confirmDeleteId === note.id ? (
                  <>
                    <button onClick={() => { deleteNote(note.id); setConfirmDeleteId(null) }}
                      style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6, border: '1px solid #ef4444', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
                      ✓
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)}
                      style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: 6, border: '1px solid #E8E5E0', background: '#F9F7F5', color: '#9ca3af', cursor: 'pointer' }}>
                      ✕
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDeleteId(note.id)} title="Delete"
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: '#d1cdc7', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#d1cdc7' }}>
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
