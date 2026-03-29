'use client'

import { useRef, useEffect, useState } from 'react'

type Tool = 'pen' | 'eraser'

const COLORS = ['#1a1a1a', '#7C3AED', '#ef4444', '#3b82f6', '#22c55e', '#8b5cf6', '#f59e0b', '#ec4899']
const WIDTHS = [2, 5, 12]

type SavedSketch = { id: string; dataUrl: string; title: string; savedAt: string }

type Props = {
  boardId: string
  onClose: () => void
  cloudScriptUrl?: string
  driveFolderId?: string
}

export function Whiteboard({ boardId, onClose, cloudScriptUrl, driveFolderId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#1a1a1a')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [isDrawing, setIsDrawing] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [savedSketches, setSavedSketches] = useState<SavedSketch[]>([])
  const [showGallery, setShowGallery] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [driveStatus, setDriveStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle')

  const STORAGE_KEY = `whiteboard_${boardId}`

  // Load saved sketches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSavedSketches(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [boardId, STORAGE_KEY])

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  // Resolve effective line width — Apple Pencil sends pressure 0..1, finger/mouse sends 0.5
  function effectiveWidth(e: React.PointerEvent<HTMLCanvasElement>) {
    const base = tool === 'eraser' ? strokeWidth * 4 : strokeWidth
    // Apply pressure only for actual stylus to avoid weird behaviour with mouse/touch
    if (e.pointerType === 'pen' && e.pressure > 0) {
      return Math.max(1, base * e.pressure * 2)
    }
    return base
  }

  function startDrawing(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    // Capture pointer so move/up fire even if cursor leaves the element
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
    const pos = getPos(e)
    setIsDrawing(true)
    lastPoint.current = pos
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, effectiveWidth(e) / 2, 0, Math.PI * 2)
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color
    ctx.fill()
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !lastPoint.current) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color
    ctx.lineWidth = effectiveWidth(e)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPoint.current = pos
  }

  function stopDrawing() {
    setIsDrawing(false)
    lastPoint.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  function downloadPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `whiteboard-${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function saveSketch() {
    const canvas = canvasRef.current
    if (!canvas) return
    const title = saveTitle.trim() || `Sketch ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    const newSketch: SavedSketch = {
      id: `${Date.now()}`,
      dataUrl: canvas.toDataURL('image/png'),
      title,
      savedAt: new Date().toISOString(),
    }
    const updated = [newSketch, ...savedSketches].slice(0, 20) // keep last 20
    setSavedSketches(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
    setSaveTitle('')
    setShowSaveDialog(false)
  }

  function loadSketch(sketch: SavedSketch) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    const img = new Image()
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0) }
    img.src = sketch.dataUrl
    setShowGallery(false)
  }

  function deleteSketch(id: string) {
    const updated = savedSketches.filter(s => s.id !== id)
    setSavedSketches(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
  }

  async function saveToDrive(title?: string) {
    if (!cloudScriptUrl) return
    const canvas = canvasRef.current
    if (!canvas) return
    setDriveStatus('uploading')
    const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '-')
    const fileName = `${title || 'whiteboard'}-${date}-${time}.png`
    try {
      const res = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: cloudScriptUrl,
          fileName,
          data: canvas.toDataURL('image/png'),
          parentFolderId: driveFolderId,
        }),
      })
      const json = await res.json()
      setDriveStatus(json.success ? 'ok' : 'error')
    } catch {
      setDriveStatus('error')
    }
    setTimeout(() => setDriveStatus('idle'), 3500)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        width: '95vw', maxWidth: 1100, height: '90vh', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        position: 'relative',
      }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem',
          borderBottom: '1.5px solid #E8E5E0', background: '#FAFAFA', flexShrink: 0, flexWrap: 'wrap',
        }}>
          {/* Title */}
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.25rem' }}>Whiteboard</span>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#E8E5E0' }} />

          {/* Tools */}
          {(['pen', 'eraser'] as Tool[]).map(t => (
            <button key={t} onClick={() => setTool(t)} title={t === 'pen' ? 'Pen' : 'Eraser'} style={{
              width: 32, height: 32, borderRadius: 8, border: tool === t ? '2px solid #7C3AED' : '1.5px solid #E8E5E0',
              background: tool === t ? '#EDE9FE' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>
              {t === 'pen' ? '✏️' : '🧹'}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: '#E8E5E0' }} />

          {/* Colors */}
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool('pen') }} style={{
                width: c === color && tool === 'pen' ? 22 : 18, height: c === color && tool === 'pen' ? 22 : 18,
                borderRadius: '50%', background: c, border: c === color && tool === 'pen' ? '2.5px solid #1a1a1a' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
              }} />
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: '#E8E5E0' }} />

          {/* Stroke widths */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {WIDTHS.map(w => (
              <button key={w} onClick={() => setStrokeWidth(w)} style={{
                width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: strokeWidth === w ? '2px solid #7C3AED' : '1.5px solid #E8E5E0',
                background: strokeWidth === w ? '#EDE9FE' : '#fff', cursor: 'pointer',
              }}>
                <div style={{ width: Math.min(w * 2.5, 16), height: Math.min(w * 2.5, 16), borderRadius: '50%', background: '#1a1a1a' }} />
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: '#E8E5E0' }} />

          {/* Actions */}
          <button onClick={clearCanvas} title="Clear canvas" style={{
            padding: '0.3rem 0.625rem', borderRadius: 8, border: '1.5px solid #E8E5E0',
            background: '#fff', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
          }}>
            Clear
          </button>
          <button onClick={() => setShowGallery(true)} title="Saved sketches" style={{
            padding: '0.3rem 0.625rem', borderRadius: 8, border: '1.5px solid #E8E5E0',
            background: '#fff', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
          }}>
            Gallery {savedSketches.length > 0 && `(${savedSketches.length})`}
          </button>
          <button onClick={() => setShowSaveDialog(true)} style={{
            padding: '0.3rem 0.625rem', borderRadius: 8, border: '1.5px solid #7C3AED',
            background: '#EDE9FE', color: '#7C3AED', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600,
          }}>
            Save
          </button>
          {cloudScriptUrl && (
            <button
              onClick={() => saveToDrive()}
              disabled={driveStatus === 'uploading'}
              title="Save PNG to Drive whiteboard folder"
              style={{
                padding: '0.3rem 0.625rem', borderRadius: 8, fontSize: '0.75rem', cursor: driveStatus === 'uploading' ? 'wait' : 'pointer', fontWeight: 600,
                border: `1.5px solid ${driveStatus === 'ok' ? '#22c55e' : driveStatus === 'error' ? '#ef4444' : '#4285F4'}`,
                background: driveStatus === 'ok' ? '#f0fdf4' : driveStatus === 'error' ? '#fef2f2' : '#EEF3FD',
                color: driveStatus === 'ok' ? '#22c55e' : driveStatus === 'error' ? '#ef4444' : '#4285F4',
              }}
            >
              {driveStatus === 'uploading' ? '…' : driveStatus === 'ok' ? '✓ Saved to Drive' : driveStatus === 'error' ? '✗ Error' : '☁ Save to Drive'}
            </button>
          )}
          <button onClick={downloadPng} style={{
            padding: '0.3rem 0.625rem', borderRadius: 8, border: '1.5px solid #E8E5E0',
            background: '#fff', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
          }}>
            ↓ Export PNG
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Close */}
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1.5px solid #E8E5E0',
            background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b7280', fontSize: '1rem',
          }}>×</button>
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}>
          <canvas
            ref={canvasRef}
            width={1600}
            height={900}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block',
              background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
              touchAction: 'none',   // prevent iOS scroll/zoom while drawing
              userSelect: 'none',
            }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
          />
        </div>

        {/* Save dialog */}
        {showSaveDialog && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '1.5rem', width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.875rem', color: '#1a1a1a' }}>Save sketch</h3>
              <input
                value={saveTitle}
                onChange={e => setSaveTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveSketch(); if (e.key === 'Escape') setShowSaveDialog(false) }}
                placeholder="Title (optional)"
                autoFocus
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #E8E5E0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveSketch} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setShowSaveDialog(false)} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: '1.5px solid #E8E5E0', background: '#fff', fontSize: '0.825rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Gallery */}
        {showGallery && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ background: '#fff', borderRadius: 18, padding: '1.5rem', width: '80vw', maxWidth: 720, maxHeight: '75vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a1a' }}>Saved sketches</h3>
                <button onClick={() => setShowGallery(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem' }}>×</button>
              </div>
              {savedSketches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#c4bfb9', fontSize: '0.8rem' }}>No saved sketches yet</div>
              ) : (
                <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {savedSketches.map(sketch => (
                    <div key={sketch.id} style={{ border: '1.5px solid #E8E5E0', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }}>
                      <img
                        src={sketch.dataUrl}
                        alt={sketch.title}
                        onClick={() => loadSketch(sketch)}
                        style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{ padding: '0.375rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sketch.title}</span>
                        <button
                          onClick={e => { e.stopPropagation(); deleteSketch(sketch.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C4B5FD', fontSize: '0.8rem', padding: '0 0.2rem', flexShrink: 0 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#C4B5FD' }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
