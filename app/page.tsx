'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEFAULT_COLUMNS, type LocalSession } from '@/lib/types'

type RecentBoard = { boardId: string; name: string; nickname: string; visitedAt: string }

export default function LandingPage() {
  const router = useRouter()
  const [boardName, setBoardName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [recentBoards, setRecentBoards] = useState<RecentBoard[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    // Load recent boards from localStorage
    try {
      const raw = localStorage.getItem('task_recent_boards')
      if (raw) setRecentBoards(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  function isCreator(boardId: string) {
    try { return localStorage.getItem(`task_creator_${boardId}`) === 'true' } catch { return false }
  }

  async function handleDeleteBoard(boardId: string) {
    setDeletingId(boardId)
    await supabase.from('boards').delete().eq('id', boardId)
    try {
      localStorage.removeItem(`task_creator_${boardId}`)
      const raw = localStorage.getItem('task_recent_boards')
      if (raw) {
        const list = JSON.parse(raw).filter((b: RecentBoard) => b.boardId !== boardId)
        localStorage.setItem('task_recent_boards', JSON.stringify(list))
      }
    } catch { /* ignore */ }
    setRecentBoards(prev => prev.filter(b => b.boardId !== boardId))
    setConfirmDeleteId(null)
    setDeletingId(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = boardName.trim()
    if (!name) return
    setCreating(true)
    setError('')

    // 1. Create board
    const { data: board, error: boardErr } = await supabase
      .from('boards')
      .insert({ name })
      .select()
      .single()

    if (boardErr || !board) {
      setError('Could not create board. Check your connection and try again.')
      setCreating(false)
      return
    }

    // 2. Seed default columns
    const cols = DEFAULT_COLUMNS.map(c => ({ board_id: board.id, name: c.name, position: c.position }))
    await supabase.from('columns').insert(cols)

    // 3. Mark this user as the board creator in localStorage
    try {
      localStorage.setItem(`task_creator_${board.id}`, 'true')
    } catch { /* ignore */ }

    router.push(`/${board.id}`)
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        background: '#FAF9F7',
      }}
    >
      {/* Logo / wordmark */}
      <div className="animate-fadeUp" style={{ marginBottom: '0.5rem' }}>
        <span
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#1a1a1a',
            letterSpacing: '-0.03em',
          }}
        >
          task
          <span style={{ color: '#c9a96e' }}>.</span>
        </span>
      </div>

      {/* Tagline */}
      <p
        className="animate-fadeUp"
        style={{
          fontSize: '1rem',
          color: '#9ca3af',
          marginBottom: '3rem',
          animationDelay: '0.05s',
        }}
      >
        Get things done, together.
      </p>

      {/* Create board card */}
      <div
        className="animate-fadeUp"
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
          padding: '2.5rem',
          width: '100%',
          maxWidth: '440px',
          animationDelay: '0.1s',
        }}
      >
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#1a1a1a',
            marginBottom: '0.375rem',
          }}
        >
          Start a new board
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
          Name it, share the link — your team joins in seconds.
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            className="input-base"
            type="text"
            placeholder="e.g. Product Launch Q3"
            value={boardName}
            onChange={e => setBoardName(e.target.value)}
            maxLength={60}
            autoFocus
            required
          />

          {error && (
            <p style={{ fontSize: '0.8125rem', color: '#ef4444' }}>{error}</p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={creating || !boardName.trim()}
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '0.75rem',
              fontSize: '0.9375rem',
              opacity: creating || !boardName.trim() ? 0.6 : 1,
            }}
          >
            {creating ? (
              <>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    display: 'inline-block',
                  }}
                  className="animate-spin"
                />
                Creating…
              </>
            ) : (
              'Start board →'
            )}
          </button>
        </form>
      </div>

      {/* Recent boards */}
      {recentBoards.length > 0 && (
        <div
          className="animate-fadeUp"
          style={{
            marginTop: '2rem',
            width: '100%',
            maxWidth: '440px',
            animationDelay: '0.15s',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#c4bfb9',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '0.75rem',
            }}
          >
            Continue where you left off
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentBoards.slice(0, 4).map(rb => (
              <div
                key={rb.boardId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#FFFFFF',
                  border: '1.5px solid #E8E5E0',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  gap: '0.5rem',
                  transition: 'border-color 0.15s ease',
                }}
              >
                {/* Board info — tıklayınca git */}
                <div
                  onClick={() => router.push(`/${rb.boardId}`)}
                  style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                >
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rb.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                    as {rb.nickname}
                  </div>
                </div>

                {/* Sağ taraf */}
                {confirmDeleteId === rb.boardId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Delete?</span>
                    <button
                      onClick={() => handleDeleteBoard(rb.boardId)}
                      disabled={deletingId === rb.boardId}
                      style={{ fontSize: '0.72rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '0.15rem 0.3rem' }}
                    >
                      {deletingId === rb.boardId ? '…' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      style={{ fontSize: '0.72rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.3rem' }}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span
                      onClick={() => router.push(`/${rb.boardId}`)}
                      style={{ color: '#c9a96e', fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      →
                    </span>
                    <button
                      onClick={() => setConfirmDeleteId(rb.boardId)}
                      title="Delete board"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4bfb9', fontSize: '0.8rem', padding: '0.15rem 0.25rem', borderRadius: '4px', transition: 'color 0.15s ease', lineHeight: 1 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <p
        style={{
          marginTop: '3rem',
          fontSize: '0.75rem',
          color: '#c4bfb9',
        }}
      >
        by{' '}
        <a
          href="https://omercimen.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#c9a96e', textDecoration: 'none' }}
        >
          omercimen.com
        </a>
      </p>
    </main>
  )
}
