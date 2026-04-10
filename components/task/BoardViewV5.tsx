'use client'

import React, { useState, useMemo } from 'react'
import {
  type Board, type Column, type Member, type MemberRole,
  type Task, type Milestone, type MilestoneTask,
  type BudgetLine, type CostTransaction, type Priority,
} from '@/lib/types'

// ─── Design tokens (Project Architect design system) ─────────────────────────
const C = {
  primary:         '#003178',
  primaryCont:     '#0d47a1',
  onPrimary:       '#ffffff',
  secondary:       '#4c616c',
  tertiary:        '#003f0b',
  tertiaryFixed:   '#a3f69c',   // On Track green badge bg
  onTertiaryFixed: '#002204',   // On Track green badge text
  secondaryFixed:  '#cfe6f2',   // Planning blue badge bg
  onSecondaryFixed:'#071e27',   // Planning blue badge text
  errorCont:       '#ffdad6',
  error:           '#ba1a1a',
  surface:         '#f8f9fa',
  surfLowest:      '#ffffff',
  surfContLow:     '#f3f4f5',
  surfCont:        '#edeeef',
  surfHigh:        '#e7e8e9',
  surfHighest:     '#e1e3e4',
  onSurface:       '#191c1d',
  onSurfaceVar:    '#434652',
  outline:         '#737783',
  outlineVar:      '#c3c6d4',
} as const

const FONT_HEADLINE = "'Manrope', 'Inter', sans-serif"
const FONT_BODY     = "'Inter', sans-serif"

// ─── Work items ───────────────────────────────────────────────────────────────
type WorkPackage = {
  id: string; num: number; label: string; why: string
  startFrac: number; endFrac: number; major: boolean
}
type WorkItem = {
  id: string; name: string; color: string
  phaseNum: number
  startFrac: number; endFrac: number
  packages: WorkPackage[]
}

