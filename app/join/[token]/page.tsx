'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getLocalProfile, saveLocalProfile, generateProfileId } from '@/lib/profile'
import { type Profile, type InviteToken, MEMBER_COLORS } from '@/lib/types'

type Stage = 'loading' | 'invalid' | 'profile' | 'confirm' | 'joining' | 'done'

function randomColor() {
  return MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]
}

export default function JoinPage({ params }: { params: { token: string } }) {
  const router = useRouter()
  const [stage, setStage]     = useState<Stage>('loading')
  const [token, setToken]     = useState<InviteToken | null>(null)
  const [boardName, setBoardName] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [err, setErr]         = useState('')

  useEffect(() => {
    async function init() {
      // 1. Validate token
      const { data: tokenData } = await supabase
        .from('invite_tokens')
        .select('*')
        .eq('id', params.token)
        .single()

      if (!tokenData) { setStage('invalid'); return }

      // Check expiry
      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        setStage('invalid'); return
      }
      // Check max uses
      if (tokenData.max_uses && tokenData.uses >= tokenData.max_uses) {
        setStage('invalid'); return
      }

      setToken(tokenData)

      // 2. Fetch board name
      const { data: boardData } = await supabase
        .from('boards')
        .select('name')
        .eq('id', tokenData.board_id)
        .single()
      setBoardName(boardData?.name ?? 'this project')

      // 3. Check for existing profile
      const existing = getLocalProfile()
      if (existing) {
        // Check if already a member
        const { data: memberData } = await supabase
          .from('members')
          .select('id')
          .eq('board_id', tokenData.board_id)
          .eq('profile_id', existing.id)
          .single()

        if (memberData) {
          // Already a member — go straight to board
          router.replace(`/${tokenData.board_id}`)
          return
        }
        setProfile(existing)
        setStage('confirm')
      } else {
        setStage('profile')
      }
    }
    init()
  }, [params.token, router])

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    const display_name = name.trim()
    if (!display_name) return
    const p: Profile = { id: generateProfileId(), display_name, email: email.trim() || undefined }
    const { error } = await supabase.from('profiles').upsert({ id: p.id, display_name: p.display_name, email: p.email ?? null })
    if (error) { setErr('Could not save profile. Try again.'); return }
    saveLocalProfile(p)
    setProfile(p)
    setStage('confirm')
  }

  async function handleJoin() {
    if (!token || !profile) return
    setStage('joining')

    // Create member record
    const { data: memberData, error: memberErr } = await supabase
      .from('members')
      .insert({
        board_id: token.board_id,
        nickname: profile.display_name,
        color: randomColor(),
        profile_id: profile.id,
      })
      .select()
      .single()

    if (memberErr || !memberData) {
      setErr('Could not join. Try again.')
      setStage('confirm')
      return
    }

    // Save session
    try {
      localStorage.setItem(`task_session_${token.board_id}`, JSON.stringify({
        boardId: token.board_id,
        memberId: memberData.id,
        nickname: memberData.nickname,
        color: memberData.color,
      }))
      // Save recent board
      const raw = localStorage.getItem('task_recent_boards')
      const list = raw ? JSON.parse(raw) : []
      const filtered = list.filter((b: { boardId: string }) => b.boardId !== token.board_id)
      filtered.unshift({ boardId: token.board_id, name: boardName, nickname: profile.display_name, visitedAt: new Date().toISOString() })
      localStorage.setItem('task_recent_boards', JSON.stringify(filtered.slice(0, 8)))
    } catch { /* ignore */ }

    // Increment token uses
    await supabase
      .from('invite_tokens')
      .update({ uses: token.uses + 1 })
      .eq('id', token.id)

    router.replace(`/${token.board_id}`)
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: '2.5rem 2.25rem',
    width: '100%', maxWidth: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
  }

  if (stage === 'loading') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F7' }}>
        <div style={{ color: '#c4bfb9', fontSize: '0.85rem' }}>Checking invite…</div>
      </main>
    )
  }

  if (stage === 'invalid') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F7', padding: '1rem' }}>
        <div style={card}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>Invite not valid</div>
          <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
            This link may have expired, been revoked, or already reached its usage limit.
          </div>
          <button onClick={() => router.push('/')} style={{ padding: '0.65rem 1.25rem', borderRadius: 10, border: 'none', background: '#c9a96e', color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Go to home
          </button>
        </div>
      </main>
    )
  }

  if (stage === 'profile') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F7', padding: '1rem' }}>
        <div style={card}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.25rem' }}>
            You&apos;re invited to join
          </div>
          <div style={{ fontSize: '0.9rem', color: '#c9a96e', fontWeight: 600, marginBottom: '0.25rem' }}>{boardName}</div>
          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
            Set up your name — it will appear across all your projects.
          </div>

          <form onSubmit={handleProfileSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              value={name} onChange={e => { setName(e.target.value); setErr('') }}
              placeholder="Your name"
              maxLength={40} autoFocus required
              style={{ padding: '0.65rem 0.875rem', borderRadius: 10, border: '1.5px solid #E8E5E0', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
            />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email (optional)"
              style={{ padding: '0.65rem 0.875rem', borderRadius: 10, border: '1.5px solid #E8E5E0', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
            />
            {err && <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{err}</div>}
            <button type="submit" disabled={!name.trim()} style={{ padding: '0.7rem', borderRadius: 10, border: 'none', background: '#c9a96e', color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: name.trim() ? 'pointer' : 'default', opacity: name.trim() ? 1 : 0.5, fontFamily: 'inherit' }}>
              Continue →
            </button>
          </form>
        </div>
      </main>
    )
  }

  if (stage === 'confirm' && profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F7', padding: '1rem' }}>
        <div style={card}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.25rem' }}>
            Join <span style={{ color: '#c9a96e' }}>{boardName}</span>?
          </div>
          <div style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '0.75rem 0 1.5rem' }}>
            You&apos;ll join as <strong style={{ color: '#374151' }}>{profile.display_name}</strong>.
          </div>
          {err && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.75rem' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button
              onClick={handleJoin}
              style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: '#c9a96e', color: '#fff', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Join project →
            </button>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '0.7rem 1rem', borderRadius: 10, border: '1.5px solid #E8E5E0', background: '#fff', color: '#9ca3af', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (stage === 'joining') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F7' }}>
        <div style={{ color: '#c4bfb9', fontSize: '0.85rem' }}>Joining…</div>
      </main>
    )
  }

  return null
}
