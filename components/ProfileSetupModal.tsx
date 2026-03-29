'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { saveLocalProfile, generateProfileId } from '@/lib/profile'
import { type Profile } from '@/lib/types'

type Props = {
  /** Called after profile is created/confirmed */
  onComplete: (profile: Profile) => void
  /** Optional: show board name context ("You're joining Sancaktepe 2") */
  boardName?: string
  /** If provided, existing profile is shown for confirmation (edit mode) */
  existingProfile?: Profile
}

export function ProfileSetupModal({ onComplete, boardName, existingProfile }: Props) {
  const [name, setName]   = useState(existingProfile?.display_name ?? '')
  const [email, setEmail] = useState(existingProfile?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const display_name = name.trim()
    if (!display_name) return
    setSaving(true); setErr('')

    const profile: Profile = {
      id: existingProfile?.id ?? generateProfileId(),
      display_name,
      email: email.trim() || undefined,
    }

    // Upsert to Supabase so the profile is server-side accessible
    const { error } = await supabase.from('profiles').upsert({
      id: profile.id,
      display_name: profile.display_name,
      email: profile.email ?? null,
    })

    if (error) {
      setErr('Could not save profile. Check your connection.')
      setSaving(false)
      return
    }

    saveLocalProfile(profile)
    onComplete(profile)
  }

  const isEdit = !!existingProfile

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300, padding: '1rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '2rem 2.25rem',
        width: '100%', maxWidth: 400,
        boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a' }}>
            {isEdit ? 'Edit your profile' : 'Welcome! Set up your profile'}
          </div>
          {boardName && !isEdit && (
            <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.3rem' }}>
              You&apos;re joining <strong style={{ color: '#374151' }}>{boardName}</strong>
            </div>
          )}
          {!isEdit && (
            <div style={{ fontSize: '0.78rem', color: '#c4bfb9', marginTop: '0.25rem' }}>
              This name will appear across all your projects.
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Display name */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.35rem' }}>
              Display name *
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErr('') }}
              placeholder="e.g. Ömer Çimen"
              maxLength={40}
              autoFocus
              required
              style={{
                width: '100%', padding: '0.625rem 0.875rem', borderRadius: 10,
                border: '1.5px solid #E8E5F0', fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a1a',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E8E5F0' }}
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.35rem' }}>
              Email <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '0.625rem 0.875rem', borderRadius: 10,
                border: '1.5px solid #E8E5F0', fontSize: '0.9rem', outline: 'none',
                boxSizing: 'border-box', fontFamily: 'inherit', color: '#1a1a1a',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#E8E5F0' }}
            />
          </div>

          {err && (
            <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{err}</div>
          )}

          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{
              marginTop: '0.25rem', padding: '0.7rem', borderRadius: 10,
              border: 'none', background: '#7C3AED', color: '#fff',
              fontSize: '0.9rem', fontWeight: 600, cursor: saving || !name.trim() ? 'default' : 'pointer',
              opacity: saving || !name.trim() ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Continue →'}
          </button>
        </form>
      </div>
    </div>
  )
}
