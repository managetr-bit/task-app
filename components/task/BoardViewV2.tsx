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

function fmtCurrency(n: number, currency: string) {
  if (n >= 1_000_000) return `${currency === 'TRY' ? '₺' : '$'}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${currency === 'TRY' ? '₺' : '$'}${(n / 1_000).toFixed(0)}K`
  return `${currency === 'TRY' ? '₺' : '$'}${n.toFixed(0)}`
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
  const [showInvite, setShowInvite] = useState(false)
  const [showCost, setShowCost] = useState(false)
  const [recentNotes, setRecentNotes] = useState<Note[]>([])
  const [weather, setWeather] = useState<Weather>(null)
  const [cloudScriptUrl, setCloudScriptUrl] = useState<string>(() => {
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
  const totalBudget = useMemo(() =>
    budgetLines.filter(b => b.type === 'expense').reduce((s, b) => s + b.budgeted_amount, 0), [budgetLines])
  const totalSpent = useMemo(() =>
    costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])
  const totalIncome = useMemo(() =>
    costTransactions.filter(t => t.type === 'cash_in' && !t.is_forecast).reduce((s, t) => s + t.amount, 0), [costTransactions])

  const today = new Date().toISOString().split('T')[0]
  const overdueMilestones = milestones.filter(m => !m.completed_at && m.target_date < today)
  const scheduleOk = overdueMilestones.length === 0

  // Progress %
  const doneColIds = columns.filter(c => c.name.toLowerCase() === 'done').map(c => c.id)
  const progress = tasks.length > 0
    ? Math.round(tasks.filter(t => doneColIds.includes(t.column_id)).length / tasks.length * 100) : 0

  // Load recent notes for activity feed
  useEffect(() => {
    supabase.from('board_notes').select('id, content, author_name, created_at')
      .eq('board_id', board.id)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => { if (data) setRecentNotes(data) })
  }, [board.id])

  // Weather from Open-Meteo (free, no key)
  useEffect(() => {
    const lat = board.location_lat
    const lng = board.location_lng
    if (!lat || !lng) return
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=apparent_temperature`)
      .then(r => r.json())
      .then(d => {
        const wc = d?.current_weather?.weathercode ?? 0
        const temp = Math.round(d?.current_weather?.temperature ?? 0)
        const icons: Record<number, [string, string]> = {
          0: ['☀️', 'Clear'], 1: ['🌤', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'],
          3: ['☁️', 'Overcast'], 45: ['🌫', 'Foggy'], 48: ['🌫', 'Foggy'],
          51: ['🌦', 'Drizzle'], 53: ['🌦', 'Drizzle'], 55: ['🌧', 'Drizzle'],
          61: ['🌧', 'Rain'], 63: ['🌧', 'Rain'], 65: ['🌧', 'Heavy rain'],
          71: ['🌨', 'Snow'], 73: ['🌨', 'Snow'], 75: ['❄️', 'Heavy snow'],
          80: ['🌦', 'Showers'], 81: ['🌧', 'Showers'], 82: ['⛈', 'Showers'],
          95: ['⛈', 'Thunderstorm'], 96: ['⛈', 'Thunderstorm'],
        }
        const [icon, desc] = icons[wc] ?? ['🌡', 'Unknown']
        setWeather({ temp, desc, icon })
      })
      .catch(() => { /* no weather */ })
  }, [board.location_lat, board.location_lng])

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const coverPhoto = board.photos?.[0] ?? null

  return (
    <div style={{ minHeight: '100vh', background: '#F0EFF8', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <header style={{
        height: 52, background: '#FFFFFF', borderBottom: '1.5px solid #E8E5F0',
        display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.75rem',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 30,
      }}>
        <button
          onClick={() => { if (window.confirm('Go back to all projects?')) window.location.href = '/' }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '0.78rem', fontWeight: 500, padding: '0.25rem 0.375rem', borderRadius: 6, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M2 7l4-4M2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Projects
        </button>

        {/* v2 badge */}
        <span style={{ fontSize: '0.55rem', fontWeight: 800, letterSpacing: '0.06em', color: '#7C3AED', background: '#EDE9FE', border: '1px solid #DDD6FE', borderRadius: 4, padding: '0.15rem 0.4rem', textTransform: 'uppercase', flexShrink: 0 }}>v2</span>

        {/* Project name */}
        <span
          onClick={() => setShowProjectInfo(true)}
          style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', letterSpacing: '-0.01em', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}
          title="Click to edit project info"
        >
          {board.name}
        </span>

        {/* Switch to v1 */}
        <a
          href={`/${board.id}`}
          style={{ fontSize: '0.7rem', color: '#9CA3AF', textDecoration: 'none', flexShrink: 0, padding: '0.2rem 0.5rem', border: '1px solid #E8E5F0', borderRadius: 6 }}
          title="Switch to v1 Kanban"
        >
          v1 view
        </a>

        <MembersBar members={members} currentMember={currentMember} isCreator={isCreator} onUpdateMemberRole={onUpdateMemberRole} />

        <button
          onClick={() => setShowInvite(true)}
          style={{ flexShrink: 0, padding: '0.35rem 0.75rem', background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
        >
          + Invite
        </button>
        <button
          onClick={() => setShowCost(true)}
          style={{ flexShrink: 0, padding: '0.35rem 0.625rem', background: 'none', color: '#9CA3AF', border: '1px solid #E8E5F0', borderRadius: 7, fontSize: '0.75rem', cursor: 'pointer' }}
        >
          💰 Budget
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>

        {/* Upper area: Project Card + KPI/Timeline */}
        <div style={{ display: 'flex', gap: '0', flex: '1 0 auto', minHeight: 480 }}>

          {/* LEFT: Project Card */}
          <div style={{
            width: 272, flexShrink: 0, background: '#FFFFFF',
            borderRight: '1.5px solid #E8E5F0',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Cover photo */}
            <div
              onClick={() => setShowProjectInfo(true)}
              style={{
                height: 160, flexShrink: 0, position: 'relative', cursor: 'pointer',
                background: coverPhoto ? 'transparent' : 'linear-gradient(135deg, #7C3AED22 0%, #A78BFA33 100%)',
                overflow: 'hidden',
              }}
            >
              {coverPhoto ? (
                <img src={coverPhoto} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.25rem' }}>
                  <span style={{ fontSize: '2rem', opacity: 0.3 }}>🏗</span>
                  <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>Click to add cover photo</span>
                </div>
              )}
              {/* Gradient overlay */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
              {/* Upload overlay */}
              <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '0.6rem', borderRadius: 5, padding: '0.2rem 0.45rem' }}>
                ✎ Edit
              </div>
            </div>

            {/* Project info */}
            <div style={{ padding: '0.875rem 1rem', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {/* Name + status + progress */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{board.name}</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#10B981', background: '#D1FAE5', borderRadius: 4, padding: '0.1rem 0.35rem', flexShrink: 0 }}>
                    In Progress
                  </span>
                </div>
                {board.description && (
                  <p style={{ fontSize: '0.7rem', color: '#6B7280', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {board.description}
                  </p>
                )}
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9CA3AF' }}>Completion</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED' }}>{progress}%</span>
                </div>
                <div style={{ height: 6, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #7C3AED, #A78BFA)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                  {tasks.filter(t => doneColIds.includes(t.column_id)).length} of {tasks.length} tasks complete
                </div>
              </div>

              {/* Location */}
              {(board.location_address || (board.location_lat && board.location_lng)) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>📍</span>
                  <span style={{ fontSize: '0.7rem', color: '#6B7280', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {board.location_address && !board.location_address.startsWith('https://') ? board.location_address : (board.location_lat ? `${board.location_lat?.toFixed(4)}, ${board.location_lng?.toFixed(4)}` : '')}
                  </span>
                </div>
              )}

              {/* Created date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>📅</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>
                  Created {new Date(board.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* Team members count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>👥</span>
                <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>{members.length} team member{members.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Photos strip */}
              {board.photos && board.photos.filter(Boolean).length > 1 && (
                <div>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.35rem' }}>Photos</div>
                  <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto' }}>
                    {board.photos.filter(Boolean).slice(1, 5).map((url, i) => (
                      <img key={i} src={url} alt="" style={{ width: 48, height: 40, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowProjectInfo(true)}
                style={{ marginTop: 'auto', padding: '0.4rem', background: '#F5F4FD', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 7, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}
              >
                ✎ Edit project info
              </button>
            </div>
          </div>

          {/* RIGHT: KPI bar + Timeline */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#F0EFF8' }}>

            {/* KPI bar */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1.5px solid #E8E5F0', background: '#FFFFFF', flexShrink: 0 }}>
              {[
                { label: 'Budget', value: fmtCurrency(totalBudget, board.currency), sub: `Budgeted total`, color: '#6B7280', highlight: false },
                { label: 'Spent', value: fmtCurrency(totalSpent, board.currency), sub: `${totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100) : 0}% of budget`, color: '#EF4444', highlight: totalSpent > totalBudget },
                { label: 'Income', value: fmtCurrency(totalIncome, board.currency), sub: `Cash received`, color: '#10B981', highlight: false },
                { label: 'Schedule', value: scheduleOk ? 'On Track' : `Delayed (${overdueMilestones.length})`, sub: scheduleOk ? `${milestones.filter(m => m.completed_at).length} milestones done` : `${overdueMilestones.length} overdue`, color: scheduleOk ? '#10B981' : '#EF4444', highlight: !scheduleOk },
              ].map((kpi, i) => (
                <div key={i} style={{
                  flex: 1, padding: '0.75rem 1.25rem',
                  borderRight: i < 3 ? '1px solid #F3F4F6' : 'none',
                  background: kpi.highlight ? '#FEF2F2' : '#FFFFFF',
                }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{kpi.label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: kpi.color, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{kpi.value}</div>
                  <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: '0.2rem' }}>{kpi.sub}</div>
                  {/* Bar indicator for budget/spent */}
                  {i <= 1 && totalBudget > 0 && (
                    <div style={{ height: 3, background: '#F3F4F6', borderRadius: 2, marginTop: '0.4rem', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (i === 0 ? 100 : totalSpent / totalBudget * 100))}%`, background: i === 0 ? '#E5E7EB' : (totalSpent > totalBudget ? '#EF4444' : '#7C3AED'), borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
          </div>
        </div>

        {/* ── Bottom row: Notes | Files | Whiteboard | Activity+Weather ── */}
        <div style={{ height: 280, display: 'flex', borderTop: '1.5px solid #E8E5F0', flexShrink: 0, background: '#FFFFFF' }}>

          {/* Notes */}
          <div style={{ flex: 1.5, minWidth: 0, borderRight: '1.5px solid #E8E5F0', overflow: 'hidden' }}>
            <NotesPanel
              boardId={board.id}
              authorName={currentMember.nickname}
              onConvertToTask={() => {}}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
            />
          </div>

          {/* Files */}
          <div style={{ flex: 1, minWidth: 0, borderRight: '1.5px solid #E8E5F0', overflow: 'hidden' }}>
            <FilePanel
              boardId={board.id}
              filePanelUrl={board.file_panel_url}
              isCreator={isCreator}
              onUpdate={onUpdateFilePanelUrl}
              cloudScriptUrl={cloudScriptUrl}
              onCloudScriptUrlChange={saveCloudScriptUrl}
            />
          </div>

          {/* Whiteboard */}
          <div style={{ flex: 1.5, minWidth: 0, borderRight: '1.5px solid #E8E5F0', overflow: 'hidden' }}>
            <Whiteboard boardId={board.id} onClose={() => {}} cloudScriptUrl={cloudScriptUrl || undefined} driveFolderId={driveFolderId} />
          </div>

          {/* Activity Feed + Weather */}
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Activity */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0.625rem 0.75rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>Activity</div>
              {recentNotes.length === 0 ? (
                <p style={{ fontSize: '0.7rem', color: '#D1D5DB', textAlign: 'center', marginTop: '1rem' }}>No activity yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {recentNotes.slice(0, 6).map(note => (
                    <div key={note.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#7C3AED', color: '#fff', fontSize: '0.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {(note.author_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.65rem', color: '#374151', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {note.content.replace(/<[^>]*>/g, '').slice(0, 80)}
                        </div>
                        <div style={{ fontSize: '0.58rem', color: '#9CA3AF', marginTop: '0.1rem' }}>
                          {note.author_name ?? 'Unknown'} · {timeAgo(note.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weather */}
            {weather && (
              <div style={{ flexShrink: 0, padding: '0.5rem 0.75rem', borderTop: '1px solid #F3F4F6', background: '#F5F4FD' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>Weather at site</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{weather.icon}</span>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{weather.temp}°C</div>
                    <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>{weather.desc}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <div style={{ width: '60vw', height: '100vh', background: '#fff', position: 'relative', overflow: 'auto' }}>
            <button onClick={() => setShowCost(false)} style={{ position: 'absolute', top: 12, right: 12, zIndex: 1, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#9CA3AF' }}>✕</button>
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
