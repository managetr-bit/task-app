'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEFAULT_COLUMNS } from '@/lib/types'
import { getLocalProfile } from '@/lib/profile'
import { ProfileSetupModal } from '@/components/ProfileSetupModal'
import type { Profile } from '@/lib/types'

type RecentBoard = { boardId: string; name: string; nickname: string; visitedAt: string }

export default function LandingPage() {
  const router = useRouter()
  const [boardName, setBoardName]         = useState('')
  const [creating, setCreating]           = useState(false)
  const [error, setError]                 = useState('')
  const [recentBoards, setRecentBoards]   = useState<RecentBoard[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [focused, setFocused]             = useState(false)
  const [profile, setProfile]             = useState<Profile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [pendingCreate, setPendingCreate] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('task_recent_boards')
      if (raw) setRecentBoards(JSON.parse(raw))
    } catch { /* ignore */ }
    setProfile(getLocalProfile())
  }, [])

  async function createBoard(p: Profile) {
    const name = boardName.trim()
    if (!name) return
    setCreating(true); setError('')

    const { data: board, error: boardErr } = await supabase
      .from('boards').insert({ name }).select().single()

    if (boardErr || !board) {
      setError('Could not create project. Check your connection and try again.')
      setCreating(false)
      return
    }

    // Default columns
    await supabase.from('columns').insert(
      DEFAULT_COLUMNS.map(c => ({ board_id: board.id, name: c.name, position: c.position }))
    )

    // Auto-join as creator
    const { data: member } = await supabase
      .from('members')
      .insert({ board_id: board.id, nickname: p.display_name, color: '#c9a96e', profile_id: p.id, role: 'creator' })
      .select().single()

    if (member) {
      try {
        localStorage.setItem(`task_creator_${board.id}`, 'true')
        localStorage.setItem(`task_session_${board.id}`, JSON.stringify({
          boardId: board.id, memberId: member.id, nickname: member.nickname, color: member.color,
        }))
        const raw = localStorage.getItem('task_recent_boards')
        const list = raw ? JSON.parse(raw) : []
        list.unshift({ boardId: board.id, name: board.name, nickname: p.display_name, visitedAt: new Date().toISOString() })
        localStorage.setItem('task_recent_boards', JSON.stringify(list.slice(0, 8)))
      } catch { /* ignore */ }
    }

    router.push(`/${board.id}`)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!boardName.trim()) return
    const p = getLocalProfile()
    if (!p) {
      setPendingCreate(true)
      setShowProfileModal(true)
      return
    }
    await createBoard(p)
  }

  async function handleProfileComplete(p: Profile) {
    setProfile(p)
    setShowProfileModal(false)
    if (pendingCreate) {
      setPendingCreate(false)
      await createBoard(p)
    }
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

  return (
    <>
      {showProfileModal && (
        <ProfileSetupModal onComplete={handleProfileComplete} />
      )}

      <main style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', background: '#FAF9F7',
      }}>
        {/* Profile badge */}
        {profile && (
          <div
            onClick={() => setShowProfileModal(true)}
            title="Edit profile"
            style={{
              position: 'fixed', top: '1.25rem', right: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 20,
              padding: '0.35rem 0.75rem 0.35rem 0.35rem',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: '#c9a96e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
            }}>
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
              {profile.display_name}
            </span>
          </div>
        )}

        {/* Create project card */}
        <div
          className="animate-fadeUp"
          style={{
            background: '#FFFFFF', borderRadius: '20px',
            boxShadow: focused
              ? '0 8px 40px rgba(201,169,110,0.15), 0 2px 8px rgba(0,0,0,0.06)'
              : '0 4px 24px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
            padding: '2.5rem', width: '100%', maxWidth: '440px', transition: 'box-shadow 0.3s ease',
          }}
        >
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input
              className="input-base" type="text" placeholder="Name your project…"
              value={boardName}
              onChange={e => { setBoardName(e.target.value); setError('') }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={60} autoFocus required
              style={{ fontSize: '1.0625rem', padding: '0.875rem 1rem' }}
            />
            {error && <p style={{ fontSize: '0.8125rem', color: '#ef4444', marginTop: '-0.25rem' }}>{error}</p>}
            <button
              type="submit" className="btn-primary"
              disabled={creating || !boardName.trim()}
              style={{ width: '100%', justifyContent: 'center', padding: '0.8125rem', fontSize: '0.9375rem', opacity: creating || !boardName.trim() ? 0.5 : 1, transition: 'opacity 0.2s ease' }}
            >
              {creating ? (
                <>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', display: 'inline-block' }} className="animate-spin" />
                  Creating…
                </>
              ) : 'Start project →'}
            </button>
          </form>
        </div>

        {/* Recent projects */}
        {recentBoards.length > 0 && (
          <div className="animate-fadeUp" style={{ marginTop: '1.5rem', width: '100%', maxWidth: '440px', animationDelay: '0.1s' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
              Recent projects
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentBoards.slice(0, 4).map(rb => (
                <div key={rb.boardId} style={{ display: 'flex', alignItems: 'center', background: '#FFFFFF', border: '1.5px solid #E8E5E0', borderRadius: '12px', padding: '0.75rem 1rem', gap: '0.5rem', transition: 'border-color 0.15s ease' }}>
                  <div onClick={() => router.push(`/${rb.boardId}`)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rb.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.1rem' }}>as {rb.nickname}</div>
                  </div>
                  {confirmDeleteId === rb.boardId ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Delete?</span>
                      <button onClick={() => handleDeleteBoard(rb.boardId)} disabled={deletingId === rb.boardId} style={{ fontSize: '0.72rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '0.15rem 0.3rem' }}>
                        {deletingId === rb.boardId ? '…' : 'Yes'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: '0.72rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.3rem' }}>No</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <span onClick={() => router.push(`/${rb.boardId}`)} style={{ color: '#c9a96e', fontSize: '0.875rem', cursor: 'pointer' }}>→</span>
                      <button
                        onClick={() => setConfirmDeleteId(rb.boardId)} title="Delete project"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c4bfb9', fontSize: '0.8rem', padding: '0.15rem 0.25rem', borderRadius: '4px', transition: 'color 0.15s ease', lineHeight: 1 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
                      >🗑</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ marginTop: '2.5rem', fontSize: '0.75rem', color: '#c4bfb9' }}>
          by{' '}
          <a href="https://omercimen.com" target="_blank" rel="noopener noreferrer" style={{ color: '#c9a96e', textDecoration: 'none' }}>
            omercimen.com
          </a>
        </p>
      </main>
    </>
  )
}
