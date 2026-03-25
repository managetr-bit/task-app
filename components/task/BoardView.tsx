'use client'

import { useState, useMemo } from 'react'
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
} from '@dnd-kit/core'
import { type Board, type Column, type Member, type Task, type Milestone, type MilestoneTask, type Priority } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'
import { AddTaskModal } from './AddTaskModal'
import { TaskDetailModal } from './TaskDetailModal'
import { ProgressArc } from './ProgressArc'
import { MembersBar } from './MembersBar'
import { FilePanel } from './FilePanel'
import { MilestoneTimeline } from './MilestoneTimeline'

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
  onDeleteColumn: (columnId: string) => Promise<void>
  onUpdateFilePanelUrl: (url: string | null) => Promise<void>
  onUpdateBoardName: (name: string) => Promise<void>
  onAddMilestone: (name: string, targetDate: string) => Promise<void>
  onDeleteMilestone: (milestoneId: string) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
}

export function BoardView({
  board, columns, members, tasks, currentMember, isCreator,
  milestones, milestoneTasks,
  onCreateTask, onMoveTask, onReorderTask, onAssignTask,
  onUpdateTask, onDeleteTask, onAddColumn, onDeleteColumn,
  onUpdateFilePanelUrl, onUpdateBoardName,
  onAddMilestone, onDeleteMilestone, onLinkTask, onUnlinkTask,
}: Props) {
  const [addTaskColumnId, setAddTaskColumnId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showFilePanel, setShowFilePanel] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [boardNameDraft, setBoardNameDraft] = useState(board.name)

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
    const task = tasks.find(t => t.id === active.id)
    if (task) setActiveTask(task)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over || active.id === over.id) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    // Dropped onto a column (empty column drop target)
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
      // Same column — reorder
      const colTasks = tasks
        .filter(t => t.column_id === activeTask.column_id)
        .sort((a, b) => a.position - b.position)
      const newIndex = colTasks.findIndex(t => t.id === overTask.id)
      onReorderTask(activeTask.id, newIndex, activeTask.column_id)
    } else {
      // Cross-column move
      onMoveTask(activeTask.id, overTask.column_id)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F7', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#FFFFFF', borderBottom: '1.5px solid #E8E5E0', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', position: 'sticky', top: 0, zIndex: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <a href="/" style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', textDecoration: 'none', flexShrink: 0 }}>
            task<span style={{ color: '#c9a96e' }}>.</span>
          </a>
          <span style={{ color: '#E8E5E0', fontSize: '1rem', flexShrink: 0 }}>/</span>
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
          <button className="btn-ghost" onClick={copyLink} style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}>
            {copiedLink ? '✓ Copied' : '🔗 Share'}
          </button>
          <button
            onClick={() => setShowFilePanel(p => !p)}
            style={{ padding: '0.375rem 0.5rem', background: showFilePanel ? '#fdf6ed' : 'transparent', border: `1.5px solid ${showFilePanel ? '#f0e4d0' : '#E8E5E0'}`, borderRadius: '8px', color: showFilePanel ? '#c9a96e' : '#9ca3af', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, transition: 'all 0.15s ease' }}
          >
            📁
          </button>
        </div>
      </header>

      {/* Board body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Timeline — full width above all columns */}
        <MilestoneTimeline
          milestones={milestones}
          milestoneTasks={milestoneTasks}
          tasks={tasks}
          onAdd={onAddMilestone}
          onDelete={onDeleteMilestone}
          onLinkTask={onLinkTask}
          onUnlinkTask={onUnlinkTask}
        />

        {/* Kanban + file panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'visible', padding: '1rem 1.5rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
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
                  onDeleteColumn={columns.length > 1 ? () => onDeleteColumn(col.id) : undefined}
                />
              )
            })}

            {/* Add column */}
            {columns.length < 6 && (
              <div style={{ flexShrink: 0, width: 240 }}>
                {showAddColumn ? (
                  <form onSubmit={handleAddColumn} className="animate-slideDown" style={{ background: '#FFFFFF', border: '1.5px solid #E8E5E0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    <input className="input-base" type="text" placeholder="Column name" value={newColumnName} onChange={e => setNewColumnName(e.target.value)} maxLength={24} autoFocus required />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="submit" className="btn-primary" disabled={addingColumn || !newColumnName.trim()} style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>Add</button>
                      <button type="button" className="btn-ghost" onClick={() => { setShowAddColumn(false); setNewColumnName('') }} style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button className="btn-ghost" onClick={() => setShowAddColumn(true)} style={{ fontSize: '0.8rem', color: '#c4bfb9', padding: '0.375rem 0.5rem' }}>
                    + Add column
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Drag overlay — floating card while dragging */}
          <DragOverlay>
            {activeTask && (
              <div style={{ transform: 'rotate(2deg)', opacity: 0.95, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.15))' }}>
                <TaskCard
                  task={activeTask}
                  members={members}
                  currentMember={currentMember}
                  isDoneColumn={false}
                  onAssign={async () => {}}
                  onClick={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {showFilePanel && (
          <div style={{ flexShrink: 0, alignSelf: 'stretch', display: 'flex' }}>
            <FilePanel filePanelUrl={board.file_panel_url} isCreator={isCreator} onUpdate={onUpdateFilePanelUrl} />
          </div>
        )}
        </div>
      </div>

      {/* Modals */}
      {addTaskColumnId && (
        <AddTaskModal
          columnId={addTaskColumnId}
          columns={columns}
          members={members}
          currentMember={currentMember}
          onClose={() => setAddTaskColumnId(null)}
          onSubmit={async params => { await onCreateTask(params); setAddTaskColumnId(null) }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          members={members}
          currentMember={currentMember}
          onClose={() => setSelectedTask(null)}
          onAssign={onAssignTask}
          onUpdate={onUpdateTask}
          onDelete={async id => { await onDeleteTask(id); setSelectedTask(null) }}
        />
      )}
    </div>
  )
}
