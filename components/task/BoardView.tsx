'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { type Board, type Column, type Member, type MemberRole, type Task, type Milestone, type MilestoneTask, type Priority, type BudgetLine, type CostTransaction } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { TaskDetailModal } from './TaskDetailModal'
import { ProgressArc } from './ProgressArc'
import { MembersBar } from './MembersBar'
import { FilePanel } from './FilePanel'
import { TimelineCashFlow } from './TimelineCashFlow'
import { NotesPanel } from './NotesPanel'
import { Whiteboard } from './Whiteboard'
import { InviteManager } from './InviteManager'
import { CostPanel } from './CostPanel'
import { ProjectInfoModal } from './ProjectInfoModal'
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
  onCreateTask: (p: {
    columnId: string
    title: string
    priority: Priority
    dueDate: string | null
    description: string
  }) => Promise<void>
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
  // Cost module
  budgetLines: BudgetLine[]
  costTransactions: CostTransaction[]
  onAddTransaction:    (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateTransaction: (id: string, updates: Partial<CostTransaction>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
  onAddBudgetLine:     (data: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateBudgetLine:  (id: string, updates: Partial<BudgetLine>) => Promise<void>
  onDeleteBudgetLine:  (id: string) => Promise<void>
  onImportBudgetLines: (lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[]) => Promise<void>
  onChangeCurrency:    (c: 'TRY' | 'USD') => Promise<void>
  onUpdateMemberRole:  (memberId: string, role: MemberRole) => Promise<void>
}

// Custom collision: column drags only collide with col-* targets; task drags ignore col-* targets
const columnAwareCollision: CollisionDetection = (args) => {
  const activeId = String(args.active.id)
  if (activeId.startsWith('col-')) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(c => String(c.id).startsWith('col-')),
    })
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(c => !String(c.id).startsWith('col-')),
  })
}

