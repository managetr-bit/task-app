export type Board = {
  id: string
  name: string
  created_at: string
}

export type Column = {
  id: string
  board_id: string
  name: string
  position: number
  created_at: string
}

export type Member = {
  id: string
  board_id: string
  nickname: string
  color: string
  joined_at: string
}

export type Priority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  board_id: string
  column_id: string
  title: string
  description: string | null
  assigned_to: string | null
  created_by: string | null
  priority: Priority
  due_date: string | null
  position: number
  created_at: string
  completed_at: string | null
}

export type LocalSession = {
  boardId: string
  memberId: string
  nickname: string
  color: string
}

export const MEMBER_COLORS = [
  '#E8936A', // warm orange
  '#6AA3E8', // calm blue
  '#6ACA9A', // soft green
  '#E8C86A', // warm yellow
  '#B86AE8', // muted purple
  '#E86A8E', // rose
  '#6AE8D8', // teal
  '#A0CB6A', // lime
]

export const DEFAULT_COLUMNS = [
  { name: 'To Do', position: 0 },
  { name: 'Doing', position: 1 },
  { name: 'Done', position: 2 },
]

export const PRIORITY_CONFIG: Record<Priority, { color: string; label: string }> = {
  low: { color: '#6b7280', label: 'Low' },
  medium: { color: '#f59e0b', label: 'Medium' },
  high: { color: '#ef4444', label: 'High' },
}
