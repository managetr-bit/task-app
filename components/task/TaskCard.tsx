'use client'

import { type Task, type Member } from '@/lib/types'
import { Avatar } from './MembersBar'

type Props = {
  task: Task
  members: Member[]
  currentMember: Member
  isDoneColumn: boolean
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onClick: (task: Task) => void
  dragHandleProps?: Record<string, unknown>
}

function getDueBadge(dueDate: string | null): { label: string; cls: string } | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date(); today.setHours(0,0,0,0)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86400000)

  if (diff < 0)  return { label: 'Overdue',      cls: 'badge badge-red'   }
  if (diff === 0) return { label: 'Due today',    cls: 'badge badge-amber' }
  if (diff === 1) return { label: 'Tomorrow',     cls: 'badge badge-amber' }
  if (diff <= 7)  return { label: `${diff}d`,     cls: 'badge badge-gray'  }
  return           { label: `${diff}d`,           cls: 'badge badge-gray'  }
}

export function TaskCard({ task, members, currentMember, isDoneColumn, onAssign, onClick }: Props) {
  const assignee  = task.assigned_to ? members.find(m => m.id === task.assigned_to) : null
  const dueBadge  = getDueBadge(task.due_date)
  const isHigh    = task.priority === 'high'

  async function handleTakeIt(e: React.MouseEvent) {
    e.stopPropagation()
    await onAssign(task.id, currentMember.id)
  }

  return (
    <div
      className={`task-card animate-fadeUp ${isDoneColumn && task.completed_at ? 'animate-burst' : ''}`}
      onClick={() => onClick(task)}
      style={{
        background: isDoneColumn ? '#FAFAFA' : '#FFFFFF',
        border: `1px solid ${isDoneColumn ? '#E9E6E1' : '#E2DFD9'}`,
        borderLeft: isHigh && !isDoneColumn
          ? '3px solid #DC2626'
          : isDoneColumn ? '3px solid #BBF7D0' : '3px solid transparent',
        borderRadius: '9px',
        padding: '0.75rem 0.875rem',
        cursor: 'pointer',
        opacity: isDoneColumn ? 0.68 : 1,
        position: 'relative',
      }}
    >
      {/* Title */}
      <p style={{
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: isDoneColumn ? '#9CA3AF' : '#111827',
        lineHeight: 1.45,
        textDecoration: isDoneColumn ? 'line-through' : 'none',
        marginBottom: task.description ? '0.375rem' : '0.5rem',
        wordBreak: 'break-word',
      }}>
        {task.title}
      </p>

      {/* Description snippet */}
      {task.description && !isDoneColumn && (
        <p style={{
          fontSize: '0.6875rem',
          color: '#9CA3AF',
          lineHeight: 1.4,
          marginBottom: '0.5rem',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {task.description}
        </p>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
        {/* Assignee / Take it */}
        {assignee ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Avatar member={assignee} isCurrent={assignee.id === currentMember.id} small />
            <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 500 }}>
              {assignee.id === currentMember.id ? 'You' : assignee.nickname}
            </span>
          </div>
        ) : !isDoneColumn ? (
          <button
            onClick={handleTakeIt}
            style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              color: '#C9A86C', background: '#FEF3E2',
              border: '1px solid #F0D9A0', borderRadius: '5px',
              padding: '0.2rem 0.45rem', cursor: 'pointer',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FDE8B8' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF3E2' }}
          >
            Assign
          </button>
        ) : <div />}

        {/* Due date badge */}
        {dueBadge && !isDoneColumn && (
          <span className={dueBadge.cls} style={{ fontSize: '0.6rem' }}>
            {dueBadge.label}
          </span>
        )}
      </div>

      {/* High priority indicator dot */}
      {isHigh && !isDoneColumn && (
        <div
          title="High priority"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 6, height: 6, borderRadius: '50%', background: '#DC2626',
          }}
        />
      )}
    </div>
  )
}
