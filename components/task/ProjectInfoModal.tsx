'use client'

import { useState, useEffect, useRef } from 'react'
import { type Board } from '@/lib/types'
import { supabase } from '@/lib/supabase'

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
  // extract from pb= parameter: !3dLAT!4dLNG (share link) or !2dLNG!3dLAT (embed URL)
  const pbLat = input.match(/!3d(-?\d+\.?\d*)/)
  const pbLng = input.match(/!4d(-?\d+\.?\d*)/) ?? input.match(/!2d(-?\d+\.?\d*)/)
  if (pbLat && pbLng) return { lat: parseFloat(pbLat[1]), lng: parseFloat(pbLng[1]) }
  // /search/LAT,+LNG path format (what maps.app.goo.gl short links resolve to)
  const searchMatch = input.match(/\/search\/(-?\d+\.?\d*),\+?(-?\d+\.?\d*)/)
  if (searchMatch) return { lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) }
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
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&q=80',
  'https://images.unsplash.com/photo-1590496793929-36417d3117de?w=900&q=80',
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
  boardId: string
  onClose: () => void
  onSave: (updates: BoardInfoUpdates) => Promise<void>
}

export function ProjectInfoModal({ board, boardId, onClose, onSave }: Props) {
  const [name, setName]               = useState(board.name)
  const [description, setDescription] = useState(board.description ?? '')
  const [locationInput, setLocationInput] = useState(
    board.location_address?.startsWith('https://www.google.com/maps/embed')
      ? '' : (board.location_address ?? '')
  )
  const [lat, setLat] = useState<number | null>(board.location_lat ?? null)
  const [lng, setLng] = useState<number | null>(board.location_lng ?? null)
  const [embedUrl, setEmbedUrl] = useState<string | null>(
    board.location_address?.startsWith('https://www.google.com/maps/embed')
      ? board.location_address : null
  )
  const [resolving, setResolving] = useState(false)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>(() => {
    // Always ensure 5 slots so indices 3 and 4 are accessible
    const base = board.photos?.length ? board.photos : DUMMY_PHOTOS
    return Array.from({ length: 5 }, (_, i) => base[i] ?? '')
  })
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [editingPhotoIdx, setEditingPhotoIdx] = useState<number | null>(null)
  const [photoUrlDraft, setPhotoUrlDraft] = useState('')
  const [hoveredPhoto, setHoveredPhoto] = useState<number | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Resolve short links (maps.app.goo.gl) via server ──
  useEffect(() => {
    if (!isShortLink(locationInput)) { setResolvedUrl(null); return }
    let cancelled = false
    setResolving(true)
    fetch(`/api/resolve-maps?url=${encodeURIComponent(locationInput.trim())}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.finalUrl) return
        setResolvedUrl(data.finalUrl) // store the full URL so we can save it
        const parsed = parseLatLng(data.finalUrl)
        if (parsed) { setLat(parsed.lat); setLng(parsed.lng) }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [locationInput])

  function handleLocationChange(val: string) {
    setLocationInput(val)
    setEmbedUrl(null)
    setResolvedUrl(null)

    if (!val.trim()) { setLat(null); setLng(null); return }

    const src = extractEmbedSrc(val)
    if (src) { setEmbedUrl(src); setLat(null); setLng(null); return }

    if (val.trim().startsWith('https://www.google.com/maps/embed')) {
      setEmbedUrl(val.trim()); setLat(null); setLng(null); return
    }

    const parsed = parseLatLng(val)
    if (parsed) { setLat(parsed.lat); setLng(parsed.lng) }
    else { setLat(null); setLng(null) }
  }

  async function handleFileUpload(photoIdx: number, file: File) {
    setUploadingIdx(photoIdx)
    setUploadError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${boardId}/${Date.now()}_${photoIdx}.${ext}`
      const { data, error } = await supabase.storage
        .from('board-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('board-photos')
        .getPublicUrl(data.path)
      setPhotos(p => p.map((u, i) => i === photoIdx ? publicUrl : u))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
    } finally {
      setUploadingIdx(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    // If lat/lng are missing, try to extract them from embedUrl or resolvedUrl
    let finalLat = lat
    let finalLng = lng
    if (finalLat === null || finalLng === null) {
      const fallbackUrl = embedUrl ?? resolvedUrl
      if (fallbackUrl) {
        const parsed = parseLatLng(fallbackUrl)
        if (parsed) { finalLat = parsed.lat; finalLng = parsed.lng }
      }
    }
    await onSave({
      name: name.trim() || board.name,
      description,
      // prefer embedUrl, then resolved long URL (for short links), then raw input
      location_address: embedUrl ?? resolvedUrl ?? locationInput,
      location_lat: finalLat,
      location_lng: finalLng,
      photos: photos.filter(p => p.trim()),  // strip empty slots before saving
    })
    setSaving(false)
    onClose()
  }

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Photos
              </label>
              <span style={{ fontSize: '0.55rem', color: '#C4B9D0', letterSpacing: '0.02em' }}>
                — hover a photo to upload or change
              </span>
            </div>

            {uploadError && (
              <div style={{ fontSize: '0.65rem', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '0.35rem 0.6rem' }}>
                Upload error: {uploadError}
                <button onClick={() => setUploadError(null)} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '0.6rem' }}>✕</button>
              </div>
            )}

            {/* Photo grid: 1 large left + 2x2 grid right */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', minHeight: 300 }}>
              {/* Photo 0 — spans both rows on left */}
              <div
                style={{ gridRow: '1 / 3', position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #E8E5F0', background: '#F5F4FD', cursor: 'zoom-in' }}
                onMouseEnter={() => setHoveredPhoto(0)}
                onMouseLeave={() => setHoveredPhoto(null)}
              >
                <PhotoSlot
                  url={photos[0]}
                  hovered={hoveredPhoto === 0}
                  uploading={uploadingIdx === 0}
                  onView={() => setLightboxIdx(0)}
                  onEdit={() => { setEditingPhotoIdx(0); setPhotoUrlDraft(photos[0]) }}
                  onFileSelected={file => handleFileUpload(0, file)}
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
              {/* Photos 1–4 — 2×2 grid on right */}
              <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', gridRow: '1 / 3' }}>
                {[1, 2, 3, 4].map(i => (
                  <div
                    key={i}
                    style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #E8E5F0', background: '#F5F4FD', cursor: 'zoom-in' }}
                    onMouseEnter={() => setHoveredPhoto(i)}
                    onMouseLeave={() => setHoveredPhoto(null)}
                  >
                    <PhotoSlot
                      url={photos[i]}
                      hovered={hoveredPhoto === i}
                      uploading={uploadingIdx === i}
                      onView={() => setLightboxIdx(i)}
                      onEdit={() => { setEditingPhotoIdx(i); setPhotoUrlDraft(photos[i]) }}
                      onFileSelected={file => handleFileUpload(i, file)}
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
  url, hovered, uploading, onView, onEdit, onFileSelected, editing,
  photoUrlDraft, setPhotoUrlDraft, onSaveUrl, onCancelEdit,
}: {
  url: string
  hovered: boolean
  uploading: boolean
  onView: () => void
  onEdit: () => void
  onFileSelected: (file: File) => void
  editing: boolean
  photoUrlDraft: string
  setPhotoUrlDraft: (v: string) => void
  onSaveUrl: () => void
  onCancelEdit: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
    // reset so same file can be re-selected
    e.target.value = ''
  }

  if (uploading) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#F5F4FD' }}>
        {/* Spinner */}
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="14" cy="14" r="11" stroke="#DDD6FE" strokeWidth="2.5"/>
          <path d="M14 3a11 11 0 0 1 11 11" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 500 }}>Uploading…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (editing) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.97)', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', zIndex: 2 }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Change Photo</span>
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.6rem', background: '#F5F4FD', border: '1.5px solid #DDD6FE',
            borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
            color: '#7C3AED', fontFamily: 'inherit', width: '100%', justifyContent: 'center',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M7 9.5V3.5M4.5 6L7 3.5L9.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Upload from device
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#D1D5DB' }}>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          <span style={{ fontSize: '0.55rem', fontWeight: 500, letterSpacing: '0.06em' }}>OR URL</span>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        </div>
        <input
          autoFocus
          value={photoUrlDraft}
          onChange={e => setPhotoUrlDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSaveUrl(); if (e.key === 'Escape') onCancelEdit() }}
          placeholder="https://..."
          style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', border: '1.5px solid #E5E7EB', borderRadius: 6, outline: 'none', fontFamily: 'inherit', color: '#374151' }}
        />
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={onSaveUrl}
            style={{ flex: 1, padding: '0.3rem', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600, fontFamily: 'inherit' }}
          >Set URL</button>
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
      {/* Hidden file input for direct upload from hover overlay */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      {url ? (
        <img
          src={url}
          alt="Project photo"
          onClick={onView}
          style={{ width: '100%', height: '100%', minHeight: 80, objectFit: 'cover', display: 'block' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0.2' }}
        />
      ) : (
        <div
          onClick={onEdit}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', background: '#F5F4FD', cursor: 'pointer' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.35 }}>
            <path d="M10 4v12M4 10h12" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: '0.55rem', color: '#C4B5FD', fontWeight: 600 }}>Add photo</span>
        </div>
      )}
      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.28)',
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
        pointerEvents: hovered ? 'auto' : 'none',
      }}>
        {/* View */}
        <button
          onClick={e => { e.stopPropagation(); onView() }}
          title="View full size"
          style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Upload from device */}
        <button
          onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}
          title="Upload from device"
          style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 9.5V3.5M4.5 6L7 3.5L9.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Enter URL */}
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          title="Change photo URL"
          style={{ width: 32, height: 32, border: 'none', borderRadius: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </>
  )
}
