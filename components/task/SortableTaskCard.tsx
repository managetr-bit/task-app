'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type Task, type Member } from '@/lib/types'
import { TaskCard } from './TaskCard'

type Props = {
  task: Task
  members: Member[]
  currentMember: Member
  isDoneColumn: boolean
  onAssign: (taskId: string, memberId: string | null) => Promise<void>
  onClick: (task: Task) => void
}

export function SortableTaskCard(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        marginBottom: '0.5rem',
        touchAction: 'none',
      }}
    >
      <TaskCard {...props} />
    </div>
  )
}