export function BoardView({
  board, columns, members, tasks, currentMember, isCreator,
  milestones, milestoneTasks,
  budgetLines, costTransactions,
  onCreateTask, onMoveTask, onReorderTask, onAssignTask,
  onUpdateTask, onDeleteTask, onAddColumn, onDeleteColumn, onRenameColumn, onReorderColumn,
  onUpdateFilePanelUrl, onUpdateBoardName, onUpdateBoardInfo,
  onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate, onUpdateMilestoneName, onCompleteMilestone, onLinkTask, onUnlinkTask, onUpdateMilestoneDependency,
  onAddTransaction, onUpdateTransaction, onDeleteTransaction,
  onAddBudgetLine, onUpdateBudgetLine, onDeleteBudgetLine, onImportBudgetLines, onChangeCurrency,
  onUpdateMemberRole,
}: Props) {
  const [addTaskColumnId, setAddTaskColumnId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showFilePanel, setShowFilePanel] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumn, setActiveColumn] = useState<Column | null>(null)
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [boardNameDraft, setBoardNameDraft] = useState(board.name)
  // Column delete confirmation state
  const [deleteColConfirm, setDeleteColConfirm] = useState<{ columnId: string; columnName: string } | null>(null)
  const [showTimeline, setShowTimeline] = useState(true)
  const [showKanban, setShowKanban] = useState(true)
  const [showNotes, setShowNotes] = useState(true)
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [showInviteManager, setShowInviteManager] = useState(false)
  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [headerLightbox, setHeaderLightbox] = useState<number | null>(null)
  const [noteTaskDraft, setNoteTaskDraft] = useState<string | null>(null)
  type SidebarTab = 'notes' | 'files' | 'cost'
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('notes')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // canEditCosts: board creator OR admin role
  const canEditCosts = isCreator || currentMember.role === 'creator' || currentMember.role === 'admin'
  // Responsive
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440)
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isMobile  = winW < 768
  const isTablet  = winW >= 768 && winW < 1100
  const defaultSidebarW = isTablet ? 220 : 280
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const sidebarW = sidebarWidth ?? defaultSidebarW
  const resizingRef = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)
  useEffect(() => {
    // Load saved sidebar width from localStorage
    try {
      const saved = localStorage.getItem(`sidebar_w_${board.id}`)
      if (saved) setSidebarWidth(parseInt(saved))
    } catch { /* ignore */ }
  }, [board.id])

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    resizingRef.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = sidebarW

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = resizeStartX.current - ev.clientX  // drag left = wider sidebar
      const newW = Math.min(520, Math.max(180, resizeStartW.current + delta))
      setSidebarWidth(newW)
    }
    const onUp = () => {
      resizingRef.current = false
      try { localStorage.setItem(`sidebar_w_${board.id}`, String(sidebarW)) } catch { /* ignore */ }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  type MobileTab = 'board' | 'timeline' | 'cost' | 'notes' | 'files'
  const [mobileTab, setMobileTab] = useState<MobileTab>('board')
  // Cloud storage settings — Apps Script URL stored per board in localStorage
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

  // Extract Google Drive folder ID from the linked file_panel_url (if it's a Drive folder)
  const driveFolderId = useMemo(() => {
    if (!board.file_panel_url) return undefined
    const m = board.file_panel_url.match(/drive\.google\.com\/drive(?:\/u\/\d+)?\/folders\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : undefined
  }, [board.file_panel_url])

  // Sensors: require 8px movement before drag starts — clicks still work
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // Progress
  const doneColumn = useMemo(() => columns.find(c => c.name === 'Done'), [columns])
  const totalTasks = tasks.length
  const doneTasks = doneColumn ? tasks.filter(t => t.column_id === doneColumn.id).length : 0
  const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
  const today = new Date().toDateString()
  const momentumCount = tasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === today).length

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  async function handleUpdateMilestoneDependency(milestoneId: string, dependsOnId: string | null, offsetDays: number) {
    if (onUpdateMilestoneDependency) {
      await onUpdateMilestoneDependency(milestoneId, dependsOnId, offsetDays)
    }
  }

  async function handleAddColumn(e: React.FormEvent) {
    e.preventDefault()
    const name = newColumnName.trim()
    if (!name || columns.length >= 6) return
    setAddingColumn(true)
    await onAddColumn(name)
    setNewColumnName('')
    setShowAddColumn(false)
    setAddingColumn(false)
  }

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id)
    if (id.startsWith('col-')) {
      const col = columns.find(c => `col-${c.id}` === id)
      if (col) setActiveColumn(col)
      return
    }
    const task = tasks.find(t => t.id === active.id)
    if (task) setActiveTask(task)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    setActiveColumn(null)
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Column reorder
    if (activeId.startsWith('col-') && overId.startsWith('col-')) {
      const activeColId = activeId.slice(4)
      const overColId = overId.slice(4)
      const sorted = [...columns].sort((a, b) => a.position - b.position)
      const newIndex = sorted.findIndex(c => c.id === overColId)
      if (newIndex !== -1) onReorderColumn(activeColId, newIndex)
      return
    }

    // Task drag
    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    // Dropped onto a column drop zone
    const targetColumn = columns.find(c => c.id === over.id)
    if (targetColumn) {
      if (targetColumn.id !== activeTask.column_id) {
        onMoveTask(activeTask.id, targetColumn.id)
      }
      return
    }

    // Dropped onto another task
    const overTask = tasks.find(t => t.id === over.id)
    if (!overTask) return

    if (activeTask.column_id === overTask.column_id) {
      const colTasks = tasks
        .filter(t => t.column_id === activeTask.column_id)
        .sort((a, b) => a.position - b.position)
      const newIndex = colTasks.findIndex(t => t.id === overTask.id)
      onReorderTask(activeTask.id, newIndex, activeTask.column_id)
    } else {
      onMoveTask(activeTask.id, overTask.column_id)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F4FD', display: 'flex', flexDirection: 'column' }}>
      {/* ── Command Header (120px, 2-column) ──────────────────────────────── */}
      {/* ── Command Header — single flat row ────────────────────────────── */}
      <header className="command-header">

        {/* 1. Projects button */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.875rem', flexShrink: 0 }}>
          <button
            title="All projects"
            onClick={() => { if (window.confirm('Go back to all projects?')) window.location.href = '/' }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', fontSize: '0.8rem', fontWeight: 500,
              padding: 0, borderRadius: 6, transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M2 7l4-4M2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Projects
          </button>
        </div>

        {/* 2. Project Name / Description */}
        <div
          onClick={() => setShowProjectInfo(true)}
          title="Click to edit project info"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.2rem', padding: '0 1rem', flexShrink: 0, cursor: 'pointer', minWidth: 140 }}
        >
          <h1 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {board.name}
          </h1>
          {board.description && (
            <span style={{ fontSize: '0.625rem', color: '#9CA3AF', fontWeight: 400, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
              {board.description}
            </span>
          )}
        </div>

        {/* 3. Location map — full height */}
        {(() => {
          const locAddr = board.location_address
          const locLat = board.location_lat
          const locLng = board.location_lng
          const hasLocation = !!(locAddr || (locLat !== null && locLng !== null))
          const headerMapSrc = locAddr?.startsWith('https://www.google.com/maps/embed')
            ? locAddr
            : (locLat !== null && locLng !== null
              ? `https://www.openstreetmap.org/export/embed.html?bbox=${locLng! - 0.008},${locLat! - 0.008},${locLng! + 0.008},${locLat! + 0.008}&layer=mapnik&marker=${locLat},${locLng}`
              : null)
          if (!hasLocation || !headerMapSrc) return null
          return (
            <div
              onClick={() => setShowProjectInfo(true)}
              title="Click to edit location"
              style={{ width: 140, flexShrink: 0, position: 'relative', cursor: 'pointer', overflow: 'hidden' }}
            >
              <iframe src={headerMapSrc} style={{ border: 'none', pointerEvents: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} title="Project Location" loading="lazy" scrolling="no" />
              <div style={{ position: 'absolute', inset: 0 }} />
            </div>
          )
        })()}

        {/* 4–6. Photos — full height, each in its own cell */}
        {(board.photos?.length ? board.photos.slice(0, 3) : []).map((url, i) => (
          <div
            key={i}
            onClick={e => { e.stopPropagation(); setHeaderLightbox(i) }}
            title="Click to view photo"
            style={{ width: 135, flexShrink: 0, overflow: 'hidden', cursor: 'zoom-in' }}
          >
            <img src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '0' }} />
          </div>
        ))}

        {/* spacer — pushes KPIs + avatars + actions to the right */}
        <div style={{ flex: 1 }} />

        {/* 7. KPIs — right-aligned, next to avatars */}
        {!isMobile && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem 1rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div className="kpi-item" style={{ gap: '0.4rem' }}>
                <div><div className="kpi-value">{totalTasks}</div><div className="kpi-label">Total Tasks</div></div>
                <span className="badge badge-blue">Active</span>
              </div>
              <div style={{ width: 1, height: 22, background: '#E8E5F0', opacity: 0.6, flexShrink: 0 }} />
              <div className="kpi-item" style={{ gap: '0.4rem' }}>
                <div><div className="kpi-value" style={{ color: '#10B981' }}>{doneTasks}</div><div className="kpi-label">Completed</div></div>
                <span className="badge badge-green">+{momentumCount} today</span>
              </div>
              <div style={{ width: 1, height: 22, background: '#E8E5F0', opacity: 0.6, flexShrink: 0 }} />
              <div className="kpi-item" style={{ gap: '0.4rem' }}>
                <div><div className="kpi-value" style={{ color: '#7C3AED' }}>{progressPct}%</div><div className="kpi-label">Progress</div></div>
                <span className="badge badge-purple">{progressPct === 100 ? '✓ Done' : 'On Track'}</span>
              </div>
              <div style={{ width: 1, height: 22, background: '#E8E5F0', opacity: 0.6, flexShrink: 0 }} />
              <div className="kpi-item">
                <div><div className="kpi-value">{members.length}</div><div className="kpi-label">Team Members</div></div>
              </div>
            </div>
            {momentumCount > 0 && (
              <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#7C3AED', letterSpacing: '0.02em' }}>🔥 {momentumCount} done today</span>
            )}
          </div>
        )}

        {/* 8. Progress arc */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 0.75rem', flexShrink: 0 }}>
            <ProgressArc pct={progressPct} size={32} />
          </div>
        )}

        {/* 9. Avatars */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', flexShrink: 0 }}>
            <MembersBar members={members} currentMember={currentMember} isCreator={currentMember.role === 'creator'} onUpdateMemberRole={onUpdateMemberRole} />
          </div>
        )}

        {/* 10. Invite + Board */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0 0.875rem', flexShrink: 0 }}>
          <button
            className="btn-ghost"
            onClick={() => setShowInviteManager(true)}
            title="Invite people"
            style={{ color: '#6B7280', fontSize: '0.75rem', padding: '0.25rem 0.5rem', gap: '0.3rem' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED'; (e.currentTarget as HTMLButtonElement).style.background = '#F3F0FA' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="5.5" cy="4" r="2.25" stroke="currentColor" strokeWidth="1.3"/><path d="M1 11.5c0-2.485 2.015-4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M11 8v4M9 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Invite
          </button>
          <button
            className="btn-ghost"
            onClick={() => setShowWhiteboard(true)}
            title="Whiteboard"
            style={{ color: '#6B7280', fontSize: '0.75rem', padding: '0.25rem 0.5rem', gap: '0.3rem' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#7C3AED'; (e.currentTarget as HTMLButtonElement).style.background = '#F3F0FA' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M4 12h6M7 10.5V12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M4 6l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Board
          </button>
        </div>

      </header>

      {/* ── Board body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, paddingBottom: isMobile ? 60 : 0 }}>

        {/* ── LEFT: Timeline + Kanban ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>

          {/* Timeline + Cash Flow (hidden on mobile when not active tab) */}
          {(!isMobile || mobileTab === 'timeline') && (
            showTimeline ? (
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
                onCollapse={() => setShowTimeline(false)}
                onUpdateDependency={handleUpdateMilestoneDependency}
              />
            ) : (
              !isMobile && (
                <div className="section-strip">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#9CA3AF', flexShrink: 0 }}>
                    <path d="M1 3h10M1 6h10M1 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <span className="section-label">Timeline &amp; Cash Flow</span>
                  {milestones.length > 0 && <span style={{ fontSize: '0.6rem', color: '#9CA3AF', background: '#F5F4FD', borderRadius: 10, padding: '0.1rem 0.45rem', fontWeight: 700, border: '1px solid #E8E5F0' }}>{milestones.length}</span>}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setShowTimeline(true)}
                    title="Expand"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, padding: 0,
                      border: '1px solid #E8E5F0', borderRadius: 6,
                      background: 'none', color: '#9CA3AF',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#7C3AED'; b.style.borderColor = '#7C3AED'; b.style.background = '#F5F4FD' }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#9CA3AF'; b.style.borderColor = '#E8E5F0'; b.style.background = 'none' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )
            )
          )}

          {/* Kanban board (hidden on mobile when not active tab) */}
          {(!isMobile || mobileTab === 'board') && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Board section header */}
              {!isMobile && (
                <div className="section-strip" style={{ background: '#F5F4FD' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#9CA3AF', flexShrink: 0 }}>
                    <rect x="1" y="1.5" width="3.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <rect x="6.5" y="1.5" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                  </svg>
                  <span className="section-label">Board</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setShowKanban(p => !p)}
                    title={showKanban ? 'Collapse' : 'Expand'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, padding: 0,
                      border: '1px solid #E8E5F0', borderRadius: 6,
                      background: 'none', color: '#9CA3AF',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#7C3AED'; b.style.borderColor = '#7C3AED'; b.style.background = '#F5F4FD' }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#9CA3AF'; b.style.borderColor = '#E8E5F0'; b.style.background = 'none' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d={showKanban ? 'M2 4.5L6 8.5L10 4.5' : 'M4.5 2L8.5 6L4.5 10'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}

              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                <DndContext sensors={sensors} collisionDetection={columnAwareCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  {showKanban && (
                    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'visible', padding: isMobile ? '0.75rem' : '1rem 1.25rem 1.5rem', display: 'flex', gap: isMobile ? '0.75rem' : '1rem', alignItems: 'flex-start' }}>
                      <SortableContext items={columns.map(c => `col-${c.id}`)} strategy={horizontalListSortingStrategy}>
                        {columns.map(col => {
                          const colTasks = tasks.filter(t => t.column_id === col.id).sort((a, b) => a.position - b.position)
                          return (
                            <KanbanColumn
                              key={col.id}
                              column={col}
                              tasks={colTasks}
                              members={members}
                              currentMember={currentMember}
                              isDoneColumn={col.name === 'Done'}
                              onAddTask={() => setAddTaskColumnId(col.id)}
                              onAssignTask={onAssignTask}
                              onTaskClick={setSelectedTask}
                              onRenameColumn={(name) => onRenameColumn(col.id, name)}
                              onDeleteColumn={columns.length > 1 ? () => setDeleteColConfirm({ columnId: col.id, columnName: col.name }) : undefined}
                            />
                          )
                        })}
                      </SortableContext>
                      {columns.length < 6 && (
                        <div style={{ flexShrink: 0, width: 220 }}>
                          {showAddColumn ? (
                            <form onSubmit={handleAddColumn} className="animate-slideDown" style={{ background: '#FFFFFF', border: '1.5px solid #E8E5F0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                              <input className="input-base" type="text" placeholder="Column name" value={newColumnName} onChange={e => setNewColumnName(e.target.value)} maxLength={24} autoFocus required />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="submit" className="btn-primary" disabled={addingColumn || !newColumnName.trim()} style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>Add</button>
                                <button type="button" className="btn-ghost" onClick={() => { setShowAddColumn(false); setNewColumnName('') }} style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <button className="btn-ghost" onClick={() => setShowAddColumn(true)} style={{ fontSize: '0.8rem', color: '#c4bfb9', padding: '0.375rem 0.5rem' }}>+ Add column</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <DragOverlay>
                    {activeTask && (
                      <div style={{ transform: 'rotate(2deg)', opacity: 0.95, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.15))' }}>
                        <TaskCard task={activeTask} members={members} currentMember={currentMember} isDoneColumn={false} onAssign={async () => {}} onClick={() => {}} />
                      </div>
                    )}
                    {activeColumn && (
                      <div style={{ width: 280, background: '#FFFFFF', borderRadius: 14, padding: '0.5rem 0.75rem', opacity: 0.9, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', transform: 'rotate(1deg)' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a' }}>{activeColumn.name}</div>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR: Tabbed (Notes | Files | Cost) — desktop & tablet ── */}
        {/* Drag handle — hidden when collapsed */}
        {!isMobile && !sidebarCollapsed && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              width: 4, flexShrink: 0, cursor: 'col-resize',
              background: 'transparent', position: 'relative', zIndex: 20,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#DDD6FE' }}
            onMouseLeave={e => { if (!resizingRef.current) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
          />
        )}
        {!isMobile && (
          <div style={{
            width: sidebarCollapsed ? 40 : sidebarW,
            flexShrink: 0, borderLeft: '1px solid #E8E5F0',
            display: 'flex', flexDirection: 'column', minHeight: 0,
            background: '#FAFAFE', transition: 'width 0.2s ease', overflow: 'hidden',
          }}>
            {/* Tab bar */}
            <div className="sidebar-tab-bar" style={{ position: 'relative' }}>
              {!sidebarCollapsed && ([
                { id: 'notes', label: 'Notes',
                  icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 2.5h9v7l-2.5 2.5h-6.5v-9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8.5 9.5v2.5l2.5-2.5h-2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M4.5 5.5h5M4.5 7.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { id: 'files', label: 'Files',
                  icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 1.5h5.5l3 3V12.5H3V1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8.5 1.5V4.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> },
                { id: 'cost',  label: 'Cost',
                  icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v6M5.5 5.5c0-.83.672-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .83-.672 1-1.5 1S5.5 7.67 5.5 8.5c0 .83.672 1.5 1.5 1.5s1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
              ] as { id: SidebarTab; label: string; icon: React.ReactNode }[]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSidebarTab(tab.id)}
                  className={`sidebar-tab${sidebarTab === tab.id ? ' active' : ''}`}
                >
                  <span style={{ lineHeight: 1 }}>{tab.icon}</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{tab.label}</span>
                </button>
              ))}
              {/* Collapse / expand button */}
              <button
                onClick={() => setSidebarCollapsed(p => !p)}
                title={sidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
                style={{
                  width: 40, flexShrink: 0, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', padding: 0,
                  borderBottom: '2px solid transparent',
                  border: 'none',
                  transition: 'color 0.12s',
                }}
              >
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24,
                    border: '1px solid #E8E5F0', borderRadius: 6,
                    background: 'none', color: '#9CA3AF',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.color = '#7C3AED'; d.style.borderColor = '#7C3AED'; d.style.background = '#F5F4FD' }}
                  onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.color = '#9CA3AF'; d.style.borderColor = '#E8E5F0'; d.style.background = 'none' }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d={sidebarCollapsed ? 'M4.5 2L8.5 6L4.5 10' : 'M7.5 2L3.5 6L7.5 10'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>
            </div>

            {/* Tab content — hidden when collapsed */}
            <div style={{ flex: 1, minHeight: 0, display: sidebarCollapsed ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {sidebarTab === 'notes' && (
                <NotesPanel
                  boardId={board.id}
                  authorName={currentMember.nickname}
                  cloudScriptUrl={cloudScriptUrl || undefined}
                  driveFolderId={driveFolderId}
                  onConvertToTask={content => { setNoteTaskDraft(content); setAddTaskColumnId(columns[0]?.id ?? null) }}
                />
              )}
              {sidebarTab === 'files' && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <FilePanel boardId={board.id} filePanelUrl={board.file_panel_url} isCreator={isCreator} onUpdate={onUpdateFilePanelUrl} cloudScriptUrl={cloudScriptUrl} onCloudScriptUrlChange={saveCloudScriptUrl} />
                </div>
              )}
              {sidebarTab === 'cost' && (
                <CostPanel
                  boardId={board.id}
                  currency={board.currency ?? 'USD'}
                  budgetLines={budgetLines}
                  transactions={costTransactions}
                  milestones={milestones}
                  canEdit={canEditCosts}
                  onAddTransaction={onAddTransaction}
                  onUpdateTransaction={onUpdateTransaction}
                  onDeleteTransaction={onDeleteTransaction}
                  onAddBudgetLine={onAddBudgetLine}
                  onUpdateBudgetLine={onUpdateBudgetLine}
                  onDeleteBudgetLine={onDeleteBudgetLine}
                  onImportBudgetLines={onImportBudgetLines}
                  onChangeCurrency={onChangeCurrency}
                />
              )}
            </div>
          </div>
        )}

        {/* ── MOBILE: tab panels ── */}
        {isMobile && mobileTab === 'notes' && (
          <div style={{ position: 'absolute', inset: '60px 0 56px 0', display: 'flex', flexDirection: 'column', background: '#FAFAFA', zIndex: 5 }}>
            <NotesPanel
              boardId={board.id}
              authorName={currentMember.nickname}
              cloudScriptUrl={cloudScriptUrl || undefined}
              driveFolderId={driveFolderId}
              onConvertToTask={content => { setNoteTaskDraft(content); setAddTaskColumnId(columns[0]?.id ?? null); setMobileTab('board') }}
            />
          </div>
        )}
        {isMobile && mobileTab === 'files' && (
          <div style={{ position: 'absolute', inset: '60px 0 56px 0', display: 'flex', flexDirection: 'column', background: '#FAFAFA', zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #E8E5E0', background: '#fff' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Files</span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FilePanel boardId={board.id} filePanelUrl={board.file_panel_url} isCreator={isCreator} onUpdate={onUpdateFilePanelUrl} cloudScriptUrl={cloudScriptUrl} onCloudScriptUrlChange={saveCloudScriptUrl} />
            </div>
          </div>
        )}
        {isMobile && mobileTab === 'cost' && (
          <div style={{ position: 'absolute', inset: '60px 0 56px 0', display: 'flex', flexDirection: 'column', background: '#FAFAFA', zIndex: 5, overflow: 'hidden' }}>
            <CostPanel
              boardId={board.id}
              currency={board.currency ?? 'USD'}
              budgetLines={budgetLines}
              transactions={costTransactions}
              milestones={milestones}
              canEdit={canEditCosts}
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
        )}
      </div>

      {/* ── MOBILE: Bottom tab bar ── */}
      {isMobile && (
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 60, background: '#FFFFFF', borderTop: '1px solid #E8E5F0', display: 'flex', zIndex: 30 }}>
          {([
            { id: 'board',    label: 'Board',    icon: <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><rect x="1" y="1.5" width="4" height="11" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="7.5" y="1.5" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg> },
            { id: 'timeline', label: 'Timeline', icon: <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M1 7h12M3 4.5V7M7 3.5V7M11 5V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="3" cy="4.5" r="1.2" fill="currentColor"/><circle cx="7" cy="3.5" r="1.2" fill="currentColor"/><circle cx="11" cy="5" r="1.2" fill="currentColor"/></svg> },
            { id: 'cost',     label: 'Cost',     icon: <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 4v6M5.5 5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .83-.67 1-1.5 1s-1.5.67-1.5 1.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
            { id: 'notes',    label: 'Notes',    icon: <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2.5 2.5h9v7l-2.5 2.5h-6.5v-9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M4.5 5.5h5M4.5 7.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
            { id: 'files',    label: 'Files',    icon: <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M3 1.5h5.5l3 3V12.5H3V1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8.5 1.5V4.5h3" stroke="currentColor" strokeWidth="1.3"/></svg> },
          ] as { id: MobileTab; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: mobileTab === tab.id ? '#7C3AED' : '#9CA3AF',
                borderTop: mobileTab === tab.id ? '2px solid #7C3AED' : '2px solid transparent',
                transition: 'color 0.12s ease, border-color 0.12s ease',
              }}
            >
              {tab.icon}
              <span style={{ fontSize: '0.5625rem', fontWeight: mobileTab === tab.id ? 700 : 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Modals */}
      {addTaskColumnId && (
        <AddTaskModal
          columnId={addTaskColumnId}
          columns={columns}
          members={members}
          currentMember={currentMember}
          initialTitle={noteTaskDraft ?? undefined}
          onClose={() => { setAddTaskColumnId(null); setNoteTaskDraft(null) }}
          onSubmit={async params => { await onCreateTask(params); setAddTaskColumnId(null); setNoteTaskDraft(null) }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          members={members}
          currentMember={currentMember}
          milestones={milestones}
          milestoneTasks={milestoneTasks}
          onClose={() => setSelectedTask(null)}
          onAssign={onAssignTask}
          onUpdate={onUpdateTask}
          onDelete={async id => { await onDeleteTask(id); setSelectedTask(null) }}
        />
      )}

      {/* Whiteboard modal */}
      {showWhiteboard && (
        <Whiteboard boardId={board.id} onClose={() => setShowWhiteboard(false)} cloudScriptUrl={cloudScriptUrl || undefined} driveFolderId={driveFolderId} />
      )}

      {/* Header photo lightbox */}
      {headerLightbox !== null && (() => {
        const photos = board.photos ?? []
        return (
          <div
            onClick={() => setHeaderLightbox(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img
              src={photos[headerLightbox]}
              alt={`Photo ${headerLightbox + 1}`}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '88vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }}
            />
            <button onClick={() => setHeaderLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, width: 38, height: 38, border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
            {photos.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); setHeaderLightbox(i => ((i ?? 0) - 1 + photos.length) % photos.length) }} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); setHeaderLightbox(i => ((i ?? 0) + 1) % photos.length) }} style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, border: 'none', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8.5 6l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* Project info modal */}
      {showProjectInfo && (
        <ProjectInfoModal
          board={board}
          boardId={board.id}
          onClose={() => setShowProjectInfo(false)}
          onSave={async updates => {
            await onUpdateBoardInfo(updates)
            setBoardNameDraft(updates.name)
          }}
        />
      )}

      {/* Invite manager modal */}
      {showInviteManager && (
        <InviteManager
          boardId={board.id}
          boardName={board.name}
          profile={getLocalProfile()}
          members={members}
          currentMember={currentMember}
          onUpdateMemberRole={onUpdateMemberRole}
          onClose={() => setShowInviteManager(false)}
        />
      )}

      {/* Delete column confirmation */}
      {deleteColConfirm && (() => {
        const incompleteTasks = tasks.filter(t => t.column_id === deleteColConfirm.columnId && !t.completed_at)
        const otherCols = columns.filter(c => c.id !== deleteColConfirm.columnId)
        return (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteColConfirm(null) }}>
            <div className="modal-card" style={{ padding: '2rem', maxWidth: 420 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a1a', marginBottom: '0.75rem' }}>
                Delete "{deleteColConfirm.columnName}"?
              </h2>
              {incompleteTasks.length > 0 ? (
                <>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>
                    This column has <strong>{incompleteTasks.length} incomplete task{incompleteTasks.length > 1 ? 's' : ''}</strong>. Move them to another column or delete with the column.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {otherCols.map(col => (
                      <button
                        key={col.id}
                        onClick={async () => { await onDeleteColumn(deleteColConfirm.columnId, col.id); setDeleteColConfirm(null) }}
                        style={{ textAlign: 'left', padding: '0.6rem 0.875rem', borderRadius: 10, border: '1.5px solid #E8E5F0', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#1a1a1a' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#7C3AED' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5F0' }}
                      >
                        Move to <strong>{col.name}</strong>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={async () => { await onDeleteColumn(deleteColConfirm.columnId); setDeleteColConfirm(null) }}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    Delete column and all tasks
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>This will permanently delete the column.</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-ghost" onClick={() => setDeleteColConfirm(null)} style={{ flex: 1, justifyContent: 'center', padding: '0.6rem' }}>Cancel</button>
                    <button onClick={async () => { await onDeleteColumn(deleteColConfirm.columnId); setDeleteColConfirm(null) }} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
