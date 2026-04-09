'use client'

import {
  type Board, type Column, type Member, type MemberRole,
  type Task, type Milestone, type MilestoneTask,
  type BudgetLine, type CostTransaction, type Priority,
} from '@/lib/types'
import { GanttV4 } from './v4/GanttV4'

type Props = {
  board: Board
  columns: Column[]
  members: Member[]
  tasks: Task[]
  currentMember: Member
  isCreator: boolean
  milestones: Milestone[]
  milestoneTasks: MilestoneTask[]
  budgetLines: BudgetLine[]
  costTransactions: CostTransaction[]
  onCreateTask: (p: { columnId: string; title: string; priority: Priority; dueDate: string | null; description: string }) => Promise<void>
  onMoveTask: (taskId: string, newColumnId: string) => Promise<void>
  onReorderTask: (taskId: string, newIndex: number, colId: string) => Promise<void>
  onAssignTask: (taskId: string, memberId: string | null) => Promise<void>
  onUpdateTask: (taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date'>>) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onAddColumn: (name: string) => Promise<void>
  onDeleteColumn: (columnId: string, targetColumnId?: string) => Promise<void>
  onRenameColumn: (columnId: string, name: string) => Promise<void>
  onReorderColumn: (columnId: string, newIndex: number) => Promise<void>
  onUpdateFilePanelUrl: (url: string | null) => Promise<void>
  onUpdateBoardName: (name: string) => Promise<void>
  onUpdateBoardInfo: (updates: { name: string; description: string; location_address: string; location_lat: number | null; location_lng: number | null; photos: string[] }) => Promise<void>
  onAddMilestone: (name: string, targetDate: string) => Promise<void>
  onDeleteMilestone: (milestoneId: string) => Promise<void>
  onUpdateMilestoneDate: (milestoneId: string, newDate: string) => Promise<void>
  onUpdateMilestoneName?: (milestoneId: string, name: string) => Promise<void>
  onCompleteMilestone: (milestoneId: string, complete: boolean) => Promise<void>
  onLinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUnlinkTask: (milestoneId: string, taskId: string) => Promise<void>
  onUpdateMilestoneDependency?: (milestoneId: string, dependsOnId: string | null, offsetDays: number) => Promise<void>
  onAddTransaction: (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateTransaction: (id: string, updates: Partial<CostTransaction>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
  onAddBudgetLine: (data: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateBudgetLine: (id: string, updates: Partial<BudgetLine>) => Promise<void>
  onDeleteBudgetLine: (id: string) => Promise<void>
  onImportBudgetLines: (lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[]) => Promise<void>
  onChangeCurrency: (c: 'TRY' | 'USD') => Promise<void>
  onUpdateMemberRole: (memberId: string, role: MemberRole) => Promise<void>
}

export function BoardViewV4({
  board, milestones, costTransactions,
  onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate,
  onUpdateMilestoneName, onCompleteMilestone,
}: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#faf8ff', fontFamily: 'Inter, sans-serif' }}>
      <GanttV4
        board={board}
        milestones={milestones}
        costTransactions={costTransactions}
        currency={board.currency}
        onAddMilestone={onAddMilestone}
        onUpdateMilestoneDate={onUpdateMilestoneDate}
        onUpdateMilestoneName={onUpdateMilestoneName}
        onDeleteMilestone={onDeleteMilestone}
        onCompleteMilestone={onCompleteMilestone}
      />
    </div>
  )
}
