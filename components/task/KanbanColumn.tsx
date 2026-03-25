'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type Column, type Task, type Member } from '@/lib/types'
import { SortableTaskCard } from './SortableTaskCard'

type Props = {
  column: Column
  tasks: Task[]
  members: Member[]
  currentMember: Member
  isDoneColumn: boolean
  onAddTask: () => void
  onAssignTask: (taskId: string, memberId: string | null) => Promise<void>
  onTaskClick: (task: Task) => void
  onDeleteColumn?: () => void
  onRenameColumn?: (newName: string) => Promise<void>
}

const COLUMN_HEADER_COLORS: Record<string, { dot: string; bg: string }> = {
  'To Do': { dot: '#9ca3af', bg: '#F3F4F6' },
  'Doing': { dot: '#f59e0b', bg: '#FFF7ED' },
  'Done':  { dot: '#4ade80', bg: '#F0FDF4' },
}

function getColumnStyle(name: string) {
  return COLUMN_HEADER_COLORS[name] ?? { dot: '#c9a96e', bg: '#fdf6ed' }
}

export function KanbanColumn({
  column, tasks, members, currentMember, isDoneColumn,
  onAddTask, onAssignTask, onTaskClick, onDeleteColumn, onRenameColumn,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(column.name)
  const [showMenu, setShowMenu] = useState(false)

  const colStyle = getColumnStyle(column.name)
  const PAGE_SIZE = 5
  const visibleTasks = expanded ? tasks : tasks.slice(0, PAGE_SIZE)
  const hiddenCount = tasks.length - PAGE_SIZE

  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  async function handleRename() {
    const name = nameDraft.trim()
    if (name && name !== column.name && onRenameColumn) {
      await onRenameColumn(name)
    } else {
      setNameDraft(column.name)
    }
    setEditingName(false)
  }

  return (
    <div style={{ flexShrink: 0, width: 280, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colStyle.dot, flexShrink: 0, display: 'inline-block' }} />
          {editingName ? (
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setNameDraft(column.name); setEditingName(false) }
              }}
              autoFocus
              maxLength={24}
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a', border: 'none', borderBottom: '1.5px solid #c9a96e', outline: 'none', background: 'transparent', width: 120, padding: '0 0 1px' }}
            />
          ) : (
            <span
              onDoubleClick={() => { if (onRenameColumn) { setNameDraft(column.name); setEditingName(true) } }}
              title={onRenameColumn ? 'Double-click to rename' : undefined}
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a', letterSpacing: '-0.01em', cursor: onRenameColumn ? 'text' : 'default' }}
            >
              {column.name}
            </span>
          )}
          <span style={{ fontSize: '0.7rem', color: '#9ca3af', background: '#F3F4F6', borderRadius: '10px', padding: '0.1rem 0.45rem', fontWeight: 600, flexShrink: 0 }}>
            {tasks.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={onAddTask}
            title="Add task"
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.2rem 0.3rem', borderRadius: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
          >
            +
          </button>

          {onDeleteColumn && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(p => !p)}
                style={{ background: 'transparent', border: 'none', color: '#c4bfb9', cursor: 'pointer', fontSize: '0.85rem', padding: '0.2rem 0.3rem', borderRadius: '6px', lineHeight: 1 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
              >
                ···
              </button>
              {showMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
                  <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 20, background: '#fff', border: '1.5px solid #E8E5E0', borderRadius: 10, padding: '0.25rem', minWidth: 130, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
                    {onRenameColumn && (
                      <button
                        onClick={() => { setShowMenu(false); setNameDraft(column.name); setEditingName(true) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#4b5563', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      onClick={() => { setShowMenu(false); onDeleteColumn() }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    >
                      Delete column
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        style={{
          background: isOver ? '#fdf6ed' : colStyle.bg,
          border: `1.5px dashed ${isOver ? '#c9a96e' : 'transparent'}`,
          borderRadius: '14px',
          padding: '0.625rem',
          minHeight: 80,
          display: 'flex',
          flexDirection: 'column',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {tasks.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, color: '#c4bfb9', fontSize: '0.75rem' }}>
            Drop tasks here
          </div>
        )}

        <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              members={members}
              currentMember={currentMember}
              isDoneColumn={isDoneColumn}
              onAssign={onAssignTask}
              onClick={onTaskClick}
            />
          ))}
        </SortableContext>

        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(p => !p)}
            style={{ background: 'transparent', border: 'none', borderRadius: '8px', padding: '0.4rem 0.5rem', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 500, textAlign: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
          >
            {expanded ? '↑ Show less' : `↓ ${hiddenCount} more task${hiddenCount > 1 ? 's' : ''}`}
          </button>
        )}

        {!isDoneColumn && (
          <button
            onClick={onAddTask}
            style={{ background: 'transparent', border: '1.5px dashed #E8E5E0', borderRadius: '10px', padding: '0.5rem', cursor: 'pointer', color: '#c4bfb9', fontSize: '0.75rem', textAlign: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#c9a96e'; (e.currentTarget as HTMLButtonElement).style.color = '#c9a96e' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E5E0'; (e.currentTarget as HTMLButtonElement).style.color = '#c4bfb9' }}
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}
