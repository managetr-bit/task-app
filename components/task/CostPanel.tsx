'use client'

import { useState, useMemo } from 'react'
import type { BudgetLine, CostTransaction, Milestone } from '@/lib/types'
import { COST_CATEGORIES } from '@/lib/types'
import { CostTransactionModal } from './CostTransactionModal'
import { BudgetModal } from './BudgetModal'

type Props = {
  boardId: string
  currency: 'TRY' | 'USD'
  budgetLines: BudgetLine[]
  transactions: CostTransaction[]
  milestones: Milestone[]
  canEdit: boolean
  onAddTransaction:    (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateTransaction: (id: string, updates: Partial<CostTransaction>) => Promise<void>
  onDeleteTransaction: (id: string) => Promise<void>
  onAddBudgetLine:     (data: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdateBudgetLine:  (id: string, updates: Partial<BudgetLine>) => Promise<void>
  onDeleteBudgetLine:  (id: string) => Promise<void>
  onImportBudgetLines: (lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[]) => Promise<void>
  onChangeCurrency:    (c: 'TRY' | 'USD') => Promise<void>
}

// ── Currency helpers ─────────────────────────────────────────────────────────
function fmt(amount: number, currency: 'TRY' | 'USD'): string {
  const sym = currency === 'TRY' ? '₺' : '$'
  if (Math.abs(amount) >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`
  if (Math.abs(amount) >= 1_000)     return `${sym}${(amount / 1_000).toFixed(0)}K`
  return `${sym}${amount.toFixed(0)}`
}
function fmtFull(amount: number, currency: 'TRY' | 'USD'): string {
  return new Intl.NumberFormat(currency === 'TRY' ? 'tr-TR' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount)
}

// ── Cash Flow Chart (pure SVG) ───────────────────────────────────────────────
function CashFlowChart({ transactions, budgetLines, milestones, currency }: { transactions: CostTransaction[]; budgetLines: BudgetLine[]; milestones: Milestone[]; currency: 'TRY' | 'USD' }) {
  const W = 240, H = 130, PL = 42, PR = 8, PT = 10, PB = 28

  // Build monthly buckets — last 8 months + future months with data
  const months = useMemo(() => {
    const now = new Date()
    const buckets: Record<string, { cashIn: number; cashOut: number; forecastIn: number; forecastOut: number }> = {}

    // Seed 8 months around today
    for (let i = -5; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = { cashIn: 0, cashOut: 0, forecastIn: 0, forecastOut: 0 }
    }

    for (const tx of transactions) {
      const key = tx.date.slice(0, 7)
      if (!buckets[key]) buckets[key] = { cashIn: 0, cashOut: 0, forecastIn: 0, forecastOut: 0 }
      if (tx.type === 'cash_in') {
        if (tx.is_forecast) buckets[key].forecastIn  += tx.amount
        else                buckets[key].cashIn      += tx.amount
      } else {
        if (tx.is_forecast) buckets[key].forecastOut += tx.amount
        else                buckets[key].cashOut     += tx.amount
      }
    }

    // Add budget lines (with expected_date or milestone date) as forecast entries
    for (const bl of budgetLines) {
      const dateStr = bl.expected_date ?? (bl.milestone_id ? milestones.find(m => m.id === bl.milestone_id)?.target_date : null)
      if (!dateStr) continue
      const key = dateStr.slice(0, 7)
      if (!buckets[key]) buckets[key] = { cashIn: 0, cashOut: 0, forecastIn: 0, forecastOut: 0 }
      if (bl.type === 'income') buckets[key].forecastIn  += bl.budgeted_amount
      else                      buckets[key].forecastOut += bl.budgeted_amount
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({
        key,
        label: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short' }),
        cashIn:      v.cashIn,
        cashOut:     v.cashOut,
        forecastIn:  v.forecastIn,
        forecastOut: v.forecastOut,
        totalIn:  v.cashIn  + v.forecastIn,
        totalOut: v.cashOut + v.forecastOut,
      }))
  }, [transactions])

  const hasData = months.some(m => m.totalIn > 0 || m.totalOut > 0)

  if (!hasData) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: '#c4bfb9' }}>No transactions yet</p>
      </div>
    )
  }

  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const n = months.length
  const barW = Math.max(3, Math.floor(chartW / n / 2.5))
  const groupW = chartW / n
  const maxVal = Math.max(...months.map(m => Math.max(m.totalIn, m.totalOut)), 1)

  // Nice round Y max
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)))
    const candidates = [1, 2, 2.5, 5, 10].map(f => f * mag)
    return candidates.find(c => c >= maxVal) ?? maxVal
  })()

  function scaleY(val: number) { return PT + chartH - (val / niceMax) * chartH }
  function fmtY(val: number) { return fmt(val, currency) }

  // Running balance line
  const balance: { x: number; y: number }[] = []
  let running = 0
  for (let i = 0; i < months.length; i++) {
    running += months[i].totalIn - months[i].totalOut
    const cx = PL + i * groupW + groupW / 2
    balance.push({ x: cx, y: scaleY(Math.max(0, running)) })
  }

  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const nowIdx = months.findIndex(m => m.key === nowKey)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Y-axis grid + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PT + chartH * (1 - f)
        return (
          <g key={f}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#EDE9FE" strokeWidth="1" />
            {f > 0 && (
              <text x={PL - 4} y={y + 3} textAnchor="end" fontSize="7" fill="#9ca3af">{fmtY(f * niceMax)}</text>
            )}
          </g>
        )
      })}

      {/* TODAY marker */}
      {nowIdx >= 0 && (
        <line
          x1={PL + nowIdx * groupW + groupW / 2} y1={PT}
          x2={PL + nowIdx * groupW + groupW / 2} y2={PT + chartH}
          stroke="#7C3AED" strokeWidth="1" strokeDasharray="2 2" opacity="0.6"
        />
      )}

      {/* Bars */}
      {months.map((m, i) => {
        const cx = PL + i * groupW
        const inH  = (m.totalIn  / niceMax) * chartH
        const outH = (m.totalOut / niceMax) * chartH
        const inX  = cx + (groupW - barW * 2 - 1) / 2
        const outX = inX + barW + 1

        return (
          <g key={m.key}>
            {/* Cash In bar (green) */}
            {m.totalIn > 0 && (
              <rect
                x={inX} y={PT + chartH - inH} width={barW} height={inH}
                fill={m.forecastIn > 0 ? '#A8E6C4' : '#6ACA9A'}
                rx={1.5}
                opacity={m.forecastIn > 0 && m.cashIn === 0 ? 0.6 : 1}
              />
            )}
            {/* Cash Out bar (rose) */}
            {m.totalOut > 0 && (
              <rect
                x={outX} y={PT + chartH - outH} width={barW} height={outH}
                fill={m.forecastOut > 0 ? '#F4B8C8' : '#E86A8E'}
                rx={1.5}
                opacity={m.forecastOut > 0 && m.cashOut === 0 ? 0.6 : 1}
              />
            )}
            {/* X label */}
            <text x={cx + groupW / 2} y={H - 6} textAnchor="middle" fontSize="7" fill={m.key === nowKey ? '#7C3AED' : '#9ca3af'} fontWeight={m.key === nowKey ? '700' : '400'}>
              {m.label}
            </text>
          </g>
        )
      })}

      {/* Balance line */}
      {balance.length >= 2 && (() => {
        const path = balance.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        return (
          <>
            <path d={path} fill="none" stroke="#7C3AED" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            {balance.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2} fill="#7C3AED" />)}
          </>
        )
      })()}
    </svg>
  )
}

// ── Main CostPanel ────────────────────────────────────────────────────────────
export function CostPanel({
  boardId, currency, budgetLines, transactions, milestones,
  canEdit, onAddTransaction, onUpdateTransaction, onDeleteTransaction,
  onAddBudgetLine, onUpdateBudgetLine, onDeleteBudgetLine, onImportBudgetLines, onChangeCurrency,
}: Props) {
  const [showTxModal, setShowTxModal]       = useState(false)
  const [editingTx, setEditingTx]           = useState<CostTransaction | null>(null)
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [budgetModalDefaultType, setBudgetModalDefaultType] = useState<'expense' | 'income' | undefined>(undefined)
  const [showChart, setShowChart]           = useState(true)
  const [showBudgetSection, setShowBudgetSection] = useState(false)
  const [txFilter, setTxFilter]             = useState<'all' | 'cash_in' | 'cash_out' | 'forecast'>('all')
  const [showSchedules, setShowSchedules]   = useState(true)
  const [showIncome, setShowIncome]         = useState(true)
  const [newPaymentLineId, setNewPaymentLineId] = useState<string | null>(null)
  const [newPaymentType, setNewPaymentType]     = useState<'cash_in' | 'cash_out'>('cash_out')

  function openNewPayment(lineId: string, type: 'cash_in' | 'cash_out') {
    setNewPaymentLineId(lineId)
    setNewPaymentType(type)
    setEditingTx(null)
    setShowTxModal(true)
  }

  // ── Summaries ────────────────────────────────────────────────────────────
  const totalBudgetExpense = useMemo(() => budgetLines.filter(l => l.type === 'expense').reduce((s, l) => s + l.budgeted_amount, 0), [budgetLines])
  const totalBudgetIncome  = useMemo(() => budgetLines.filter(l => l.type === 'income').reduce((s, l) => s + l.budgeted_amount, 0), [budgetLines])

  const actuals = transactions.filter(t => !t.is_forecast)
  const totalSpent    = actuals.filter(t => t.type === 'cash_out').reduce((s, t) => s + t.amount, 0)
  const totalReceived = actuals.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0)
  const netBalance    = totalReceived - totalSpent

  const budgetUsedPct = totalBudgetExpense > 0 ? Math.round((totalSpent / totalBudgetExpense) * 100) : null

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...transactions].sort((a, b) => b.date.localeCompare(a.date))
    if (txFilter === 'cash_in')  list = list.filter(t => t.type === 'cash_in')
    if (txFilter === 'cash_out') list = list.filter(t => t.type === 'cash_out')
    if (txFilter === 'forecast') list = list.filter(t => t.is_forecast)
    return list
  }, [transactions, txFilter])

  // ── Category breakdown (for budget vs actual) ─────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { budgeted: number; spent: number; label: string; emoji: string }> = {}
    for (const line of budgetLines) {
      const k = line.category
      if (!map[k]) map[k] = { budgeted: 0, spent: 0, label: COST_CATEGORIES[line.category].label, emoji: COST_CATEGORIES[line.category].emoji }
      map[k].budgeted += line.budgeted_amount
    }
    for (const tx of transactions.filter(t => !t.is_forecast && t.type === 'cash_out')) {
      const line = budgetLines.find(l => l.id === tx.budget_line_id)
      if (line) {
        const k = line.category
        if (!map[k]) map[k] = { budgeted: 0, spent: 0, label: COST_CATEGORIES[line.category].label, emoji: COST_CATEGORIES[line.category].emoji }
        map[k].spent += tx.amount
      }
    }
    return Object.entries(map).filter(([, v]) => v.budgeted > 0)
  }, [budgetLines, transactions])

  const sym = currency === 'TRY' ? '₺' : '$'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FAFAFE' }}>
      {/* Header */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #E8E5F0', display: 'flex', alignItems: 'center', gap: '0.375rem', background: '#fff', flexShrink: 0 }}>
        <span style={{ fontSize: '0.75rem' }}>💰</span>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>Cost</span>

        {/* Currency toggle */}
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 7, padding: 2, gap: 2 }}>
          {(['TRY', 'USD'] as const).map(c => (
            <button key={c} onClick={() => canEdit && onChangeCurrency(c)} style={{
              padding: '0.15rem 0.45rem', borderRadius: 5, border: 'none', cursor: canEdit ? 'pointer' : 'default',
              background: currency === c ? '#fff' : 'transparent',
              color: currency === c ? '#7C3AED' : '#9ca3af',
              fontSize: '0.65rem', fontWeight: 700,
              boxShadow: currency === c ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{c === 'TRY' ? '₺ TRY' : '$ USD'}</button>
          ))}
        </div>

        {canEdit && (
          <button onClick={() => setShowBudgetModal(true)} title="Manage budget" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', padding: '0.2rem', lineHeight: 1 }}>⚙</button>
        )}
        {canEdit && (
          <button
            onClick={() => { setEditingTx(null); setShowTxModal(true) }}
            title="Add transaction"
            style={{ width: 20, height: 20, borderRadius: '50%', background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }}
          >+</button>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* ── Summary cards ── */}
        <div style={{ padding: '0.625rem 0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
          <SummaryCard label="Budget" value={fmt(totalBudgetExpense, currency)} sub={totalBudgetIncome > 0 ? `Income: ${fmt(totalBudgetIncome, currency)}` : undefined} color="#1a1a1a" />
          <SummaryCard
            label={`Spent${budgetUsedPct != null ? ` · ${budgetUsedPct}%` : ''}`}
            value={fmt(totalSpent, currency)}
            sub={totalBudgetExpense > 0 ? `of ${fmt(totalBudgetExpense, currency)}` : undefined}
            color={budgetUsedPct != null && budgetUsedPct > 90 ? '#ef4444' : budgetUsedPct != null && budgetUsedPct > 70 ? '#f59e0b' : '#1a1a1a'}
            bar={budgetUsedPct}
          />
          <SummaryCard label="Received" value={fmt(totalReceived, currency)} color="#6ACA9A" />
          <SummaryCard
            label="Balance"
            value={`${netBalance >= 0 ? '+' : ''}${fmt(netBalance, currency)}`}
            color={netBalance >= 0 ? '#6ACA9A' : '#E86A8E'}
          />
        </div>

        {/* ── Cash Flow Chart ── */}
        <Section
          title="Cash Flow"
          emoji="📈"
          open={showChart}
          onToggle={() => setShowChart(p => !p)}
        >
          <div style={{ padding: '0.25rem 0.5rem 0.5rem' }}>
            <CashFlowChart transactions={transactions} budgetLines={budgetLines} milestones={milestones} currency={currency} />
            {/* Legend */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.25rem' }}>
              <LegendDot color="#6ACA9A" label="Cash In" />
              <LegendDot color="#E86A8E" label="Cash Out" />
              <LegendDot color="#7C3AED" label="Balance" line />
            </div>
          </div>
        </Section>

        {/* ── Budget vs Actual ── */}
        {categoryBreakdown.length > 0 && (
          <Section title="Budget vs Actual" emoji="📊" open={showBudgetSection} onToggle={() => setShowBudgetSection(p => !p)}>
            <div style={{ padding: '0.25rem 0.75rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {categoryBreakdown.map(([key, v]) => {
                const pct = v.budgeted > 0 ? Math.min(100, Math.round((v.spent / v.budgeted) * 100)) : 0
                const over = v.spent > v.budgeted
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: '0.7rem', color: '#4b5563' }}>{v.emoji} {v.label}</span>
                      <span style={{ fontSize: '0.7rem', color: over ? '#ef4444' : '#6b7280', fontWeight: over ? 700 : 400 }}>
                        {sym}{v.spent.toLocaleString()} / {sym}{v.budgeted.toLocaleString()}
                      </span>
                    </div>
                    <div style={{ height: 4, background: '#EDE9FE', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: over ? '#ef4444' : pct > 70 ? '#f59e0b' : '#6ACA9A', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* ── Payment Schedules ── */}
        <Section title="Payment Schedules" emoji="📅" open={showSchedules} onToggle={() => setShowSchedules(p => !p)}>
          <div style={{ padding: '0 0.75rem 0.5rem' }}>
            {budgetLines.filter(l => l.type === 'expense').map(line => (
              <PaymentScheduleGroup
                key={line.id}
                line={line}
                allTransactions={transactions}
                milestones={milestones}
                currency={currency}
                canEdit={canEdit}
                onAddPayment={() => openNewPayment(line.id, 'cash_out')}
                onEditTransaction={tx => { setEditingTx(tx); setShowTxModal(true) }}
              />
            ))}
            {budgetLines.filter(l => l.type === 'expense').length === 0 && (
              <p style={{ fontSize: '0.68rem', color: '#c4bfb9', margin: '0.25rem 0 0.375rem' }}>
                Define budget items (contracts, labor, materials…) to schedule their payment installments — date-based or tied to milestones.
              </p>
            )}
            {canEdit && (
              <button
                onClick={() => { setBudgetModalDefaultType('expense'); setShowBudgetModal(true) }}
                style={{ fontSize: '0.65rem', color: '#7C3AED', background: 'none', border: '1px dashed #7C3AED60', borderRadius: 6, cursor: 'pointer', padding: '4px 10px', fontWeight: 600, marginTop: 4 }}
              >
                + Add budget item
              </button>
            )}
          </div>
        </Section>

        {/* ── Income Plan ── */}
        <Section title="Income Plan" emoji="💵" open={showIncome} onToggle={() => setShowIncome(p => !p)}>
          <div style={{ padding: '0 0.75rem 0.5rem' }}>
            {budgetLines.filter(l => l.type === 'income').map(line => (
              <PaymentScheduleGroup
                key={line.id}
                line={line}
                allTransactions={transactions}
                milestones={milestones}
                currency={currency}
                canEdit={canEdit}
                onAddPayment={() => openNewPayment(line.id, 'cash_in')}
                onEditTransaction={tx => { setEditingTx(tx); setShowTxModal(true) }}
              />
            ))}
            {budgetLines.filter(l => l.type === 'income').length === 0 && (
              <p style={{ fontSize: '0.68rem', color: '#c4bfb9', margin: '0.25rem 0 0.375rem' }}>
                Plan expected income — unit sales, advance payments, grants — and tie them to project milestones.
              </p>
            )}
            {canEdit && (
              <button
                onClick={() => { setBudgetModalDefaultType('income'); setShowBudgetModal(true) }}
                style={{ fontSize: '0.65rem', color: '#6ACA9A', background: 'none', border: '1px dashed #6ACA9A60', borderRadius: 6, cursor: 'pointer', padding: '4px 10px', fontWeight: 600, marginTop: 4 }}
              >
                + Add income source
              </button>
            )}
          </div>
        </Section>

        {/* ── Transactions ── */}
        <Section title={`Transactions${transactions.length > 0 ? ` (${transactions.length})` : ''}`} emoji="🧾" open alwaysOpen>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: '0.25rem', padding: '0.375rem 0.75rem', borderBottom: '1px solid #EDE9FE' }}>
            {([['all', 'All'], ['cash_out', '↑ Out'], ['cash_in', '↓ In'], ['forecast', '~Forecast']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTxFilter(id)} style={{
                padding: '0.2rem 0.5rem', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.65rem', fontWeight: txFilter === id ? 700 : 500,
                background: txFilter === id ? '#7C3AED' : '#F3F4F6',
                color: txFilter === id ? '#fff' : '#6b7280',
              }}>{label}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#c4bfb9', fontSize: '0.8rem' }}>
              {transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(tx => {
                const isCashIn = tx.type === 'cash_in'
                const line = budgetLines.find(l => l.id === tx.budget_line_id)
                const ms   = milestones.find(m => m.id === tx.milestone_id)
                return (
                  <div
                    key={tx.id}
                    onClick={() => canEdit && (setEditingTx(tx), setShowTxModal(true))}
                    style={{
                      padding: '0.5rem 0.75rem', borderBottom: '1px solid #EDE9FE', display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                      cursor: canEdit ? 'pointer' : 'default', background: '#fff',
                    }}
                    onMouseEnter={e => { if (canEdit) (e.currentTarget as HTMLDivElement).style.background = '#FAFAFE' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fff' }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: isCashIn ? '#F0FDF4' : '#FFF1F4',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 700, color: isCashIn ? '#6ACA9A' : '#E86A8E',
                      marginTop: 1,
                    }}>
                      {isCashIn ? '↓' : '↑'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.7875rem', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description || (line ? line.name : isCashIn ? 'Cash In' : 'Cash Out')}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 1 }}>
                        {new Date(tx.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                        {line && ` · ${COST_CATEGORIES[line.category]?.emoji} ${line.name}`}
                        {ms && ` · ${ms.name}`}
                        {tx.is_forecast && <span style={{ color: '#7C3AED', fontWeight: 600 }}> · forecast</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: isCashIn ? '#6ACA9A' : '#E86A8E', flexShrink: 0 }}>
                      {isCashIn ? '+' : '-'}{fmtFull(tx.amount, currency)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Modals */}
      {showTxModal && (
        <CostTransactionModal
          boardId={boardId}
          currency={currency}
          budgetLines={budgetLines}
          milestones={milestones}
          editing={editingTx}
          defaultBudgetLineId={newPaymentLineId ?? undefined}
          defaultType={newPaymentType}
          onClose={() => { setShowTxModal(false); setEditingTx(null); setNewPaymentLineId(null) }}
          onSave={async (data) => {
            if (editingTx) {
              await onUpdateTransaction(editingTx.id, data)
            } else {
              await onAddTransaction(data)
            }
          }}
          onDelete={editingTx ? onDeleteTransaction : undefined}
        />
      )}
      {showBudgetModal && (
        <BudgetModal
          currency={currency}
          budgetLines={budgetLines}
          milestones={milestones}
          defaultLineType={budgetModalDefaultType}
          onClose={() => { setShowBudgetModal(false); setBudgetModalDefaultType(undefined) }}
          onAdd={onAddBudgetLine}
          onUpdate={onUpdateBudgetLine}
          onDelete={onDeleteBudgetLine}
          onImportLines={onImportBudgetLines}
        />
      )}
    </div>
  )
}

// ── Helper sub-components ─────────────────────────────────────────────────────

// ── Payment Schedule Group ────────────────────────────────────────────────────
function PaymentScheduleGroup({
  line, allTransactions, milestones, currency, canEdit, onAddPayment, onEditTransaction,
}: {
  line: BudgetLine
  allTransactions: CostTransaction[]
  milestones: Milestone[]
  currency: 'TRY' | 'USD'
  canEdit: boolean
  onAddPayment: () => void
  onEditTransaction: (tx: CostTransaction) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const txs = allTransactions.filter(t => t.budget_line_id === line.id)
  const totalScheduled = txs.reduce((s, t) => s + t.amount, 0)
  const pct = line.budgeted_amount > 0 ? Math.min(100, Math.round(totalScheduled / line.budgeted_amount * 100)) : 0
  const isIncome = line.type === 'income'
  const accentColor = isIncome ? '#6ACA9A' : '#7C3AED'

  return (
    <div style={{ borderBottom: '1px solid #EDE9FE' }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '0.45rem 0' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0, color: '#c4bfb9' }}>
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1a1a1a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {COST_CATEGORIES[line.category].emoji} {line.name}
        </span>
        {txs.length > 0 && (
          <span style={{ fontSize: '0.6rem', color: pct >= 100 ? '#ef4444' : accentColor, fontWeight: 600 }}>{pct}%</span>
        )}
        <span style={{ fontSize: '0.6rem', color: '#9ca3af', flexShrink: 0 }}>
          {line.budgeted_amount > 0 ? fmt(line.budgeted_amount, currency) : '—'}
        </span>
      </div>

      {/* Progress bar */}
      {txs.length > 0 && line.budgeted_amount > 0 && (
        <div style={{ height: 2, background: '#EDE9FE', borderRadius: 1, marginLeft: 16, marginBottom: 2 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct > 100 ? '#ef4444' : accentColor, borderRadius: 1 }} />
        </div>
      )}

      {/* Expanded: list of payments */}
      {expanded && (
        <div style={{ marginLeft: 16, marginBottom: 6 }}>
          {txs.length === 0 ? (
            <p style={{ fontSize: '0.65rem', color: '#c4bfb9', margin: '4px 0' }}>
              {isIncome ? 'No income events planned' : 'No payments scheduled'}
            </p>
          ) : (
            txs.map(tx => {
              const ms = milestones.find(m => m.id === tx.milestone_id)
              return (
                <div
                  key={tx.id}
                  onClick={() => canEdit && onEditTransaction(tx)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0', cursor: canEdit ? 'pointer' : 'default' }}
                >
                  <span style={{ fontSize: '0.65rem', flexShrink: 0 }}>{ms ? '🏁' : '📅'}</span>
                  <span style={{ flex: 1, fontSize: '0.7rem', color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description || (ms ? ms.name : tx.date)}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: '#9ca3af', flexShrink: 0 }}>
                    {ms ? ms.name : new Date(tx.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                  {tx.is_forecast && <span style={{ fontSize: '0.55rem', color: '#7C3AED', fontWeight: 700, flexShrink: 0 }}>plan</span>}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isIncome ? '#6ACA9A' : '#E86A8E', flexShrink: 0 }}>
                    {isIncome ? '+' : '-'}{fmt(tx.amount, currency)}
                  </span>
                </div>
              )
            })
          )}
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onAddPayment() }}
              style={{ fontSize: '0.65rem', color: accentColor, background: 'none', border: `1px dashed ${accentColor}40`, borderRadius: 6, cursor: 'pointer', padding: '3px 8px', fontWeight: 600, marginTop: 4 }}
            >
              + {isIncome ? 'Plan income event' : 'Schedule payment'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, color, bar }: { label: string; value: string; sub?: string; color?: string; bar?: number | null }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #EDE9FE', padding: '0.5rem 0.625rem' }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: color ?? '#1a1a1a', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.6rem', color: '#c4bfb9', marginTop: 2 }}>{sub}</div>}
      {bar != null && (
        <div style={{ height: 3, background: '#EDE9FE', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${bar}%`, background: bar > 90 ? '#ef4444' : bar > 70 ? '#f59e0b' : '#6ACA9A', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
      )}
    </div>
  )
}

function Section({ title, emoji, open, onToggle, alwaysOpen, children }: {
  title: string; emoji: string; open: boolean; onToggle?: () => void; alwaysOpen?: boolean; children: React.ReactNode
}) {
  return (
    <div style={{ borderTop: '1px solid #E8E5F0' }}>
      {!alwaysOpen && (
        <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.45rem 0.75rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontSize: '0.75rem' }}>{emoji}</span>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>{title}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', color: '#7C3AED' }}>
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {alwaysOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.45rem 0.75rem' }}>
          <span style={{ fontSize: '0.75rem' }}>{emoji}</span>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        </div>
      )}
      {(open || alwaysOpen) && children}
    </div>
  )
}

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {line
        ? <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
        : <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />}
      <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{label}</span>
    </div>
  )
}
