'use client'

import {
  type Board, type Column, type Member, type MemberRole,
  type Task, type Milestone, type MilestoneTask,
  type BudgetLine, type CostTransaction, type Priority,
} from '@/lib/types'
import { GanttV4 } from './v4/GanttV4'

// ─── Full props (same interface as other board views so BoardPageClient can render it) ───
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

// ─── Design tokens (mirroring GanttV4) ───────────────────────────────────────
const PRIMARY    = '#320075'
const ON_SURFACE = '#131b2e'
const OUTLINE    = '#7b7484'
const SURF_LOW   = '#f2f3ff'
const SURF_CONT  = '#eaedff'
const OUTLINE_V  = '#ccc3d4'

export function BoardViewV4({
  board, milestones, costTransactions,
  onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate,
  onUpdateMilestoneName, onCompleteMilestone,
}: Props) {
  const photos = (board.photos ?? []).filter(Boolean)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#faf8ff',
      fontFamily: 'Inter, sans-serif',
    }}>

      {/* ── Top bar ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem',
        height: 52,
        background: 'rgba(255,255,255,0.75)',
        backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${OUTLINE_V}33`,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 30, height: 30,
            background: `linear-gradient(135deg, ${PRIMARY}, #4a1d96)`,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', color: '#fff', fontWeight: 800,
          }}>
            ◈
          </div>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: PRIMARY, letterSpacing: '-0.02em' }}>
            {board.name}
          </span>
          {board.location_address && (
            <span style={{ fontSize: '0.68rem', color: OUTLINE, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <span>📍</span>
              {board.location_address}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Project health badge */}
          <div style={{
            padding: '0.3rem 0.85rem',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 99,
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              On Track
            </span>
          </div>

          {/* Currency badge */}
          <div style={{
            padding: '0.3rem 0.85rem',
            background: SURF_CONT,
            borderRadius: 99,
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: PRIMARY }}>
              {board.currency === 'TRY' ? '₺ TRY' : '$ USD'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Cover photo strip (if any) ── */}
      {photos.length > 0 && (
        <div style={{
          height: 160, position: 'relative', overflow: 'hidden',
          background: ON_SURFACE,
        }}>
          <img
            src={photos[0]}
            alt="Project"
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(135deg, ${PRIMARY}cc 0%, transparent 60%)`,
          }} />
          <div style={{
            position: 'absolute', bottom: '1.25rem', left: '2rem',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 99, padding: '0.3rem 0.85rem',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6ffbbe' }} />
              <span style={{ fontSize: '0.63rem', fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Executing
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt ── */}
      <div style={{
        margin: '1.5rem 2rem',
        background: '#ffffff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px -4px rgba(19,27,46,0.08)',
        border: `1px solid ${OUTLINE_V}33`,
      }}>
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

      {/* ── Bottom padding ── */}
      <div style={{ height: '2rem' }} />
    </div>
  )
}