const WORK_ITEMS: WorkItem[] = [
  {
    id: 'p1', phaseNum: 1, color: '#7C3AED', name: 'İş Geliştirme ve Satış',
    startFrac: 0.00, endFrac: 0.10,
    packages: [
      { id: 'km1', num: 1, label: 'Ön Anlaşma',    startFrac: 0.00, endFrac: 0.06, major: false, why: 'Arsa sahibiyle ticari şartların mutabakatı.' },
      { id: 'km2', num: 2, label: 'Tapu Şerhi',     startFrac: 0.04, endFrac: 0.10, major: true,  why: 'Noterli KKİS imzası ve tapuya şerh.' },
    ],
  },
  {
    id: 'p2', phaseNum: 2, color: '#2563EB', name: 'Tasarım ve Mühendislik',
    startFrac: 0.06, endFrac: 0.28,
    packages: [
      { id: 'km3', num: 3, label: 'Zemin Etüdü',    startFrac: 0.06, endFrac: 0.12, major: false, why: 'Yanlış zemin verisi bütçeyi %20 artırabilir.' },
      { id: 'km4', num: 4, label: 'Konsept Proje',   startFrac: 0.10, endFrac: 0.16, major: false, why: 'Ön satış materyallerine olanak sağlar.' },
      { id: 'km5', num: 5, label: 'Avan Proje',      startFrac: 0.15, endFrac: 0.21, major: false, why: 'Emsal ve imar haklarının yasallaşması.' },
      { id: 'km6', num: 6, label: 'Uyg. Projeleri',  startFrac: 0.19, endFrac: 0.24, major: false, why: 'Statik, elektrik, mekanik projelerinin tamamlanması.' },
      { id: 'km7', num: 7, label: 'Yapı Ruhsatı',    startFrac: 0.22, endFrac: 0.28, major: true,  why: 'İnşaatın resmi başlangıç tetikleyicisi.' },
    ],
  },
  {
    id: 'p3', phaseNum: 3, color: '#EA580C', name: 'Kaba Yapı',
    startFrac: 0.24, endFrac: 0.54,
    packages: [
      { id: 'km8',  num: 8,  label: 'Mobilizasyon',  startFrac: 0.24, endFrac: 0.29, major: false, why: 'Şantiye kontrolünün ele alınması.' },
      { id: 'km9',  num: 9,  label: 'Hafriyat',      startFrac: 0.28, endFrac: 0.34, major: false, why: 'Temel için en büyük fiziksel riskin geçilmesi.' },
      { id: 'km10', num: 10, label: 'Temel',          startFrac: 0.33, endFrac: 0.39, major: false, why: 'Sıfır kota ulaşma; finansal hakediş noktası.' },
      { id: 'km11', num: 11, label: 'Normal Katlar',  startFrac: 0.38, endFrac: 0.46, major: false, why: 'Periyodik üretim hızı kontrolü.' },
      { id: 'km12', num: 12, label: 'Alt İhale',      startFrac: 0.43, endFrac: 0.49, major: false, why: 'İnce işçilerin sahaya girişi için kilit geçiş.' },
      { id: 'km13', num: 13, label: 'Karkas Sonu',    startFrac: 0.46, endFrac: 0.54, major: true,  why: 'Kaba imalatın teknik kabulü.' },
    ],
  },
  {
    id: 'p4', phaseNum: 4, color: '#0D9488', name: 'İnce İşler ve Çevre',
    startFrac: 0.48, endFrac: 0.93,
    packages: [
      { id: 'km14', num: 14, label: 'Cephe',           startFrac: 0.48, endFrac: 0.54, major: false, why: 'Dış izolasyon sürecinin başlangıcı.' },
      { id: 'km15', num: 15, label: 'Watertight',      startFrac: 0.52, endFrac: 0.59, major: true,  why: 'Islak hasar riski kapanır.' },
      { id: 'km16', num: 16, label: 'Duvar & Sıva',    startFrac: 0.58, endFrac: 0.64, major: false, why: 'Oda hacimlerinin ortaya çıkması.' },
      { id: 'km17', num: 17, label: 'Yalıtım Testi',   startFrac: 0.62, endFrac: 0.68, major: false, why: 'Su sızıntısı riskinin elimine edilmesi.' },
      { id: 'km18', num: 18, label: 'Ağır Sistemler',  startFrac: 0.66, endFrac: 0.72, major: false, why: 'Asansör, trafo, hidrofor kurulumu.' },
      { id: 'km19', num: 19, label: 'Örnek Daire',     startFrac: 0.70, endFrac: 0.76, major: true,  why: 'Seri imalata geçmeden kalite standardının tescili.' },
      { id: 'km20', num: 20, label: 'Mobilya & Kapı',  startFrac: 0.74, endFrac: 0.80, major: false, why: 'Mahal Listesi\'nin seri uygulanması.' },
      { id: 'km21', num: 21, label: 'Final Boya',      startFrac: 0.78, endFrac: 0.85, major: false, why: 'Son estetik dokunuşlar.' },
      { id: 'km22', num: 22, label: 'Peyzaj',          startFrac: 0.83, endFrac: 0.89, major: false, why: 'İskan için aranan şart.' },
      { id: 'km23', num: 23, label: 'Snag List',       startFrac: 0.87, endFrac: 0.93, major: false, why: 'Son teknik kontrol.' },
    ],
  },
  {
    id: 'p5', phaseNum: 5, color: '#059669', name: 'Teslimat ve Kapanış',
    startFrac: 0.88, endFrac: 1.00,
    packages: [
      { id: 'km24', num: 24, label: 'Teknik Kabul',  startFrac: 0.88, endFrac: 0.93, major: false, why: 'İtfaiye onayı ve yangın testleri.' },
      { id: 'km25', num: 25, label: 'İskan',         startFrac: 0.91, endFrac: 0.97, major: true,  why: 'Tapu devri için zorunlu.' },
      { id: 'km26', num: 26, label: 'Tapu Devri',    startFrac: 0.95, endFrac: 1.00, major: false, why: 'Geliştiricinin finansal çıkışı.' },
    ],
  },
]

// ─── Full Props (same interface as other board views) ─────────────────────────
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

