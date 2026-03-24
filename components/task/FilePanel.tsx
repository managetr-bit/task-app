'use client'

import { useState } from 'react'

type Props = {
  filePanelUrl: string | null
  isCreator: boolean
  onUpdate: (url: string | null) => Promise<void>
}

type EmbedInfo = {
  type: 'gdrive-folder' | 'gdrive-file' | 'onedrive' | 'link'
  embedUrl: string
  displayName: string
}

function parseUrl(url: string): EmbedInfo | null {
  if (!url) return null
  const trimmed = url.trim()

  // Google Drive folder
  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  const gFolderMatch = trimmed.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
  if (gFolderMatch) {
    return {
      type: 'gdrive-folder',
      embedUrl: `https://drive.google.com/embeddedfolderview?id=${gFolderMatch[1]}#list`,
      displayName: 'Google Drive Folder',
    }
  }

  // Google Drive file
  // https://drive.google.com/file/d/FILE_ID/view
  const gFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (gFileMatch) {
    return {
      type: 'gdrive-file',
      embedUrl: `https://drive.google.com/file/d/${gFileMatch[1]}/preview`,
      displayName: 'Google Drive File',
    }
  }

  // OneDrive shared link
  if (trimmed.includes('onedrive.live.com') || trimmed.includes('1drv.ms') || trimmed.includes('sharepoint.com')) {
    return {
      type: 'onedrive',
      embedUrl: trimmed,
      displayName: 'OneDrive / SharePoint',
    }
  }

  return { type: 'link', embedUrl: trimmed, displayName: 'Shared Folder' }
}

const PLATFORM_ICONS: Record<string, string> = {
  'gdrive-folder': '📁',
  'gdrive-file': '📄',
  'onedrive': '☁️',
  'link': '🔗',
}

export function FilePanel({ filePanelUrl, isCreator, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState(filePanelUrl ?? '')
  const [saving, setSaving] = useState(false)

  const embed = filePanelUrl ? parseUrl(filePanelUrl) : null
  const canEmbed = embed?.type === 'gdrive-folder' || embed?.type === 'gdrive-file'

  async function handleSave() {
    setSaving(true)
    await onUpdate(inputUrl.trim() || null)
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setInputUrl(filePanelUrl ?? '')
    setEditing(false)
  }

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: '1.5px solid #E8E5E0',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '0.875rem 1rem',
          borderBottom: '1.5px solid #F3F4F6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem' }}>📁</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>Files</span>
        </div>
        {!editing && (
          <button
            onClick={() => { setInputUrl(filePanelUrl ?? ''); setEditing(true) }}
            title={isCreator ? 'Configure shared folder' : 'Change shared folder link'}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#c4bfb9',
              cursor: 'pointer',
              fontSize: '0.8rem',
              padding: '0.2rem 0.4rem',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
          >
            {filePanelUrl ? '✎' : '+ Link'}
          </button>
        )}
      </div>

      {/* Edit mode */}
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
            style={{
              width: '100%',
              fontSize: '0.75rem',
              border: '1.5px solid #E8E5E0',
              borderRadius: '8px',
              padding: '0.5rem 0.625rem',
              resize: 'none',
              fontFamily: 'inherit',
              color: '#1a1a1a',
              outline: 'none',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2,
                padding: '0.4rem 0.75rem',
                background: '#c9a96e',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                background: 'transparent',
                color: '#9ca3af',
                border: '1.5px solid #E8E5E0',
                borderRadius: '8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
          {filePanelUrl && (
            <button
              onClick={async () => { setSaving(true); await onUpdate(null); setSaving(false); setEditing(false) }}
              style={{
                marginTop: '0.375rem',
                width: '100%',
                padding: '0.3rem',
                background: 'transparent',
                color: '#c4bfb9',
                border: 'none',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              Remove link
            </button>
          )}
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!filePanelUrl ? (
          // Empty state
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem 1.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.4 }}>📂</div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#9ca3af', marginBottom: '0.375rem' }}>
              No folder linked yet
            </p>
            <p style={{ fontSize: '0.75rem', color: '#c4bfb9', lineHeight: 1.5 }}>
              Link a Google Drive or OneDrive shared folder to keep your team's files in one place.
            </p>
            <button
              onClick={() => { setInputUrl(''); setEditing(true) }}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: '#fdf6ed',
                color: '#c9a96e',
                border: '1.5px solid #f0e4d0',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Link a folder
            </button>
          </div>
        ) : canEmbed ? (
          // Embedded iframe (Google Drive)
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                padding: '0.5rem 1rem',
                background: '#fafaf9',
                borderBottom: '1px solid #F3F4F6',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span style={{ fontSize: '0.75rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}>{embed!.displayName}</span>
              <a
                href={filePanelUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#c9a96e', textDecoration: 'none' }}
              >
                Open ↗
              </a>
            </div>
            <iframe
              src={embed!.embedUrl}
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                minHeight: 0,
              }}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        ) : (
          // Non-embeddable: show link card
          <div
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <a
              href={embed!.embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.875rem 1rem',
                background: '#fdf6ed',
                border: '1.5px solid #f0e4d0',
                borderRadius: '12px',
                textDecoration: 'none',
                transition: 'border-color 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c9a96e' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#f0e4d0' }}
            >
              <span style={{ fontSize: '1.5rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>
                  {embed!.displayName}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                  Click to open in browser ↗
                </div>
              </div>
            </a>
            <p style={{ fontSize: '0.7rem', color: '#c4bfb9', lineHeight: 1.5, padding: '0 0.25rem' }}>
              OneDrive and SharePoint folders open in a new tab. For embedded preview, use a Google Drive folder link.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
