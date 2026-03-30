'use client'

import { useState, useEffect } from 'react'
import { type Board } from '@/lib/types'

// ── Extract Google Maps embed src from iframe HTML ──
function extractEmbedSrc(input: string): string | null {
  const m = input.match(/src="(https:\/\/www\.google\.com\/maps\/embed[^"]*)"/)
  return m ? m[1] : null
}

// ── Parse lat/lng from various Google Maps URL formats ──
function parseLatLng(input: string): { lat: number; lng: number } | null {
  const atMatch = input.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
  const qMatch = input.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }
  // extract from pb= parameter: !3dLAT!4dLNG
  const pbLat = input.match(/!3d(-?\d+\.?\d*)/)
  const pbLng = input.match(/!4d(-?\d+\.?\d*)/)
  if (pbLat && pbLng) return { lat: parseFloat(pbLat[1]), lng: parseFloat(pbLng[1]) }
  // plain "lat, lng"
  const plainMatch = input.trim().match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/)
  if (plainMatch) return { lat: parseFloat(plainMatch[1]), lng: parseFloat(plainMatch[2]) }
  return null
}

function isShortLink(val: string) {
  return /maps\.app\.goo\.gl/.test(val)
}

const DUMMY_PHOTOS = [
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=900&q=80',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=80',
  'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=900&q=80',
]

type BoardInfoUpdates = {
  name: string
  description: string
  location_address: string
  location_lat: number | null
  location_lng: number | null
  photos: string[]
}

type Props = {
  board: Board
  onClose: () => void
  onSave: (updates: BoardInfoUpdates) => Promise<void>
}

