'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { DEFAULT_COLUMNS } from '@/lib/types'
import { getLocalProfile } from '@/lib/profile'
import { ProfileSetupModal } from '@/components/ProfileSetupModal'
import type { Profile } from '@/lib/types'

type RecentBoard = { boardId: string; name: string; nickname: string; visitedAt: string }

export default function LandingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [boardName, setBoardName]             = useState('')
  const [creating, setCreating]               = useState(false)
  const [error, setError]                     = useState('')
  const [recentBoards, setRecentBoards]       = useState<RecentBoard[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [focused, setFocused]                 = useState(false)
  const [profile, setProfile]                 = useState<Profile | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [pendingCreate, setPendingCreate]     = useState(false)
  const [activeVersion, setActiveVersion]     = useState<'v1' | 'v2' | 'v3'>('v1')

  // Pre-select tab from ?v= param
  useEffect(() => {
    const v = searchParams.get('v')
    if (v === '2') setActiveVersion('v2')
    if (v === '3') setActiveVersion('v3')
  }, [searchParams])

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

    await supabase.from('columns').insert(
      DEFAULT_COLUMNS.map(c => ({ board_id: board.id, name: c.name, position: c.position }))
    )

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

    const path = activeVersion === 'v3' ? `/v3/${board.id}` : activeVersion === 'v2' ? `/v2/${board.id}` : `/${board.id}`
    router.push(path)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!boardName.trim()) return
    const p = getLocalProfile()
    if (!p) { setPendingCreate(true); setShowProfileModal(true); return }
    await createBoard(p)
  }

  async function handleProfileComplete(p: Profile) {
    setProfile(p)
    setShowProfileModal(false)
    if (pendingCreate) { setPendingCreate(false); await createBoard(p) }
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

  function formatDate(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch { return '' }
  }

  return (
    <>
      {showProfileModal && <ProfileSetupModal onComplete={handleProfileComplete} />}

      {/* ── Top bar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
        height: 56, background: '#FFFFFF',
        borderBottom: '1px solid #E8E5F0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="4" height="11" rx="1.2" fill="rgba(255,255,255,0.9)"/>
              <rect x="7.5" y="1.5" width="4" height="7.5" rx="1.2" fill="rgba(255,255,255,0.9)"/>
            </svg>
          </div>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
            ProjectBoard
          </span>
        </div>

        {/* Profile */}
        {profile ? (
          <button
            onClick={() => setShowProfileModal(true)}
            title="Edit profile"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: '#F5F4FD', border: '1px solid #E8E5F0',
              borderRadius: '20px', padding: '0.3rem 0.75rem 0.3rem 0.375rem',
              cursor: 'pointer', transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#EDE9FE' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F5F4FD' }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: '#7C3AED',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.625rem', fontWeight: 800, flexShrink: 0,
            }}>
              {profile.display_name.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>
              {profile.display_name}
            </span>
          </button>
        ) : (
          <button
            onClick={() => setShowProfileModal(true)}
            style={{
              fontSize: '0.8rem', fontWeight: 600, color: '#6B7280',
              background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem 0.625rem',
              borderRadius: 8,
            }}
          >
            Set profile
          </button>
        )}
      </header>

      {/* ── Main ── */}
      <main style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: '56px', background: '#F5F4FD',
      }}>
        {/* Hero section */}
        <div style={{
          width: '100%', background: '#F5F4FD',
          borderBottom: '1px solid #E8E5F0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '3.5rem 1.5rem 3rem',
        }}>
          <p style={{
            fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#7C3AED',
            marginBottom: '0.75rem',
          }}>
            Project Command Center
          </p>
          <h1 style={{
            fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800,
            color: '#111827', letterSpacing: '-0.03em', textAlign: 'center',
            marginBottom: '0.75rem', lineHeight: 1.15,
          }}>
            Manage your projects.<br />
            <span style={{ color: '#7C3AED' }}>Ship faster.</span>
          </h1>
          <p style={{
            fontSize: '0.9375rem', color: '#6B7280',
            textAlign: 'center', maxWidth: 400, lineHeight: 1.6, marginBottom: '1.5rem',
          }}>
            Timeline · Kanban board · Budget tracking · Team collaboration — all in one place.
          </p>

          {/* Version switcher */}
          <div style={{ display: 'flex', gap: '0.375rem', background: '#EEEBF8', borderRadius: 10, padding: '0.25rem', marginBottom: '1.5rem' }}>
            {([
              { v: 'v1', label: 'v1 — Kanban' },
              { v: 'v2', label: 'v2 — Dashboard' },
              { v: 'v3', label: 'v3 — Spreadsheet' },
            ] as { v: 'v1' | 'v2' | 'v3'; label: string }[]).map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setActiveVersion(v)}
                style={{
                  padding: '0.375rem 1.125rem', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: 700, transition: 'all 0.15s ease',
                  background: activeVersion === v ? '#FFFFFF' : 'transparent',
                  color: activeVersion === v ? '#7C3AED' : '#9CA3AF',
                  boxShadow: activeVersion === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Create project form */}
          <form
            onSubmit={handleCreate}
            className="animate-fadeUp"
            style={{
              display: 'flex', gap: '0.625rem',
              width: '100%', maxWidth: 460,
              background: '#FFFFFF',
              border: `1px solid ${focused ? 'rgba(124,58,237,0.5)' : '#E8E5F0'}`,
              borderRadius: 12, padding: '0.375rem 0.375rem 0.375rem 1rem',
              transition: 'border-color 0.2s ease',
              boxShadow: focused ? '0 0 0 4px rgba(124,58,237,0.1)' : 'none',
            }}
          >
            <input
              type="text"
              placeholder="Name your project…"
              value={boardName}
              onChange={e => { setBoardName(e.target.value); setError('') }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              maxLength={60}
              autoFocus
              required
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: '0.9375rem', color: '#111827', fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={creating || !boardName.trim()}
              className="btn-primary"
              style={{
                flexShrink: 0, padding: '0.5625rem 1.125rem', fontSize: '0.875rem',
                opacity: creating || !boardName.trim() ? 0.5 : 1,
              }}
            >
              {creating ? (
                <>
                  <span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', display: 'inline-block' }} className="animate-spin" />
                  Creating…
                </>
              ) : 'Create project →'}
            </button>
          </form>
          {error && (
            <p style={{ fontSize: '0.8125rem', color: '#FCA5A5', marginTop: '0.5rem' }}>{error}</p>
          )}
        </div>

        {/* Recent projects */}
        <div style={{ width: '100%', maxWidth: 800, padding: '2rem 1.5rem' }}>
          {recentBoards.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                <h2 style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Recent Projects
                </h2>
                <span style={{ fontSize: '0.6875rem', color: '#C4BFBA' }}>{recentBoards.length} project{recentBoards.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                {recentBoards.slice(0, 6).map((rb, i) => (
                  <div
                    key={rb.boardId}
                    className="animate-fadeUp"
                    style={{
                      animationDelay: `${i * 0.04}s`,
                      background: '#FFFFFF',
                      border: '1px solid #E8E5F0',
                      borderRadius: 12, overflow: 'hidden',
                      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = '#7C3AED'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(124,58,237,0.12)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = '#E8E5F0'
                      ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                    }}
                  >
                    {/* Card color strip */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg, #7C3AED, #A78BFA)' }} />

                    <div style={{ padding: '0.875rem 1rem' }}>
                      <div
                        onClick={() => router.push(activeVersion === 'v3' ? `/v3/${rb.boardId}` : activeVersion === 'v2' ? `/v2/${rb.boardId}` : `/${rb.boardId}`)}
                        style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                      >
                        <div style={{
                          fontSize: '0.9375rem', fontWeight: 700, color: '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          letterSpacing: '-0.01em', marginBottom: '0.25rem',
                        }}>{rb.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: '#7C3AED',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: '0.5rem', fontWeight: 800, flexShrink: 0,
                          }}>
                            {rb.nickname.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>as {rb.nickname}</span>
                          <span style={{ color: '#D0CBDF', fontSize: '0.6rem' }}>·</span>
                          <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>{formatDate(rb.visitedAt)}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                        {confirmDeleteId === rb.boardId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>Delete project?</span>
                            <button
                              onClick={() => handleDeleteBoard(rb.boardId)}
                              disabled={deletingId === rb.boardId}
                              style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.375rem', borderRadius: 5 }}
                            >
                              {deletingId === rb.boardId ? '…' : 'Delete'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{ fontSize: '0.6875rem', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '0.15rem 0.375rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(rb.boardId)}
                            title="Delete project"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#C4BFBA', fontSize: '0.6875rem',
                              padding: '0.2rem 0.375rem', borderRadius: 5,
                              transition: 'color 0.12s ease',
                              fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#C4BFBA' }}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          onClick={() => router.push(activeVersion === 'v3' ? `/v3/${rb.boardId}` : activeVersion === 'v2' ? `/v2/${rb.boardId}` : `/${rb.boardId}`)}
                          className="btn-primary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                        >
                          Open {activeVersion} →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{
              textAlign: 'center', padding: '3rem 1.5rem',
              color: '#9CA3AF', fontSize: '0.875rem',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.4 }}>📋</div>
              <p style={{ fontWeight: 500, marginBottom: '0.25rem', color: '#4B5563' }}>No projects yet</p>
              <p style={{ fontSize: '0.8125rem' }}>Create your first project above to get started.</p>
            </div>
          )}
        </div>

        <footer style={{ marginTop: 'auto', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: '#C4BFBA' }}>
            Built by{' '}
            <a href="https://omercimen.com" target="_blank" rel="noopener noreferrer" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>
              omercimen.com
            </a>
          </p>
        </footer>
      </main>
    </>
  )
}
