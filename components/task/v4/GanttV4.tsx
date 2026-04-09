'use client'

import React, { useState, useMemo, useRef, useCallback } from 'react'
import { type Milestone, type CostTransaction, type Board } from '@/lib/types'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:        '#320075',
  primaryCont:    '#4a1d96',
  onPrimary:      '#ffffff',
  onSurface:      '#131b2e',
  onSurfaceVar:   '#4a4452',
  surface:        '#faf8ff',
  surfLowest:     '#ffffff',
  surfLow:        '#f2f3ff',
  surfCont:       '#eaedff',
  surfHigh:       '#e2e7ff',
  surfHighest:    '#dae2fd',
  outline:        '#7b7484',
  outlineVar:     '#ccc3d4',
  tint:           '#6d46bb',
  error:          '#ba1a1a',
  errorCont:      '#ffdad6',
  tertiary:       '#002e1d',
} as const

// ─── Types ────────────────────────────────────────────────────────────────────
type Timeframe = 'monthly' | 'quarterly'
type Period    = { label: string; start: Date; end: Date; key: string }
type DepLink   = { from: string; to: string }

type ProcessMilestone = {
  id: string; num: number; label: string; why: string
  startFrac: number; endFrac: number; major: boolean
}
type WorkItem = {
  id: string; name: string; color: string
  startFrac: number; endFrac: number
  milestones: ProcessMilestone[]
}
type MilestonePopover =
  | { mode: 'create'; x: number; y: number; phaseId: string }
  | { mode: 'edit';   ms: Milestone; x: number; y: number }

export type GanttV4Props = {
  board: Board
  milestones: Milestone[]
  costTransactions?: CostTransaction[]
  currency?: 'TRY' | 'USD'
  onAddMilestone?:        (name: string, date: string) => Promise<void>
  onUpdateMilestoneDate?: (id: string, date: string)   => Promise<void>
  onUpdateMilestoneName?: (id: string, name: string)   => Promise<void>
  onDeleteMilestone?:     (id: string)                  => Promise<void>
  onCompleteMilestone?:   (id: string, ok: boolean)    => Promise<void>
}

