'use client'

import { useState } from 'react'
import { type Task, type Member } from '@/lib/types'
import { Avatar } from './MembersBar'

type Props = {
  task: Task
  members: Member[]
  currentMember: Member
  isDoneColumn: boolean
  isFirst: boolean
  isLast: boolean
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onMoveUp: () => void
  onMoveDown: () => void
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

export function TaskCard({ task, members, currentMember, isDoneColumn, isFirst, isLast, onAssign, onMoveUp, onMoveDown, onClick }: Props) {
  const [hovered, setHovered] = useState(false)
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      {/* ↑ ↓ reorder buttons — visible on hover */}
      {hovered && !isDoneColumn && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isFirst ? 'transparent' : '#f3f4f6',
              border: 'none',
              borderRadius: '5px',
              cursor: isFirst ? 'default' : 'pointer',
              fontSize: '0.65rem',
              color: isFirst ? '#e5e7eb' : '#6b7280',
              lineHeight: 1,
              transition: 'background 0.1s ease, color 0.1s ease',
            }}
            onMouseEnter={e => { if (!isFirst) { (e.currentTarget as HTMLButtonElement).style.background = '#c9a96e'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isFirst ? 'transparent' : '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = isFirst ? '#e5e7eb' : '#6b7280' }}
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isLast ? 'transparent' : '#f3f4f6',
              border: 'none',
              borderRadius: '5px',
              cursor: isLast ? 'default' : 'pointer',
              fontSize: '0.65rem',
              color: isLast ? '#e5e7eb' : '#6b7280',
              lineHeight: 1,
              transition: 'background 0.1s ease, color 0.1s ease',
            }}
            onMouseEnter={e => { if (!isLast) { (e.currentTarget as HTMLButtonElement).style.background = '#c9a96e'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isLast ? 'transparent' : '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = isLast ? '#e5e7eb' : '#6b7280' }}
          >
            ↓
          </button>
        </div>
      )}

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
          paddingRight: hovered && !isDoneColumn ? '1.75rem' : 0,
          transition: 'padding-right 0.1s ease',
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
            style={{ fontSize: '0.7rem', color: '#c9a96e', background: '#fdf6ed', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontWeight: 500 }}
          >
            Take it
          </button>
        ) : (
          <div />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {dueBadge && !isDoneColumn && (
            <span
              style={{ fontSize: '0.65rem', fontWeight: 600, color: dueBadge.color, background: dueBadge.bg, borderRadius: '6px', padding: '0.15rem 0.45rem', whiteSpace: 'nowrap' }}
            >
              {dueBadge.label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
