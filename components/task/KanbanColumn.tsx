'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

// Status configs
const COL_CONFIG: Record<string, { accent: string; bg: string; countBg: string; countColor: string }> = {
  'To Do':  { accent: '#6B7280', bg: '#F2F1EE',   countBg: '#E5E7EB',  countColor: '#374151' },
  'Doing':  { accent: '#D97706', bg: '#FFFBEB',   countBg: '#FDE68A',  countColor: '#92400E' },
  'Done':   { accent: '#16A34A', bg: '#F0FDF4',   countBg: '#BBF7D0',  countColor: '#15803D' },
}
function getCfg(name: string) {
  return COL_CONFIG[name] ?? { accent: '#C9A86C', bg: '#FEF3E2', countBg: '#F0D9A0', countColor: '#92400E' }
}

export function KanbanColumn({
  column, tasks, members, currentMember, isDoneColumn,
  onAddTask, onAssignTask, onTaskClick, onDeleteColumn, onRenameColumn,
}: Props) {
  const [expanded, setExpanded]     = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft]   = useState(column.name)
  const [showMenu, setShowMenu]     = useState(false)

  const cfg       = getCfg(column.name)
  const PAGE_SIZE = 5
  const visibleTasks = expanded ? tasks : tasks.slice(0, PAGE_SIZE)
  const hiddenCount  = tasks.length - PAGE_SIZE

  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: `col-${column.id}` })

  async function handleRename() {
    const name = nameDraft.trim()
    if (name && name !== column.name && onRenameColumn) await onRenameColumn(name)
    else setNameDraft(column.name)
    setEditingName(false)
  }

  return (
    <div
      ref={setSortableRef}
      {...attributes}
      style={{
        flexShrink: 0, width: 272,
        display: 'flex', flexDirection: 'column', gap: '0.5rem',
        transform: CSS.Transform.toString(transform),
        transition, opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* Column header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.4rem 0.375rem',
        borderBottom: `2px solid ${cfg.accent}`,
        marginBottom: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1, minWidth: 0 }}>
          {/* Drag handle */}
          <span
            {...listeners}
            title="Drag to reorder"
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              color: '#C4BFBA', fontSize: '0.625rem', flexShrink: 0, lineHeight: 1, touchAction: 'none',
              padding: '0.1rem 0.1rem',
            }}
          >⠿</span>

          {/* Status dot */}
          <span className="status-dot" style={{ background: cfg.accent }} />

          {/* Column name */}
          {editingName ? (
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setNameDraft(column.name); setEditingName(false) }
              }}
              autoFocus maxLength={24}
              style={{
                fontSize: '0.8125rem', fontWeight: 700, color: '#111827',
                border: 'none', borderBottom: `1.5px solid ${cfg.accent}`,
                outline: 'none', background: 'transparent', width: 120, padding: '0 0 1px',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              onDoubleClick={() => { if (onRenameColumn) { setNameDraft(column.name); setEditingName(true) } }}
              title={onRenameColumn ? 'Double-click to rename' : undefined}
              style={{
                fontSize: '0.8125rem', fontWeight: 700, color: '#111827',
                letterSpacing: '-0.01em',
                cursor: onRenameColumn ? 'text' : 'default',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {column.name}
            </span>
          )}

          {/* Count badge */}
          <span style={{
            fontSize: '0.65rem', fontWeight: 700,
            color: cfg.countColor, background: cfg.countBg,
            borderRadius: '5px', padding: '0.1rem 0.4rem', flexShrink: 0,
          }}>
            {tasks.length}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.1rem', flexShrink: 0 }}>
          <button
            onClick={onAddTask}
            title="Add task"
            className="btn-icon"
            style={{ width: 26, height: 26, fontSize: '1rem' }}
          >+</button>

          {onDeleteColumn && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(p => !p)}
                className="btn-icon"
                style={{ width: 26, height: 26, fontSize: '0.8rem', letterSpacing: '0.05em' }}
              >···</button>
              {showMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 20,
                    background: '#fff', border: '1px solid #E2DFD9', borderRadius: 9,
                    padding: '0.25rem', minWidth: 140,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  }}>
                    {onRenameColumn && (
                      <button
                        onClick={() => { setShowMenu(false); setNameDraft(column.name); setEditingName(true) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.375rem',
                          width: '100%', textAlign: 'left', padding: '0.4rem 0.625rem',
                          fontSize: '0.8125rem', color: '#374151', background: 'none', border: 'none',
                          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F2F1EE' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 1.5l2.5 2.5-7 7H1v-2.5l7-7z" stroke="#374151" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                        Rename
                      </button>
                    )}
                    <button
                      onClick={() => { setShowMenu(false); onDeleteColumn() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        width: '100%', textAlign: 'left', padding: '0.4rem 0.625rem',
                        fontSize: '0.8125rem', color: '#DC2626', background: 'none', border: 'none',
                        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2.5h3V3.5M5 5.5v3M7 5.5v3M3 3.5l.5 6h5l.5-6" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
          background: isOver ? '#FEF3E2' : cfg.bg,
          border: `1.5px dashed ${isOver ? '#C9A86C' : 'transparent'}`,
          borderRadius: '10px',
          padding: '0.5rem',
          minHeight: 72,
          display: 'flex', flexDirection: 'column', gap: '0.375rem',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        {tasks.length === 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 56, color: '#C4BFBA', fontSize: '0.75rem',
            border: '1px dashed #E2DFD9', borderRadius: 8,
          }}>
            No tasks
          </div>
        )}

        <SortableContext items={visibleTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map(task => (
            <SortableTaskCard
              key={task.id} task={task} members={members}
              currentMember={currentMember} isDoneColumn={isDoneColumn}
              onAssign={onAssignTask} onClick={onTaskClick}
            />
          ))}
        </SortableContext>

        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(p => !p)}
            style={{
              background: 'transparent', border: 'none', borderRadius: '7px',
              padding: '0.375rem 0.5rem', cursor: 'pointer',
              color: '#9CA3AF', fontSize: '0.6875rem', fontWeight: 600,
              textAlign: 'center', fontFamily: 'inherit',
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#C9A86C' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
          >
            {expanded ? '↑ Show less' : `+ ${hiddenCount} more`}
          </button>
        )}

        {!isDoneColumn && (
          <button
            onClick={onAddTask}
            style={{
              background: 'transparent',
              border: '1px dashed #D5D1CB',
              borderRadius: '8px', padding: '0.4375rem 0.5rem',
              cursor: 'pointer', color: '#9CA3AF',
              fontSize: '0.75rem', textAlign: 'center',
              fontFamily: 'inherit', fontWeight: 500,
              transition: 'border-color 0.12s ease, color 0.12s ease, background 0.12s ease',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#C9A86C'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#C9A86C'
              ;(e.currentTarget as HTMLButtonElement).style.background = '#FEF9F0'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#D5D1CB'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            + Add task
          </button>
        )}
      </div>
    </div>
  )
}
