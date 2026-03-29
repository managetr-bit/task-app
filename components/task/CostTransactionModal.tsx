'use client'

import { useState } from 'react'
import type { CostTransaction, BudgetLine, Milestone } from '@/lib/types'
import { COST_CATEGORIES } from '@/lib/types'

type Props = {
  boardId: string
  currency: 'TRY' | 'USD'
  budgetLines: BudgetLine[]
  milestones: Milestone[]
  editing?: CostTransaction | null
  defaultBudgetLineId?: string
  defaultType?: 'cash_in' | 'cash_out'
  onClose: () => void
  onSave: (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

const currencySymbol = (c: 'TRY' | 'USD') => (c === 'TRY' ? '₺' : '$')

export function CostTransactionModal({
  currency, budgetLines, milestones, editing, defaultBudgetLineId, defaultType, onClose, onSave, onDelete,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType]               = useState<'cash_in' | 'cash_out'>(editing?.type ?? defaultType ?? 'cash_out')
  const [amount, setAmount]           = useState(editing ? String(editing.amount) : '')
  const [date, setDate]               = useState(editing?.date ?? today)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [budgetLineId, setBudgetLineId] = useState<string>(editing?.budget_line_id ?? defaultBudgetLineId ?? '')
  const [milestoneId, setMilestoneId] = useState<string>(editing?.milestone_id ?? '')
  const [milestoneOffset, setMilestoneOffset] = useState<number>(editing?.milestone_offset_days ?? 0)
  const [isForecast, setIsForecast]   = useState(editing?.is_forecast ?? false)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isRecurring, setIsRecurring] = useState(false)
  const [installCount, setInstallCount] = useState(3)
  const [installFreq, setInstallFreq] = useState<'monthly' | 'quarterly'>('monthly')

  // Suggest category from selected budget line
  const selectedLine = budgetLines.find(l => l.id === budgetLineId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ''))
    if (!parsed || parsed <= 0) return
    setSaving(true)

    if (isRecurring && !editing) {
      const perAmount = parsed / installCount
      const freqMonths = installFreq === 'monthly' ? 1 : 3
      let baseDate = new Date(date + 'T00:00:00')
      for (let i = 0; i < installCount; i++) {
        const d = new Date(baseDate)
        d.setMonth(d.getMonth() + i * freqMonths)
        const payDate = d.toISOString().slice(0, 10)
        await onSave({
          type,
          amount: perAmount,
          date: payDate,
          description: description.trim() ? `${description.trim()} (${i + 1}/${installCount})` : `Payment ${i + 1} of ${installCount}`,
          budget_line_id: budgetLineId || null,
          milestone_id: milestoneId || null,
          milestone_offset_days: milestoneId ? milestoneOffset : null,
          task_id: null,
          is_forecast: isForecast,
        })
      }
    } else {
      await onSave({
        type,
        amount: parsed,
        date,
        description: description.trim(),
        budget_line_id: budgetLineId || null,
        milestone_id: milestoneId || null,
        milestone_offset_days: milestoneId ? milestoneOffset : null,
        task_id: null,
        is_forecast: isForecast,
      })
    }
    onClose()
  }

  const sym = currencySymbol(currency)
  const isCashIn = type === 'cash_in'

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ padding: '1.75rem', maxWidth: 440, width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a' }}>
            {editing ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>

        {/* Type toggle */}
        <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, marginBottom: '1.25rem', gap: 3 }}>
          <button
            type="button"
            onClick={() => setType('cash_out')}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
              background: !isCashIn ? '#E86A8E' : 'transparent',
              color: !isCashIn ? '#fff' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            ↑ Cash Out
          </button>
          <button
            type="button"
            onClick={() => setType('cash_in')}
            style={{
              flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
              background: isCashIn ? '#6ACA9A' : 'transparent',
              color: isCashIn ? '#fff' : '#6b7280',
              transition: 'all 0.15s',
            }}
          >
            ↓ Cash In
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Amount */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Amount ({sym}) *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: '0.875rem', fontWeight: 600,
                color: isCashIn ? '#6ACA9A' : '#E86A8E',
              }}>{sym}</span>
              <input
                className="input-base"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                style={{ paddingLeft: 28, fontWeight: 600, fontSize: '1.05rem' }}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Date *</label>
            <input className="input-base" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Description</label>
            <input
              className="input-base"
              type="text"
              placeholder="Invoice #, vendor, payment reference..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Budget Line */}
          {budgetLines.length > 0 && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Budget Line</label>
              <select
                className="input-base"
                value={budgetLineId}
                onChange={e => setBudgetLineId(e.target.value)}
                style={{ fontSize: '0.8125rem' }}
              >
                <option value="">— unlinked —</option>
                {budgetLines.map(l => (
                  <option key={l.id} value={l.id}>
                    {COST_CATEGORIES[l.category]?.emoji} {l.name}
                    {l.budgeted_amount > 0 ? ` (${sym}${l.budgeted_amount.toLocaleString()})` : ''}
                  </option>
                ))}
              </select>
              {selectedLine && (
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 3 }}>
                  Category: {COST_CATEGORIES[selectedLine.category]?.label} · {selectedLine.type}
                </p>
              )}
            </div>
          )}

          {/* Milestone */}
          {milestones.length > 0 && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Milestone</label>
              <select
                className="input-base"
                value={milestoneId}
                onChange={e => {
                  const id = e.target.value
                  setMilestoneId(id)
                  setMilestoneOffset(0)
                  if (id && !editing) {
                    const ms = milestones.find(m => m.id === id)
                    if (ms) { setDate(ms.target_date); setIsForecast(true) }
                  }
                }}
                style={{ fontSize: '0.8125rem' }}
              >
                <option value="">— none —</option>
                {milestones.filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              {milestoneId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <input
                    type="number"
                    value={milestoneOffset}
                    onChange={e => {
                      const days = parseInt(e.target.value) || 0
                      setMilestoneOffset(days)
                      const ms = milestones.find(m => m.id === milestoneId)
                      if (ms) {
                        const d = new Date(ms.target_date + 'T00:00:00')
                        d.setDate(d.getDate() + days)
                        setDate(d.toISOString().slice(0, 10))
                      }
                    }}
                    style={{ width: 64, padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid #E8E5F0', fontSize: '0.8rem', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>days {milestoneOffset >= 0 ? 'after' : 'before'} milestone</span>
                </div>
              )}
            </div>
          )}

          {/* Forecast toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <div
              onClick={() => setIsForecast(p => !p)}
              style={{
                width: 36, height: 20, borderRadius: 10, background: isForecast ? '#7C3AED' : '#E5E7EB',
                position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: isForecast ? 18 : 2, width: 16, height: 16,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
            <span style={{ fontSize: '0.8125rem', color: '#4b5563' }}>Forecast (planned, not actual)</span>
          </label>

          {/* Recurring */}
          <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: isRecurring ? '0.75rem' : 0 }}>
              <div
                onClick={() => setIsRecurring(p => !p)}
                style={{
                  width: 36, height: 20, borderRadius: 10, background: isRecurring ? '#7C3AED' : '#E5E7EB',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute', top: 2, left: isRecurring ? 18 : 2, width: 16, height: 16,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
              <span style={{ fontSize: '0.8125rem', color: '#4b5563' }}>Recurring payments</span>
            </label>
            {isRecurring && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Every</span>
                <select
                  value={installFreq}
                  onChange={e => setInstallFreq(e.target.value as 'monthly' | 'quarterly')}
                  style={{ padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid #E8E5F0', fontSize: '0.8rem' }}
                >
                  <option value="monthly">month</option>
                  <option value="quarterly">quarter</option>
                </select>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>for</span>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={installCount}
                  onChange={e => setInstallCount(Math.max(2, parseInt(e.target.value) || 2))}
                  style={{ width: 52, padding: '0.25rem 0.5rem', borderRadius: 6, border: '1px solid #E8E5F0', fontSize: '0.8rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>payments</span>
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', width: '100%' }}>
                  {amount && parseFloat(amount.replace(/[^0-9.]/g, '')) > 0
                    ? `${sym}${(parseFloat(amount.replace(/[^0-9.]/g, '')) / installCount).toLocaleString(undefined, { maximumFractionDigits: 0 })} / payment`
                    : 'Enter amount above'}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            {editing && onDelete && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{ padding: '0.6rem 0.75rem', borderRadius: 10, border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                Delete
              </button>
            )}
            {confirmDelete && (
              <button
                type="button"
                onClick={async () => { await onDelete!(editing!.id); onClose() }}
                style={{ padding: '0.6rem 0.75rem', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                Confirm Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '0.6rem' }}>Cancel</button>
            <button
              type="submit"
              disabled={saving || !amount || !date}
              style={{
                flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: isCashIn ? '#6ACA9A' : '#E86A8E',
                color: '#fff', fontWeight: 700, fontSize: '0.875rem',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : editing ? 'Update' : `Add ${isCashIn ? 'Cash In' : 'Cash Out'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
