'use client'

import { useState, useMemo, useEffect } from 'react'
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
import { type Board, type Column, type Member, type Task, type Milestone, type MilestoneTask, type Priority, type BudgetLine, type CostTransaction } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { TaskDetailModal } from './TaskDetailModal'
import { ProgressArc } from './ProgressArc'
import { MembersBar } from './MembersBar'
import { FilePanel } from './FilePanel'
import { MilestoneTimeline } from './MilestoneTimeline'
import { NotesPanel } from './NotesPanel'
import { Whiteboard } from './Whiteboard'
import { InviteManager } from './InviteManager'
import { CostPanel } from './CostPanel'
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
  onAddMilestone: (name: string, targetDate: string) => Promise<void>
  onDeleteMilestone: (milestoneId: string) => Promise<void>
  onUpdateMilestoneDate: (milestoneId: string, newDate: string) => Promise<void>
  onUpdateMilestoneName?: (milestoneId: string, name: string) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
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
  onUpdateFilePanelUrl, onUpdateBoardName,
  onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate, onUpdateMilestoneName, onLinkTask, onUnlinkTask,
  onAddTransaction, onUpdateTransaction, onDeleteTransaction,
  onAddBudgetLine, onUpdateBudgetLine, onDeleteBudgetLine, onImportBudgetLines, onChangeCurrency,
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
  const [noteTaskDraft, setNoteTaskDraft] = useState<string | null>(null)
  type SidebarTab = 'notes' | 'files' | 'cost'
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('notes')
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
  const sidebarW  = isTablet ? 220 : 280
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
    <div style={{ minHeight: '100vh', background: '#FAF9F7', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5E0', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', position: 'sticky', top: 0, zIndex: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <a href="/" title="All projects" style={{ fontSize: '1rem', color: '#c4bfb9', textDecoration: 'none', flexShrink: 0, lineHeight: 1 }}>←</a>
          {editingBoardName ? (
            <input
              value={boardNameDraft}
              onChange={e => setBoardNameDraft(e.target.value)}
              onBlur={async () => {
                const name = boardNameDraft.trim()
                if (name && name !== board.name) await onUpdateBoardName(name)
                else setBoardNameDraft(board.name)
                setEditingBoardName(false)
              }}
              onKeyDown={async e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setBoardNameDraft(board.name); setEditingBoardName(false) }
              }}
              autoFocus
              style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1a1a1a', border: 'none', borderBottom: '2px solid #c9a96e', outline: 'none', background: 'transparent', width: 180 }}
            />
          ) : (
            <h1
              onClick={() => setEditingBoardName(true)}
              title="Click to rename"
              style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {board.name}
            </h1>
          )}
        </div>

        <MembersBar members={members} currentMember={currentMember} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          {momentumCount > 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a96e', background: '#fdf6ed', borderRadius: '20px', padding: '0.2rem 0.6rem', whiteSpace: 'nowrap' }}>
              {momentumCount} done today 🔥
            </span>
          )}
          <ProgressArc pct={progressPct} size={36} />
          <button className="btn-ghost" onClick={() => setShowInviteManager(true)} style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }} title="Invite people">
            👥 Invite
          </button>
          <button className="btn-ghost" onClick={() => setShowWhiteboard(true)} style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }} title="Open whiteboard">
            🎨 Whiteboard
          </button>
        </div>
      </header>

      {/* ── Board body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, paddingBottom: isMobile ? 56 : 0 }}>

        {/* ── LEFT: Timeline + Kanban ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>

          {/* Timeline (hidden on mobile when not active tab) */}
          {(!isMobile || mobileTab === 'timeline') && (
            showTimeline ? (
              <MilestoneTimeline
                milestones={milestones}
                milestoneTasks={milestoneTasks}
                tasks={tasks}
                onAdd={onAddMilestone}
                onDelete={onDeleteMilestone}
                onUpdateDate={onUpdateMilestoneDate}
                onUpdateName={onUpdateMilestoneName}
                onLinkTask={onLinkTask}
                onUnlinkTask={onUnlinkTask}
                onCollapse={() => setShowTimeline(false)}
              />
            ) : (
              !isMobile && (
                <div style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5E0', padding: '0.35rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Timeline</span>
                  {milestones.length > 0 && <span style={{ fontSize: '0.6rem', color: '#c4bfb9', background: '#F3F4F6', borderRadius: 10, padding: '0.05rem 0.45rem', fontWeight: 600 }}>{milestones.length}</span>}
                  <button onClick={() => setShowTimeline(true)} title="Expand timeline" style={{ color: '#c9a96e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 1.5rem', background: '#FAF9F7', borderBottom: '1px solid #F0EDE8', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Board</span>
                  <button onClick={() => setShowKanban(p => !p)} title={showKanban ? 'Collapse board' : 'Expand board'} style={{ color: '#c9a96e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.2rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d={showKanban ? 'M2 4.5L6 8.5L10 4.5' : 'M4.5 2L8.5 6L4.5 10'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              )}

              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                <DndContext sensors={sensors} collisionDetection={columnAwareCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                  {showKanban && (
                    <div style={{ flex: 1, overflowX: 'auto', overflowY: 'visible', padding: isMobile ? '0.75rem' : '1rem 1.5rem 1.5rem', display: 'flex', gap: isMobile ? '0.75rem' : '1rem', alignItems: 'flex-start' }}>
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
                            <form onSubmit={handleAddColumn} className="animate-slideDown" style={{ background: '#FFFFFF', border: '1.5px solid #E8E5E0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
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
        {!isMobile && (
          <div style={{ width: sidebarW, flexShrink: 0, borderLeft: '1.5px solid #E8E5E0', display: 'flex', flexDirection: 'column', minHeight: 0, background: '#FAFAFA' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1.5px solid #E8E5E0', background: '#fff', flexShrink: 0 }}>
              {([
                { id: 'notes', icon: '📝', label: 'Notes' },
                { id: 'files', icon: '📁', label: 'Files' },
                { id: 'cost',  icon: '💰', label: 'Cost'  },
              ] as { id: SidebarTab; icon: string; label: string }[]).map(tab => (
                <button key={tab.id} onClick={() => setSidebarTab(tab.id)} style={{
                  flex: 1, padding: '0.45rem 0.25rem', border: 'none', background: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  color: sidebarTab === tab.id ? '#c9a96e' : '#9ca3af',
                  borderBottom: sidebarTab === tab.id ? '2px solid #c9a96e' : '2px solid transparent',
                }}>
                  <span style={{ fontSize: '0.875rem', lineHeight: 1 }}>{tab.icon}</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: sidebarTab === tab.id ? 700 : 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                  <FilePanel filePanelUrl={board.file_panel_url} isCreator={isCreator} onUpdate={onUpdateFilePanelUrl} cloudScriptUrl={cloudScriptUrl} onCloudScriptUrlChange={saveCloudScriptUrl} />
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
              <FilePanel filePanelUrl={board.file_panel_url} isCreator={isCreator} onUpdate={onUpdateFilePanelUrl} cloudScriptUrl={cloudScriptUrl} onCloudScriptUrlChange={saveCloudScriptUrl} />
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
        <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 56, background: '#fff', borderTop: '1.5px solid #E8E5E0', display: 'flex', zIndex: 30 }}>
          {([
            { id: 'board',    icon: '📋', label: 'Board' },
            { id: 'timeline', icon: '📅', label: 'Timeline' },
            { id: 'cost',     icon: '💰', label: 'Cost' },
            { id: 'notes',    icon: '📝', label: 'Notes' },
            { id: 'files',    icon: '📁', label: 'Files' },
          ] as { id: MobileTab; icon: string; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, border: 'none', background: 'none', cursor: 'pointer',
                color: mobileTab === tab.id ? '#c9a96e' : '#9ca3af',
                borderTop: mobileTab === tab.id ? '2px solid #c9a96e' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: mobileTab === tab.id ? 700 : 500, letterSpacing: '0.04em' }}>{tab.label}</span>
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

      {/* Invite manager modal */}
      {showInviteManager && (
        <InviteManager
          boardId={board.id}
          profile={getLocalProfile()}
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
                        style={{ textAlign: 'left', padding: '0.6rem 0.875rem', borderRadius: 10, border: '1.5px solid #E8E5E0', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#1a1a1a' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0' }}
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