export function ProjectInfoModal({ board, onClose, onSave }: Props) {
  const [name, setName]               = useState(board.name)
  const [description, setDescription] = useState(board.description ?? '')
  const [locationInput, setLocationInput] = useState(
    // If address is a Google embed URL, show friendly label in the input
    board.location_address?.startsWith('https://www.google.com/maps/embed')
      ? '' : (board.location_address ?? '')
  )
  const [lat, setLat] = useState<number | null>(board.location_lat ?? null)
  const [lng, setLng] = useState<number | null>(board.location_lng ?? null)
  // embedUrl: used directly as iframe src (Google Maps embed)
  const [embedUrl, setEmbedUrl] = useState<string | null>(
    board.location_address?.startsWith('https://www.google.com/maps/embed')
      ? board.location_address : null
  )
  const [resolving, setResolving] = useState(false)
  const [photos, setPhotos] = useState<string[]>(
    board.photos?.length ? board.photos : DUMMY_PHOTOS
  )
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [editingPhotoIdx, setEditingPhotoIdx] = useState<number | null>(null)
  const [photoUrlDraft, setPhotoUrlDraft] = useState('')
  const [hoveredPhoto, setHoveredPhoto] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Resolve short links (maps.app.goo.gl) via server ──
  useEffect(() => {
    if (!isShortLink(locationInput)) return
    let cancelled = false
    setResolving(true)
    fetch(`/api/resolve-maps?url=${encodeURIComponent(locationInput.trim())}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.finalUrl) return
        const parsed = parseLatLng(data.finalUrl)
        if (parsed) { setLat(parsed.lat); setLng(parsed.lng) }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [locationInput])

  function handleLocationChange(val: string) {
    setLocationInput(val)
    setEmbedUrl(null) // clear any previous embed

    if (!val.trim()) { setLat(null); setLng(null); return }

    // Case 1: iframe embed code pasted
    const src = extractEmbedSrc(val)
    if (src) { setEmbedUrl(src); setLat(null); setLng(null); return }

    // Case 2: raw embed URL pasted
    if (val.trim().startsWith('https://www.google.com/maps/embed')) {
      setEmbedUrl(val.trim()); setLat(null); setLng(null); return
    }

    // Case 3: short link — handled by useEffect above

    // Case 4: long Google Maps URL or plain coordinates
    const parsed = parseLatLng(val)
    if (parsed) { setLat(parsed.lat); setLng(parsed.lng) }
    else { setLat(null); setLng(null) }
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      name: name.trim() || board.name,
      description,
      // Store embed URL as location_address when available
      location_address: embedUrl ?? locationInput,
      location_lat: lat,
      location_lng: lng,
      photos,
    })
    setSaving(false)
    onClose()
  }

  // Map iframe src: prefer Google embed URL, fallback to OpenStreetMap
  const mapSrc = embedUrl
    ?? (lat !== null && lng !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.008},${lat - 0.008},${lng + 0.008},${lat + 0.008}&layer=mapnik&marker=${lat},${lng}`
      : null)

  const inputStyle: React.CSSProperties = {
    width: '100%', fontFamily: 'inherit',
    background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 8,
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.12s, background 0.12s',
    color: '#374151',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 1000 }}
      />

      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(96vw, 1080px)',
          maxHeight: '90vh',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          zIndex: 1001, display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.85rem 1.25rem',
          borderBottom: '1px solid #F3F4F6', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: '#9CA3AF' }}>
            <rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 4h6M4 7h6M4 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Project Info</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, border: 'none', background: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, cursor: 'pointer', color: '#9CA3AF', transition: 'all 0.12s',
            }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#F3F4F6'; b.style.color = '#374151' }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'none'; b.style.color = '#9CA3AF' }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* 3-column body */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr 1fr',
          gap: '1.25rem',
          padding: '1.25rem',
          flex: 1, minHeight: 0, overflow: 'auto',
        }}>

          {/* ── Col 1: Name + Description ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.35rem' }}>
                Project Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ ...inputStyle, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.01em', padding: '0.5rem 0.75rem' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#fff' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB' }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.35rem' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief project overview..."
                style={{
                  ...inputStyle, flex: 1, minHeight: 120,
                  fontSize: '0.8125rem', lineHeight: 1.55,
                  padding: '0.5rem 0.75rem', resize: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#fff' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB' }}
              />
            </div>
            <div style={{ fontSize: '0.65rem', color: '#C4B9D0', lineHeight: 1.6 }}>
              <div>Created {new Date(board.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div>Currency: {board.currency}</div>
            </div>
          </div>

          {/* ── Col 2: Location ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div>
              <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.35rem' }}>
                Location
              </label>
              <textarea
                value={locationInput}
                onChange={e => handleLocationChange(e.target.value)}
                placeholder={'Paste any of:\n• Google Maps short link (maps.app.goo.gl/…)\n• Embed iframe code (<iframe src="…">)\n• Coordinates (lat, lng)'}
                rows={3}
                style={{ ...inputStyle, fontSize: '0.72rem', padding: '0.45rem 0.75rem', resize: 'none', lineHeight: 1.5 }}
                onFocus={e => { e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#fff' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.background = '#F9FAFB' }}
              />
              {/* Status feedback */}
              {resolving && (
                <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginTop: '0.3rem' }}>⏳ Resolving link…</div>
              )}
              {embedUrl && !resolving && (
                <div style={{ fontSize: '0.6rem', color: '#059669', marginTop: '0.3rem', fontWeight: 500 }}>
                  ✓ Google Maps embed loaded
                  <button onClick={() => { setEmbedUrl(null); setLocationInput('') }} style={{ marginLeft: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '0.6rem' }}>✕ clear</button>
                </div>
              )}
              {lat !== null && lng !== null && !embedUrl && !resolving && (
                <div style={{ fontSize: '0.6rem', color: '#7C3AED', marginTop: '0.3rem', fontWeight: 500 }}>
                  📍 {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
              )}
            </div>

            {/* Map frame */}
            <div style={{
              flex: 1, borderRadius: 12, overflow: 'hidden',
              border: '1.5px solid #E8E5F0', background: '#F5F4FD',
              minHeight: 300, position: 'relative',
            }}>
              {mapSrc ? (
                <iframe
                  src={mapSrc}
                  width="100%" height="100%"
                  style={{ border: 'none', display: 'block', minHeight: 300 }}
                  title="Project Location"
                  loading="lazy"
                />
              ) : (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '0.6rem', color: '#C4B9D0',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                  <span style={{ fontSize: '0.75rem', textAlign: 'center', maxWidth: 180, lineHeight: 1.5 }}>
                    Paste a Google Maps URL or coordinates to show the location
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Col 3: Photos ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
              Photos
            </label>

            {/* Photo grid: large top + 2 bottom */}
            <div style={{ flex: 1, display: 'grid', gridTemplateRows: '1fr 1fr', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', minHeight: 300 }}>
              {/* Photo 0 — spans both rows on left */}
              <div
                style={{ gridRow: '1 / 3', gridColumn: '1', position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #E8E5F0', background: '#F5F4FD', cursor: 'zoom-in' }}
                onMouseEnter={() => setHoveredPhoto(0)}
                onMouseLeave={() => setHoveredPhoto(null)}
              >
                <PhotoSlot
                  url={photos[0]}
                  hovered={hoveredPhoto === 0}
                  onView={() => setLightboxIdx(0)}
                  onEdit={() => { setEditingPhotoIdx(0); setPhotoUrlDraft(photos[0]) }}
                  editing={editingPhotoIdx === 0}
                  photoUrlDraft={photoUrlDraft}
                  setPhotoUrlDraft={setPhotoUrlDraft}
                  onSaveUrl={() => {
                    if (photoUrlDraft.trim()) setPhotos(p => p.map((u, i) => i === 0 ? photoUrlDraft.trim() : u))
                    setEditingPhotoIdx(null); setPhotoUrlDraft('')
                  }}
                  onCancelEdit={() => { setEditingPhotoIdx(null); setPhotoUrlDraft('') }}
                />
              </div>
              {/* Photos 1 + 2 — stacked on right */}
              {[1, 2].map(i => (
                <div
                  key={i}
                  style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #E8E5F0', background: '#F5F4FD', cursor: 'zoom-in' }}
                  onMouseEnter={() => setHoveredPhoto(i)}
                  onMouseLeave={() => setHoveredPhoto(null)}
                >
                  <PhotoSlot
                    url={photos[i]}
                    hovered={hoveredPhoto === i}
                    onView={() => setLightboxIdx(i)}
                    onEdit={() => { setEditingPhotoIdx(i); setPhotoUrlDraft(photos[i]) }}
                    editing={editingPhotoIdx === i}
                    photoUrlDraft={photoUrlDraft}
                    setPhotoUrlDraft={setPhotoUrlDraft}
                    onSaveUrl={() => {
                      if (photoUrlDraft.trim()) setPhotos(p => p.map((u, pi) => pi === i ? photoUrlDraft.trim() : u))
                      setEditingPhotoIdx(null); setPhotoUrlDraft('')
                    }}
                    onCancelEdit={() => { setEditingPhotoIdx(null); setPhotoUrlDraft('') }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem',
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid #F3F4F6', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.45rem 1rem', border: '1px solid #E5E7EB', borderRadius: 8,
              background: '#fff', color: '#6B7280', cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'inherit',
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#9CA3AF' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.45rem 1.25rem', border: 'none', borderRadius: 8,
              background: saving ? '#A78BFA' : '#7C3AED', color: '#fff',
              cursor: saving ? 'default' : 'pointer',
              fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit',
              transition: 'background 0.12s',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          onClick={() => setLightboxIdx(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
            zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={photos[lightboxIdx]}
            alt={`Photo ${lightboxIdx + 1}`}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '88vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}
          />
          {/* Close */}
          <button
            onClick={() => setLightboxIdx(null)}
            style={{
              position: 'absolute', top: 20, right: 20,
              width: 38, height: 38, border: 'none', borderRadius: 8,
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
          {/* Prev */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxIdx(i => ((i ?? 0) - 1 + photos.length) % photos.length) }}
            style={{
              position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
              width: 42, height: 42, border: 'none', borderRadius: 8,
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {/* Next */}
          <button
            onClick={e => { e.stopPropagation(); setLightboxIdx(i => ((i ?? 0) + 1) % photos.length) }}
            style={{
              position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
              width: 42, height: 42, border: 'none', borderRadius: 8,
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8.5 6l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      )}
    </>
  )
}

// ── PhotoSlot sub-component ──
function PhotoSlot({
  url, hovered, onView, onEdit, editing,
  photoUrlDraft, setPhotoUrlDraft, onSaveUrl, onCancelEdit,
}: {
  url: string
  hovered: boolean
  onView: () => void
  onEdit: () => void
  editing: boolean
  photoUrlDraft: string
  setPhotoUrlDraft: (v: string) => void
  onSaveUrl: () => void
  onCancelEdit: () => void
}) {
  if (editing) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.97)', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', zIndex: 2 }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Photo URL</span>
        <input
          autoFocus
          value={photoUrlDraft}
          onChange={e => setPhotoUrlDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveUrl(); if (e.key === 'Escape') onCancelEdit() }}
          placeholder="https://..."
          style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', border: '1.5px solid #DDD6FE', borderRadius: 6, outline: 'none', fontFamily: 'inherit', color: '#374151' }}
        />
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={onSaveUrl}
            style={{ flex: 1, padding: '0.3rem', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, fontFamily: 'inherit' }}
          >Set</button>
          <button
            onClick={onCancelEdit}
            style={{ flex: 1, padding: '0.3rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'inherit' }}
          >Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <img
        src={url}
        alt="Project photo"
        onClick={onView}
        style={{ width: '100%', height: '100%', minHeight: 80, objectFit: 'cover', display: 'block' }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
      />
      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.28)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        <button
          onClick={e => { e.stopPropagation(); onView() }}
          title="View full size"
          style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          title="Change photo"
          style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </>
  )
}
