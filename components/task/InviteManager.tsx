'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { type InviteToken, type Profile, type Member, type MemberRole } from '@/lib/types'

type Props = {
  boardId: string
  boardName: string
  profile: Profile | null
  members: Member[]
  currentMember: Member
  onUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>
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

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

export function InviteManager({ boardId, boardName, profile, members, currentMember, onUpdateMemberRole, onClose }: Props) {
  const [tokens, setTokens]             = useState<InviteToken[]>([])
  const [loading, setLoading]           = useState(true)
  const [label, setLabel]               = useState('Team invite')
  const [emailTo, setEmailTo]           = useState('')
  const [creating, setCreating]         = useState(false)
  const [sendStatus, setSendStatus]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [copied, setCopied]             = useState<string | null>(null)
  const [revoking, setRevoking]         = useState<string | null>(null)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  // Per-token email send state
  const [tokenEmail, setTokenEmail]     = useState<Record<string, string>>({})
  const [tokenSending, setTokenSending] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})

  const isCreator = currentMember.role === 'creator'

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

  async function sendEmail(inviteUrl: string, to: string): Promise<'sent' | 'fallback' | 'error'> {
    try {
      const res = await fetch('/api/invite/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          boardName,
          inviteUrl,
          senderName: currentMember.nickname,
        }),
      })
      const json = await res.json()
      if (json.fallback) return 'fallback'
      if (json.ok) return 'sent'
      return 'error'
    } catch {
      return 'error'
    }
  }

  function openMailto(inviteUrl: string, to: string) {
    const subject = encodeURIComponent(`You've been invited to "${boardName}"`)
    const body = encodeURIComponent(
      `Hi,\n\n${currentMember.nickname} has invited you to join "${boardName}".\n\nClick the link below to accept:\n${inviteUrl}\n\nSee you there!`
    )
    window.open(`mailto:${to}?subject=${subject}&body=${body}`)
  }

  async function createAndSend() {
    const trimEmail = emailTo.trim()
    const hasEmail  = trimEmail && isValidEmail(trimEmail)
    setCreating(true)
    if (hasEmail) setSendStatus('sending')

    const { data } = await supabase
      .from('invite_tokens')
      .insert({
        board_id: boardId,
        created_by: profile?.id ?? null,
        label: label.trim() || 'Invite',
      })
      .select()
      .single()

    if (data) {
      setTokens(prev => [data, ...prev])
      if (hasEmail) {
        const url    = tokenUrl(data.id)
        const result = await sendEmail(url, trimEmail)
        if (result === 'fallback') openMailto(url, trimEmail)
        setSendStatus(result === 'error' ? 'error' : 'sent')
        setTimeout(() => setSendStatus('idle'), 3000)
      }
    }

    setLabel('Team invite')
    setEmailTo('')
    setCreating(false)
  }

  async function sendToTokenEmail(token: InviteToken, email: string) {
    setTokenSending(prev => ({ ...prev, [token.id]: 'sending' }))
    const url    = tokenUrl(token.id)
    const result = await sendEmail(url, email)
    if (result === 'fallback') openMailto(url, email)
    setTokenSending(prev => ({ ...prev, [token.id]: result === 'error' ? 'error' : 'sent' }))
    setTimeout(() => {
      setTokenSending(prev => ({ ...prev, [token.id]: 'idle' }))
      setTokenEmail(prev => ({ ...prev, [token.id]: '' }))
    }, 2500)
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

  async function changeRole(memberId: string, role: MemberRole) {
    setUpdatingRole(memberId)
    await onUpdateMemberRole(memberId, role)
    setUpdatingRole(null)
  }

  const roleBadge = (role: MemberRole) => {
    if (role === 'creator') return { label: 'Creator', bg: '#EDE9FE', color: '#7C3AED', border: '#f0d9a8' }
    if (role === 'admin')   return { label: 'Admin',   bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' }
    if (role === 'visitor') return { label: 'Visitor', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' }
    return                         { label: 'Member',  bg: '#F3F4F6', color: '#6b7280', border: '#E8E5E0' }
  }

  const sortedMembers = [...members].sort((a, b) => {
    const order: Record<MemberRole, number> = { creator: 0, admin: 1, member: 2, visitor: 3 }
    return order[a.role] - order[b.role]
  })

  const inputStyle = {
    padding: '0.55rem 0.75rem', borderRadius: 8,
    border: '1.5px solid #E8E5E0', fontSize: '0.85rem',
    outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1.5px solid #E8E5E0' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a' }}>Invite people</div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 2 }}>Enter an email to send directly, or share a link.</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Team members */}
          <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1.5px solid #E8E5E0' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
              Team · {members.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {sortedMembers.map(m => {
                const badge     = roleBadge(m.role)
                const isSelf    = m.id === currentMember.id
                const canChange = isCreator && m.role !== 'creator'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.4rem 0.625rem', borderRadius: 10, background: isSelf ? '#FEF9F0' : '#FAFAFA', border: `1.5px solid ${isSelf ? '#f0d9a8' : '#E8E5F0'}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color, color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {m.nickname.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 500, color: '#1a1a1a', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.nickname}{isSelf ? <span style={{ color: '#c4bfb9', fontWeight: 400 }}> (you)</span> : ''}
                    </span>
                    {canChange ? (
                      <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                        {([
                          { r: 'admin' as MemberRole,   label: 'Admin',   ac: '#3b82f6', ab: '#eff6ff' },
                          { r: 'member' as MemberRole,  label: 'Member',  ac: '#6b7280', ab: '#F3F4F6' },
                          { r: 'visitor' as MemberRole, label: 'Visitor', ac: '#16a34a', ab: '#f0fdf4' },
                        ]).map(({ r, label, ac, ab }) => (
                          <button key={r} onClick={() => changeRole(m.id, r)} disabled={updatingRole === m.id || m.role === r} style={{ padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, cursor: m.role === r ? 'default' : 'pointer', fontFamily: 'inherit', border: m.role === r ? `1.5px solid ${ac}` : '1.5px solid #E8E5E0', background: m.role === r ? ab : '#fff', color: m.role === r ? ac : '#9ca3af' }}>{label}</button>
                        ))}
                        {updatingRole === m.id && <span style={{ fontSize: '0.7rem', color: '#7C3AED', alignSelf: 'center' }}>…</span>}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.2rem 0.55rem', borderRadius: 6, border: `1.5px solid ${badge.border}`, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.label}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Create / send invite */}
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1.5px solid #E8E5E0' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
              New invite
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Label */}
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Label (e.g. Design team)"
                maxLength={40}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
              />
              {/* Email */}
              <input
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="Email address (optional — send invite directly)"
                type="email"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
                onKeyDown={e => { if (e.key === 'Enter') createAndSend() }}
              />
              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={createAndSend}
                  disabled={creating || (!!emailTo && !isValidEmail(emailTo))}
                  style={{
                    flex: 1, padding: '0.6rem 1rem', borderRadius: 8, border: 'none',
                    background: emailTo && isValidEmail(emailTo) ? '#7C3AED' : '#7C3AED',
                    color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                    cursor: creating ? 'default' : 'pointer',
                    opacity: creating || (!!emailTo && !isValidEmail(emailTo)) ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {creating
                    ? '…'
                    : emailTo && isValidEmail(emailTo)
                    ? '✉ Send invite'
                    : '+ Generate link'}
                </button>
              </div>
              {/* Send status */}
              {sendStatus === 'sent' && (
                <div style={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 500 }}>✓ Invite sent to {emailTo}</div>
              )}
              {sendStatus === 'error' && (
                <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>Could not send — check your email settings.</div>
              )}
            </div>
          </div>

          {/* Token list */}
          <div style={{ padding: '0.75rem 1.5rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
              Active links
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#c4bfb9', fontSize: '0.8rem' }}>Loading…</div>
            ) : tokens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#c4bfb9', fontSize: '0.8rem' }}>No invite links yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {tokens.map(token => {
                  const expired   = isExpired(token)
                  const exhausted = isExhausted(token)
                  const inactive  = expired || exhausted
                  const tEmail    = tokenEmail[token.id] ?? ''
                  const tStatus   = tokenSending[token.id] ?? 'idle'
                  return (
                    <div
                      key={token.id}
                      style={{ border: '1.5px solid #E8E5E0', borderRadius: 12, padding: '0.75rem 1rem', background: inactive ? '#FAFAFA' : '#fff', opacity: inactive ? 0.65 : 1 }}
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
                              style={{ padding: '0.35rem 0.75rem', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: copied === token.id ? '1.5px solid #22c55e' : '1.5px solid #E8E5E0', background: copied === token.id ? '#f0fdf4' : '#fff', color: copied === token.id ? '#22c55e' : '#374151', transition: 'all 0.15s' }}
                            >
                              {copied === token.id ? '✓ Copied' : 'Copy link'}
                            </button>
                          )}
                          <button
                            onClick={() => revokeToken(token.id)}
                            disabled={revoking === token.id}
                            title="Revoke"
                            style={{ padding: '0.35rem 0.5rem', borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', color: '#c4bfb9', fontSize: '0.75rem', cursor: 'pointer' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#c4bfb9'; e.currentTarget.style.borderColor = '#E8E5E0' }}
                          >
                            {revoking === token.id ? '…' : '🗑'}
                          </button>
                        </div>
                      </div>

                      {/* URL preview */}
                      {!inactive && (
                        <div style={{ marginTop: '0.5rem', background: '#F9F7F5', borderRadius: 6, padding: '0.35rem 0.625rem', fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tokenUrl(token.id)}
                        </div>
                      )}

                      {/* Send by email (active tokens only) */}
                      {!inactive && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem' }}>
                          <input
                            value={tEmail}
                            onChange={e => setTokenEmail(prev => ({ ...prev, [token.id]: e.target.value }))}
                            placeholder="Send to email…"
                            type="email"
                            style={{ flex: 1, padding: '0.35rem 0.625rem', borderRadius: 7, border: '1.5px solid #E8E5E0', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED' }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
                            onKeyDown={e => { if (e.key === 'Enter' && isValidEmail(tEmail)) sendToTokenEmail(token, tEmail) }}
                          />
                          <button
                            onClick={() => sendToTokenEmail(token, tEmail)}
                            disabled={!isValidEmail(tEmail) || tStatus === 'sending'}
                            style={{
                              padding: '0.35rem 0.75rem', borderRadius: 7, border: 'none',
                              background: tStatus === 'sent' ? '#22c55e' : '#7C3AED',
                              color: '#fff', fontSize: '0.75rem', fontWeight: 600,
                              cursor: !isValidEmail(tEmail) || tStatus === 'sending' ? 'default' : 'pointer',
                              opacity: !isValidEmail(tEmail) ? 0.4 : 1,
                              fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background 0.2s',
                            }}
                          >
                            {tStatus === 'sending' ? '…' : tStatus === 'sent' ? '✓ Sent' : '✉ Send'}
                          </button>
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
    </div>
  )
}
