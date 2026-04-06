'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  type Board, type Column, type Member, type MemberRole, type Task,
  type Milestone, type MilestoneTask, type Priority,
  type BudgetLine, type CostTransaction,
} from '@/lib/types'
import { WorkStreamGantt }  from './v3/WorkStreamGantt'
import { NotesPanel }       from './NotesPanel'
import { FilePanel }        from './FilePanel'
import { Whiteboard }       from './Whiteboard'
import { MembersBar }       from './MembersBar'
import { ProjectInfoModal } from './ProjectInfoModal'
import { InviteManager }    from './InviteManager'
import { CostPanel }        from './CostPanel'
import { supabase }         from '@/lib/supabase'
import { getLocalProfile }  from '@/lib/profile'

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  board: Board
  columns: Column[]
  members: Member[]
  tasks: Task[]
  currentMember: Member
  isCreator: boolean
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  budgetLines: BudgetLine[]
  costTransactions: CostTransaction[]
  onCreateTask: (p: { columnId: string; title: string; priority: Priority; dueDate: string | null; description: string }) => Promise<void>
  onMoveTask: (taskId: string, newColumnId: string) => Promise<void>
  onReorderTask: (taskId: string, newIndex: number, colId: string) => Promise<void>
  onAssignTask: (taskId: string, memberId: string | null) => Promise<void>
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date'>>) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onAddColumn: (name: string) => Promise<void>
  onDeleteColumn: (columnId: string, targetColumnId?: string) => Promise<void>
  onRenameColumn: (columnId: string, name: string) => Promise<void>
  onReorderColumn: (columnId: string, newIndex: number) => Promise<void>
  onUpdateFilePanelUrl: (url: string | null) => Promise<void>
  onUpdateBoardName: (name: string) => Promise<void>
  onUpdateBoardInfo: (updates: { name: string; description: string; location_address: string; location_lat: number | null; location_lng: number | null; photos: string[] }) => Promise<void>
  onAddMilestone: (name: string, targetDate: string) => Promise<void>
  onDeleteMilestone: (milestoneId: string) => Promise<void>
  onUpdateMilestoneDate: (milestoneId: string, newDate: string) => Promise<void>
  onUpdateMilestoneName?: (milestoneId: string, name: string) => Promise<void>
  onCompleteMilestone: (milestoneId: string, complete: boolean) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUpdateMilestoneDependency?: (milestoneId: string, dependsOnId: string | null, offsetDays: number) => Promise<void>
  onAddTransaction: (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateTransaction: (id: string, updates: Partial<CostTransaction>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
  onAddBudgetLine: (data: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateBudgetLine: (id: string, updates: Partial<BudgetLine>) => Promise<void>
  onDeleteBudgetLine: (id: string) => Promise<void>
  onImportBudgetLines: (lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[]) => Promise<void>
  onChangeCurrency: (c: 'TRY' | 'USD') => Promise<void>
  onUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Note    = { id: string; content: string; author_name: string | null; created_at: string }
type Weather = { temp: number; desc: string; icon: string } | null

const SYM: Record<string, string> = { TRY: '₺', USD: '$' }

function fmtAmt(n: number, cur: string) {
  const s = SYM[cur] ?? '$'
  if (n >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${s}${(n / 1_000).toFixed(0)}K`
  return `${s}${n.toFixed(0)}`
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Phase colors (mirrors WorkStreamGantt) ──────────────────────────────────

const PHASE_FRACS = [
  { label: 'FAZ 1', color: '#7C3AED', end: 0.10 },
  { label: 'FAZ 2', color: '#2563EB', end: 0.28 },
  { label: 'FAZ 3', color: '#EA580C', end: 0.54 },
  { label: 'FAZ 4', color: '#0D9488', end: 0.93 },
  { label: 'FAZ 5', color: '#059669', end: 1.00 },
]

function phaseForDate(date: string, rangeStart: Date, rangeEnd: Date): { label: string; color: string } {
  const total = rangeEnd.getTime() - rangeStart.getTime()
  if (total <= 0) return { label: 'FAZ 1', color: '#7C3AED' }
  const frac = (new Date(date + 'T00:00:00').getTime() - rangeStart.getTime()) / total
  for (const p of PHASE_FRACS) { if (frac <= p.end) return p }
  return PHASE_FRACS[PHASE_FRACS.length - 1]
}

// ─── MilestoneList ────────────────────────────────────────────────────────────

type MilestoneListProps = {
  milestones: Milestone[]
  rangeStart: Date
  rangeEnd: Date
  canEdit: boolean
  today: string
  onAdd: (name: string, date: string) => Promise<void>
  onUpdateDate: (id: string, date: string) => Promise<void>
  onUpdateName?: (id: string, name: string) => Promise<void>
  onComplete: (id: string, complete: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function MilestoneList({
  milestones, rangeStart, rangeEnd, canEdit, today,
  onAdd, onUpdateDate, onUpdateName, onComplete, onDelete,
}: MilestoneListProps) {
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editName,    setEditName]    = useState('')
  const [newName,     setNewName]     = useState('')
  const [newDate,     setNewDate]     = useState('')
  const [addingRow,   setAddingRow]   = useState(false)
  const [saving,      setSaving]      = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const sorted = [...milestones].sort((a, b) => a.target_date.localeCompare(b.target_date))
  const done   = milestones.filter(m => m.completed_at).length

  function startEdit(m: Milestone) {
    setEditingId(m.id)
    setEditName(m.name)
    setTimeout(() => nameRef.current?.focus(), 30)
  }

  async function commitName(m: Milestone) {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== m.name && onUpdateName) {
      setSaving(m.id)
      await onUpdateName(m.id, trimmed).catch(() => {})
      setSaving(null)
    }
    setEditingId(null)
  }

  async function handleDateChange(id: string, date: string) {
    setSaving(id)
    await onUpdateDate(id, date).catch(() => {})
    setSaving(null)
  }

  async function handleComplete(id: string, current: string | null) {
    setSaving(id)
    await onComplete(id, !current).catch(() => {})
    setSaving(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this milestone?')) return
    setSaving(id)
    await onDelete(id).catch(() => {})
    setSaving(null)
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name || !newDate) return
    setSaving('new')
    await onAdd(name, newDate).catch(() => {})
    setSaving(null)
    setNewName('')
    setNewDate('')
    setAddingRow(false)
  }

  const COL_DATE  = 110
  const COL_PHASE = 68
  const COL_COMP  = 84
  const COL_DEL   = 36

  return (
    <div style={{ background: '#fff', borderTop: '1.5px solid #E2E8F0', borderBottom: '1.5px solid #E2E8F0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 1rem', borderBottom: '1px solid #E2E8F0', gap: '0.625rem' }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          Milestone Listesi
        </span>
        <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: 500 }}>
          {done}/{milestones.length} tamamlandı
        </span>
        {/* progress bar */}
        <div style={{ flex: 1, height: 4, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden', maxWidth: 180 }}>
          <div style={{ height: '100%', width: `${milestones.length > 0 ? done / milestones.length * 100 : 0}%`, background: '#10B981', borderRadius: 99, transition: 'width 0.3s' }} />
        </div>
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button
            onClick={() => { setAddingRow(true); setTimeout(() => nameRef.current?.focus(), 30) }}
            style={{ padding: '0.25rem 0.625rem', background: '#0F172A', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer' }}
          >+ Ekle</button>
        )}
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', padding: '0 1rem', height: 28, alignItems: 'center', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ flex: 1, fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Kilometre Taşı</div>
        <div style={{ width: COL_PHASE, fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Faz</div>
        <div style={{ width: COL_DATE,  fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hedef Tarih</div>
        <div style={{ width: COL_COMP,  fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Durum</div>
        {canEdit && <div style={{ width: COL_DEL }} />}
      </div>

      {/* Rows */}
      <div>
        {sorted.map(m => {
          const phase    = phaseForDate(m.target_date, rangeStart, rangeEnd)
          const overdue  = !m.completed_at && m.target_date < today
          const isEdit   = editingId === m.id
          const isSaving = saving === m.id

          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', padding: '0 1rem',
              height: 36, borderBottom: '1px solid #F1F5F9',
              background: m.completed_at ? '#F0FDF4' : overdue ? '#FFF7F7' : '#fff',
              opacity: isSaving ? 0.5 : 1, transition: 'background 0.15s',
            }}>
              {/* Name */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, paddingRight: '0.75rem' }}>
                {/* Diamond */}
                <div style={{
                  width: 9, height: 9, flexShrink: 0,
                  background: m.completed_at ? '#10B981' : overdue ? '#EF4444' : phase.color,
                  border: m.completed_at ? 'none' : `2px solid ${phase.color}`,
                  borderRadius: 2, transform: 'rotate(45deg)',
                  boxShadow: m.completed_at ? '0 1px 3px rgba(16,185,129,0.4)' : 'none',
                }} />
                {isEdit && canEdit
                  ? (
                    <input
                      ref={nameRef}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitName(m)}
                      onKeyDown={e => { if (e.key === 'Enter') commitName(m); if (e.key === 'Escape') setEditingId(null) }}
                      style={{ flex: 1, fontSize: '0.72rem', border: 'none', borderBottom: `1.5px solid ${phase.color}`, outline: 'none', padding: '0 2px', background: 'transparent', color: '#0F172A', fontWeight: 600 }}
                    />
                  )
                  : (
                    <span
                      onClick={() => canEdit && startEdit(m)}
                      title={canEdit ? 'Düzenlemek için tıkla' : m.name}
                      style={{
                        fontSize: '0.72rem', fontWeight: m.completed_at ? 500 : 600,
                        color: m.completed_at ? '#64748B' : '#0F172A',
                        textDecoration: m.completed_at ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        cursor: canEdit ? 'text' : 'default',
                      }}
                    >{m.name}</span>
                  )
                }
              </div>

              {/* Phase badge */}
              <div style={{ width: COL_PHASE }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '0.12rem 0.35rem', borderRadius: 4, background: phase.color + '18', color: phase.color }}>
                  {phase.label}
                </span>
              </div>

              {/* Date */}
              <div style={{ width: COL_DATE }}>
                {canEdit
                  ? (
                    <input
                      type="date"
                      value={m.target_date}
                      onChange={e => e.target.value && handleDateChange(m.id, e.target.value)}
                      style={{ fontSize: '0.68rem', color: overdue ? '#EF4444' : '#334155', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: overdue ? 700 : 400, width: '100%' }}
                    />
                  )
                  : (
                    <span style={{ fontSize: '0.68rem', color: overdue ? '#EF4444' : '#334155', fontWeight: overdue ? 700 : 400 }}>
                      {new Date(m.target_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )
                }
              </div>

              {/* Status */}
              <div style={{ width: COL_COMP }}>
                {canEdit
                  ? (
                    <button
                      onClick={() => handleComplete(m.id, m.completed_at)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        background: m.completed_at ? '#D1FAE5' : overdue ? '#FEE2E2' : '#F1F5F9',
                        color:      m.completed_at ? '#059669' : overdue ? '#EF4444' : '#64748B',
                        border: 'none', borderRadius: 99, padding: '0.18rem 0.5rem',
                        fontSize: '0.6rem', fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {m.completed_at ? '✓ Tamam' : overdue ? '⚠ Gecikti' : '○ Bekliyor'}
                    </button>
                  )
                  : (
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: m.completed_at ? '#059669' : overdue ? '#EF4444' : '#64748B' }}>
                      {m.completed_at ? '✓ Tamam' : overdue ? '⚠ Gecikti' : '○ Bekliyor'}
                    </span>
                  )
                }
              </div>

              {/* Delete */}
              {canEdit && (
                <div style={{ width: COL_DEL, display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleDelete(m.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '0.8rem', lineHeight: 1, padding: '0 2px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1' }}
                  >✕</button>
                </div>
              )}
            </div>
          )
        })}

        {/* Add row */}
        {addingRow && canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 1rem', height: 40, borderBottom: '1px solid #F1F5F9', background: '#FAFBFF', gap: '0.5rem' }}>
            <div style={{ width: 9, height: 9, flexShrink: 0, background: '#E2E8F0', border: '2px solid #CBD5E1', borderRadius: 2, transform: 'rotate(45deg)' }} />
            <input
              ref={nameRef}
              placeholder="Milestone adı…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddingRow(false) } }}
              style={{ flex: 1, fontSize: '0.72rem', border: 'none', borderBottom: '1.5px solid #7C3AED', outline: 'none', padding: '0 2px', background: 'transparent', color: '#0F172A' }}
            />
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              style={{ fontSize: '0.68rem', border: '1px solid #E2E8F0', borderRadius: 4, padding: '0.2rem 0.4rem', outline: 'none', color: '#334155' }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newDate || saving === 'new'}
              style={{ padding: '0.2rem 0.625rem', background: '#0F172A', color: '#fff', border: 'none', borderRadius: 5, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', opacity: !newName.trim() || !newDate ? 0.4 : 1 }}
            >{saving === 'new' ? '…' : 'Kaydet'}</button>
            <button
              onClick={() => setAddingRow(false)}
              style={{ padding: '0.2rem 0.4rem', background: 'none', color: '#94A3B8', border: 'none', borderRadius: 5, fontSize: '0.8rem', cursor: 'pointer' }}
            >✕</button>
          </div>
        )}

        {milestones.length === 0 && !addingRow && (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#CBD5E1' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>◈</div>
            <div style={{ fontSize: '0.68rem' }}>Henüz milestone eklenmemiş</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoardViewV3(props: Props) {
  const {
    board, columns, members, tasks, currentMember, isCreator,
    milestones, milestoneTasks, budgetLines, costTransactions,
    onUpdateFilePanelUrl, onUpdateBoardInfo,
    onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate,
    onUpdateMilestoneName, onCompleteMilestone,
    onAddTransaction, onUpdateTransaction, onDeleteTransaction,
    onAddBudgetLine, onUpdateBudgetLine, onDeleteBudgetLine,
    onImportBudgetLines, onChangeCurrency, onUpdateMemberRole,
  } = props

  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [showInvite,      setShowInvite]       = useState(false)
  const [showCost,        setShowCost]         = useState(false)
  const [recentNotes,     setRecentNotes]      = useState<Note[]>([])
  const [weather,         setWeather]          = useState<Weather>(null)
  const [cloudScriptUrl,  setCloudScriptUrl]   = useState<string>(() => {
    try { return localStorage.getItem(`cloud_script_${board.id}`) ?? '' } catch { return '' }
  })

  function saveCloudScriptUrl(url: string) {
    setCloudScriptUrl(url)
    try {
      if (url) localStorage.setItem(`cloud_script_${board.id}`, url)
      else     localStorage.removeItem(`cloud_script_${board.id}`)
    } catch { /* ignore */ }
  }

  const driveFolderId = useMemo(() => {
    const m = board.file_panel_url?.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : undefined
  }, [board.file_panel_url])

  // ── Activity feed ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('board_notes').select('id, content, author_name, created_at')
      .eq('board_id', board.id).order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setRecentNotes(data) })
  }, [board.id])

  // ── Weather ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const lat = board.location_lat, lng = board.location_lng
    if (!lat || !lng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json())
      .then(d => {
        const wc   = d?.current_weather?.weathercode ?? 0
        const temp = Math.round(d?.current_weather?.temperature ?? 0)
        const icons: Record<number, [string, string]> = {
          0: ['☀️','Clear'], 1: ['🌤','Mostly Clear'], 2: ['⛅','Partly Cloudy'],
          3: ['☁️','Overcast'], 45: ['🌫','Foggy'], 51: ['🌦','Drizzle'],
          61: ['🌧','Rain'], 65: ['🌧','Heavy Rain'], 71: ['🌨','Snow'],
          80: ['🌦','Showers'], 95: ['⛈','Thunderstorm'],
        }
        const [icon, desc] = icons[wc] ?? ['🌡','Unknown']
        setWeather({ temp, desc, icon })
      }).catch(() => {})
  }, [board.location_lat, board.location_lng])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalBudget  = useMemo(() => budgetLines.filter(b => b.type === 'expense').reduce((s, b) => s + b.budgeted_amount, 0), [budgetLines])
  const totalCashOut = useMemo(() => costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])
  const totalCashIn  = useMemo(() => costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])

  const doneColIds = useMemo(() => columns.filter(c => c.name.toLowerCase() === 'done').map(c => c.id), [columns])
  const doneCount  = useMemo(() => tasks.filter(t => doneColIds.includes(t.column_id)).length, [tasks, doneColIds])
  const progress   = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0

  const today = new Date().toISOString().split('T')[0]
  const overdueMilestones = milestones.filter(m => !m.completed_at && m.target_date < today)

  // Schedule status
  const schedBadge = overdueMilestones.length > 0
    ? { label: `${overdueMilestones.length} Overdue`, color: '#DC2626', bg: '#FEE2E2' }
    : progress >= 90
      ? { label: 'Near Complete', color: '#059669', bg: '#D1FAE5' }
      : { label: 'On Schedule',   color: '#0EA5E9', bg: '#E0F2FE' }

  // Milestone date range for header
  const msDates = milestones.map(m => new Date(m.target_date + 'T00:00:00'))
  const msStart = msDates.length > 0 ? new Date(Math.min(...msDates.map(d => d.getTime()))) : null
  const msEnd   = msDates.length > 0 ? new Date(Math.max(...msDates.map(d => d.getTime()))) : null
  const dateRangeLabel = msStart && msEnd
    ? `${msStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} — ${msEnd.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`
    : `Since ${new Date(board.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`

  // Map
  const miniMapSrc = useMemo(() => {
    const lat = board.location_lat, lng = board.location_lng
    if (lat !== null && lng !== null)
      return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`
    if (board.location_address?.startsWith('https://www.google.com/maps/embed'))
      return board.location_address
    return null
  }, [board.location_lat, board.location_lng, board.location_address])

  const mapLink = board.location_lat !== null && board.location_lng !== null
    ? `https://www.google.com/maps/search/?api=1&query=${board.location_lat},${board.location_lng}`
    : board.location_address && !board.location_address.startsWith('https://')
      ? `https://maps.google.com/?q=${encodeURIComponent(board.location_address)}`
      : null

  const locLabel = board.location_address && !board.location_address.startsWith('https://')
    ? board.location_address
    : board.location_lat !== null
      ? `${board.location_lat.toFixed(3)}, ${board.location_lng?.toFixed(3)}`
      : null

  const photos    = board.photos ?? []
  const coverPhoto = photos[0] ?? null

  // Billed invoices (total approved cash_in lines)
  const approvedInvoices = costTransactions.filter(t => t.type === 'cash_in' && !t.is_forecast).length

  // Date range for milestone phase assignment (mirrors WorkStreamGantt logic)
  const { msRangeStart, msRangeEnd } = useMemo(() => {
    const ts: number[] = []
    tasks.forEach(t => { if (t.due_date) ts.push(new Date(t.due_date + 'T00:00:00').getTime()) })
    milestones.forEach(m => ts.push(new Date(m.target_date + 'T00:00:00').getTime()))
    costTransactions.forEach(t => ts.push(new Date(t.date + 'T00:00:00').getTime()))
    if (!ts.length) {
      const now = new Date()
      return { msRangeStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), msRangeEnd: new Date(now.getFullYear(), now.getMonth() + 11, 0) }
    }
    const s = new Date(Math.min(...ts)); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(Math.max(...ts)); e.setMonth(e.getMonth() + 1); e.setDate(0)
    return { msRangeStart: s, msRangeEnd: e }
  }, [tasks, milestones, costTransactions])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0B1120', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ── */}
      <header style={{
        height: 48, background: 'rgba(11,17,32,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        position: 'sticky', top: 0, zIndex: 40, flexShrink: 0,
      }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'center', padding: '0 1.25rem', gap: '0.625rem' }}>
          <button
            onClick={() => { if (window.confirm('Go back to all projects?')) window.location.href = '/' }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 500, padding: '0.2rem 0.375rem', borderRadius: 5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M2 7l4-4M2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Projects
          </button>

          <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.06em', color: '#0EA5E9', background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase' }}>v3</span>

          <span style={{ flex: 1 }} />

          <MembersBar members={members} currentMember={currentMember} isCreator={isCreator} onUpdateMemberRole={onUpdateMemberRole} />
          <button onClick={() => setShowInvite(true)} style={{ flexShrink: 0, padding: '0.3rem 0.625rem', background: 'rgba(14,165,233,0.12)', color: '#0EA5E9', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>+ Invite</button>
          <button onClick={() => setShowCost(true)} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer' }} title="Budget & Cost">💰</button>
          <a href={`/${board.id}`}    style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: '0.72rem', textDecoration: 'none' }}>v1</a>
          <a href={`/v2/${board.id}`} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: '0.72rem', textDecoration: 'none' }}>v2</a>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>

          {/* ══════════════════════════════════════════════════════
              COVER PHOTO
          ══════════════════════════════════════════════════════ */}
          <div style={{ position: 'relative', height: 220, overflow: 'hidden', background: '#0F172A' }}>

            {/* Background photo */}
            {coverPhoto
              ? <img src={coverPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
              : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 40%, #0F2A4A 100%)',
                }} />
              )
            }

            {/* Dark gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,17,32,0.92) 0%, rgba(11,17,32,0.40) 50%, rgba(11,17,32,0.15) 100%)' }} />

            {/* Bottom-left overlay: badge + date + location */}
            <div style={{ position: 'absolute', bottom: 20, left: 24, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: '#fff', background: '#0EA5E9', borderRadius: 4, padding: '0.18rem 0.5rem',
                }}>
                  {progress === 100 ? 'COMPLETE' : overdueMilestones.length > 0 ? 'DELAYED' : 'EXECUTING'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 1a4.5 4.5 0 0 1 4.5 4.5C11.5 9 7 13 7 13S2.5 9 2.5 5.5A4.5 4.5 0 0 1 7 1Z" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2"/><circle cx="7" cy="5.5" r="1.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2"/></svg>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.65)', fontWeight: 400 }}>
                  {locLabel ?? 'Location not set'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/><path d="M1 5.5h12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/><path d="M4 1v2M10 1v2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>
                  {dateRangeLabel}
                </span>
              </div>
            </div>

            {/* Top-right: map thumbnail */}
            {miniMapSrc && (
              <a
                href={mapLink ?? '#'} target="_blank" rel="noopener noreferrer"
                style={{ position: 'absolute', top: 16, right: 16, width: 120, height: 80, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'block' }}
              >
                <iframe src={miniMapSrc} style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: 6 }} />
              </a>
            )}

            {/* Edit button */}
            <button
              onClick={() => setShowProjectInfo(true)}
              style={{ position: 'absolute', top: 16, right: miniMapSrc ? 150 : 16, padding: '0.25rem 0.6rem', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 500 }}
            >
              ✎ Edit
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════
              PROJECT NAME + PROGRESS
          ══════════════════════════════════════════════════════ */}
          <div style={{ background: '#fff', borderBottom: '1.5px solid #E2E8F0', padding: '1.125rem 1.5rem', display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>

            {/* Name + description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', margin: '0 0 0.35rem 0', lineHeight: 1.15 }}>
                {board.name}
              </h1>
              {board.description && (
                <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.6, maxWidth: 680 }}>
                  {board.description}
                </p>
              )}
            </div>

            {/* Progress donut + schedule */}
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Ring */}
              <div style={{ position: 'relative', width: 58, height: 58 }}>
                <svg width="58" height="58" viewBox="0 0 58 58" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="29" cy="29" r="23" fill="none" stroke="#E2E8F0" strokeWidth="5" />
                  <circle cx="29" cy="29" r="23" fill="none" stroke="#0EA5E9" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 23}`}
                    strokeDashoffset={`${2 * Math.PI * 23 * (1 - progress / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A' }}>{progress}%</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.2rem' }}>Completion</div>
                <div style={{ fontSize: '0.62rem', color: '#64748B', marginBottom: '0.35rem' }}>{doneCount}/{tasks.length} tasks done</div>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '0.18rem 0.5rem', borderRadius: 99, background: schedBadge.bg, color: schedBadge.color }}>
                  {schedBadge.label}
                </span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              METADATA STRIP (5 fields)
          ══════════════════════════════════════════════════════ */}
          <div style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', display: 'flex', overflowX: 'auto' }}>
            {[
              { label: 'Client Group',       value: 'Construction PM',  accent: false },
              { label: 'Contract Basis',     value: 'Fixed Price',      accent: false },
              { label: 'Master Permit',      value: 'Rev. 3',           accent: false },
              { label: 'Total Auth. Budget', value: totalBudget > 0 ? fmtAmt(totalBudget, board.currency) : '—', accent: true },
              { label: 'Current Phase',      value: columns[0]?.name ?? '—', accent: false },
            ].map((field, i, arr) => (
              <div key={i} style={{
                flex: '1 0 120px', padding: '0.6rem 1rem',
                borderRight: i < arr.length - 1 ? '1px solid #E2E8F0' : 'none',
                background: field.accent ? '#EFF6FF' : 'transparent',
              }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.2rem' }}>
                  {field.label}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: field.accent ? 800 : 600, color: field.accent ? '#0369A1' : '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {field.value}
                </div>
              </div>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════
              KPI CARDS (4)
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1.5px solid #E2E8F0' }}>

            {/* Card 1 — Total Est. Budget */}
            <div style={{ padding: '1rem 1.25rem', borderRight: '1px solid #E2E8F0', background: '#fff' }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.4rem' }}>Total Est. Budget</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em', lineHeight: 1 }}>
                {totalBudget > 0 ? fmtAmt(totalBudget, board.currency) : '—'}
              </div>
              <div style={{ marginTop: '0.5rem', height: 3, borderRadius: 99, background: '#E2E8F0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalBudget > 0 ? Math.min(100, totalCashOut / totalBudget * 100) : 0}%`, background: '#0EA5E9', borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: '0.58rem', color: '#94A3B8', marginTop: '0.3rem' }}>
                {totalBudget > 0 ? `${Math.round(totalCashOut / totalBudget * 100)}% expended` : 'No budget set'}
              </div>
            </div>

            {/* Card 2 — Total Spent Net */}
            <div style={{ padding: '1rem 1.25rem', borderRight: '1px solid #E2E8F0', background: '#fff' }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.4rem' }}>Total Spent Net</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em', lineHeight: 1 }}>
                  {totalCashOut > 0 ? fmtAmt(totalCashOut, board.currency) : '—'}
                </div>
                {totalBudget > 0 && totalCashOut > 0 && (
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B', background: '#FEF3C7', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                    {Math.round(totalCashOut / totalBudget * 100)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.58rem', color: '#94A3B8', marginTop: '0.5rem' }}>
                {totalCashIn > 0 ? `${fmtAmt(totalCashIn, board.currency)} cash received` : 'Cash out only'}
              </div>
            </div>

            {/* Card 3 — App. Invoices */}
            <div style={{ padding: '1rem 1.25rem', borderRight: '1px solid #E2E8F0', background: '#fff' }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.4rem' }}>App. Invoices</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em', lineHeight: 1 }}>
                {approvedInvoices > 0 ? approvedInvoices : '—'}
              </div>
              <div style={{ fontSize: '0.58rem', color: '#94A3B8', marginTop: '0.5rem' }}>
                {approvedInvoices > 0 ? `${fmtAmt(totalCashIn, board.currency)} total approved` : 'No approved invoices'}
              </div>
            </div>

            {/* Card 4 — Schedule Status (dark navy) */}
            <div style={{ padding: '1rem 1.25rem', background: '#0F172A' }}>
              <div style={{ fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.4rem' }}>Schedule Status</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                {overdueMilestones.length > 0
                  ? `${overdueMilestones.length} Overdue`
                  : progress >= 90
                    ? 'Near Completion'
                    : 'On Track'}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.45rem', lineHeight: 1.4 }}>
                {overdueMilestones.length > 0
                  ? `Critical path at risk · Review required`
                  : milestones.length > 0
                    ? `${milestones.filter(m => m.completed_at).length}/${milestones.length} milestones complete`
                    : 'No milestones set'}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════
              WORK STREAMS GANTT
          ══════════════════════════════════════════════════════ */}
          <WorkStreamGantt
            tasks={tasks}
            columns={columns}
            milestones={milestones}
            milestoneTasks={milestoneTasks}
            costTransactions={costTransactions}
            budgetLines={budgetLines}
            currency={board.currency}
            boardPhotos={photos}
            onAddMilestone={onAddMilestone}
            onUpdateMilestoneDate={onUpdateMilestoneDate}
          />

          {/* ══════════════════════════════════════════════════════
              MILESTONE LIST
          ══════════════════════════════════════════════════════ */}
          <MilestoneList
            milestones={milestones}
            rangeStart={msRangeStart}
            rangeEnd={msRangeEnd}
            canEdit={isCreator || currentMember.role === 'admin'}
            today={today}
            onAdd={onAddMilestone}
            onUpdateDate={onUpdateMilestoneDate}
            onUpdateName={onUpdateMilestoneName}
            onComplete={onCompleteMilestone}
            onDelete={onDeleteMilestone}
          />

          {/* ══════════════════════════════════════════════════════
              BOTTOM PANELS — 2 columns
          ══════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1.5px solid #E2E8F0', minHeight: 360, background: '#fff' }}>

            {/* ── Left column: Notes + Whiteboard ── */}
            <div style={{ borderRight: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
              {/* Notes — top half */}
              <div style={{ flex: '1 1 0', borderBottom: '1px solid #E2E8F0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <NotesPanel
                  boardId={board.id}
                  authorName={currentMember.nickname}
                  onConvertToTask={() => {}}
                  cloudScriptUrl={cloudScriptUrl || undefined}
                  driveFolderId={driveFolderId}
                />
              </div>
              {/* Whiteboard — bottom half */}
              <div style={{ flex: '1 1 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Whiteboard
                  boardId={board.id}
                  onClose={() => {}}
                  cloudScriptUrl={cloudScriptUrl || undefined}
                  driveFolderId={driveFolderId}
                  inline
                />
              </div>
            </div>

            {/* ── Right column: Files + Activity + Weather ── */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Project Drive */}
              <div style={{ flex: '1 1 0', borderBottom: '1px solid #E2E8F0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <FilePanel
                  boardId={board.id}
                  filePanelUrl={board.file_panel_url}
                  isCreator={isCreator}
                  onUpdate={onUpdateFilePanelUrl}
                  cloudScriptUrl={cloudScriptUrl}
                  onCloudScriptUrlChange={saveCloudScriptUrl}
                />
              </div>

              {/* Live Activity */}
              <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid #F1F5F9', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Live Activity</span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', flexShrink: 0, boxShadow: '0 0 0 3px rgba(16,185,129,0.15)' }} />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {recentNotes.length === 0
                    ? (
                      <div style={{ paddingTop: '1.5rem', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.25rem', opacity: 0.2 }}>📋</span>
                        <p style={{ fontSize: '0.65rem', color: '#CBD5E1', margin: '0.3rem 0 0' }}>No activity yet</p>
                      </div>
                    )
                    : recentNotes.slice(0, 8).map(note => (
                        <div key={note.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0F172A', color: '#fff', fontSize: '0.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {(note.author_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.63rem', color: '#334155', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <strong>{note.author_name ?? 'Unknown'}</strong>{' '}
                              {note.content.replace(/<[^>]*>/g, '').slice(0, 55)}
                            </div>
                            <div style={{ fontSize: '0.55rem', color: '#94A3B8', marginTop: '0.1rem' }}>{timeAgo(note.created_at)}</div>
                          </div>
                        </div>
                      ))
                  }
                </div>

                {/* Weather strip */}
                {weather && (
                  <div style={{ flexShrink: 0, padding: '0.5rem 0.875rem', borderTop: '1px solid #F1F5F9', background: '#F0F9FF', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>{weather.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{weather.temp}°C</div>
                      <div style={{ fontSize: '0.58rem', color: '#0369A1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{weather.desc} · Site Conditions</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>{/* end max-width */}
      </div>{/* end scrollable body */}

      {/* ── Modals ── */}
      {showProjectInfo && (
        <ProjectInfoModal
          board={board}
          boardId={board.id}
          onClose={() => setShowProjectInfo(false)}
          onSave={async (updates) => { await onUpdateBoardInfo(updates); setShowProjectInfo(false) }}
        />
      )}
      {showInvite && (
        <InviteManager
          boardId={board.id}
          boardName={board.name}
          profile={getLocalProfile()}
          members={members}
          currentMember={currentMember}
          onClose={() => setShowInvite(false)}
          onUpdateMemberRole={onUpdateMemberRole}
        />
      )}
      {showCost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
          <div style={{ width: '55vw', minWidth: 480, background: '#fff', overflow: 'auto', position: 'relative' }}>
            <button onClick={() => setShowCost(false)} style={{ position: 'sticky', top: 12, float: 'right', marginRight: 12, zIndex: 1, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#94A3B8', fontSize: '0.85rem' }}>✕</button>
            <CostPanel
              boardId={board.id}
              currency={board.currency}
              budgetLines={budgetLines}
              transactions={costTransactions}
              milestones={milestones}
              canEdit={isCreator || currentMember.role === 'admin'}
              onAddTransaction={onAddTransaction}
              onUpdateTransaction={onUpdateTransaction}
              onDeleteTransaction={onDeleteTransaction}
              onAddBudgetLine={onAddBudgetLine}
              onUpdateBudgetLine={onUpdateBudgetLine}
              onDeleteBudgetLine={onDeleteBudgetLine}
              onImportBudgetLines={onImportBudgetLines}
              onChangeCurrency={onChangeCurrency}
            />
          </div>
        </div>
      )}

    </div>
  )
}
