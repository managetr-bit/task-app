'use client'

import { useState } from 'react'
import { type Column, type Task, type Member } from '@/lib/types'
import { TaskCard } from './TaskCard'

type Props = {
  column: Column
  tasks: Task[]
  members: Member[]
  currentMember: Member
  allColumns: Column[]
  isDoneColumn: boolean
  onAddTask: () => void
  onMoveTask: (taskId: string, colId: string) => Promise<void>
  onAssignTask: (taskId: string, memberId: string | null) => Promise<void>
  onTaskClick: (task: Task) => void
  onDeleteColumn?: () => void
}

const COLUMN_HEADER_COLORS: Record<string, { dot: string; bg: string }> = {
  'To Do':  { dot: '#9ca3af', bg: '#F3F4F6' },
  'Doing':  { dot: '#f59e0b', bg: '#FFF7ED' },
  'Done':   { dot: '#4ade80', bg: '#F0FDF4' },
}

function getColumnStyle(name: string) {
  return COLUMN_HEADER_COLORS[name] ?? { dot: '#c9a96e', bg: '#fdf6ed' }
}

export function KanbanColumn({
  column,
  tasks,
  members,
  currentMember,
  allColumns,
  isDoneColumn,
  onAddTask,
  onMoveTask,
  onAssignTask,
  onTaskClick,
  onDeleteColumn,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const colStyle = getColumnStyle(column.name)

  // ── Drag and drop ──
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave() {
    setDragOver(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) onMoveTask(taskId, column.id)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flexShrink: 0,
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        transition: 'background 0.15s ease',
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: colStyle.dot,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#1a1a1a',
              letterSpacing: '-0.01em',
            }}
          >
            {column.name}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              color: '#9ca3af',
              background: '#F3F4F6',
              borderRadius: '10px',
              padding: '0.1rem 0.45rem',
              fontWeight: 600,
            }}
          >
            {tasks.length}
          </span>
        </div>

        {/* Column actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {/* Add task to this column */}
          <button
            onClick={onAddTask}
            title="Add task"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '1.1rem',
              lineHeight: 1,
              padding: '0.2rem 0.3rem',
              borderRadius: '6px',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
          >
            +
          </button>

          {/* Delete column (non-default only) */}
          {onDeleteColumn && !['To Do', 'Doing', 'Done'].includes(column.name) && (
            <>
              {showDeleteConfirm ? (
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  <button
                    onClick={() => { onDeleteColumn(); setShowDeleteConfirm(false) }}
                    title="Confirm delete"
                    style={{ fontSize: '0.65rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.25rem' }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    title="Cancel"
                    style={{ fontSize: '0.65rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem 0.25rem' }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Delete column"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#c4bfb9',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.3rem',
                    borderRadius: '6px',
                    transition: 'color 0.15s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
                >
                  ···
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drop zone / cards container */}
      <div
        style={{
          background: dragOver ? '#fdf6ed' : colStyle.bg,
          border: `1.5px dashed ${dragOver ? '#c9a96e' : 'transparent'}`,
          borderRadius: '14px',
          padding: '0.625rem',
          minHeight: 80,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {tasks.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 60,
              color: '#c4bfb9',
              fontSize: '0.75rem',
            }}
          >
            {dragOver ? 'Drop here' : 'Drop tasks here'}
          </div>
        )}

        {tasks.map(task => (
          <div
            key={task.id}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData('taskId', task.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            style={{ cursor: 'grab' }}
          >
            <TaskCard
              task={task}
              members={members}
              currentMember={currentMember}
              allColumns={allColumns}
              isDoneColumn={isDoneColumn}
              onMove={onMoveTask}
              onAssign={onAssignTask}
              onClick={onTaskClick}
            />
          </div>
        ))}

        {/* Add task inline prompt */}
        {!isDoneColumn && (
          <button
            onClick={onAddTask}
            style={{
              background: 'transparent',
              border: '1.5px dashed #E8E5E0',
              borderRadius: '10px',
              padding: '0.5rem',
              cursor: 'pointer',
              color: '#c4bfb9',
              fontSize: '0.75rem',
              transition: 'border-color 0.15s ease, color 0.15s ease',
              textAlign: 'center',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#c9a96e'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9'
            }}
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}
