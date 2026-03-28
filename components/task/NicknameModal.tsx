'use client'

import { useState } from 'react'

type Props = {
  boardName: string
  onJoin: (nickname: string) => Promise<void>
}

export function NicknameModal({ boardName, onJoin }: Props) {
  const [nickname, setNickname] = useState('')
  const [joining, setJoining]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = nickname.trim()
    if (!name) return
    setJoining(true)
    await onJoin(name)
    setJoining(false)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 400 }}>
        {/* Top accent */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #7C3AED, #A78BFA)', borderRadius: '16px 16px 0 0' }} />

        <div style={{ padding: '2rem' }}>
          {/* Icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: '#EDE9FE', border: '1px solid #DDD6FE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1.25rem',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="7" r="3.5" stroke="#7C3AED" strokeWidth="1.5"/>
              <path d="M3 16.5c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
            Joining project
          </h2>
          <p style={{ fontSize: '0.9375rem', color: '#7C3AED', fontWeight: 600, marginBottom: '0.625rem', wordBreak: 'break-word' }}>
            {boardName}
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', marginBottom: '1.75rem', lineHeight: 1.5 }}>
            Enter a display name to identify yourself to your team. No account required.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div>
              <label className="form-label">Your name</label>
              <input
                className="input-base"
                type="text"
                placeholder="e.g. Alex Kim"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={24}
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={joining || !nickname.trim()}
              style={{ width: '100%', justifyContent: 'center', padding: '0.6875rem', fontSize: '0.9375rem' }}
            >
              {joining ? (
                <>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', display: 'inline-block' }} className="animate-spin" />
                  Joining…
                </>
              ) : 'Join project →'}
            </button>
          </form>

          <p style={{ marginTop: '1rem', fontSize: '0.6875rem', color: '#C4BFBA', textAlign: 'center' }}>
            Anyone with the project link can join and collaborate.
          </p>
        </div>
      </div>
    </div>
  )
}
