'use client'

import { useState, useMemo } from 'react'
import { type Board, type Column, type Member, type Task, type Priority } from '@/lib/types'
import { KanbanColumn } from './KanbanColumn'
import { AddTaskModal } from './AddTaskModal'
import { TaskDetailModal } from './TaskDetailModal'
import { ProgressArc } from './ProgressArc'
import { MembersBar } from './MembersBar'
import { FilePanel } from './FilePanel'

type Props = {
  board: Board
  columns: Column[]
  members: Member[]
  tasks: Task[]
  currentMember: Member
  isCreator: boolean
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
}

export function BoardView({
  board,
  columns,
  members,
  tasks,
  currentMember,
  isCreator,
  onCreateTask,
  onMoveTask,
  onReorderTask,
  onAssignTask,
  onUpdateTask,
  onDeleteTask,
  onAddColumn,
  onDeleteColumn,
  onUpdateFilePanelUrl,
}: Props) {
  const [addTaskColumnId, setAddTaskColumnId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [showFilePanel, setShowFilePanel] = useState(true)

  // ── Psychology: progress + momentum ──
  const doneColumn = useMemo(() => columns.find(c => c.name === 'Done'), [columns])
  const totalTasks = tasks.length
  const doneTasks = doneColumn ? tasks.filter(t => t.column_id === doneColumn.id).length : 0
  const progressPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)

  const today = new Date().toDateString()
  const momentumCount = tasks.filter(
    t => t.completed_at && new Date(t.completed_at).toDateString() === today
  ).length

  // ── Copy share link ──
  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    })
  }

  // ── Add custom column ──
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF9F7',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top bar ── */}
      <header
        style={{
          background: '#FFFFFF',
          borderBottom: '1.5px solid #E8E5E0',
          padding: '0 1.5rem',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        {/* Left: wordmark + board name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <a
            href="/"
            style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a1a', textDecoration: 'none', flexShrink: 0 }}
          >
            task<span style={{ color: '#c9a96e' }}>.</span>
          </a>
          <span style={{ color: '#E8E5E0', fontSize: '1rem', flexShrink: 0 }}>/</span>
          <h1
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: '#1a1a1a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {board.name}
          </h1>
        </div>

        {/* Center: members */}
        <MembersBar members={members} currentMember={currentMember} />

        {/* Right: progress + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          {momentumCount > 0 && (
            <span
              title={`${momentumCount} task${momentumCount > 1 ? 's' : ''} done today`}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#c9a96e',
                background: '#fdf6ed',
                borderRadius: '20px',
                padding: '0.2rem 0.6rem',
                whiteSpace: 'nowrap',
              }}
            >
              {momentumCount} done today 🔥
            </span>
          )}

          <ProgressArc pct={progressPct} size={36} />

          <button
            className="btn-ghost"
            onClick={copyLink}
            title="Copy board link to share"
            style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
          >
            {copiedLink ? '✓ Copied' : '🔗 Share'}
          </button>

          {/* Toggle file panel */}
          <button
            onClick={() => setShowFilePanel(p => !p)}
            title={showFilePanel ? 'Hide files' : 'Show files'}
            style={{
              padding: '0.375rem 0.5rem',
              background: showFilePanel ? '#fdf6ed' : 'transparent',
              border: `1.5px solid ${showFilePanel ? '#f0e4d0' : '#E8E5E0'}`,
              borderRadius: '8px',
              color: showFilePanel ? '#c9a96e' : '#9ca3af',
              cursor: 'pointer',
              fontSize: '0.85rem',
              lineHeight: 1,
              transition: 'all 0.15s ease',
            }}
          >
            📁
          </button>
        </div>
      </header>

      {/* ── Board body: kanban + file panel ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Kanban scrollable area */}
        <div
          style={{
            flex: 1,
            overflowX: 'auto',
            overflowY: 'visible',
            padding: '1.5rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          {/* Columns */}
          {columns.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={tasks
                .filter(t => t.column_id === col.id)
                .sort((a, b) => a.position - b.position)}
              members={members}
              currentMember={currentMember}
              allColumns={columns}
              isDoneColumn={col.name === 'Done'}
              onAddTask={() => setAddTaskColumnId(col.id)}
              onMoveTask={onMoveTask}
              onReorderTask={onReorderTask}
              onAssignTask={onAssignTask}
              onTaskClick={setSelectedTask}
              onDeleteColumn={columns.length > 1 ? () => onDeleteColumn(col.id) : undefined}
            />
          ))}

          {/* Add column control */}
          {columns.length < 6 && (
            <div style={{ flexShrink: 0, width: 240 }}>
              {showAddColumn ? (
                <form
                  onSubmit={handleAddColumn}
                  className="animate-slideDown"
                  style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #E8E5E0',
                    borderRadius: '14px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.625rem',
                  }}
                >
                  <input
                    className="input-base"
                    type="text"
                    placeholder="Column name"
                    value={newColumnName}
                    onChange={e => setNewColumnName(e.target.value)}
                    maxLength={24}
                    autoFocus
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={addingColumn || !newColumnName.trim()}
                      style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => { setShowAddColumn(false); setNewColumnName('') }}
                      style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className="btn-ghost"
                  onClick={() => setShowAddColumn(true)}
                  style={{
                    fontSize: '0.8rem',
                    color: '#c4bfb9',
                    padding: '0.375rem 0.5rem',
                  }}
                >
                  + Add column
                </button>
              )}
            </div>
          )}
        </div>

        {/* File panel */}
        {showFilePanel && (
          <div style={{ flexShrink: 0, alignSelf: 'stretch', display: 'flex' }}>
            <FilePanel
              filePanelUrl={board.file_panel_url}
              isCreator={isCreator}
              onUpdate={onUpdateFilePanelUrl}
            />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {addTaskColumnId && (
        <AddTaskModal
          columnId={addTaskColumnId}
          columns={columns}
          members={members}
          currentMember={currentMember}
          onClose={() => setAddTaskColumnId(null)}
          onSubmit={async params => {
            await onCreateTask(params)
            setAddTaskColumnId(null)
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          columns={columns}
          members={members}
          currentMember={currentMember}
          onClose={() => setSelectedTask(null)}
          onMove={onMoveTask}
          onAssign={onAssignTask}
          onUpdate={onUpdateTask}
          onDelete={async id => {
            await onDeleteTask(id)
            setSelectedTask(null)
          }}
        />
      )}
    </div>
  )
}
