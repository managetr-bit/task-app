'use client'

import { useState } from 'react'

type Props = {
  boardName: string
  onJoin: (nickname: string) => Promise<void>
}

export function NicknameModal({ boardName, onJoin }: Props) {
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)

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
      <div className="modal-card" style={{ padding: '2.5rem' }}>
        {/* Icon */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '14px',
            background: '#fdf6ed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem',
            fontSize: '1.5rem',
          }}
        >
          👋
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.375rem' }}>
          You&apos;re joining
        </h2>
        <p
          style={{
            fontSize: '1rem',
            color: '#c9a96e',
            fontWeight: 600,
            marginBottom: '0.75rem',
            wordBreak: 'break-word',
          }}
        >
          {boardName}
        </p>
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '1.75rem' }}>
          Pick a nickname — no account needed.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input
            className="input-base"
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={24}
            autoFocus
            required
          />

          <button
            type="submit"
            className="btn-primary"
            disabled={joining || !nickname.trim()}
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '0.75rem',
              fontSize: '0.9375rem',
              opacity: joining || !nickname.trim() ? 0.6 : 1,
            }}
          >
            {joining ? (
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
                Joining…
              </>
            ) : (
              'Join board →'
            )}
          </button>
        </form>

        <p
          style={{
            marginTop: '1.25rem',
            fontSize: '0.75rem',
            color: '#c4bfb9',
            textAlign: 'center',
          }}
        >
          Anyone with this link can view and edit this board.
        </p>
      </div>
    </div>
  )
}
