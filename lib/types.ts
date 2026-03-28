export type Board = {
  id: string
  name: string
  file_panel_url: string | null
  created_at: string
  currency: 'TRY' | 'USD'
}

export type Column = {
  id: string
  board_id: string
  name: string
  position: number
  created_at: string
}

export type MemberRole = 'visitor' | 'member' | 'admin' | 'creator'

export type Member = {
  id: string
  board_id: string
  nickname: string
  color: string
  joined_at: string
  profile_id: string | null
  role: MemberRole
}

export type Profile = {
  id: string          // client-generated UUID, stored in localStorage
  display_name: string
  email?: string
}

export type InviteToken = {
  id: string
  board_id: string
  created_by: string | null
  label: string
  max_uses: number | null
  uses: number
  expires_at: string | null
  created_at: string
}

export type Priority = 'normal' | 'high'

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

export type Milestone = {
  id: string
  board_id: string
  name: string
  target_date: string
  completed_at: string | null   // null = not yet complete
  created_at: string
}

export type MilestoneTask = {
  milestone_id: string
  task_id: string
}

export type BoardNote = {
  id: string
  board_id: string
  content: string
  author_name: string | null
  created_at: string
}

export type BoardImage = {
  id: string
  board_id: string
  storage_path: string
  file_name: string
  added_at: string
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
  normal: { color: '#9ca3af', label: 'Normal' },
  high:   { color: '#ef4444', label: 'High' },
}

// ── Cost Module ──────────────────────────────────────────────────────────────

export type CostCategory =
  | 'labor'
  | 'materials'
  | 'equipment'
  | 'subcontractor'
  | 'professional_fees'
  | 'revenue'
  | 'contingency'
  | 'other'

export const COST_CATEGORIES: Record<CostCategory, { label: string; emoji: string; defaultType: 'expense' | 'income' }> = {
  labor:             { label: 'Labor',             emoji: '👷', defaultType: 'expense' },
  materials:         { label: 'Materials',         emoji: '🧱', defaultType: 'expense' },
  equipment:         { label: 'Equipment',         emoji: '🔧', defaultType: 'expense' },
  subcontractor:     { label: 'Subcontractor',     emoji: '🏗️', defaultType: 'expense' },
  professional_fees: { label: 'Professional Fees', emoji: '📋', defaultType: 'expense' },
  revenue:           { label: 'Revenue / Income',  emoji: '💵', defaultType: 'income'  },
  contingency:       { label: 'Contingency',       emoji: '🛡️', defaultType: 'expense' },
  other:             { label: 'Other',             emoji: '📌', defaultType: 'expense' },
}

export type BudgetLine = {
  id: string
  board_id: string
  name: string
  category: CostCategory
  type: 'expense' | 'income'
  budgeted_amount: number
  milestone_id: string | null
  expected_date: string | null   // YYYY-MM-DD: when this cost/income is expected to occur
  notes: string | null
  position: number
  created_at: string
}

export type CostTransaction = {
  id: string
  board_id: string
  budget_line_id: string | null
  type: 'cash_in' | 'cash_out'
  amount: number
  date: string          // YYYY-MM-DD
  description: string
  milestone_id: string | null
  task_id: string | null
  is_forecast: boolean
  created_at: string
}
