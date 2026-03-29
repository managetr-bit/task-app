'use client'
import { type Task, type Member } from '@/lib/types'
import { Avatar } from './MembersBar'

type Props = {
  task: Task; members: Member[]; currentMember: Member
  isDoneColumn: boolean
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onClick: (task: Task) => void
  dragHandleProps?: Record<string, unknown>
}


function getDueBadge(dueDate: string | null): { label: string; cls: string } | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - today.getTime()) / 86400000)
  if (diff < 0)   return { label: 'Overdue',   cls: 'badge badge-red'   }
  if (diff === 0)  return { label: 'Due today', cls: 'badge badge-amber' }
  if (diff === 1)  return { label: 'Tomorrow',  cls: 'badge badge-amber' }
  if (diff <= 7)   return { label: `${diff}d`,  cls: 'badge badge-gray'  }
  return             { label: `${diff}d`,        cls: 'badge badge-gray'  }
}

export function TaskCard({ task, members, currentMember, isDoneColumn, onAssign, onClick }: Props) {
  const assignee = task.assigned_to ? members.find(m => m.id === task.assigned_to) : null
  const dueBadge = getDueBadge(task.due_date)
  const isHigh   = task.priority === 'high'

  async function handleTakeIt(e: React.MouseEvent) {
    e.stopPropagation()
    await onAssign(task.id, currentMember.id)
  }

  return (
    <div
      className={`task-card animate-fadeUp ${isDoneColumn && task.completed_at ? 'animate-burst' : ''}`}
      onClick={() => onClick(task)}
      style={{
        background: '#FFFFFF',
        border: `1.5px solid ${isDoneColumn ? '#DDD6FE' : '#E8E5F0'}`,
        borderLeft: isHigh && !isDoneColumn ? '3px solid #EF4444' : '3px solid transparent',
        borderRadius: '12px',
        padding: '0.75rem',
        cursor: 'pointer',
        opacity: isDoneColumn ? 0.7 : 1,
        position: 'relative',
      }}
    >
      {/* Due badge row */}
      {dueBadge && !isDoneColumn && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.375rem' }}>
          <span className={dueBadge.cls} style={{ fontSize: '0.6rem' }}>{dueBadge.label}</span>
        </div>
      )}

      {/* Title */}
      <p style={{
        fontSize: '0.8125rem', fontWeight: 600, color: isDoneColumn ? '#9CA3AF' : '#111827',
        lineHeight: 1.45, textDecoration: isDoneColumn ? 'line-through' : 'none',
        marginBottom: task.description && !isDoneColumn ? '0.375rem' : '0.5rem',
        wordBreak: 'break-word',
      }}>
        {task.title}
      </p>

      {/* Description */}
      {task.description && !isDoneColumn && (
        <p style={{
          fontSize: '0.6875rem', color: '#6B7280', lineHeight: 1.4, marginBottom: '0.5rem',
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {task.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', marginTop: 2 }}>
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
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: '#7C3AED', background: '#EDE9FE', border: '1px solid #DDD6FE',
              borderRadius: '5px', padding: '0.2rem 0.45rem', cursor: 'pointer',
              transition: 'background 0.12s ease',
            }}
          >Assign</button>
        ) : <div />}

        {/* High priority dot */}
        {isHigh && !isDoneColumn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
            <span style={{ fontSize: '0.6rem', color: '#EF4444', fontWeight: 700 }}>HIGH</span>
          </div>
        )}
      </div>
    </div>
  )
}
