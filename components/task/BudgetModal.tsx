'use client'

import { useState, useRef } from 'react'
import type { BudgetLine, Milestone, CostCategory } from '@/lib/types'
import { COST_CATEGORIES } from '@/lib/types'

type Props = {
  currency: 'TRY' | 'USD'
  budgetLines: BudgetLine[]
  milestones: Milestone[]
  defaultLineType?: 'expense' | 'income'
  onClose: () => void
  onAdd: (data: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>) => Promise<void>
  onUpdate: (id: string, updates: Partial<BudgetLine>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onImportLines: (lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[]) => Promise<void>
}

const sym = (c: 'TRY' | 'USD') => (c === 'TRY' ? '₺' : '$')

const CATS = Object.entries(COST_CATEGORIES) as [CostCategory, { label: string; emoji: string; defaultType: 'expense' | 'income' }][]

type EditingLine = {
  id?: string
  name: string
  category: CostCategory
  type: 'expense' | 'income'
  budgeted_amount: string
  milestone_id: string
  expected_date: string
  notes: string
}

const blank = (): EditingLine => ({
  name: '', category: 'other', type: 'expense', budgeted_amount: '', milestone_id: '', expected_date: '', notes: '',
})

export function BudgetModal({ currency, budgetLines, milestones, defaultLineType, onClose, onAdd, onUpdate, onDelete, onImportLines }: Props) {
  const [editing, setEditing] = useState<EditingLine | null>(defaultLineType ? { ...blank(), type: defaultLineType, category: defaultLineType === 'income' ? 'revenue' : 'other' } : null)
  const [saving, setSaving]   = useState(false)
  const [tab, setTab]         = useState<'lines' | 'import'>('lines')
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function downloadSample() {
    setDownloading(true)
    try {
      const XLSX = await import('xlsx')

      // ── Sheet 1: Budget Template ─────────────────────────────────────────
      const headers = ['Name', 'Category', 'Type', 'Amount', 'Milestone', 'Notes']
      const sampleRows = [
        ['Foundation & Earthworks',  'materials',         'expense', 250000, milestones[0]?.name ?? 'Phase 1', 'Excavation and concrete works'],
        ['Structural Steel',          'materials',         'expense', 480000, milestones[0]?.name ?? 'Phase 1', ''],
        ['Site Labor',                'labor',             'expense', 320000, milestones[0]?.name ?? 'Phase 1', 'Monthly payroll'],
        ['Mechanical & Electrical',   'subcontractor',     'expense', 190000, milestones[1]?.name ?? 'Phase 2', 'MEP subcontractor'],
        ['Architectural Supervision', 'professional_fees', 'expense',  60000, '',                               'Monthly retainer'],
        ['Contingency Reserve',       'contingency',       'expense',  80000, '',                               '5% of total budget'],
        ['Client Advance Payment',    'revenue',           'income',  400000, '',                               'Contract milestone payment'],
        ['Progress Payment – Phase 1','revenue',           'income',  300000, milestones[1]?.name ?? 'Phase 2', ''],
      ]

      const ws1Data = [headers, ...sampleRows]
      const ws1 = XLSX.utils.aoa_to_sheet(ws1Data)

      // Column widths
      ws1['!cols'] = [
        { wch: 36 }, // Name
        { wch: 20 }, // Category
        { wch: 10 }, // Type
        { wch: 14 }, // Amount
        { wch: 24 }, // Milestone
        { wch: 36 }, // Notes
      ]

      // Style the header row (bold + light gold background)
      // SheetJS CE doesn't support cell styles, but we mark the range
      ws1['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 5, r: sampleRows.length } })

      // ── Sheet 2: Valid Categories Reference ───────────────────────────────
      const catHeaders  = ['Category Key (use in Column B)', 'Label', 'Default Type']
      const catRows = Object.entries(COST_CATEGORIES).map(([key, v]) => [key, v.label, v.defaultType])
      const ws2 = XLSX.utils.aoa_to_sheet([catHeaders, ...catRows])
      ws2['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 14 }]

      // ── Sheet 3: Instructions ─────────────────────────────────────────────
      const instructions = [
        ['BUDGET IMPORT — INSTRUCTIONS'],
        [''],
        ['1.  Fill in the "Budget Template" sheet. Do not change column order.'],
        ['2.  Name (required)      — any descriptive name for the budget line.'],
        ['3.  Category (required)  — must be one of the keys listed in the "Categories" sheet.'],
        ['4.  Type (required)      — "expense" or "income".'],
        ['5.  Amount (required)    — numeric value only, no currency symbols.'],
        ['6.  Milestone (optional) — must match exactly the milestone name in your project.'],
        ['7.  Notes (optional)     — any free-text note.'],
        [''],
        ['Save the file and upload it via the "Upload Excel" button in the Cost panel.'],
        ['CSV export also works — make sure to keep the same column order.'],
      ]
      const ws3 = XLSX.utils.aoa_to_sheet(instructions)
      ws3['!cols'] = [{ wch: 70 }]

      // ── Workbook ──────────────────────────────────────────────────────────
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws1, 'Budget Template')
      XLSX.utils.book_append_sheet(wb, ws2, 'Categories')
      XLSX.utils.book_append_sheet(wb, ws3, 'Instructions')

      XLSX.writeFile(wb, 'budget_import_template.xlsx')
    } finally {
      setDownloading(false)
    }
  }

  const totalExpense = budgetLines.filter(l => l.type === 'expense').reduce((s, l) => s + l.budgeted_amount, 0)
  const totalIncome  = budgetLines.filter(l => l.type === 'income').reduce((s, l) => s + l.budgeted_amount, 0)

  function startEdit(line?: BudgetLine) {
    if (line) {
      setEditing({ id: line.id, name: line.name, category: line.category, type: line.type, budgeted_amount: String(line.budgeted_amount), milestone_id: line.milestone_id ?? '', expected_date: line.expected_date ?? '', notes: line.notes ?? '' })
    } else {
      setEditing(blank())
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const amt = parseFloat(editing.budgeted_amount.replace(/[^0-9.]/g, '')) || 0
    const payload = {
      name: editing.name.trim(),
      category: editing.category,
      type: editing.type,
      budgeted_amount: amt,
      milestone_id: editing.milestone_id || null,
      expected_date: editing.expected_date || null,
      notes: editing.notes.trim() || null,
      position: editing.id ? (budgetLines.find(l => l.id === editing.id)?.position ?? 0) : budgetLines.length,
    }
    setSaving(true)
    if (editing.id) {
      await onUpdate(editing.id, payload)
    } else {
      await onAdd(payload)
    }
    setSaving(false)
    setEditing(null)
  }

  // ── Excel / CSV import ───────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      // Skip header row if first cell looks like a header
      const dataRows = rows[0]?.[0]?.toLowerCase().includes('name') ? rows.slice(1) : rows
      const csvText = dataRows.map(r => r.join(',')).join('\n')
      setImportText(csvText)
      setImportError('')
    } catch {
      setImportError('Could not read file. Try CSV or paste data directly.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function parseImportText(text: string): Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[] {
    const lines: Omit<BudgetLine, 'id' | 'board_id' | 'created_at'>[] = []
    const rows = text.trim().split('\n').filter(r => r.trim())
    for (let i = 0; i < rows.length; i++) {
      // Support both comma and tab separated
      const sep = rows[i].includes('\t') ? '\t' : ','
      const parts = rows[i].split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
      const [nameRaw, catRaw, typeRaw, amtRaw, msRaw, notesRaw] = parts
      if (!nameRaw) continue

      const categoryKey = catRaw?.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_') as CostCategory
      const category: CostCategory = (COST_CATEGORIES[categoryKey] ? categoryKey : 'other') as CostCategory
      const type: 'expense' | 'income' = typeRaw?.toLowerCase() === 'income' ? 'income' : 'expense'
      const amt = parseFloat(amtRaw?.replace(/[^0-9.]/g, '')) || 0
      const milestone = milestones.find(m => m.name.toLowerCase() === msRaw?.toLowerCase())

      lines.push({
        name: nameRaw,
        category,
        type,
        budgeted_amount: amt,
        milestone_id: milestone?.id ?? null,
        expected_date: milestone?.target_date ?? null,
        notes: notesRaw || null,
        position: budgetLines.length + lines.length,
      })
    }
    return lines
  }

  async function handleImport() {
    if (!importText.trim()) return
    const parsed = parseImportText(importText)
    if (parsed.length === 0) { setImportError('No valid rows found. Check the format.'); return }
    setImporting(true)
    await onImportLines(parsed)
    setImporting(false)
    setImportText('')
    setTab('lines')
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={{ padding: 0, maxWidth: 600, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1.5px solid #E8E5E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Budget Lines</h2>
            {budgetLines.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.15rem 0 0' }}>
                {sym(currency)}{totalExpense.toLocaleString()} expenses · {sym(currency)}{totalIncome.toLocaleString()} income
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E8E5E0', background: '#FAFAFA', flexShrink: 0 }}>
          {(['lines', 'import'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '0.625rem', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#c9a96e' : '#9ca3af',
              borderBottom: tab === t ? '2px solid #c9a96e' : '2px solid transparent',
            }}>
              {t === 'lines' ? '📋 Budget Lines' : '📂 Import from Excel'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>

          {/* ── Budget Lines tab ── */}
          {tab === 'lines' && (
            <>
              {budgetLines.length === 0 && !editing && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9ca3af' }}>
                  <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💼</p>
                  <p style={{ fontSize: '0.875rem' }}>No budget lines yet.</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Add lines or import from Excel.</p>
                </div>
              )}

              {/* Line list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {budgetLines.map(line => (
                  confirmDeleteId === line.id ? (
                    <div key={line.id} style={{ background: '#fef2f2', borderRadius: 10, padding: '0.6rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#ef4444', flex: 1 }}>Delete "{line.name}"?</span>
                      <button onClick={async () => { await onDelete(line.id); setConfirmDeleteId(null) }} style={{ padding: '0.3rem 0.625rem', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ padding: '0.3rem 0.625rem', borderRadius: 7, border: '1.5px solid #E8E5E0', background: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>No</button>
                    </div>
                  ) : (
                    <div
                      key={line.id}
                      style={{ background: '#fff', borderRadius: 10, border: '1.5px solid #E8E5E0', padding: '0.625rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}
                      onClick={() => startEdit(line)}
                    >
                      <span style={{ fontSize: '1rem' }}>{COST_CATEGORIES[line.category]?.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          {COST_CATEGORIES[line.category]?.label}
                          {line.milestone_id && milestones.find(m => m.id === line.milestone_id) && ` · ${milestones.find(m => m.id === line.milestone_id)!.name}`}
                          {line.expected_date && <span style={{ color: '#c9a96e' }}> · {line.expected_date}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: line.type === 'income' ? '#6ACA9A' : '#1a1a1a' }}>
                          {line.type === 'income' ? '+' : ''}{sym(currency)}{line.budgeted_amount.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#c4bfb9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{line.type}</div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(line.id) }}
                        style={{ color: '#c4bfb9', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem', lineHeight: 1 }}
                      >🗑</button>
                    </div>
                  )
                ))}
              </div>

              {/* Edit/Add form */}
              {editing ? (
                <form onSubmit={handleSave} style={{ background: '#FAFAFA', borderRadius: 12, border: '1.5px solid #c9a96e', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Name *</label>
                      <input className="input-base" value={editing.name} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} placeholder="e.g. Structural Works" required style={{ fontSize: '0.8125rem' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Type *</label>
                      <select className="input-base" value={editing.type} onChange={e => setEditing(p => p ? { ...p, type: e.target.value as 'expense' | 'income' } : p)} style={{ fontSize: '0.8125rem' }}>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Category</label>
                      <select className="input-base" value={editing.category} onChange={e => setEditing(p => p ? { ...p, category: e.target.value as CostCategory } : p)} style={{ fontSize: '0.8125rem' }}>
                        {CATS.map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Budget ({sym(currency)}) *</label>
                      <input className="input-base" type="text" inputMode="decimal" placeholder="0" value={editing.budgeted_amount} onChange={e => setEditing(p => p ? { ...p, budgeted_amount: e.target.value } : p)} required style={{ fontSize: '0.8125rem' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Linked Milestone / Phase</label>
                    {milestones.length > 0 ? (
                      <select
                        className="input-base"
                        value={editing.milestone_id}
                        onChange={e => {
                          const id = e.target.value
                          const ms = milestones.find(m => m.id === id)
                          setEditing(p => p ? {
                            ...p,
                            milestone_id: id,
                            expected_date: id && ms ? ms.target_date : p.expected_date,
                          } : p)
                        }}
                        style={{ fontSize: '0.8125rem' }}
                      >
                        <option value="">— not linked —</option>
                        {milestones.map(m => <option key={m.id} value={m.id}>{m.name} ({m.target_date})</option>)}
                      </select>
                    ) : (
                      <div style={{ fontSize: '0.72rem', color: '#c4bfb9', padding: '0.45rem 0.625rem', border: '1.5px solid #E8E5E0', borderRadius: 8, background: '#FAFAFA' }}>
                        No milestones yet — add them from the <strong>Timeline</strong> tab to link budget items to project phases.
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>
                      Expected Date
                      <span style={{ fontWeight: 400, color: '#c4bfb9', marginLeft: 4 }}>— when this cost / income is expected to occur</span>
                    </label>
                    <input
                      className="input-base"
                      type="date"
                      value={editing.expected_date}
                      onChange={e => setEditing(p => p ? { ...p, expected_date: e.target.value } : p)}
                      style={{ fontSize: '0.8125rem' }}
                    />
                    {editing.milestone_id && (() => {
                      const ms = milestones.find(m => m.id === editing.milestone_id)
                      return ms ? (
                        <p style={{ fontSize: '0.68rem', color: '#c9a96e', marginTop: 3 }}>
                          Auto-set from milestone "{ms.name}" · {ms.target_date}
                        </p>
                      ) : null
                    })()}
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3 }}>Notes</label>
                    <input className="input-base" type="text" placeholder="Optional note" value={editing.notes} onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)} maxLength={200} style={{ fontSize: '0.8125rem' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setEditing(null)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>Cancel</button>
                    <button type="submit" disabled={saving} className="btn-primary" style={{ flex: 2, justifyContent: 'center', padding: '0.5rem', fontSize: '0.8125rem' }}>
                      {saving ? 'Saving…' : editing.id ? 'Update Line' : 'Add Line'}
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => startEdit()} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '0.6rem', fontSize: '0.8125rem', border: '1.5px dashed #E8E5E0', borderRadius: 10 }}>
                  + Add Budget Line
                </button>
              )}
            </>
          )}

          {/* ── Import tab ── */}
          {tab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Download sample — prominent CTA */}
              <div style={{ background: 'linear-gradient(135deg, #fdf6ed 0%, #fef9f3 100%)', borderRadius: 12, border: '1.5px solid #e8d5b0', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem', lineHeight: 1, flexShrink: 0 }}>📥</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '0.2rem' }}>Download Sample Excel</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '0.625rem' }}>
                      Pre-formatted template with sample rows, valid category list, and import instructions — ready to fill in Excel or Numbers.
                    </p>
                    <button
                      type="button"
                      onClick={downloadSample}
                      disabled={downloading}
                      style={{
                        padding: '0.5rem 1rem', borderRadius: 8, border: 'none',
                        background: downloading ? '#e8d5b0' : '#c9a96e',
                        color: '#fff', fontWeight: 700, fontSize: '0.8125rem',
                        cursor: downloading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                      }}
                    >
                      {downloading ? '⏳ Generating…' : '⬇ budget_import_template.xlsx'}
                    </button>
                  </div>
                </div>
                {milestones.length > 0 && (
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.625rem', borderTop: '1px solid #e8d5b0', paddingTop: '0.5rem' }}>
                    ✓ Your {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} ({milestones.slice(0, 3).map(m => m.name).join(', ')}{milestones.length > 3 ? '…' : ''}) are pre-filled in the sample rows.
                  </p>
                )}
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 1, background: '#E8E5E0' }} />
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500 }}>then upload your filled file</span>
                <div style={{ flex: 1, height: 1, background: '#E8E5E0' }} />
              </div>

              {/* File upload */}
              <div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1.5px dashed #c4bfb9', background: '#FAFAFA', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <span>📂</span> Upload filled Excel (.xlsx) or CSV
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 1, background: '#E8E5E0' }} />
                <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>or paste CSV data directly</span>
                <div style={{ flex: 1, height: 1, background: '#E8E5E0' }} />
              </div>

              <textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportError('') }}
                placeholder={'Foundation Works,materials,expense,500000,Phase 1,\nConsulting Fees,professional_fees,expense,80000,,Initial review'}
                style={{ width: '100%', minHeight: 120, borderRadius: 10, border: '1.5px solid #E8E5E0', padding: '0.75rem', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box', color: '#1a1a1a', background: '#fff', lineHeight: 1.6 }}
              />

              {importError && <p style={{ fontSize: '0.8rem', color: '#ef4444' }}>{importError}</p>}

              {importText.trim() && (
                <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '0.75rem', border: '1px solid #BBF7D0' }}>
                  <p style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>
                    Preview: {parseImportText(importText).length} lines detected
                  </p>
                  {parseImportText(importText).slice(0, 3).map((l, i) => (
                    <p key={i} style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.2rem' }}>
                      {COST_CATEGORIES[l.category]?.emoji} {l.name} — {sym(currency)}{l.budgeted_amount.toLocaleString()} ({l.type})
                    </p>
                  ))}
                  {parseImportText(importText).length > 3 && (
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>…and {parseImportText(importText).length - 3} more</p>
                  )}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: 'none', background: '#c9a96e', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', opacity: importing || !importText.trim() ? 0.6 : 1 }}
              >
                {importing ? 'Importing…' : `Import ${parseImportText(importText).length} Lines`}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.875rem 1.5rem', borderTop: '1.5px solid #E8E5E0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '0.8125rem' }}>Done</button>
        </div>
      </div>
    </div>
  )
}
