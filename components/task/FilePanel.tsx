'use client'

import { useState, useEffect } from 'react'

type Props = {
  boardId: string
  filePanelUrl: string | null
  isCreator: boolean
  onUpdate: (url: string | null) => Promise<void>
  cloudScriptUrl: string
  onCloudScriptUrlChange: (url: string) => void
}

type EmbedInfo = {
  type: 'gdrive-folder' | 'gdrive-file' | 'onedrive' | 'link'
  embedUrl: string
  displayName: string
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

export function FilePanel({ boardId, filePanelUrl, isCreator, onUpdate, cloudScriptUrl, onCloudScriptUrlChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [inputUrl, setInputUrl] = useState(filePanelUrl ?? '')
  const [saving, setSaving] = useState(false)
  const [showUploadSetup, setShowUploadSetup] = useState(false)
  const [scriptDraft, setScriptDraft] = useState(cloudScriptUrl)
  const [savedLinks, setSavedLinks] = useState<{url: string; label: string; savedAt: string}[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`saved_links_${boardId}`)
      setSavedLinks(raw ? JSON.parse(raw) : [])
    } catch { setSavedLinks([]) }
  }, [boardId])

  function removeSavedLink(index: number) {
    const updated = savedLinks.filter((_, i) => i !== index)
    setSavedLinks(updated)
    localStorage.setItem(`saved_links_${boardId}`, JSON.stringify(updated))
  }

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
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1.5px solid #E8E5E0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Panel header */}
      <div style={{ padding: '0.875rem 1rem', borderBottom: '1.5px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem' }}>📁</span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>Files</span>
        </div>
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
            <p style={{ fontSize: '0.75rem', color: '#c4bfb9', lineHeight: 1.5 }}>Link a Google Drive or OneDrive shared folder to keep your team's files in one place.</p>
            <button onClick={() => { setInputUrl(''); setEditing(true) }} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#fdf6ed', color: '#c9a96e', border: '1.5px solid #f0e4d0', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
              + Link a folder
            </button>
          </div>
        ) : canEmbed ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0.5rem 1rem', background: '#fafaf9', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.75rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}>{embed!.displayName}</span>
              <a href={filePanelUrl!} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#c9a96e', textDecoration: 'none' }}>Open ↗</a>
            </div>
            <iframe src={embed!.embedUrl} style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }} allow="clipboard-read; clipboard-write" />

            {/* ── Upload setup (only for Google Drive folders) ── */}
            {embed!.type === 'gdrive-folder' && (
              <div style={{ flexShrink: 0, borderTop: '1px solid #F0EDE8', background: '#FAFAF9' }}>
                <button
                  onClick={() => { setScriptDraft(cloudScriptUrl); setShowUploadSetup(p => !p) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '0.65rem' }}>{cloudScriptUrl ? '🟢' : '⚪'}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af' }}>
                    {cloudScriptUrl ? 'Upload enabled' : 'Enable uploads (Notes & Whiteboard)'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#c4bfb9' }}>{showUploadSetup ? '▲' : '▼'}</span>
                </button>
                {showUploadSetup && (
                  <div style={{ padding: '0 1rem 0.875rem' }}>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                      Notes export to <strong>notes/</strong> and whiteboard saves go to <strong>whiteboard/</strong> inside this Drive folder. Requires a Google Apps Script Web App URL.
                    </p>
                    <details style={{ marginBottom: '0.625rem', fontSize: '0.68rem', color: '#9ca3af', background: '#F3F4F6', borderRadius: 8, padding: '0.4rem 0.625rem' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>How to set up (one-time)</summary>
                      <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                        <li>Go to <strong>script.google.com</strong> → New project</li>
                        <li>Paste the script below and save</li>
                        <li><strong>Deploy → New deployment → Web App</strong></li>
                        <li><em>Execute as</em>: Me &nbsp;|&nbsp; <em>Access</em>: Anyone</li>
                        <li>Copy the Web App URL and paste it below</li>
                      </ol>
                      <pre style={{ marginTop: '0.5rem', background: '#fff', padding: '0.5rem', borderRadius: 6, fontSize: '0.62rem', overflowX: 'auto', border: '1px solid #E8E5E0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var root = d.parentFolderId
      ? DriveApp.getFolderById(d.parentFolderId)
      : DriveApp.getRootFolder();
    var sub = getOrCreate(root, d.folder || 'files');
    var blob;
    if (d.data && d.data.indexOf('base64,') > -1) {
      var b64 = d.data.split('base64,')[1];
      blob = Utilities.newBlob(
        Utilities.base64Decode(b64), 'image/png', d.fileName);
    } else {
      blob = Utilities.newBlob(
        d.data || '', 'text/plain', d.fileName);
    }
    var file = sub.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW);
    return ContentService
      .createTextOutput(JSON.stringify(
        {success:true, url:file.getUrl()}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify(
        {success:false, error:err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
function getOrCreate(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}`}</pre>
                    </details>
                    <input
                      value={scriptDraft}
                      onChange={e => setScriptDraft(e.target.value)}
                      placeholder="https://script.google.com/macros/s/…/exec"
                      style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1.5px solid #E8E5E0', fontSize: '0.7rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.5rem', fontFamily: 'monospace', color: '#374151' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#c9a96e' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#E8E5E0' }}
                    />
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        onClick={() => { onCloudScriptUrlChange(scriptDraft.trim()); setShowUploadSetup(false) }}
                        style={{ flex: 1, padding: '0.4rem', borderRadius: 8, border: 'none', background: '#c9a96e', color: '#fff', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                      >Save</button>
                      {cloudScriptUrl && (
                        <button
                          onClick={() => { onCloudScriptUrlChange(''); setScriptDraft(''); setShowUploadSetup(false) }}
                          style={{ padding: '0.4rem 0.625rem', borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer' }}
                        >Disconnect</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a href={embed!.embedUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1rem', background: '#fdf6ed', border: '1.5px solid #f0e4d0', borderRadius: '12px', textDecoration: 'none', transition: 'border-color 0.15s ease' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#c9a96e' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = '#f0e4d0' }}>
              <span style={{ fontSize: '1.5rem' }}>{PLATFORM_ICONS[embed!.type]}</span>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>{embed!.displayName}</div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.1rem' }}>Click to open in browser ↗</div>
              </div>
            </a>
            <p style={{ fontSize: '0.7rem', color: '#c4bfb9', lineHeight: 1.5, padding: '0 0.25rem' }}>
              OneDrive and SharePoint folders open in a new tab. For embedded preview, use a Google Drive folder link.
            </p>
          </div>
        )}
      </div>

      {/* Saved links from notes */}
      {savedLinks.length > 0 && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #E8E5F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Saved Links
          </div>
          {savedLinks.map((link, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '0.7rem' }}>🔗</span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.75rem', color: '#7C3AED', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
              >
                {link.label || link.url}
              </a>
              <button
                onClick={() => removeSavedLink(i)}
                style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
