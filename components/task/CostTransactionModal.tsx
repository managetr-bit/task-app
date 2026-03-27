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
  onClose: () => void
  onSave: (data: Omit<CostTransaction, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

const currencySymbol = (c: 'TRY' | 'USD') => (c === 'TRY' ? '₺' : '$')

export function CostTransactionModal({
  currency, budgetLines, milestones, editing, onClose, onSave, onDelete,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [type, setType]               = useState<'cash_in' | 'cash_out'>(editing?.type ?? 'cash_out')
  const [amount, setAmount]           = useState(editing ? String(editing.amount) : '')
  const [date, setDate]               = useState(editing?.date ?? today)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [budgetLineId, setBudgetLineId] = useState<string>(editing?.budget_line_id ?? '')
  const [milestoneId, setMilestoneId] = useState<string>(editing?.milestone_id ?? '')
  const [isForecast, setIsForecast]   = useState(editing?.is_forecast ?? false)
  const [saving, setSaving]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Suggest category from selected budget line
  const selectedLine = budgetLines.find(l => l.id === budgetLineId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ''))
    if (!parsed || parsed <= 0) return
    setSaving(true)
    await onSave({
      type,
      amount: parsed,
      date,
      description: description.trim(),
      budget_line_id: budgetLineId || null,
      milestone_id:   milestoneId  || null,
      task_id:        null,
      is_forecast:    isForecast,
    })
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
                onChange={e => setMilestoneId(e.target.value)}
                style={{ fontSize: '0.8125rem' }}
              >
                <option value="">— none —</option>
                {milestones.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Forecast toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <div
              onClick={() => setIsForecast(p => !p)}
              style={{
                width: 36, height: 20, borderRadius: 10, background: isForecast ? '#c9a96e' : '#E5E7EB',
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
