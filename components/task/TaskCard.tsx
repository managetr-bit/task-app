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
}

function getDueBadge(dueDate: string | null): { label: string; color: string; bg: string } | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return { label: 'Overdue', color: '#ef4444', bg: '#fef2f2' }
  if (diffDays === 0) return { label: 'Due today', color: '#d97706', bg: '#fffbeb' }
  if (diffDays === 1) return { label: 'Due tomorrow', color: '#d97706', bg: '#fffbeb' }
  if (diffDays <= 3) return { label: `${diffDays}d`, color: '#6b7280', bg: '#f9fafb' }
  return { label: `${diffDays}d`, color: '#9ca3af', bg: '#f9fafb' }
}

export function TaskCard({ task, members, currentMember, isDoneColumn, onAssign, onClick }: Props) {
  const assignee = task.assigned_to ? members.find(m => m.id === task.assigned_to) : null
  const dueBadge = getDueBadge(task.due_date)

  async function handleTakeIt(e: React.MouseEvent) {
    e.stopPropagation()
    await onAssign(task.id, currentMember.id)
  }

  return (
    <div
      className={`task-card animate-fadeUp ${isDoneColumn && task.completed_at ? 'animate-burst' : ''}`}
      onClick={() => onClick(task)}
      style={{
        background: isDoneColumn ? '#f9fafb' : '#FFFFFF',
        border: '1.5px solid #E8E5E0',
        borderRadius: '12px',
        padding: '0.875rem',
        cursor: 'pointer',
        opacity: isDoneColumn ? 0.72 : 1,
        position: 'relative',
      }}
    >
      {/* Title */}
      <p
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          color: isDoneColumn ? '#9ca3af' : '#1a1a1a',
          lineHeight: 1.45,
          textDecoration: isDoneColumn ? 'line-through' : 'none',
          marginBottom: '0.625rem',
          wordBreak: 'break-word',
        }}
      >
        {task.title}
      </p>

      {/* Description snippet */}
      {task.description && (
        <p
          style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            lineHeight: 1.4,
            marginBottom: '0.625rem',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {task.description}
        </p>
      )}

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.375rem' }}>
        {/* Assignee or Take it */}
        {assignee ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Avatar member={assignee} isCurrent={assignee.id === currentMember.id} small />
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              {assignee.id === currentMember.id ? 'you' : assignee.nickname}
            </span>
          </div>
        ) : !isDoneColumn ? (
          <button
            onClick={handleTakeIt}
            style={{
              fontSize: '0.7rem',
              color: '#c9a96e',
              background: '#fdf6ed',
              border: 'none',
              borderRadius: '6px',
              padding: '0.2rem 0.5rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Take it
          </button>
        ) : (
          <div />
        )}

        {/* Right side: due badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {dueBadge && !isDoneColumn && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 600,
                color: dueBadge.color,
                background: dueBadge.bg,
                borderRadius: '6px',
                padding: '0.15rem 0.45rem',
                whiteSpace: 'nowrap',
              }}
            >
              {dueBadge.label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
