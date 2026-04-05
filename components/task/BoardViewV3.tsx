'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  type Board, type Column, type Member, type MemberRole, type Task,
  type Milestone, type MilestoneTask, type Priority,
  type BudgetLine, type CostTransaction,
} from '@/lib/types'
import { TimelineGridV3 } from './v3/TimelineGridV3'
import { NotesPanel }       from './NotesPanel'
import { FilePanel }        from './FilePanel'
import { Whiteboard }       from './Whiteboard'
import { MembersBar }       from './MembersBar'
import { ProjectInfoModal } from './ProjectInfoModal'
import { InviteManager }    from './InviteManager'
import { CostPanel }        from './CostPanel'
import { supabase }         from '@/lib/supabase'
import { getLocalProfile }  from '@/lib/profile'

// ─── props (identical to BoardViewV2) ─────────────────────────────────────────

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

// ─── helpers ──────────────────────────────────────────────────────────────────

type Note    = { id: string; content: string; author_name: string | null; created_at: string }
type Weather = { temp: number; desc: string; icon: string } | null

const SYM = { TRY: '₺', USD: '$' }
function fmtAmt(n: number, cur: string) {
  const s = SYM[cur as keyof typeof SYM] ?? '$'
  if (n >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${s}${(n / 1_000).toFixed(0)}K`
  return `${s}${n.toFixed(0)}`
}
function fmtDuration(a: Date, b: Date) {
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (days < 0) return '—'
  if (days < 31)  return `${days}d`
  if (days < 365) return `${Math.round(days / 30.4)}mo`
  return `${(days / 365).toFixed(1)}yr`
}
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── KPI cell ────────────────────────────────────────────────────────────────

function KpiCell({ label, value, sub, valueColor, bordered }: {
  label: string; value: string; sub?: string
  valueColor?: string; bordered?: boolean
}) {
  return (
    <div style={{
      padding: '0.7rem 1rem',
      borderRight: bordered !== false ? '1px solid #E8E5F0' : 'none',
      background: '#fff',
      minWidth: 0,
    }}>
      <div style={{ fontSize: '0.52rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: valueColor ?? '#111827', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.58rem', color: '#9CA3AF', marginTop: '0.18rem' }}>{sub}</div>
      )}
    </div>
  )
}

// ─── component ───────────────────────────────────────────────────────────────

export function BoardViewV3(props: Props) {
  const {
    board, columns, members, tasks, currentMember, isCreator,
    milestones, milestoneTasks, budgetLines, costTransactions,
    onUpdateFilePanelUrl, onUpdateBoardInfo,
    onAddMilestone, onUpdateMilestoneDate, onUpdateMilestoneName,
    onCompleteMilestone, onLinkTask, onUnlinkTask, onUpdateMilestoneDependency,
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
      else localStorage.removeItem(`cloud_script_${board.id}`)
    } catch { /* ignore */ }
  }

  const driveFolderId = useMemo(() => {
    const m = board.file_panel_url?.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : undefined
  }, [board.file_panel_url])

  // ── Activity & weather ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('board_notes').select('id, content, author_name, created_at')
      .eq('board_id', board.id).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (data) setRecentNotes(data) })
  }, [board.id])

  useEffect(() => {
    const lat = board.location_lat, lng = board.location_lng
    if (!lat || !lng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json())
      .then(d => {
        const wc = d?.current_weather?.weathercode ?? 0
        const temp = Math.round(d?.current_weather?.temperature ?? 0)
        const icons: Record<number, [string, string]> = {
          0: ['☀️','Clear'], 1: ['🌤','Mostly clear'], 2: ['⛅','Partly cloudy'],
          3: ['☁️','Overcast'], 45: ['🌫','Foggy'], 51: ['🌦','Drizzle'],
          61: ['🌧','Rain'], 65: ['🌧','Heavy rain'], 71: ['🌨','Snow'],
          80: ['🌦','Showers'], 95: ['⛈','Thunderstorm'],
        }
        const [icon, desc] = icons[wc] ?? ['🌡','Unknown']
        setWeather({ temp, desc, icon })
      }).catch(() => {})
  }, [board.location_lat, board.location_lng])

  // ── KPI calculations ───────────────────────────────────────────────────
  const totalBudget     = useMemo(() => budgetLines.filter(b => b.type === 'expense').reduce((s, b) => s + b.budgeted_amount, 0), [budgetLines])
  const totalSale       = useMemo(() => costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])
  const totalCashOut    = useMemo(() => costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])
  const totalNet        = totalSale - totalCashOut
  const totalInvestment = Math.max(0, totalBudget - totalSale) // self-funding gap

  const msDates = milestones.map(m => new Date(m.target_date + 'T00:00:00'))
  const msStart = msDates.length > 0 ? new Date(Math.min(...msDates.map(d => d.getTime()))) : null
  const msEnd   = msDates.length > 0 ? new Date(Math.max(...msDates.map(d => d.getTime()))) : null

  const doneColIds  = columns.filter(c => c.name.toLowerCase() === 'done').map(c => c.id)
  const doneCount   = tasks.filter(t => doneColIds.includes(t.column_id)).length
  const progress    = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0

  const today = new Date().toISOString().split('T')[0]
  const overdueMilestones = milestones.filter(m => !m.completed_at && m.target_date < today)

  // ── Map ────────────────────────────────────────────────────────────────
  const miniMapSrc = useMemo(() => {
    const lat = board.location_lat, lng = board.location_lng
    if (lat !== null && lng !== null)
      return `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.008},${lat-0.008},${lng+0.008},${lat+0.008}&layer=mapnik&marker=${lat},${lng}`
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

  const photos = board.photos ?? []

  // ── render ────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#F0EFF8', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav bar ── */}
      <header style={{ height: 48, background: '#fff', borderBottom: '1.5px solid #E8E5F0', flexShrink: 0, position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', height: '100%', display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.625rem' }}>
          <button
            onClick={() => { if (window.confirm('Go back to all projects?')) window.location.href = '/' }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 500, padding: '0.2rem 0.375rem', borderRadius: 5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M2 7l4-4M2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Projects
          </button>
          <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.06em', color: '#7C3AED', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase' }}>v3</span>
          <span style={{ flex: 1 }} />
          <MembersBar members={members} currentMember={currentMember} isCreator={isCreator} onUpdateMemberRole={onUpdateMemberRole} />
          <button onClick={() => setShowInvite(true)} style={{ flexShrink: 0, padding: '0.3rem 0.625rem', background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>+ Invite</button>
          <button onClick={() => setShowCost(true)} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer' }} title="Budget & Cost">💰</button>
          <a href={`/${board.id}`}    style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, fontSize: '0.72rem', textDecoration: 'none' }}>v1</a>
          <a href={`/v2/${board.id}`} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, fontSize: '0.72rem', textDecoration: 'none' }}>v2</a>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', background: '#fff', boxShadow: '0 0 0 1px #E8E5F0' }}>

        {/* ══════════════════════════════════════════════════════
            SECTION 1 — Project info | Photos | Location
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 2fr 1.5fr', borderBottom: '1.5px solid #E8E5F0', minHeight: 140 }}>

          {/* Panel A: Name + Description */}
          <div style={{ padding: '1.25rem 1.25rem', borderRight: '1px solid #E8E5F0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.2 }}>{board.name}</h1>
              <span style={{ fontSize: '0.52rem', fontWeight: 800, letterSpacing: '0.07em', color: '#10B981', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 4, padding: '0.12rem 0.4rem', textTransform: 'uppercase' }}>
                {progress === 100 ? 'COMPLETE' : overdueMilestones.length > 0 ? 'DELAYED' : 'IN PROGRESS'}
              </span>
            </div>
            {board.description && (
              <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {board.description}
              </p>
            )}
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Completion ring text */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: `conic-gradient(#7C3AED ${progress * 3.6}deg, #EDE9FE 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 800, color: '#7C3AED' }}>{progress}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#374151' }}>Completion</div>
                  <div style={{ fontSize: '0.58rem', color: '#9CA3AF' }}>{doneCount}/{tasks.length} tasks done</div>
                </div>
              </div>
              <button onClick={() => setShowProjectInfo(true)} style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem 0.4rem', borderRadius: 4 }}>✎ Edit</button>
            </div>
          </div>

          {/* Panel B: Photos gallery */}
          <div style={{ borderRight: '1px solid #E8E5F0', overflow: 'hidden', background: '#F9FAFB' }}>
            {photos.length === 0 ? (
              <div
                onClick={() => setShowProjectInfo(true)}
                style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <span style={{ fontSize: '2rem', opacity: 0.3 }}>🖼</span>
                <span style={{ fontSize: '0.68rem' }}>Add project photos</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: photos.length === 1 ? '1fr' : '1fr 1fr', gridTemplateRows: photos.length <= 2 ? '1fr' : '1fr 1fr', width: '100%', height: '100%', gap: 2, padding: 2 }}>
                {photos.slice(0, 4).map((url, i) => (
                  <div key={i} style={{ position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {i === 3 && photos.length > 4 && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 700 }}>+{photos.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel C: Location */}
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Project Location</div>
            {locLabel && (
              <a href={mapLink ?? '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.3rem', textDecoration: 'none' }}>
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>📍</span>
                <span style={{ fontSize: '0.68rem', color: '#374151', lineHeight: 1.5 }}>{locLabel}</span>
              </a>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.9rem' }}>📅</span>
              <span style={{ fontSize: '0.68rem', color: '#6B7280' }}>
                Since {new Date(board.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              </span>
            </div>
            {miniMapSrc ? (
              <a href={mapLink ?? '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'block', flex: 1, minHeight: 60, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #E8E5F0', marginTop: 'auto' }}>
                <iframe src={miniMapSrc} style={{ width: '100%', height: '100%', minHeight: 60, border: 'none', pointerEvents: 'none' }} />
              </a>
            ) : (
              <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, fontSize: '0.65rem', color: '#9CA3AF' }}>
                No location set
              </div>
            )}
          </div>

        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 2 — KPI bar (6 cells)
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: '1.5px solid #E8E5F0', background: '#FAFAFA' }}>
          <KpiCell
            label="Total Duration"
            value={msStart && msEnd ? fmtDuration(msStart, msEnd) : '—'}
            sub={msStart && msEnd
              ? `${msStart.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })} → ${msEnd.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}`
              : 'Set milestones to track'}
          />
          <KpiCell
            label="Total Budget"
            value={totalBudget > 0 ? fmtAmt(totalBudget, board.currency) : '—'}
            sub={totalBudget > 0 ? `${Math.round((totalCashOut / totalBudget) * 100)}% spent` : 'No budget set'}
          />
          <KpiCell
            label="Total Sale"
            value={totalSale > 0 ? fmtAmt(totalSale, board.currency) : '—'}
            sub="Pre-sales / cash in"
          />
          <KpiCell
            label="Total Net"
            value={totalSale + totalCashOut > 0 ? fmtAmt(totalNet, board.currency) : '—'}
            valueColor={totalNet >= 0 ? '#059669' : '#DC2626'}
            sub={totalNet >= 0 ? 'Net positive' : 'Net negative'}
          />
          <KpiCell
            label="Total Investment"
            value={totalBudget > 0 ? fmtAmt(totalInvestment, board.currency) : '—'}
            sub="Self-funding required"
            valueColor="#7C3AED"
          />
          <KpiCell
            label="Completion Rate"
            value={`${progress}%`}
            sub={`${doneCount} / ${tasks.length} tasks`}
            valueColor={progress === 100 ? '#059669' : progress >= 50 ? '#D97706' : '#374151'}
            bordered={false}
          />
        </div>

        {/* ══════════════════════════════════════════════════════
            SECTION 3 — Timeline grid
        ══════════════════════════════════════════════════════ */}
        <TimelineGridV3
          tasks={tasks}
          columns={columns}
          milestones={milestones}
          milestoneTasks={milestoneTasks}
          costTransactions={costTransactions}
          budgetLines={budgetLines}
          currency={board.currency}
          boardPhotos={photos}
        />

        {/* ══════════════════════════════════════════════════════
            SECTION 4 — Notes | Whiteboard | Files | Activity
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1.5px solid #E8E5F0', minHeight: 300 }}>

          {/* Notes */}
          <div style={{ borderRight: '1.5px solid #E8E5F0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <NotesPanel
              boardId={board.id}
              authorName={currentMember.nickname}
              onConvertToTask={() => {}}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
            />
          </div>

          {/* Whiteboard */}
          <div style={{ borderRight: '1.5px solid #E8E5F0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Whiteboard
              boardId={board.id}
              onClose={() => {}}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
              inline
            />
          </div>

          {/* Files */}
          <div style={{ borderRight: '1.5px solid #E8E5F0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FilePanel
              boardId={board.id}
              filePanelUrl={board.file_panel_url}
              isCreator={isCreator}
              onUpdate={onUpdateFilePanelUrl}
              cloudScriptUrl={cloudScriptUrl}
              onCloudScriptUrlChange={saveCloudScriptUrl}
            />
          </div>

          {/* Activity + Weather */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Activity</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentNotes.length === 0
                ? <p style={{ fontSize: '0.68rem', color: '#D1D5DB', textAlign: 'center', paddingTop: '1.5rem' }}>No activity yet</p>
                : recentNotes.slice(0, 6).map(note => (
                    <div key={note.id} style={{ display: 'flex', gap: '0.375rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#7C3AED', color: '#fff', fontSize: '0.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(note.author_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.63rem', color: '#374151', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          <strong>{note.author_name ?? 'Unknown'}</strong>{' '}
                          {note.content.replace(/<[^>]*>/g, '').slice(0, 60)}
                        </div>
                        <div style={{ fontSize: '0.55rem', color: '#9CA3AF', marginTop: '0.1rem' }}>{timeAgo(note.created_at)}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
            {weather && (
              <div style={{ flexShrink: 0, padding: '0.5rem 0.75rem', borderTop: '1px solid #F3F4F6', background: '#F5F4FD' }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>
                  Site Weather
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{weather.icon}</span>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{weather.temp}°C</div>
                    <div style={{ fontSize: '0.62rem', color: '#6B7280' }}>{weather.desc}</div>
                  </div>
                </div>
              </div>
            )}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
          <div style={{ width: '55vw', minWidth: 480, background: '#fff', overflow: 'auto', position: 'relative' }}>
            <button onClick={() => setShowCost(false)} style={{ position: 'sticky', top: 12, float: 'right', marginRight: 12, zIndex: 1, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 8, cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#9CA3AF', fontSize: '0.85rem' }}>✕</button>
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