// ─── Work items (Ana İş Kalemleri) ───────────────────────────────────────────
const WORK_ITEMS: WorkItem[] = [
  {
    id: 'p1', color: '#7C3AED', name: 'İş Geliştirme ve Satış',
    startFrac: 0.00, endFrac: 0.10,
    milestones: [
      { id: 'km1', num: 1, label: 'Ön Anlaşma',   startFrac: 0.00, endFrac: 0.06, major: false, why: 'Arsa sahibiyle ticari şartların mutabakatı; ön protokol.' },
      { id: 'km2', num: 2, label: 'Tapu Şerhi',    startFrac: 0.04, endFrac: 0.10, major: true,  why: 'Noterli KKİS imzası ve tapuya şerh. Hukuki zemin tamamlanır.' },
    ],
  },
  {
    id: 'p2', color: '#2563EB', name: 'Tasarım ve Mühendislik',
    startFrac: 0.06, endFrac: 0.28,
    milestones: [
      { id: 'km3', num: 3, label: 'Zemin Etüdü',    startFrac: 0.06, endFrac: 0.12, major: false, why: 'Yanlış zemin verisi kaba inşaat bütçesini %20 artırabilir.' },
      { id: 'km4', num: 4, label: 'Konsept Proje',   startFrac: 0.10, endFrac: 0.16, major: false, why: 'Ön satış materyallerine olanak sağlar.' },
      { id: 'km5', num: 5, label: 'Avan Proje',      startFrac: 0.15, endFrac: 0.21, major: false, why: 'Emsal ve imar haklarının yasallaşması.' },
      { id: 'km6', num: 6, label: 'Uyg. Projeleri',  startFrac: 0.19, endFrac: 0.24, major: false, why: 'Statik, elektrik, mekanik projelerinin tamamlanması.' },
      { id: 'km7', num: 7, label: 'Yapı Ruhsatı',    startFrac: 0.22, endFrac: 0.28, major: true,  why: 'İnşaatın resmi başlangıç tetikleyicisi. Banka kredisi için zorunlu.' },
    ],
  },
  {
    id: 'p3', color: '#EA580C', name: 'Kaba Yapı',
    startFrac: 0.24, endFrac: 0.54,
    milestones: [
      { id: 'km8',  num: 8,  label: 'Mobilizasyon', startFrac: 0.24, endFrac: 0.29, major: false, why: 'Şantiye kontrolünün ele alınması.' },
      { id: 'km9',  num: 9,  label: 'Hafriyat',     startFrac: 0.28, endFrac: 0.34, major: false, why: 'Temel için en büyük fiziksel riskin geçilmesi.' },
      { id: 'km10', num: 10, label: 'Temel',         startFrac: 0.33, endFrac: 0.39, major: false, why: 'Sıfır kota ulaşma; finansal hakediş noktası.' },
      { id: 'km11', num: 11, label: 'Normal Katlar', startFrac: 0.38, endFrac: 0.46, major: false, why: 'Periyodik üretim hızı kontrolü.' },
      { id: 'km12', num: 12, label: 'Alt İhale',     startFrac: 0.43, endFrac: 0.49, major: false, why: 'İnce işçilerin sahaya girişi için kilit geçiş.' },
      { id: 'km13', num: 13, label: 'Karkas Sonu',   startFrac: 0.46, endFrac: 0.54, major: true,  why: 'Kaba imalatın teknik kabulü.' },
    ],
  },
  {
    id: 'p4', color: '#0D9488', name: 'İnce İşler ve Çevre',
    startFrac: 0.48, endFrac: 0.93,
    milestones: [
      { id: 'km14', num: 14, label: 'Cephe',          startFrac: 0.48, endFrac: 0.54, major: false, why: 'Dış izolasyon sürecinin başlangıcı.' },
      { id: 'km15', num: 15, label: 'Watertight',     startFrac: 0.52, endFrac: 0.59, major: true,  why: 'Islak hasar riski kapanır.' },
      { id: 'km16', num: 16, label: 'Duvar/Sıva',     startFrac: 0.58, endFrac: 0.64, major: false, why: 'Oda hacimlerinin ortaya çıkması.' },
      { id: 'km17', num: 17, label: 'Yalıtım Testi',  startFrac: 0.62, endFrac: 0.68, major: false, why: 'Su sızıntısı riskinin elimine edilmesi.' },
      { id: 'km18', num: 18, label: 'Ağır Sistemler', startFrac: 0.66, endFrac: 0.72, major: false, why: 'Asansör, trafo, hidrofor kurulumu.' },
      { id: 'km19', num: 19, label: 'Örnek Daire',    startFrac: 0.70, endFrac: 0.76, major: true,  why: 'Seri imalata geçmeden kalite standardının tescili.' },
      { id: 'km20', num: 20, label: 'Mobilya/Kapı',   startFrac: 0.74, endFrac: 0.80, major: false, why: 'Mahal Listesi\'nin seri uygulanması.' },
      { id: 'km21', num: 21, label: 'Final Boya',     startFrac: 0.78, endFrac: 0.85, major: false, why: 'Son estetik dokunuşlar.' },
      { id: 'km22', num: 22, label: 'Peyzaj',         startFrac: 0.83, endFrac: 0.89, major: false, why: 'İskan için aranan şart.' },
      { id: 'km23', num: 23, label: 'Snag List',      startFrac: 0.87, endFrac: 0.93, major: false, why: 'Son teknik kontrol.' },
    ],
  },
  {
    id: 'p5', color: '#059669', name: 'Teslimat ve Kapanış',
    startFrac: 0.88, endFrac: 1.00,
    milestones: [
      { id: 'km24', num: 24, label: 'Teknik Kabul', startFrac: 0.88, endFrac: 0.93, major: false, why: 'İtfaiye onayı ve yangın sistemleri testleri.' },
      { id: 'km25', num: 25, label: 'İskan',        startFrac: 0.91, endFrac: 0.97, major: true,  why: 'Tapu devri için zorunlu.' },
      { id: 'km26', num: 26, label: 'Tapu Devri',   startFrac: 0.95, endFrac: 1.00, major: false, why: 'Geliştiricinin finansal çıkışı.' },
    ],
  },
]

const DEFAULT_DEPS: DepLink[] = [
  { from: 'p1', to: 'p2' },
  { from: 'p2', to: 'p3' },
  { from: 'p3', to: 'p4' },
  { from: 'p4', to: 'p5' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computePeriods(start: Date, end: Date, tf: Timeframe): Period[] {
  const ps: Period[] = []
  if (tf === 'quarterly') {
    const c = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 3, 0)
      const q = Math.floor(c.getMonth() / 3) + 1
      ps.push({ label: `Q${q} '${String(c.getFullYear()).slice(2)}`, start: new Date(c), end: pEnd, key: `${c.getFullYear()}-Q${q}` })
      c.setMonth(c.getMonth() + 3)
    }
  } else {
    const c = new Date(start.getFullYear(), start.getMonth(), 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 1, 0)
      ps.push({
        label: c.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }).toUpperCase(),
        start: new Date(c), end: pEnd,
        key: `${c.getFullYear()}-${c.getMonth()}`,
      })
      c.setMonth(c.getMonth() + 1)
    }
  }
  return ps
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LABEL_W  = 210
const ROW_H    = 64
const BAR_H    = 20   // task bar height
const BAR_Y    = (ROW_H - BAR_H) / 2   // bar top offset within row
const D_SIZE   = 9    // diamond size (all standardized)
const HDR_H    = 44   // period header height
const CF_ROW_H = 48   // cash flow row height

