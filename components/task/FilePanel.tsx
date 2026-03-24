'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  boardId: string
  filePanelUrl: string | null
  isCreator: boolean
  onUpdate: (url: string | null) => Promise<void>
}

type EmbedInfo = {
  type: 'gdrive-folder' | 'gdrive-file' | 'onedrive' | 'link'
  embedUrl: string
  displayName: string
}

type BoardImage = {
  id: string
  board_id: string
  storage_path: string
  file_name: string
  added_at: string
}

function parseUrl(url: string): EmbedInfo | null {
  if (!url) return null
  const trimmed = url.trim()
  const gFolderMatch = trimmed.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
  if (gFolderMatch) {
    return { type: 'gdrive-folder', embedUrl: `https://drive.google.com/embeddedfolderview?id=${gFolderMatch[1]}#list`, displayName: 'Google Drive Folder' }
  }
  const gFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (gFileMatch) {
    return { type: 'gdrive-file', embedUrl: `https://drive.google.com/file/d/${gFileMatch[1]}/preview`, displayName: 'Google Drive File' }
  }
  if (trimmed.includes('onedrive.live.com') || trimmed.includes('1drv.ms') || trimmed.includes('sharepoint.com')) {
    return { type: 'onedrive', embedUrl: trimmed, displayName: 'OneDrive / SharePoint' }
  }
  return { type: 'link', embedUrl: trimmed, displayName: 'Shared Folder' }
}

const PLATFORM_ICONS: Record<string, string> = {
  'gdrive-folder': '📁', 'gdrive-file': '📄', 'onedrive': '☁️', 'link': '🔗',
}

const BUCKET = 'board-images'
const MAX_MB = 5

