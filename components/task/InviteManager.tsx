'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { type InviteToken, type Profile } from '@/lib/types'

type Props = {
  boardId: string
  profile: Profile | null
  onClose: () => void
}

function tokenUrl(token: string) {
  return `${window.location.origin}/join/${token}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isExpired(token: InviteToken) {
  if (!token.expires_at) return false
  return new Date(token.expires_at) < new Date()
}

function isExhausted(token: InviteToken) {
  if (!token.max_uses) return false
  return token.uses >= token.max_uses
}

export function InviteManager({ boardId, profile, onClose }: Props) {
  const [tokens, setTokens]       = useState<InviteToken[]>([])
  const [loading, setLoading]     = useState(true)
  const [label, setLabel]         = useState('Team invite')
  const [creating, setCreating]   = useState(false)
  const [copied, setCopied]       = useState<string | null>(null)
  const [revoking, setRevoking]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: false })
    setTokens(data ?? [])
    setLoading(false)
  }, [boardId])

  useEffect(() => { load() }, [load])

  async function createToken() {
    setCreating(true)
    const { data } = await supabase
      .from('invite_tokens')
      .insert({
        board_id: boardId,
        created_by: profile?.id ?? null,
        label: label.trim() || 'Invite',
      })
      .select()
      .single()
    if (data) setTokens(prev => [data, ...prev])
    setLabel('Team invite')
    setCreating(false)
  }

  async function revokeToken(id: string) {
    setRevoking(id)
    await supabase.from('invite_tokens').delete().eq('id', id)
    setTokens(prev => prev.filter(t => t.id !== id))
    setRevoking(null)
  }

  async function copyLink(tokenId: string) {
    await navigator.clipboard.writeText(tokenUrl(tokenId))
    setCopied(tokenId)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1.5px solid #E8E5E0' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a' }}>Invite people</div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Share an invite link — only people with the link can join.</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Create new token */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #F0EDE8' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Label (e.g. Design team)"
              maxLength={40}
              style={{
                flex: 1, padding: '0.55rem 0.75rem', borderRadius: 8,
                border: '1.5px solid #E8E5E0', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
              onKeyDown={e => { if (e.key === 'Enter') createToken() }}
            />
            <button
              onClick={createToken}
              disabled={creating}
              style={{
                padding: '0.55rem 1rem', borderRadius: 8, border: 'none',
                background: '#c9a96e', color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.6 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}
            >
              {creating ? '…' : '+ New link'}
            </button>
          </div>
        </div>

        {/* Token list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#c4bfb9', fontSize: '0.8rem' }}>Loading…</div>
          ) : tokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#c4bfb9', fontSize: '0.8rem' }}>No invite links yet. Create one above.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {tokens.map(token => {
                const expired   = isExpired(token)
                const exhausted = isExhausted(token)
                const inactive  = expired || exhausted
                return (
                  <div
                    key={token.id}
                    style={{
                      border: '1.5px solid #E8E5E0', borderRadius: 12, padding: '0.75rem 1rem',
                      background: inactive ? '#FAFAFA' : '#fff',
                      opacity: inactive ? 0.65 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a' }}>{token.label}</span>
                          {inactive && (
                            <span style={{ fontSize: '0.65rem', background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                              {expired ? 'Expired' : 'Exhausted'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2, display: 'flex', gap: '0.75rem' }}>
                          <span>Used {token.uses}{token.max_uses ? `/${token.max_uses}` : ''} times</span>
                          <span>Created {fmtDate(token.created_at)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                        {!inactive && (
                          <button
                            onClick={() => copyLink(token.id)}
                            style={{
                              padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                              border: copied === token.id ? '1.5px solid #22c55e' : '1.5px solid #E8E5E0',
                              background: copied === token.id ? '#f0fdf4' : '#fff',
                              color: copied === token.id ? '#22c55e' : '#374151',
                              transition: 'all 0.15s',
                            }}
                          >
                            {copied === token.id ? '✓ Copied' : 'Copy link'}
                          </button>
                        )}
                        <button
                          onClick={() => revokeToken(token.id)}
                          disabled={revoking === token.id}
                          title="Revoke"
                          style={{
                            padding: '0.35rem 0.5rem', borderRadius: 8, border: '1.5px solid #E8E5E0',
                            background: '#fff', color: '#c4bfb9', fontSize: '0.75rem', cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c4bfb9'; e.currentTarget.style.borderColor = '#E8E5E0' }}
                        >
                          {revoking === token.id ? '…' : '🗑'}
                        </button>
                      </div>
                    </div>
                    {/* URL preview */}
                    {!inactive && (
                      <div style={{
                        marginTop: '0.5rem', background: '#F9F7F5', borderRadius: 6,
                        padding: '0.35rem 0.625rem', fontSize: '0.68rem', color: '#9ca3af',
                        fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tokenUrl(token.id)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
