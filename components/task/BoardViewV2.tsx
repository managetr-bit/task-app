'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  type Board, type Column, type Member, type MemberRole, type Task,
  type Milestone, type MilestoneTask, type Priority, type BudgetLine, type CostTransaction,
} from '@/lib/types'
import { TimelineCashFlow } from './TimelineCashFlow'
import { NotesPanel } from './NotesPanel'
import { FilePanel } from './FilePanel'
import { Whiteboard } from './Whiteboard'
import { MembersBar } from './MembersBar'
import { ProjectInfoModal } from './ProjectInfoModal'
import { InviteManager } from './InviteManager'
import { CostPanel } from './CostPanel'
import { ProgressArc } from './ProgressArc'
import { supabase } from '@/lib/supabase'
import { getLocalProfile } from '@/lib/profile'

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

type Note = { id: string; content: string; author_name: string | null; created_at: string }
type Weather = { temp: number; desc: string; icon: string } | null

const SYM = { TRY: '₺', USD: '$' }
function fmtAmt(n: number, cur: string) {
  const s = SYM[cur as keyof typeof SYM] ?? '$'
  if (n >= 1_000_000) return `${s}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${s}${(n / 1_000).toFixed(0)}K`
  return `${s}${n.toFixed(0)}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function BoardViewV2(props: Props) {
  const {
    board, columns, members, tasks, currentMember, isCreator,
    milestones, milestoneTasks, budgetLines, costTransactions,
    onUpdateFilePanelUrl, onUpdateBoardInfo,
    onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate,
    onUpdateMilestoneName, onCompleteMilestone, onLinkTask, onUnlinkTask,
    onUpdateMilestoneDependency,
    onAddTransaction, onUpdateTransaction, onDeleteTransaction,
    onAddBudgetLine, onUpdateBudgetLine, onDeleteBudgetLine,
    onImportBudgetLines, onChangeCurrency, onUpdateMemberRole,
  } = props

  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [showInvite, setShowInvite]           = useState(false)
  const [showCost, setShowCost]               = useState(false)
  const [recentNotes, setRecentNotes]         = useState<Note[]>([])
  const [weather, setWeather]                 = useState<Weather>(null)
  const [cloudScriptUrl, setCloudScriptUrl]   = useState<string>(() => {
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
    if (!board.file_panel_url) return undefined
    const m = board.file_panel_url.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : undefined
  }, [board.file_panel_url])

  // KPI calculations
  const totalBudget  = useMemo(() => budgetLines.filter(b => b.type === 'expense').reduce((s, b) => s + b.budgeted_amount, 0), [budgetLines])
  const totalSpent   = useMemo(() => costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])
  const totalIncome  = useMemo(() => costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])

  const today = new Date().toISOString().split('T')[0]
  const overdueMilestones = milestones.filter(m => !m.completed_at && m.target_date < today)

  // Progress
  const doneColIds = columns.filter(c => c.name.toLowerCase() === 'done').map(c => c.id)
  const doneCount  = tasks.filter(t => doneColIds.includes(t.column_id)).length
  const progress   = tasks.length > 0 ? Math.round(doneCount / tasks.length * 100) : 0

  // Activity (board notes)
  useEffect(() => {
    supabase.from('board_notes').select('id, content, author_name, created_at')
      .eq('board_id', board.id).order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setRecentNotes(data) })
  }, [board.id])

  // Weather
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

  // Map src for mini-map
  const miniMapSrc = useMemo(() => {
    const lat = board.location_lat, lng = board.location_lng
    if (lat !== null && lng !== null)
      return `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.006},${lat-0.006},${lng+0.006},${lat+0.006}&layer=mapnik&marker=${lat},${lng}`
    if (board.location_address?.startsWith('https://www.google.com/maps/embed'))
      return board.location_address
    return null
  }, [board.location_lat, board.location_lng, board.location_address])

  const mapLink = board.location_lat !== null && board.location_lng !== null
    ? `https://www.google.com/maps/search/?api=1&query=${board.location_lat},${board.location_lng}`
    : board.location_address && !board.location_address.startsWith('https://') ? `https://maps.google.com/?q=${encodeURIComponent(board.location_address)}` : null

  const locLabel = board.location_address && !board.location_address.startsWith('https://')
    ? board.location_address
    : board.location_lat !== null ? `${board.location_lat?.toFixed(3)}, ${board.location_lng?.toFixed(3)}` : null

  const coverPhoto = board.photos?.[0] ?? null

  return (
    <div style={{ minHeight: '100vh', background: '#F0EFF8', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top nav ── */}
      <header style={{
        height: 48, background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0',
        display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.625rem',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 30,
      }}>
        <button
          onClick={() => { if (window.confirm('Go back to all projects?')) window.location.href = '/' }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 500, padding: '0.2rem 0.375rem', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M2 7l4-4M2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Projects
        </button>
        <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.06em', color: '#7C3AED', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 4, padding: '0.12rem 0.35rem', textTransform: 'uppercase', flexShrink: 0 }}>v2</span>
        <span style={{ flex: 1 }} />
        <MembersBar members={members} currentMember={currentMember} isCreator={isCreator} onUpdateMemberRole={onUpdateMemberRole} />
        <button onClick={() => setShowInvite(true)} style={{ flexShrink: 0, padding: '0.3rem 0.625rem', background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>+ Invite</button>
        <button onClick={() => setShowCost(true)} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer' }} title="Budget & Cost">💰</button>
        <a href={`/${board.id}`} style={{ flexShrink: 0, padding: '0.3rem 0.5rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 6, fontSize: '0.72rem', textDecoration: 'none' }} title="Switch to v1 Kanban">v1</a>
      </header>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* ── Cover photo ── */}
        <div
          onClick={() => setShowProjectInfo(true)}
          style={{ position: 'relative', height: 200, flexShrink: 0, cursor: 'pointer', overflow: 'hidden', background: 'linear-gradient(135deg,#7C3AED22,#A78BFA33)' }}
        >
          {coverPhoto
            ? <img src={coverPhoto} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ fontSize: '3rem', opacity: 0.2 }}>🏗</span>
                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Click to add cover photo</span>
              </div>
          }
          {/* Upload button overlay */}
          <button
            onClick={e => { e.stopPropagation(); setShowProjectInfo(true) }}
            style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.625rem', background: 'rgba(0,0,0,0.45)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(4px)' }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 4l3-3 3 3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Upload Cover
          </button>
        </div>

        {/* ── Project info row ── */}
        <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '1.25rem' }}>

          {/* Left: name + badge + completion label + description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', margin: 0 }}>{board.name}</h1>
              <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#10B981', background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 5, padding: '0.15rem 0.45rem', flexShrink: 0 }}>IN PROGRESS</span>
            </div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', marginBottom: '0.25rem' }}>Completion Progress</div>
            {board.description && (
              <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {board.description}
              </p>
            )}
          </div>

          {/* Center: progress circle */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressArc pct={progress} size={72} />
          </div>

          {/* Right: location + date + mini map */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 160 }}>
              {locLabel && (
                <a href={mapLink ?? '#'} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
                  <span style={{ fontSize: '0.8rem' }}>📍</span>
                  <span style={{ fontSize: '0.7rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{locLabel}</span>
                </a>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.8rem' }}>📅</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>
                  {new Date(board.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
            {miniMapSrc && (
              <a href={mapLink ?? '#'} target="_blank" rel="noopener noreferrer" title="Open in maps" style={{ flexShrink: 0, display: 'block', width: 96, height: 72, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #E8E5F0', textDecoration: 'none' }}>
                <iframe src={miniMapSrc} style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} />
                <div style={{ textAlign: 'center', fontSize: '0.55rem', color: '#9CA3AF', marginTop: 2 }}>Mini Map</div>
              </a>
            )}
          </div>
        </div>

        {/* ── Metadata bar ── */}
        <div style={{ background: '#FAFAF9', borderBottom: '1px solid #F0EDE8', padding: '0.375rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap', flexShrink: 0 }}>
          {[
            { label: 'Members', value: `${members.length}` },
            { label: 'Tasks', value: `${doneCount} / ${tasks.length} done` },
            { label: 'Milestones', value: `${milestones.filter(m => m.completed_at).length} / ${milestones.length} done` },
            { label: 'Currency', value: board.currency ?? 'USD' },
            { label: 'Created', value: new Date(board.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
          ].map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#D1C7C0', fontSize: '0.75rem', padding: '0 0.625rem' }}>|</span>}
              <span style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>{item.label}:</span> {item.value}
              </span>
            </React.Fragment>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => setShowProjectInfo(true)} style={{ fontSize: '0.65rem', color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.375rem' }}>✎ Edit info</button>
        </div>

        {/* ── KPI cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0', flexShrink: 0 }}>
          {[
            {
              label: 'Budget', value: fmtAmt(totalBudget, board.currency),
              sub: totalBudget > 0 ? `${fmtAmt(totalSpent, board.currency)} spent` : 'No budget set',
              pct: totalBudget > 0 ? Math.min(100, totalSpent / totalBudget * 100) : 0,
              barColor: totalSpent > totalBudget ? '#EF4444' : '#7C3AED',
              textColor: '#111827', warn: false,
            },
            {
              label: 'Spent', value: fmtAmt(totalSpent, board.currency),
              sub: totalBudget > 0 ? `${Math.round(totalSpent / totalBudget * 100)}% of budget` : 'No budget',
              pct: null, barColor: '', textColor: '#111827', warn: totalSpent > totalBudget,
            },
            {
              label: 'Income', value: fmtAmt(totalIncome, board.currency),
              sub: 'Cash received', pct: null, barColor: '', textColor: '#10B981', warn: false,
            },
            {
              label: 'Schedule',
              value: overdueMilestones.length > 0 ? `Delayed (${overdueMilestones.length}d)` : milestones.length > 0 ? 'On Track' : 'No milestones',
              sub: overdueMilestones.length > 0 ? `${overdueMilestones.length} milestone${overdueMilestones.length > 1 ? 's' : ''} overdue` : `${milestones.filter(m => m.completed_at).length} completed`,
              pct: null, barColor: '', textColor: overdueMilestones.length > 0 ? '#EF4444' : '#10B981',
              warn: overdueMilestones.length > 0,
            },
          ].map((kpi, i) => (
            <div key={i} style={{ padding: '0.875rem 1.25rem', borderRight: i < 3 ? '1px solid #F3F4F6' : 'none', background: kpi.warn ? '#FFF5F5' : '#FFFFFF' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{kpi.label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: kpi.textColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{kpi.value}</div>
              <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: '0.2rem' }}>{kpi.sub}</div>
              {kpi.pct !== null && (
                <div style={{ height: 3, background: '#F3F4F6', borderRadius: 2, marginTop: '0.5rem', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${kpi.pct}%`, background: kpi.barColor, borderRadius: 2, transition: 'width 0.4s' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Timeline ── */}
        <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0', flexShrink: 0 }}>
          <TimelineCashFlow
            milestones={milestones}
            milestoneTasks={milestoneTasks}
            tasks={tasks}
            costTransactions={costTransactions}
            budgetLines={budgetLines}
            currency={board.currency}
            onAdd={onAddMilestone}
            onDelete={onDeleteMilestone}
            onUpdateDate={onUpdateMilestoneDate}
            onUpdateName={onUpdateMilestoneName}
            onComplete={onCompleteMilestone}
            onLinkTask={onLinkTask}
            onUnlinkTask={onUnlinkTask}
            onCollapse={() => {}}
            onUpdateDependency={onUpdateMilestoneDependency}
          />
        </div>

        {/* ── Bottom row: Notes | Files | Whiteboard | Activity+Weather ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px 1fr 220px', background: '#FFFFFF', minHeight: 280, flexShrink: 0 }}>

          {/* Quick Notes */}
          <div style={{ borderRight: '1.5px solid #E8E5F0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <NotesPanel
              boardId={board.id}
              authorName={currentMember.nickname}
              onConvertToTask={() => {}}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
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

          {/* Whiteboard — inline */}
          <div style={{ borderRight: '1.5px solid #E8E5F0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Whiteboard
              boardId={board.id}
              onClose={() => {}}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
              inline
            />
          </div>

          {/* Activity Feed + Weather */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Activity */}
            <div style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Activity Feed</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentNotes.length === 0
                ? <p style={{ fontSize: '0.7rem', color: '#D1D5DB', textAlign: 'center', paddingTop: '1rem' }}>No activity yet</p>
                : recentNotes.slice(0, 6).map(note => (
                    <div key={note.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#7C3AED', color: '#fff', fontSize: '0.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(note.author_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.65rem', color: '#374151', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          <strong>{note.author_name ?? 'Unknown'}</strong> {note.content.replace(/<[^>]*>/g, '').slice(0, 60)}
                        </div>
                        <div style={{ fontSize: '0.58rem', color: '#9CA3AF', marginTop: '0.1rem' }}>{timeAgo(note.created_at)}</div>
                      </div>
                    </div>
                  ))
              }
            </div>

            {/* Weather */}
            {weather && (
              <div style={{ flexShrink: 0, padding: '0.5rem 0.75rem', borderTop: '1px solid #F3F4F6', background: '#F5F4FD' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>
                  {locLabel ? locLabel.split(',')[0] : 'Site weather'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>{weather.icon}</span>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>{weather.temp}°C</div>
                    <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>{weather.desc}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

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
          onUpdateMemberRole={onUpdateMemberRole}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showCost && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
          <div style={{ width: '55vw', minWidth: 480, background: '#fff', overflow: 'auto', position: 'relative' }}>
            <button onClick={() => setShowCost(false)} style={{ position: 'sticky', top: 12, float: 'right', marginRight: 12, zIndex: 1, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 8, cursor: 'pointer', padding: '0.25rem 0.5rem', color: '#9CA3AF', fontSize: '0.85rem' }}>✕</button>
            <CostPanel
              boardId={board.id}
              currency={board.currency ?? 'USD'}
              budgetLines={budgetLines}
              transactions={costTransactions}
              milestones={milestones}
              canEdit={isCreator}
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