function getPublicUrl(path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export function FilePanel({ boardId, filePanelUrl, isCreator, onUpdate }: Props) {
  const [tab, setTab] = useState<'files' | 'gallery'>('files')

  // ── Files tab state ──
  const [editing, setEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState(filePanelUrl ?? '')
  const [saving, setSaving] = useState(false)

  // ── Gallery tab state ──
  const [images, setImages] = useState<BoardImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState<BoardImage | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const embed = filePanelUrl ? parseUrl(filePanelUrl) : null
  const canEmbed = embed?.type === 'gdrive-folder' || embed?.type === 'gdrive-file'

  // ── Fetch images ──
  useEffect(() => {
    supabase
      .from('board_images')
      .select('*')
      .eq('board_id', boardId)
      .order('added_at', { ascending: false })
      .then(({ data }) => setImages(data ?? []))
  }, [boardId])

  // ── Realtime ──
  useEffect(() => {
    const channel = supabase
      .channel(`gallery-${boardId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_images', filter: `board_id=eq.${boardId}` },
        payload => setImages(prev => [payload.new as BoardImage, ...prev]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_images', filter: `board_id=eq.${boardId}` },
        payload => setImages(prev => prev.filter(img => img.id !== (payload.old as BoardImage).id)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [boardId])

  // ── Upload ──
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!list.length) return
    setUploadError(null)

    for (const file of list) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setUploadError(`${file.name} is too large (max ${MAX_MB}MB)`)
        continue
      }
      setUploading(true)
      const ext = file.name.split('.').pop()
      const path = `${boardId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file)
      if (error) { setUploadError('Upload failed'); setUploading(false); continue }
      await supabase.from('board_images').insert({ board_id: boardId, storage_path: path, file_name: file.name })
      setUploading(false)
    }
  }, [boardId])

  // ── Delete image ──
  async function deleteImage(img: BoardImage) {
    await supabase.storage.from(BUCKET).remove([img.storage_path])
    await supabase.from('board_images').delete().eq('id', img.id)
    if (lightbox?.id === img.id) setLightbox(null)
  }

  // ── Files tab: save/cancel ──
  async function handleSave() {
    setSaving(true)
    await onUpdate(inputUrl.trim() || null)
    setSaving(false)
    setEditing(false)
  }
  function handleCancel() { setInputUrl(filePanelUrl ?? ''); setEditing(false) }

  return (
    <>
      <div style={{ width: 300, flexShrink: 0, borderLeft: '1.5px solid #E8E5E0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1.5px solid #F3F4F6', flexShrink: 0 }}>
          {(['files', 'gallery'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '0.625rem',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${tab === t ? '#c9a96e' : 'transparent'}`,
                color: tab === t ? '#c9a96e' : '#9ca3af',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                letterSpacing: '0.02em',
              }}
            >
              {t === 'files' ? '📁 Files' : '🖼 Gallery'}
            </button>
          ))}
        </div>

        {/* ── FILES TAB ── */}
        {tab === 'files' && (
          <>
            {/* Header with edit button */}
            <div style={{ padding: '0.875rem 1rem', borderBottom: '1.5px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>Shared folder</span>
              {!editing && (
                <button
                  onClick={() => { setInputUrl(filePanelUrl ?? ''); setEditing(true) }}
                  style={{ background: 'transparent', border: 'none', color: '#c4bfb9', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.4rem', borderRadius: '6px', transition: 'color 0.15s ease' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
                >
                  {filePanelUrl ? '✎' : '+ Link'}
                </button>
              )}
            </div>

            {editing && (
              <div style={{ padding: '1rem', borderBottom: '1.5px solid #F3F4F6', flexShrink: 0 }}>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.625rem', lineHeight: 1.5 }}>
                  Paste a Google Drive or OneDrive folder link. The folder must be shared with "Anyone with the link."
                </p>
                <textarea
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  rows={3}
                  autoFocus
                  style={{ width: '100%', fontSize: '0.75rem', border: '1.5px solid #E8E5E0', borderRadius: '8px', padding: '0.5rem 0.625rem', resize: 'none', fontFamily: 'inherit', color: '#1a1a1a', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '0.4rem 0.75rem', background: '#c9a96e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={handleCancel} style={{ flex: 1, padding: '0.4rem 0.5rem', background: 'transparent', color: '#9ca3af', border: '1.5px solid #E8E5E0', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
                {filePanelUrl && (
                  <button onClick={async () => { setSaving(true); await onUpdate(null); setSaving(false); setEditing(false) }} style={{ marginTop: '0.375rem', width: '100%', padding: '0.3rem', background: 'transparent', color: '#c4bfb9', border: 'none', fontSize: '0.7rem', cursor: 'pointer' }}>
                    Remove link
                  </button>
                )}
              </div>
            )}

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {!filePanelUrl ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.4 }}>📂</div>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.375rem' }}>No folder linked yet</p>
                  <p style={{ fontSize: '0.75rem', color: '#c4bfb9', lineHeight: 1.5 }}>Link a Google Drive or OneDrive shared folder.</p>
                  <button onClick={() => { setInputUrl(''); setEditing(true) }} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#fdf6ed', color: '#c9a96e', border: '1.5px solid #f0e4d0', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                    + Link a folder
                  </button>
                </div>
              ) : canEmbed ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '0.5rem 1rem', background: '#fafaf9', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{ fontSize: '0.75rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}>{embed!.displayName}</span>
                    <a href={filePanelUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#c9a96e', textDecoration: 'none' }}>Open ↗</a>
                  </div>
                  <iframe src={embed!.embedUrl} style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }} allow="clipboard-read; clipboard-write" />
                </div>
              ) : (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <a href={embed!.embedUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', background: '#fdf6ed', border: '1.5px solid #f0e4d0', borderRadius: '12px', textDecoration: 'none', transition: 'border-color 0.15s ease' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c9a96e' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#f0e4d0' }}>
                    <span style={{ fontSize: '1.5rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>{embed!.displayName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.1rem' }}>Click to open in browser ↗</div>
                    </div>
                  </a>
                  <p style={{ fontSize: '0.7rem', color: '#c4bfb9', lineHeight: 1.5, padding: '0 0.25rem' }}>
                    OneDrive and SharePoint folders open in a new tab.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── GALLERY TAB ── */}
        {tab === 'gallery' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                margin: '0.75rem',
                padding: '1rem',
                border: `2px dashed ${dragOver ? '#c9a96e' : '#E8E5E0'}`,
                borderRadius: '12px',
                background: dragOver ? '#fdf6ed' : '#fafaf9',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = '' }}
              />
              {uploading ? (
                <p style={{ fontSize: '0.75rem', color: '#c9a96e', fontWeight: 600 }}>Uploading…</p>
              ) : (
                <>
                  <p style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>📸</p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>Drop images here or click to upload</p>
                  <p style={{ fontSize: '0.7rem', color: '#c4bfb9', marginTop: '0.2rem' }}>JPG, PNG, GIF, WebP · max {MAX_MB}MB</p>
                </>
              )}
            </div>

            {uploadError && (
              <p style={{ fontSize: '0.7rem', color: '#ef4444', padding: '0 0.75rem', marginTop: '-0.25rem', marginBottom: '0.5rem' }}>{uploadError}</p>
            )}

            {/* Image grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.75rem 0.75rem' }}>
              {images.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, color: '#c4bfb9' }}>
                  <p style={{ fontSize: '0.75rem' }}>No images yet</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {images.map(img => (
                    <div
                      key={img.id}
                      onClick={() => setLightbox(img)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#F3F4F6',
                        position: 'relative',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getPublicUrl(img.storage_path)}
                        alt={img.file_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '2rem',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getPublicUrl(lightbox.storage_path)}
            alt={lightbox.file_name}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '80vh',
              borderRadius: '12px',
              objectFit: 'contain',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            }}
          />
          <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}
          >
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>{lightbox.file_name}</p>
            <button
              onClick={() => deleteImage(lightbox)}
              style={{
                fontSize: '0.75rem', color: '#ef4444',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px', padding: '0.3rem 0.7rem',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setLightbox(null)}
              style={{
                fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px', padding: '0.3rem 0.7rem',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
