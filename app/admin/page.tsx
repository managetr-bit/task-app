'use client'

import { useState, useEffect, useCallback } from 'react'

type BoardRow = {
  id: string
  name: string
  created_at: string
  file_panel_url: string | null
  memberCount: number
  taskCount: number
  milestoneCount: number
}

const SESSION_KEY = 'admin_token'

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Login screen ────────────────────────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [pw, setPw]       = useState('')
  const [show, setShow]   = useState(false)
  const [err, setErr]     = useState('')
  const [busy, setBusy]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const res  = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const json = await res.json()
      if (json.ok) {
        sessionStorage.setItem(SESSION_KEY, json.token)
        onSuccess(json.token)
      } else {
        setErr('Yanlış şifre.')
        setPw('')
      }
    } catch {
      setErr('Bağlantı hatası.')
    }
    setBusy(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 16, padding: '2rem 2.25rem', width: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.25rem' }}>Admin Girişi</div>
        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '1.5rem' }}>task.omercimen.com</div>
        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
          <input
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="Şifre"
            autoFocus
            required
            style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 0.75rem', borderRadius: 10, border: '1.5px solid #E8E5E0', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
          />
          <button
            type="button"
            onClick={() => setShow(p => !p)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af', fontSize: '0.85rem', lineHeight: 1 }}
            title={show ? 'Gizle' : 'Göster'}
          >
            {show ? '🙈' : '👁'}
          </button>
        </div>
        {err && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.625rem' }}>{err}</div>}
        <button
          type="submit"
          disabled={busy || !pw}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: 'none', background: '#c9a96e', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy || !pw ? 0.6 : 1 }}
        >
          {busy ? 'Doğrulanıyor…' : 'Giriş'}
        </button>
      </form>
    </div>
  )
}

// ── Admin dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [boards, setBoards]         = useState<BoardRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/boards', { headers: { 'x-admin-token': token } })
      if (res.status === 401) { onLogout(); return }
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setBoards(data)
    } catch {
      setError('Veriler yüklenemedi.')
    }
    setLoading(false)
  }, [token, onLogout])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch('/api/admin/boards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ id }),
      })
      setBoards(prev => prev.filter(b => b.id !== id))
    } catch {
      setError('Silme başarısız.')
    }
    setDeleting(null); setConfirmId(null)
  }

  const filtered = boards.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F7' }}>
      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1.5px solid #E8E5E0', padding: '0 1.75rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a href="/" style={{ fontSize: '0.95rem', color: '#c4bfb9', textDecoration: 'none' }}>←</a>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1a1a1a' }}>Admin Paneli</span>
          {!loading && (
            <span style={{ fontSize: '0.7rem', background: '#F3F4F6', color: '#6b7280', borderRadius: 20, padding: '0.15rem 0.55rem', fontWeight: 600 }}>
              {boards.length} proje
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Proje ara…"
            style={{ padding: '0.35rem 0.75rem', borderRadius: 8, border: '1.5px solid #E8E5E0', fontSize: '0.8rem', outline: 'none', width: 200, fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
          />
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); onLogout() }}
            style={{ padding: '0.35rem 0.75rem', borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', fontSize: '0.78rem', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Çıkış
          </button>
        </div>
      </header>

      <main style={{ padding: '1.5rem 1.75rem' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#c4bfb9', fontSize: '0.85rem' }}>
            Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#c4bfb9', fontSize: '0.85rem' }}>
            {search ? 'Eşleşen proje bulunamadı.' : 'Henüz proje yok.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 14, overflow: 'hidden' }}>
            {/* Table head */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 60px 60px 60px 120px 44px', gap: '0 1rem', padding: '0.6rem 1rem', background: '#F9F7F5', borderBottom: '1px solid #F0EDE8' }}>
              {['Proje Adı', 'Oluşturulma', 'Üye', 'Görev', 'Milestone', '', ''].map((h, i) => (
                <div key={i} style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {filtered.map((board, idx) => (
              <div
                key={board.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 60px 60px 60px 120px 44px',
                  gap: '0 1rem',
                  padding: '0.75rem 1rem',
                  alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                  background: confirmId === board.id ? '#fef9f0' : '#fff',
                  transition: 'background 0.15s',
                }}
              >
                {/* Name */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {board.name}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#c4bfb9', fontFamily: 'monospace', marginTop: 2 }}>
                    {board.id.slice(0, 8)}…
                  </div>
                </div>

                {/* Created */}
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{fmt(board.created_at)}</div>

                {/* Counts */}
                <Pill value={board.memberCount} icon="👤" />
                <Pill value={board.taskCount}   icon="✓"  />
                <Pill value={board.milestoneCount} icon="◆" />

                {/* Open link */}
                <a
                  href={`/${board.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: '#c9a96e', textDecoration: 'none', fontWeight: 600, textAlign: 'center', display: 'block' }}
                >
                  Projeyi Aç ↗
                </a>

                {/* Delete */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {confirmId === board.id ? (
                    <button
                      onClick={() => handleDelete(board.id)}
                      disabled={deleting === board.id}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', opacity: deleting === board.id ? 0.6 : 1 }}
                    >
                      {deleting === board.id ? '…' : 'Evet'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(board.id)}
                      title="Sil"
                      style={{ padding: '0.3rem 0.45rem', borderRadius: 6, border: '1.5px solid #E8E5E0', background: '#fff', color: '#c4bfb9', fontSize: '0.75rem', cursor: 'pointer', lineHeight: 1 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E5E0'; e.currentTarget.style.color = '#c4bfb9' }}
                    >
                      🗑
                    </button>
                  )}
                  {confirmId === board.id && (
                    <button
                      onClick={() => setConfirmId(null)}
                      style={{ marginLeft: 4, padding: '0.25rem 0.4rem', borderRadius: 6, border: '1.5px solid #E8E5E0', background: '#fff', color: '#9ca3af', fontSize: '0.7rem', cursor: 'pointer' }}
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats footer */}
        {!loading && boards.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 12 }}>
            <Stat label="Toplam Proje"    value={boards.length} />
            <Stat label="Toplam Üye"      value={boards.reduce((s, b) => s + b.memberCount, 0)} />
            <Stat label="Toplam Görev"    value={boards.reduce((s, b) => s + b.taskCount, 0)} />
            <Stat label="Toplam Milestone" value={boards.reduce((s, b) => s + b.milestoneCount, 0)} />
          </div>
        )}
      </main>
    </div>
  )
}

function Pill({ value, icon }: { value: number; icon: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: value > 0 ? '#374151' : '#d1d5db' }}>{value}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c9a96e' }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{label}</div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) setToken(stored)
    setChecked(true)
  }, [])

  if (!checked) return null  // avoid hydration flash

  if (!token) {
    return <LoginForm onSuccess={t => setToken(t)} />
  }

  return (
    <AdminDashboard
      token={token}
      onLogout={() => { sessionStorage.removeItem(SESSION_KEY); setToken(null) }}
    />
  )
}