// ─── Standardized milestone diamond ──────────────────────────────────────────
function KmDiamond({
  frac, color, label, why, num, major,
}: {
  frac: number; color: string; label: string; why: string; num: number; major: boolean
}) {
  const [tip, setTip] = useState(false)
  return (
    <div
      style={{
        position: 'absolute',
        left: `${frac * 100}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: tip ? 20 : 5,
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <div style={{
        width: D_SIZE + (major ? 2 : 0),
        height: D_SIZE + (major ? 2 : 0),
        background: major ? color : C.surfLowest,
        border: `2px solid ${color}`,
        borderRadius: 2,
        transform: 'rotate(45deg)',
        boxShadow: major ? `0 2px 8px ${color}55` : `0 1px 4px rgba(0,0,0,0.12)`,
        cursor: 'default',
      }} />
      {tip && (
        <div style={{
          position: 'absolute',
          bottom: `calc(100% + 10px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          background: C.onSurface,
          color: '#CBD5E1',
          fontSize: '0.6rem',
          lineHeight: 1.6,
          padding: '0.5rem 0.75rem',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(19,27,46,0.32)',
          width: 210,
          whiteSpace: 'normal',
          zIndex: 60,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.63rem', marginBottom: '0.2rem' }}>
            KM {num} — {label}
          </div>
          {why}
          <div style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${C.onSurface}`,
          }} />
        </div>
      )}
    </div>
  )
}

// ─── Project milestone diamond ────────────────────────────────────────────────
function ProjDiamond({
  ms, pctFn, onEdit,
}: {
  ms: Milestone
  pctFn: (d: Date) => number
  onEdit: (ms: Milestone, x: number, y: number) => void
}) {
  const p = pctFn(new Date(ms.target_date + 'T00:00:00'))
  if (p < 0 || p > 100) return null
  const done  = !!ms.completed_at
  const color = done ? '#10B981' : '#F59E0B'
  return (
    <div
      title={`${ms.name} · ${ms.target_date}`}
      style={{
        position: 'absolute',
        left: `${p}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 32,
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={(e) => { e.stopPropagation(); onEdit(ms, e.clientX, e.clientY) }}
    >
      <div style={{
        width: D_SIZE, height: D_SIZE,
        background: color,
        border: `2.5px solid ${C.surfLowest}`,
        outline: `2px solid ${color}`,
        borderRadius: 2,
        transform: 'rotate(45deg)',
        boxShadow: `0 2px 10px ${color}66`,
      }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function GanttV4({
  board, milestones,
  costTransactions = [],
  currency,
  onAddMilestone, onUpdateMilestoneDate,
  onUpdateMilestoneName, onDeleteMilestone, onCompleteMilestone,
}: GanttV4Props) {
  const SYM = (currency ?? board.currency) === 'TRY' ? '₺' : '$'

  const [tf,          setTf]          = useState<Timeframe>('monthly')
  const [deps,        setDeps]        = useState<DepLink[]>(DEFAULT_DEPS)
  const [connectMode, setConnectMode] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [msPopover,   setMsPopover]   = useState<MilestonePopover | null>(null)
  const [popName,     setPopName]     = useState('')
  const [popDate,     setPopDate]     = useState('')
  const [popSaving,   setPopSaving]   = useState(false)

  const timelineRef = useRef<HTMLDivElement>(null)

  // ── date range ──────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const ts: number[] = []
    milestones.forEach(m => ts.push(new Date(m.target_date + 'T00:00:00').getTime()))
    costTransactions.forEach(t => ts.push(new Date(t.date + 'T00:00:00').getTime()))
    if (!ts.length) {
      const now = new Date()
      return {
        rangeStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        rangeEnd:   new Date(now.getFullYear(), now.getMonth() + 13, 0),
      }
    }
    const s = new Date(Math.min(...ts)); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(Math.max(...ts)); e.setMonth(e.getMonth() + 2); e.setDate(0)
    return { rangeStart: s, rangeEnd: e }
  }, [milestones, costTransactions])

  const periods = useMemo(() => computePeriods(rangeStart, rangeEnd, tf), [rangeStart, rangeEnd, tf])
  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const pct     = useCallback((d: Date) =>
    Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100)),
    [rangeStart, totalMs])

  const today    = new Date()
  const todayPct = pct(today)
  const todayOn  = todayPct > 0 && todayPct < 100

  // ── shared primitives ───────────────────────────────────────────────────────
  const TodayLine = () => todayOn ? (
    <div style={{
      position: 'absolute', top: 0, bottom: 0,
      left: `${todayPct}%`, width: 1.5,
      background: C.tint, opacity: 0.55,
      boxShadow: `0 0 6px ${C.tint}`, pointerEvents: 'none', zIndex: 4,
    }} />
  ) : null

  const GridBg = () => (
    <>
      {periods.map(p => {
        const isNow = today >= p.start && today <= p.end
        return (
          <div key={p.key} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(p.start)}%`,
            width: `${pct(p.end) - pct(p.start)}%`,
            background: isNow ? `${C.primary}07` : 'transparent',
            borderRight: `1px solid ${C.outlineVar}28`,
            pointerEvents: 'none',
          }} />
        )
      })}
    </>
  )

  // ── cash flow ───────────────────────────────────────────────────────────────
  function fmtK(n: number) {
    const abs = Math.abs(n)
    const s = abs >= 1_000_000 ? `${(abs/1_000_000).toFixed(1)}M`
            : abs >= 1_000     ? `${(abs/1_000).toFixed(0)}K`
            : abs.toFixed(0)
    return (n < 0 ? '-' : '') + SYM + s
  }

  const cashIn  = costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast)
  const cashOut = costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast)
  const pIn  = useMemo(() => { const a = periods.map(() => 0); cashIn.forEach(t  => { const d = new Date(t.date+'T00:00:00').getTime(); for(let i=0;i<periods.length;i++) if(d>=periods[i].start.getTime()&&d<=periods[i].end.getTime()){a[i]+=t.amount;break;} }); return a }, [cashIn, periods])
  const pOut = useMemo(() => { const a = periods.map(() => 0); cashOut.forEach(t => { const d = new Date(t.date+'T00:00:00').getTime(); for(let i=0;i<periods.length;i++) if(d>=periods[i].start.getTime()&&d<=periods[i].end.getTime()){a[i]+=t.amount;break;} }); return a }, [cashOut, periods])
  const pNet = useMemo(() => pIn.map((v,i) => v - pOut[i]), [pIn, pOut])
  const pCum = useMemo(() => pNet.map((_,i) => pNet.slice(0,i+1).reduce((a,b)=>a+b,0)), [pNet])

  // ── dependency helpers ──────────────────────────────────────────────────────
  function toggleDep(from: string, to: string) {
    setDeps(prev => {
      const exists = prev.some(d => d.from === from && d.to === to)
      return exists ? prev.filter(d => !(d.from === from && d.to === to)) : [...prev, { from, to }]
    })
  }
  function handleBarClick(phaseId: string) {
    if (!connectMode) return
    if (!connectFrom) {
      setConnectFrom(phaseId)
    } else {
      if (connectFrom !== phaseId) toggleDep(connectFrom, phaseId)
      setConnectFrom(null)
      setConnectMode(false)
    }
  }

  // ── SVG dep arrows ──────────────────────────────────────────────────────────
  // Drawn inside the timeline area with viewBox="0 0 1000 {totalH}"
  const totalPhaseH = WORK_ITEMS.length * ROW_H
  const SVG_W = 1000

  const depArrows = deps.map(dep => {
    const fi = WORK_ITEMS.findIndex(w => w.id === dep.from)
    const ti = WORK_ITEMS.findIndex(w => w.id === dep.to)
    if (fi < 0 || ti < 0) return null
    const fw = WORK_ITEMS[fi]
    const tw = WORK_ITEMS[ti]
    // source: right edge of from bar
    const x1 = pct(new Date(rangeStart.getTime() + fw.endFrac * totalMs)) / 100 * SVG_W
    const y1 = fi * ROW_H + ROW_H / 2
    // target: left edge of to bar
    const x2 = pct(new Date(rangeStart.getTime() + tw.startFrac * totalMs)) / 100 * SVG_W
    const y2 = ti * ROW_H + ROW_H / 2
    const cpX = (x1 + x2) / 2
    const d   = `M ${x1} ${y1} C ${cpX} ${y1} ${cpX} ${y2} ${x2} ${y2}`
    // arrowhead at (x2, y2)
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const aw = 6
    const ah = 10
    const ax1 = x2 - ah * Math.cos(angle) + aw * Math.sin(angle)
    const ay1 = y2 - ah * Math.sin(angle) - aw * Math.cos(angle)
    const ax2 = x2 - ah * Math.cos(angle) - aw * Math.sin(angle)
    const ay2 = y2 - ah * Math.sin(angle) + aw * Math.cos(angle)
    const arrowD = `M ${x2} ${y2} L ${ax1} ${ay1} L ${ax2} ${ay2} Z`
    return { key: `${dep.from}-${dep.to}`, d, arrowD, from: dep.from, to: dep.to }
  }).filter(Boolean)

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{ background: C.surfLowest, fontFamily: 'Inter, sans-serif' }}>

      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.6rem 1.25rem',
        borderBottom: `1px solid ${C.outlineVar}33`,
        background: C.surfLowest,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: 7, height: 7, border: `2px solid ${C.primary}`, transform: 'rotate(45deg)', borderRadius: 1 }} />
            <span style={{ fontSize: '0.6rem', color: C.outline, fontWeight: 600 }}>Standart KM</span>
          </div>
          <div style={{ width: 1, height: 14, background: C.outlineVar }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <div style={{ width: 7, height: 7, background: '#F59E0B', borderRadius: 1, transform: 'rotate(45deg)' }} />
            <span style={{ fontSize: '0.6rem', color: C.outline, fontWeight: 600 }}>Proje Milestone</span>
          </div>
          <div style={{ width: 1, height: 14, background: C.outlineVar }} />
          {/* Connect mode */}
          <button
            onClick={() => { setConnectMode(m => !m); setConnectFrom(null) }}
            title="İki iş kalemi arasında bağımlılık oluştur"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.22rem 0.65rem', borderRadius: 99,
              border: connectMode ? `1.5px solid ${C.primary}` : `1px solid ${C.outlineVar}`,
              background: connectMode ? `${C.primary}10` : 'transparent',
              color: connectMode ? C.primary : C.outline,
              fontSize: '0.63rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>⟶</span>
            {connectMode ? (connectFrom ? 'Hedef seç…' : 'Kaynak seç…') : 'Bağımlılık Ekle'}
          </button>
          {connectMode && (
            <button
              onClick={() => { setConnectMode(false); setConnectFrom(null) }}
              style={{ fontSize: '0.6rem', color: C.outline, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.25rem' }}
            >
              ✕ İptal
            </button>
          )}
        </div>

        {/* Timeframe toggle */}
        <div style={{ display: 'flex', background: C.surfCont, borderRadius: 8, padding: 3, gap: 2 }}>
          {(['monthly', 'quarterly'] as Timeframe[]).map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              padding: '0.22rem 0.7rem', borderRadius: 6,
              fontSize: '0.64rem', fontWeight: 700,
              cursor: 'pointer', border: 'none',
              background: tf === t ? C.surfLowest : 'transparent',
              color: tf === t ? C.primary : C.outline,
              boxShadow: tf === t ? '0 1px 4px rgba(19,27,46,0.10)' : 'none',
            }}>
              {t === 'monthly' ? 'Aylık' : 'Çeyreklik'}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt grid */}
      <div style={{ overflowX: 'auto' }} ref={timelineRef}>
        <div style={{ minWidth: LABEL_W + periods.length * (tf === 'quarterly' ? 110 : 80) }}>

          {/* Period header */}
          <div style={{
            display: 'flex', height: HDR_H,
            background: C.surfHighest,
            borderBottom: `1px solid ${C.outlineVar}44`,
            position: 'sticky', top: 0, zIndex: 15,
          }}>
            <div style={{
              width: LABEL_W, flexShrink: 0,
              display: 'flex', alignItems: 'center', padding: '0 1.25rem',
              borderRight: `1px solid ${C.outlineVar}33`,
              background: C.surfHighest,
            }}>
              <span style={{ fontSize: '0.57rem', fontWeight: 800, color: C.outline, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ana İş Kalemleri
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
              {periods.map(p => {
                const isNow = today >= p.start && today <= p.end
                return (
                  <div key={p.key} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: `1px solid ${C.outlineVar}33`,
                    background: isNow ? `${C.primary}0d` : 'transparent',
                  }}>
                    <span style={{
                      fontSize: '0.59rem', fontWeight: isNow ? 800 : 600,
                      color: isNow ? C.primary : C.outline,
                      letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>
                      {p.label}{isNow ? ' ◦' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Work item rows + SVG dep layer */}
          <div style={{ position: 'relative' }}>

            {/* SVG dependency arrows — absolute overlay */}
            {depArrows.length > 0 && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0, left: LABEL_W, right: 0,
                  width: `calc(100% - ${LABEL_W}px)`,
                  height: totalPhaseH,
                  pointerEvents: 'none',
                  zIndex: 6,
                  overflow: 'visible',
                }}
                viewBox={`0 0 ${SVG_W} ${totalPhaseH}`}
                preserveAspectRatio="none"
              >
                {depArrows.map(a => a && (
                  <g key={a.key}>
                    <path
                      d={a.d}
                      fill="none"
                      stroke={C.outlineVar}
                      strokeWidth="1.8"
                      strokeDasharray="none"
                      opacity="0.7"
                    />
                    <path
                      d={a.arrowD}
                      fill={C.outlineVar}
                      opacity="0.7"
                    />
                    {/* Invisible wider stroke for click target */}
                    <path
                      d={a.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      onClick={() => toggleDep(a.from, a.to)}
                    />
                  </g>
                ))}
              </svg>
            )}

            {/* Work item rows */}
            {WORK_ITEMS.map((item, idx) => {
              const startPct = pct(new Date(rangeStart.getTime() + item.startFrac * totalMs))
              const endPct   = pct(new Date(rangeStart.getTime() + item.endFrac   * totalMs))
              const barWidth = endPct - startPct

              // Project milestones for this work item
              const itemStartMs = rangeStart.getTime() + item.startFrac * totalMs
              const itemEndMs   = rangeStart.getTime() + item.endFrac   * totalMs
              const itemMs = milestones.filter(m => {
                const t = new Date(m.target_date + 'T00:00:00').getTime()
                return t >= itemStartMs && t <= itemEndMs
              })

              const isConnectSource = connectMode && connectFrom === item.id
              const isConnectable   = connectMode

              return (
                <div key={item.id} style={{
                  display: 'flex',
                  height: ROW_H,
                  borderBottom: `1px solid ${C.outlineVar}22`,
                  background: isConnectSource ? `${item.color}08` : C.surfLowest,
                  transition: 'background 0.15s',
                }}>

                  {/* Label */}
                  <div style={{
                    width: LABEL_W, flexShrink: 0,
                    height: ROW_H,
                    display: 'flex', alignItems: 'center',
                    padding: '0 1.25rem 0 1rem',
                    borderRight: `3px solid ${item.color}`,
                    background: C.surfLow,
                    gap: '0.5rem',
                    cursor: isConnectable ? 'crosshair' : 'default',
                  }}
                  onClick={() => handleBarClick(item.id)}
                  >
                    <div style={{
                      width: 10, height: 10, flexShrink: 0,
                      background: `${item.color}20`,
                      border: `2px solid ${item.color}`,
                      borderRadius: 3,
                    }} />
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700,
                      color: isConnectSource ? item.color : C.onSurface,
                      lineHeight: 1.3, letterSpacing: '-0.01em',
                    }}>
                      {item.name}
                    </span>
                  </div>

                  {/* Timeline lane */}
                  <div
                    style={{
                      flex: 1, position: 'relative', overflow: 'visible',
                      cursor: connectMode ? 'crosshair' : (onAddMilestone ? 'crosshair' : 'default'),
                    }}
                    onClick={(e) => {
                      if (connectMode) { handleBarClick(item.id); return }
                      if (!onAddMilestone) return
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                      const frac = (e.clientX - rect.left) / rect.width
                      const dt   = new Date(rangeStart.getTime() + frac * totalMs)
                      setPopName('')
                      setPopDate(dt.toISOString().split('T')[0])
                      setMsPopover({ mode: 'create', x: e.clientX, y: e.clientY, phaseId: item.id })
                    }}
                  >
                    <GridBg />

                    {/* Task bar */}
                    <div style={{
                      position: 'absolute',
                      left:   `${startPct}%`,
                      width:  `${barWidth}%`,
                      top:    BAR_Y,
                      height: BAR_H,
                      background: `linear-gradient(90deg, ${item.color}dd, ${item.color}99)`,
                      borderRadius: 4,
                      boxShadow: `0 2px 10px ${item.color}33`,
                      zIndex: 2,
                      cursor: connectMode ? 'crosshair' : 'default',
                    }}
                    onClick={(e) => {
                      if (connectMode) { e.stopPropagation(); handleBarClick(item.id) }
                    }}
                    />

                    {/* Connector handle (right edge of bar) */}
                    {connectMode && (
                      <div
                        title="Bu iş kaleminden bağımlılık başlat"
                        style={{
                          position: 'absolute',
                          left: `${endPct}%`,
                          top: ROW_H / 2 - 8,
                          width: 16, height: 16,
                          background: isConnectSource ? item.color : C.surfLowest,
                          border: `2px solid ${item.color}`,
                          borderRadius: '50%',
                          cursor: 'pointer',
                          zIndex: 25,
                          transform: 'translateX(-50%)',
                          boxShadow: `0 2px 6px ${item.color}55`,
                        }}
                        onClick={(e) => { e.stopPropagation(); handleBarClick(item.id) }}
                      />
                    )}

                    {/* Standard KM diamonds */}
                    {item.milestones.map(km => (
                      <KmDiamond
                        key={km.id}
                        frac={km.endFrac}
                        color={item.color}
                        label={km.label}
                        why={km.why}
                        num={km.num}
                        major={km.major}
                      />
                    ))}

                    {/* Project milestone overlay */}
                    {itemMs.length > 0 && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        pointerEvents: 'none', zIndex: 30,
                      }}>
                        {itemMs.map(m => (
                          <ProjDiamond
                            key={m.id} ms={m} pctFn={pct}
                            onEdit={(ms, x, y) => {
                              setPopName(ms.name)
                              setPopDate(ms.target_date)
                              setMsPopover({ mode: 'edit', ms, x, y })
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <TodayLine />
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Cash flow rows ── */}
          {(() => {
            type CFRow = { key: string; label: string; sub: string; values: number[]; colorFn: (v: number) => string; bold?: boolean }
            const cfRows: CFRow[] = [
              { key: 'in',  label: 'Nakit Girişi',   sub: 'Cash In',     values: pIn,  colorFn: v => v > 0 ? C.tertiary : C.outline },
              { key: 'out', label: 'Nakit Çıkışı',   sub: 'Cash Out',    values: pOut, colorFn: v => v > 0 ? C.error    : C.outline },
              { key: 'net', label: 'Net Nakit',       sub: 'Net Cash',    values: pNet, colorFn: v => v > 0 ? C.tertiary : v < 0 ? C.error : C.outline, bold: true },
              { key: 'cum', label: 'Kümülatif',       sub: 'Cumulative',  values: pCum, colorFn: v => v > 0 ? C.primary  : v < 0 ? C.error : C.outline },
            ]
            return (
              <>
                {/* Section header */}
                <div style={{
                  display: 'flex', height: 32,
                  background: C.surfHighest,
                  borderTop: `1px solid ${C.outlineVar}44`,
                  borderBottom: `1px solid ${C.outlineVar}33`,
                }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0,
                    display: 'flex', alignItems: 'center', padding: '0 1.25rem',
                    borderRight: `1px solid ${C.outlineVar}33`,
                  }}>
                    <span style={{ fontSize: '0.57rem', fontWeight: 800, color: C.outline, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Finansal Nakit Akışı
                    </span>
                  </div>
                  <div style={{ flex: 1 }} />
                </div>

                {cfRows.map((row, ri) => (
                  <div key={row.key} style={{
                    display: 'flex',
                    borderBottom: ri < cfRows.length - 1 ? `1px solid ${C.outlineVar}22` : `2px solid ${C.outlineVar}44`,
                    background: row.bold ? `${C.primary}04` : C.surfLowest,
                  }}>
                    <div style={{
                      width: LABEL_W, flexShrink: 0,
                      height: CF_ROW_H,
                      background: C.surfLow,
                      borderRight: `1px solid ${C.outlineVar}33`,
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', padding: '0 1.25rem',
                    }}>
                      <span style={{ fontSize: row.bold ? '0.72rem' : '0.68rem', fontWeight: row.bold ? 800 : 600, color: row.bold ? C.primary : C.onSurface }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: '0.54rem', color: C.outline }}>{row.sub}</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex' }}>
                      {periods.map((p, i) => {
                        const v     = row.values[i] ?? 0
                        const color = row.colorFn(v)
                        const isNow = today >= p.start && today <= p.end
                        return (
                          <div key={p.key} style={{
                            flex: 1, height: CF_ROW_H,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            padding: '0 0.6rem',
                            borderRight: `1px solid ${C.outlineVar}22`,
                            background: isNow ? `${C.primary}06` : 'transparent',
                          }}>
                            {v !== 0 && (
                              <span style={{
                                fontSize: row.bold ? '0.7rem' : '0.65rem',
                                fontWeight: row.bold ? 800 : 600,
                                color, whiteSpace: 'nowrap', letterSpacing: '-0.01em',
                              }}>
                                {fmtK(v)}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </>
            )
          })()}

        </div>
      </div>
    </div>

    {/* ── Milestone popover ── */}
    {msPopover && (
      <div
        style={{
          position: 'fixed',
          top: msPopover.y, left: msPopover.x,
          zIndex: 2000,
          transform: 'translate(-50%, calc(-100% - 14px))',
          background: C.surfLowest,
          border: `1px solid ${C.outlineVar}`,
          borderRadius: 12,
          boxShadow: '0 8px 40px rgba(19,27,46,0.18)',
          padding: '1rem 1.125rem',
          width: 260,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: C.primary, letterSpacing: '-0.01em' }}>
            {msPopover.mode === 'create' ? '+ Yeni Milestone' : 'Milestone Düzenle'}
          </span>
          <button onClick={() => setMsPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: C.outline }}>✕</button>
        </div>

        {/* Work item badge (read-only) */}
        {(() => {
          const phaseId = msPopover.mode === 'create'
            ? (msPopover as Extract<MilestonePopover, { mode: 'create' }>).phaseId
            : WORK_ITEMS.find(w => {
                if (msPopover.mode !== 'edit') return false
                const t = new Date((msPopover as Extract<MilestonePopover, { mode: 'edit' }>).ms.target_date + 'T00:00:00').getTime()
                const sMs = rangeStart.getTime() + w.startFrac * totalMs
                const eMs = rangeStart.getTime() + w.endFrac   * totalMs
                return t >= sMs && t <= eMs
              })?.id ?? ''
          const w = WORK_ITEMS.find(x => x.id === phaseId)
          return w ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.2rem 0.55rem', borderRadius: 99, marginBottom: '0.6rem',
              background: `${w.color}12`, border: `1px solid ${w.color}33`,
            }}>
              <div style={{ width: 6, height: 6, background: w.color, borderRadius: 1, transform: 'rotate(45deg)' }} />
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: w.color }}>{w.name}</span>
            </div>
          ) : null
        })()}

        <input
          value={popName} onChange={e => setPopName(e.target.value)}
          placeholder="Milestone adı..." autoFocus
          onKeyDown={e => e.key === 'Escape' && setMsPopover(null)}
          style={{
            width: '100%', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: `2px solid ${C.outlineVar}`,
            background: 'transparent', outline: 'none',
            padding: '0.35rem 0', fontSize: '0.75rem', color: C.onSurface,
            marginBottom: '0.55rem', boxSizing: 'border-box' as const,
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderBottomColor = C.primary }}
          onBlur={e  => { (e.target as HTMLInputElement).style.borderBottomColor = C.outlineVar }}
        />
        <input
          type="date" value={popDate} onChange={e => setPopDate(e.target.value)}
          style={{
            width: '100%', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: `2px solid ${C.outlineVar}`,
            background: 'transparent', outline: 'none',
            padding: '0.35rem 0', fontSize: '0.72rem', color: C.onSurface,
            marginBottom: '0.75rem', boxSizing: 'border-box' as const,
          }}
        />

        {msPopover.mode === 'edit' && onCompleteMilestone && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.7rem' }}>
            <input
              type="checkbox"
              checked={!!msPopover.ms.completed_at}
              onChange={async e => {
                await onCompleteMilestone(msPopover.ms.id, e.target.checked)
                setMsPopover(null)
              }}
              style={{ accentColor: C.tertiary, width: 14, height: 14 }}
            />
            <span style={{ fontSize: '0.68rem', color: C.onSurfaceVar }}>Tamamlandı olarak işaretle</span>
          </label>
        )}

        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          {msPopover.mode === 'edit' && onDeleteMilestone && (
            <button
              onClick={async () => {
                setPopSaving(true)
                await onDeleteMilestone((msPopover as Extract<MilestonePopover, {mode:'edit'}>).ms.id)
                setPopSaving(false); setMsPopover(null)
              }}
              style={{ fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: 6, border: `1px solid ${C.errorCont}`, background: C.errorCont, color: C.error, cursor: 'pointer', fontWeight: 600 }}
            >Sil</button>
          )}
          <button onClick={() => setMsPopover(null)} style={{ fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: 6, border: `1px solid ${C.outlineVar}`, background: C.surfLow, color: C.outline, cursor: 'pointer' }}>
            İptal
          </button>
          <button
            disabled={!popName.trim() || !popDate || popSaving}
            onClick={async () => {
              if (!popName.trim() || !popDate) return
              setPopSaving(true)
              try {
                if (msPopover.mode === 'create' && onAddMilestone) {
                  await onAddMilestone(popName.trim(), popDate)
                } else if (msPopover.mode === 'edit') {
                  const em = (msPopover as Extract<MilestonePopover, {mode:'edit'}>).ms
                  if (onUpdateMilestoneName && popName.trim() !== em.name)
                    await onUpdateMilestoneName(em.id, popName.trim())
                  if (onUpdateMilestoneDate && popDate !== em.target_date)
                    await onUpdateMilestoneDate(em.id, popDate)
                }
              } finally { setPopSaving(false); setMsPopover(null) }
            }}
            style={{
              fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: 6,
              border: 'none', fontWeight: 700,
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryCont})`,
              color: C.onPrimary, cursor: 'pointer',
              opacity: (!popName.trim() || !popDate || popSaving) ? 0.45 : 1,
            }}
          >{popSaving ? '…' : 'Kaydet'}</button>
        </div>
      </div>
    )}
    </>
  )
}