// ─── Popover state ────────────────────────────────────────────────────────────
type PopoverState = {
  wpId: string | null  // null = FAB add (no specific WP)
  phaseId: string
  name: string
  date: string
  editMilestone: Milestone | null
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BoardViewV5({
  board, milestones, costTransactions = [], budgetLines = [],
  onAddMilestone, onDeleteMilestone, onUpdateMilestoneDate,
  onUpdateMilestoneName, onCompleteMilestone,
}: Props) {
  const SYM = board.currency === 'TRY' ? '₺' : '$'

  const [activePhaseId, setActivePhaseId] = useState(WORK_ITEMS[0].id)
  const [popover, setPopover]             = useState<PopoverState | null>(null)
  const [saving,  setSaving]              = useState(false)

  const activePhase = WORK_ITEMS.find(w => w.id === activePhaseId) ?? WORK_ITEMS[0]

  // ── date range ──────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd, totalMs, totalWeeks } = useMemo(() => {
    const ts: number[] = []
    milestones.forEach(m => ts.push(new Date(m.target_date + 'T00:00:00').getTime()))
    costTransactions.forEach(t => ts.push(new Date(t.date + 'T00:00:00').getTime()))
    const now = new Date()
    if (!ts.length) {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth() + 13, 0)
      const tMs = e.getTime() - s.getTime()
      return { rangeStart: s, rangeEnd: e, totalMs: tMs, totalWeeks: Math.round(tMs / (7*24*3600*1000)) }
    }
    const s = new Date(Math.min(...ts)); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(Math.max(...ts)); e.setMonth(e.getMonth() + 2); e.setDate(0)
    const tMs = e.getTime() - s.getTime()
    return { rangeStart: s, rangeEnd: e, totalMs: tMs, totalWeeks: Math.round(tMs / (7*24*3600*1000)) }
  }, [milestones, costTransactions])

  const today = new Date()

  function fracToDate(frac: number): Date {
    return new Date(rangeStart.getTime() + frac * totalMs)
  }
  function fracToDateStr(frac: number): string {
    return fracToDate(frac).toISOString().split('T')[0]
  }
  function formatDate(d: Date): string {
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  }
  function wpDurationWeeks(wp: WorkPackage): number {
    return Math.max(1, Math.round((wp.endFrac - wp.startFrac) * totalWeeks))
  }

  // ── WP status ───────────────────────────────────────────────────────────────
  type WPStatus = 'done' | 'active' | 'planned'
  function wpStatus(wp: WorkPackage): WPStatus {
    const endDate   = fracToDate(wp.endFrac)
    const startDate = fracToDate(wp.startFrac)
    if (today > endDate)   return 'done'
    if (today > startDate) return 'active'
    return 'planned'
  }

  // ── Overall progress (% of timeline elapsed, capped 0-100) ──────────────────
  const overallPct = Math.max(0, Math.min(100,
    (today.getTime() - rangeStart.getTime()) / totalMs * 100
  ))

  // ── Completed WPs across ALL phases ─────────────────────────────────────────
  const totalWPs     = WORK_ITEMS.reduce((s, w) => s + w.packages.length, 0)
  const completedWPs = WORK_ITEMS.reduce((s, w) => s + w.packages.filter(p => wpStatus(p) === 'done').length, 0)

  // ── Budget summary ───────────────────────────────────────────────────────────
  const totalBudget  = budgetLines.reduce((s, b) => s + b.budgeted_amount, 0)
  const totalSpent   = costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast).reduce((s, t) => s + t.amount, 0)
  const budgetPct    = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0

  // ── Project milestones per WP ────────────────────────────────────────────────
  function msForWP(wp: WorkPackage): Milestone[] {
    const s = fracToDate(wp.startFrac).getTime()
    const e = fracToDate(wp.endFrac).getTime()
    return milestones.filter(m => {
      const t = new Date(m.target_date + 'T00:00:00').getTime()
      return t >= s && t <= e
    })
  }

  // ── Status badge ─────────────────────────────────────────────────────────────
  function StatusBadge({ status, major }: { status: WPStatus; major: boolean }) {
    const cfg = {
      done:    { bg: C.tertiaryFixed,  text: C.onTertiaryFixed, label: 'Tamamlandı' },
      active:  { bg: C.secondaryFixed, text: C.onSecondaryFixed,label: 'Aktif' },
      planned: { bg: C.surfHighest,    text: C.onSurfaceVar,    label: 'Planlama' },
    }[status]
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={{
          padding: '0.15rem 0.5rem', borderRadius: 4,
          background: cfg.bg, color: cfg.text,
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const,
          fontFamily: FONT_BODY,
        }}>
          {cfg.label}
        </span>
        {major && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '0.2rem',
            color: C.primary, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.02em',
            fontFamily: FONT_BODY,
          }}>
            ◈ Kritik KM
          </span>
        )}
      </div>
    )
  }

  // ── Work package card ─────────────────────────────────────────────────────────
  function WPCard({ wp, phaseIdx, wpIdx }: { wp: WorkPackage; phaseIdx: number; wpIdx: number }) {
    const status     = wpStatus(wp)
    const wpMs       = msForWP(wp)
    const hasMilestone = wpMs.length > 0
    const weeks      = wpDurationWeeks(wp)
    const startDate  = fracToDate(wp.startFrac)
    const endDate    = fracToDate(wp.endFrac)
    const wpCode     = `WP.${phaseIdx}.${wpIdx}`

    return (
      <div style={{
        background: C.surfLowest,
        borderRadius: 12,
        padding: '1rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        border: `1px solid ${C.outlineVar}44`,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: C.onSurface, fontFamily: FONT_HEADLINE, marginBottom: '0.3rem', lineHeight: 1.3 }}>
              {wpCode}: {wp.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <StatusBadge status={status} major={wp.major} />
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.6rem', color: C.outline, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                ⏱ {weeks} Hafta
              </span>
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.375rem', marginLeft: '0.5rem', flexShrink: 0 }}>
            {/* Flag / Milestone button */}
            <button
              title={hasMilestone ? 'Milestone var — düzenle' : 'Milestone ekle'}
              onClick={() => {
                if (hasMilestone && wpMs[0]) {
                  setPopover({ wpId: wp.id, phaseId: activePhaseId, name: wpMs[0].name, date: wpMs[0].target_date, editMilestone: wpMs[0] })
                } else {
                  setPopover({ wpId: wp.id, phaseId: activePhaseId, name: wp.label, date: fracToDateStr(wp.endFrac), editMilestone: null })
                }
              }}
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: hasMilestone ? `${C.primary}14` : C.surfContLow,
                color: hasMilestone ? C.primary : C.outline,
                fontSize: '1rem', transition: 'all 0.15s',
              }}
            >
              {hasMilestone ? '◈' : '◇'}
            </button>
            {/* Expand / info */}
            <button
              title={wp.why}
              style={{
                width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: C.surfContLow, color: C.outline,
                fontSize: '1rem',
              }}
            >
              ℹ
            </button>
          </div>
        </div>

        {/* Footer row */}
        <div style={{
          paddingTop: '0.5rem',
          borderTop: `1px solid ${C.surfContLow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.6rem', color: C.outline, fontWeight: 500 }}>
            📅 {formatDate(startDate)} – {formatDate(endDate)}
          </span>
          {hasMilestone && wpMs[0] && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: C.primary, fontFamily: FONT_HEADLINE }}>
              ◈ {wpMs[0].name}
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Phase progress ────────────────────────────────────────────────────────────
  const phaseWPs     = activePhase.packages
  const phaseDone    = phaseWPs.filter(p => wpStatus(p) === 'done').length
  const phaseWeeks   = Math.max(1, Math.round((activePhase.endFrac - activePhase.startFrac) * totalWeeks))
  const phasePct     = phaseWPs.length > 0 ? (phaseDone / phaseWPs.length) * 100 : 0

  // ── Popover actions ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!popover || !popover.name.trim() || !popover.date) return
    setSaving(true)
    try {
      if (popover.editMilestone) {
        if (onUpdateMilestoneName && popover.name !== popover.editMilestone.name)
          await onUpdateMilestoneName(popover.editMilestone.id, popover.name)
        if (onUpdateMilestoneDate && popover.date !== popover.editMilestone.target_date)
          await onUpdateMilestoneDate(popover.editMilestone.id, popover.date)
      } else {
        await onAddMilestone(popover.name, popover.date)
      }
    } finally { setSaving(false); setPopover(null) }
  }
  async function handleDelete() {
    if (!popover?.editMilestone) return
    setSaving(true)
    try { await onDeleteMilestone(popover.editMilestone.id) }
    finally { setSaving(false); setPopover(null) }
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.surface, fontFamily: FONT_BODY, color: C.onSurface, position: 'relative' }}>

      {/* ── Fixed Header ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        zIndex: 50, background: C.surfLowest,
        boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1rem', height: 56,
          borderBottom: `1px solid ${C.surfContLow}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🏗</span>
            <span style={{ fontFamily: FONT_HEADLINE, fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', color: C.primary }}>
              Project Architect
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem', cursor: 'pointer', color: C.outline }}>🔔</span>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryCont})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.7rem', fontWeight: 800, border: `2px solid ${C.secondaryFixed}`,
            }}>
              {board.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Phase pill tabs */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: `1px solid ${C.surfContLow}`,
          background: C.surfLowest,
        }}>
          <div style={{
            flex: 1, overflowX: 'auto', display: 'flex', alignItems: 'center',
            gap: '0.5rem', padding: '0.65rem 1rem',
            scrollbarWidth: 'none' as const,
          }}>
            {WORK_ITEMS.map(item => {
              const active = item.id === activePhaseId
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePhaseId(item.id)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <div style={{
                    padding: '0.4rem 0.875rem',
                    borderRadius: 99,
                    background: active ? C.primary : C.surfContLow,
                    color: active ? '#fff' : C.outline,
                    fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' as const,
                    fontFamily: FONT_HEADLINE,
                    transition: 'all 0.15s',
                    boxShadow: active ? `0 2px 8px ${C.primary}33` : 'none',
                  }}>
                    {item.name.split(' ')[0] + (item.name.split(' ')[1] ? ' ' + item.name.split(' ')[1] : '')}
                  </div>
                  {active && (
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.primary }} />
                  )}
                </button>
              )
            })}
          </div>
          {/* Add phase button */}
          <button style={{
            padding: '0.65rem 1rem',
            borderLeft: `1px solid ${C.surfContLow}`,
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.primary, fontSize: '1.3rem', display: 'flex', alignItems: 'center',
          }}>
            ＋
          </button>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <main style={{ paddingTop: 120, paddingBottom: 120, padding: '120px 1rem 120px' }}>

        {/* Overall timeline + budget strip */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: C.outline, textTransform: 'uppercase' as const, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              📅 {totalWeeks} Hafta Tahmini
            </span>
            {totalBudget > 0 && (
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: C.outline, textTransform: 'uppercase' as const, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                💰 {SYM}{(totalBudget / 1_000_000).toFixed(1)}M ({budgetPct.toFixed(1)}% Kullanıldı)
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 4, background: C.surfHighest, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${overallPct}%`, height: '100%', background: C.primary, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Phase title */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <div style={{ width: 12, height: 12, background: activePhase.color, borderRadius: 3, flexShrink: 0 }} />
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: C.onSurface, fontFamily: FONT_HEADLINE, margin: 0, letterSpacing: '-0.03em' }}>
              {activePhase.name}
            </h1>
          </div>
          <p style={{ fontSize: '0.72rem', color: C.outline, fontWeight: 600, margin: 0 }}>
            Faz {activePhase.phaseNum} • {phaseWeeks} Hafta • {phaseDone}/{phaseWPs.length} WP Tamamlandı
          </p>
          {/* Phase progress bar */}
          <div style={{ marginTop: '0.6rem', width: '100%', height: 3, background: C.surfHighest, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${phasePct}%`, height: '100%',
              background: activePhase.color,
              borderRadius: 99, transition: 'width 0.3s',
            }} />
          </div>
        </div>

        {/* Work package cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activePhase.packages.map((wp, i) => (
            <WPCard key={wp.id} wp={wp} phaseIdx={activePhase.phaseNum} wpIdx={i + 1} />
          ))}
        </div>
      </main>

      {/* ── FAB (Add Milestone) ── */}
      <button
        onClick={() => setPopover({
          wpId: null,
          phaseId: activePhaseId,
          name: '',
          date: fracToDateStr(activePhase.endFrac),
          editMilestone: null,
        })}
        style={{
          position: 'fixed', bottom: 88, right: 24, zIndex: 40,
          width: 56, height: 56, borderRadius: '50%',
          background: C.primary, color: '#fff', border: 'none',
          boxShadow: '0 8px 24px rgba(0,49,120,0.4)',
          fontSize: '1.75rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s',
        }}
        title="Yeni Milestone Ekle"
      >
        +
      </button>

      {/* ── Bottom navigation ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '0.65rem 1rem',
        background: C.surfLowest,
        borderTop: `1px solid ${C.surfContLow}`,
        boxShadow: '0 -4px 15px rgba(0,0,0,0.04)',
      }}>
        {[
          { icon: '▣',   label: 'Overview',  active: false },
          { icon: '≡',   label: 'Yapı',      active: true  },
          { icon: '→',   label: 'Çıktılar',  active: false },
          { icon: '⚙',   label: 'Ayarlar',   active: false },
        ].map(item => (
          <div key={item.label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
            color: item.active ? C.primary : C.outline,
            cursor: 'pointer',
          }}>
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: '0.55rem', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontFamily: FONT_BODY }}>
              {item.label}
            </span>
          </div>
        ))}
      </nav>

      {/* ── Milestone popover ── */}
      {popover && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={() => setPopover(null)}
        >
          <div
            style={{
              background: C.surfLowest,
              borderRadius: '20px 20px 0 0',
              padding: '1.5rem 1.25rem 2rem',
              width: '100%', maxWidth: 480,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ width: 40, height: 4, background: C.surfHighest, borderRadius: 99, margin: '0 auto 1.25rem' }} />

            <h3 style={{ fontFamily: FONT_HEADLINE, fontWeight: 800, fontSize: '1.05rem', color: C.onSurface, margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
              {popover.editMilestone ? 'Milestone Düzenle' : '+ Yeni Milestone'}
            </h3>
            {popover.wpId && (
              <p style={{ fontSize: '0.68rem', color: C.outline, margin: '0 0 1.25rem', fontWeight: 500 }}>
                {activePhase.name} · {activePhase.packages.find(p => p.id === popover.wpId)?.label}
              </p>
            )}

            {/* Name input */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: C.outline, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                Milestone Adı
              </label>
              <input
                value={popover.name}
                onChange={e => setPopover(p => p ? { ...p, name: e.target.value } : p)}
                placeholder="Milestone adını girin..."
                autoFocus
                style={{
                  width: '100%', padding: '0.65rem 0.75rem',
                  border: `1.5px solid ${C.outlineVar}`,
                  borderRadius: 8, fontSize: '0.85rem', color: C.onSurface,
                  background: C.surface, outline: 'none', boxSizing: 'border-box' as const,
                  fontFamily: FONT_BODY,
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = C.primary }}
                onBlur={e  => { (e.target as HTMLInputElement).style.borderColor = C.outlineVar }}
              />
            </div>

            {/* Date input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: C.outline, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                Hedef Tarih
              </label>
              <input
                type="date"
                value={popover.date}
                onChange={e => setPopover(p => p ? { ...p, date: e.target.value } : p)}
                style={{
                  width: '100%', padding: '0.65rem 0.75rem',
                  border: `1.5px solid ${C.outlineVar}`,
                  borderRadius: 8, fontSize: '0.85rem', color: C.onSurface,
                  background: C.surface, outline: 'none', boxSizing: 'border-box' as const,
                  fontFamily: FONT_BODY,
                }}
              />
            </div>

            {/* Complete toggle (edit only) */}
            {popover.editMilestone && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!popover.editMilestone.completed_at}
                    onChange={async e => {
                      await onCompleteMilestone(popover.editMilestone!.id, e.target.checked)
                      setPopover(null)
                    }}
                    style={{ accentColor: C.primary, width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: '0.8rem', color: C.onSurface, fontWeight: 600 }}>Tamamlandı olarak işaretle</span>
                </label>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {popover.editMilestone && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '0.75rem', borderRadius: 10,
                    border: `1.5px solid ${C.errorCont}`,
                    background: C.errorCont, color: C.error,
                    fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                    fontFamily: FONT_HEADLINE,
                  }}
                >
                  🗑 Sil
                </button>
              )}
              <button
                onClick={() => setPopover(null)}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 10,
                  border: `1.5px solid ${C.outlineVar}`,
                  background: C.surfContLow, color: C.onSurfaceVar,
                  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: FONT_HEADLINE,
                }}
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={!popover.name.trim() || !popover.date || saving}
                style={{
                  flex: 2, padding: '0.75rem', borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryCont})`,
                  color: '#fff', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
                  fontFamily: FONT_HEADLINE,
                  opacity: (!popover.name.trim() || !popover.date || saving) ? 0.5 : 1,
                  boxShadow: `0 4px 14px ${C.primary}44`,
                }}
              >
                {saving ? '…' : '✓ Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
