'use client'

import React, { useState, useMemo } from 'react'
import { type Milestone, type CostTransaction, type Board } from '@/lib/types'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:           '#320075',
  primaryCont:       '#4a1d96',
  primaryFixed:      '#eaddff',
  tertiary:          '#002e1d',
  tertiaryFixed:     '#6ffbbe',
  error:             '#ba1a1a',
  errorCont:         '#ffdad6',
  onSurface:         '#131b2e',
  onSurfaceVar:      '#4a4452',
  onPrimary:         '#ffffff',
  surface:           '#faf8ff',
  surfContLowest:    '#ffffff',
  surfContLow:       '#f2f3ff',
  surfCont:          '#eaedff',
  surfContHigh:      '#e2e7ff',
  surfContHighest:   '#dae2fd',
  outline:           '#7b7484',
  outlineVar:        '#ccc3d4',
  surfaceTint:       '#6d46bb',
} as const

// ─── Types ────────────────────────────────────────────────────────────────────
type Timeframe = 'monthly' | 'quarterly'
type Period    = { label: string; start: Date; end: Date; key: string }

type ProcessMilestone = {
  id: string; num: number; label: string; why: string
  startFrac: number; endFrac: number; major: boolean
}
type ProcessPhase = {
  id: string; name: string; shortName: string; purpose: string
  color: string; startFrac: number; endFrac: number
  milestones: ProcessMilestone[]
}

type MilestonePopover =
  | { mode: 'create'; x: number; y: number }
  | { mode: 'edit';   ms: Milestone; x: number; y: number }

export type GanttV4Props = {
  board: Board
  milestones: Milestone[]
  costTransactions?: CostTransaction[]
  currency?: 'TRY' | 'USD'
  onAddMilestone?:       (name: string, date: string) => Promise<void>
  onUpdateMilestoneDate?:(id: string, date: string)   => Promise<void>
  onUpdateMilestoneName?:(id: string, name: string)   => Promise<void>
  onDeleteMilestone?:    (id: string)                  => Promise<void>
  onCompleteMilestone?:  (id: string, ok: boolean)    => Promise<void>
}

// ─── Standard process ─────────────────────────────────────────────────────────
const STANDARD_PROCESS: ProcessPhase[] = [
  {
    id: 'p1', color: '#7C3AED', startFrac: 0.00, endFrac: 0.10,
    name: 'FAZ 1 — Geliştirme & Hukuki', shortName: 'GELİŞTİRME',
    purpose: 'Yatırımın fizibilitesini kesinleştirmek ve arsa kontrolünü ele almak.',
    milestones: [
      { id: 'km1', num: 1, label: 'Ön Anlaşma', startFrac: 0.00, endFrac: 0.06, major: false, why: 'Arsa sahibiyle temel ticari şartların mutabakatı; ön protokol veya niyet mektubu.' },
      { id: 'km2', num: 2, label: 'Tapu Şerhi',  startFrac: 0.04, endFrac: 0.10, major: false, why: 'Noterli KKİS imzası ve tapuya şerh. Hukuki zemin tamamlanır.' },
    ],
  },
  {
    id: 'p2', color: '#2563EB', startFrac: 0.06, endFrac: 0.28,
    name: 'FAZ 2 — Tasarım & Ruhsat', shortName: 'TASARIM',
    purpose: 'Kağıt üzerindeki projenin yasal onaylarını almak.',
    milestones: [
      { id: 'km3', num: 3, label: 'Zemin Etüdü',  startFrac: 0.06, endFrac: 0.12, major: false, why: 'Yanlış zemin verisi kaba inşaat bütçesini %20 artırabilir.' },
      { id: 'km4', num: 4, label: 'Konsept Proje', startFrac: 0.10, endFrac: 0.16, major: false, why: 'Tasarımın "satılabilirlik" tescili. Ön satış materyallerine olanak sağlar.' },
      { id: 'km5', num: 5, label: 'Avan Proje',    startFrac: 0.15, endFrac: 0.21, major: false, why: 'Emsal ve imar haklarının yasallaşması.' },
      { id: 'km6', num: 6, label: 'Uyg. Projeleri',startFrac: 0.19, endFrac: 0.24, major: false, why: 'Statik, elektrik, mekanik uygulama projelerinin tamamlanması.' },
      { id: 'km7', num: 7, label: 'YAPI RUHSATI',  startFrac: 0.22, endFrac: 0.28, major: true,  why: 'İnşaatın resmi başlangıç tetikleyicisi. Banka kredisi için zorunlu.' },
    ],
  },
  {
    id: 'p3', color: '#EA580C', startFrac: 0.24, endFrac: 0.54,
    name: 'FAZ 3 — Altyapı & Kaba Yapı', shortName: 'KABA YAPI',
    purpose: 'Binanın taşıyıcı sistemini ve ana omurgasını kurmak.',
    milestones: [
      { id: 'km8',  num: 8,  label: 'Mobilizasyon', startFrac: 0.24, endFrac: 0.29, major: false, why: 'Şantiye kontrolünün ele alınması.' },
      { id: 'km9',  num: 9,  label: 'Hafriyat',     startFrac: 0.28, endFrac: 0.34, major: false, why: 'Temel için en büyük fiziksel riskin geçilmesi.' },
      { id: 'km10', num: 10, label: 'Temel',         startFrac: 0.33, endFrac: 0.39, major: false, why: 'Sıfır kotuna ulaşma; finansal hakediş noktası.' },
      { id: 'km11', num: 11, label: 'Normal Katlar', startFrac: 0.38, endFrac: 0.46, major: false, why: 'Periyodik üretim hızı kontrolü.' },
      { id: 'km12', num: 12, label: 'Alt İhale',     startFrac: 0.43, endFrac: 0.49, major: false, why: 'İnce işçilerin sahaya girişi için kilit geçiş.' },
      { id: 'km13', num: 13, label: 'KARKAS SONU',   startFrac: 0.46, endFrac: 0.54, major: true,  why: 'Kaba imalatın teknik kabulü. En büyük maliyet bloğunun kapanması.' },
    ],
  },
  {
    id: 'p4', color: '#0D9488', startFrac: 0.48, endFrac: 0.93,
    name: 'FAZ 4 — İnce İşler & Cephe', shortName: 'İNCE İŞLER',
    purpose: 'Binayı dış hava şartlarından izole etmek ve yaşam standartlarını oluşturmak.',
    milestones: [
      { id: 'km14', num: 14, label: 'Cephe Başl.',   startFrac: 0.48, endFrac: 0.54, major: false, why: 'Binayı dış şartlardan izole etme sürecinin başlangıcı.' },
      { id: 'km15', num: 15, label: 'WATERTIGHT',    startFrac: 0.52, endFrac: 0.59, major: true,  why: 'İç mekan işlerini garantiye alan en büyük KM. Islak hasar riski kapanır.' },
      { id: 'km16', num: 16, label: 'Duvar/Sıva',    startFrac: 0.58, endFrac: 0.64, major: false, why: 'Oda hacimlerinin ortaya çıkması.' },
      { id: 'km17', num: 17, label: 'Yalıtım Testi', startFrac: 0.62, endFrac: 0.68, major: false, why: 'Su sızıntısı riskinin elimine edilmesi.' },
      { id: 'km18', num: 18, label: 'Ağır Sistemler',startFrac: 0.66, endFrac: 0.72, major: false, why: 'Asansör, trafo, hidrofor kurulumu.' },
      { id: 'km19', num: 19, label: 'ÖRNEK DAİRE',   startFrac: 0.70, endFrac: 0.76, major: true,  why: 'Seri imalata geçmeden kalite standardının tescili.' },
      { id: 'km20', num: 20, label: 'Mobilya/Kapı',  startFrac: 0.74, endFrac: 0.80, major: false, why: 'Mahal Listesi\'nin seri uygulanması.' },
      { id: 'km21', num: 21, label: 'Final Boya',    startFrac: 0.78, endFrac: 0.85, major: false, why: 'Teslimat öncesi son estetik dokunuşlar.' },
      { id: 'km22', num: 22, label: 'Peyzaj',        startFrac: 0.83, endFrac: 0.89, major: false, why: 'İskan için aranan belediye denetimi şartı.' },
      { id: 'km23', num: 23, label: 'Snag List',     startFrac: 0.87, endFrac: 0.93, major: false, why: 'Yasal kabuller öncesi son teknik kontrol.' },
    ],
  },
  {
    id: 'p5', color: '#059669', startFrac: 0.88, endFrac: 1.00,
    name: 'FAZ 5 — Devreye Alma & Teslimat', shortName: 'TESLİMAT',
    purpose: 'Teknik sistemleri çalıştırmak ve mülkiyeti devretmek.',
    milestones: [
      { id: 'km24', num: 24, label: 'Teknik Kabul', startFrac: 0.88, endFrac: 0.93, major: false, why: 'İtfaiye onayı ve yangın sistemleri testleri.' },
      { id: 'km25', num: 25, label: 'İSKAN',        startFrac: 0.91, endFrac: 0.97, major: true,  why: 'Tapu devri için zorunlu. İskansız satış hukuken geçersiz.' },
      { id: 'km26', num: 26, label: 'Tapu Devri',   startFrac: 0.95, endFrac: 1.00, major: false, why: 'Geliştiricinin finansal çıkışı ve sorumluluk devri.' },
    ],
  },
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

function assignToRows(kms: ProcessMilestone[], n = 2): ProcessMilestone[][] {
  const rows: ProcessMilestone[][] = Array.from({ length: n }, () => [])
  const until = Array(n).fill(0)
  const labelFrac = 0.07
  const sorted = [...kms].sort((a, b) => a.endFrac - b.endFrac)
  for (const km of sorted) {
    let r = rows.findIndex((_, i) => until[i] <= km.endFrac)
    if (r < 0) r = 0
    rows[r].push(km)
    until[r] = km.endFrac + labelFrac
  }
  return rows
}

// ─── Diamond marker (standard process KMs) ───────────────────────────────────
function DiamondV4({ km, color }: { km: ProcessMilestone; color: string }) {
  const [tip, setTip] = useState(false)
  const D = km.major ? 10 : 7
  return (
    <div
      style={{
        position: 'absolute', left: `${km.endFrac * 100}%`, top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex', alignItems: 'center',
        zIndex: tip ? 10 : 2, pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: D, height: D, flexShrink: 0,
          background: km.major ? color : C.surfContLowest,
          border: `2px solid ${color}`,
          borderRadius: 2, transform: 'rotate(45deg)',
          boxShadow: km.major ? `0 2px 8px ${color}55` : 'none',
          pointerEvents: 'auto', cursor: 'default',
        }}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
      />
      <span style={{
        marginLeft: D / 2 + 5,
        fontSize: km.major ? '0.59rem' : '0.55rem',
        fontWeight: km.major ? 800 : 600,
        color: km.major ? color : C.onSurfaceVar,
        whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
        letterSpacing: km.major ? '0.02em' : 0,
      }}>
        {km.label}
      </span>
      {tip && (
        <div style={{
          position: 'absolute', bottom: `calc(100% + ${D / 2 + 8}px)`, left: 0,
          transform: 'translateX(-20%)',
          background: C.onSurface, color: '#CBD5E1',
          fontSize: '0.6rem', lineHeight: 1.6,
          padding: '0.5rem 0.75rem', borderRadius: 8,
          boxShadow: '0 12px 40px rgba(19,27,46,0.35)',
          width: 220, whiteSpace: 'normal', zIndex: 60,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.63rem', marginBottom: '0.2rem' }}>
            KM {km.num} — {km.label}
          </div>
          {km.why}
          <div style={{ position: 'absolute', top: '100%', left: '20%', width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: `5px solid ${C.onSurface}` }} />
        </div>
      )}
    </div>
  )
}

// ─── Project milestone marker (editable) ─────────────────────────────────────
function ProjectMarkerV4({
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
  const D = 11
  return (
    <div
      title={`${ms.name} · ${ms.target_date}`}
      style={{
        position: 'absolute', left: `${p}%`, top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 32, pointerEvents: 'auto', cursor: 'pointer',
      }}
      onClick={(e) => { e.stopPropagation(); onEdit(ms, e.clientX, e.clientY) }}
    >
      <div style={{
        width: D, height: D,
        background: color,
        border: `2.5px solid ${C.surfContLowest}`,
        outline: `2px solid ${color}`,
        borderRadius: 2, transform: 'rotate(45deg)',
        boxShadow: `0 2px 10px ${color}66`,
      }} />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const LABEL_W = 200
const ROW_H   = 44
const N_ROWS  = 2

export function GanttV4({
  board, milestones,
  costTransactions = [], currency,
  onAddMilestone, onUpdateMilestoneDate,
  onUpdateMilestoneName, onDeleteMilestone, onCompleteMilestone,
}: GanttV4Props) {
  const SYM = (currency ?? board.currency) === 'TRY' ? '₺' : '$'

  const [tf,       setTf]       = useState<Timeframe>('monthly')
  const [msPopover, setMsPopover] = useState<MilestonePopover | null>(null)
  const [popName,  setPopName]  = useState('')
  const [popDate,  setPopDate]  = useState('')
  const [popSaving,setPopSaving]= useState(false)

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

  const periods  = useMemo(() => computePeriods(rangeStart, rangeEnd, tf), [rangeStart, rangeEnd, tf])
  const totalMs  = rangeEnd.getTime() - rangeStart.getTime()
  const pct      = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100))
  const today    = new Date()
  const todayPct = pct(today)
  const todayOn  = todayPct > 0 && todayPct < 100

  // ── shared sub-elements ─────────────────────────────────────────────────────
  const TodayLine = () => todayOn ? (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`,
      width: 1.5, background: C.surfaceTint, opacity: 0.6,
      boxShadow: `0 0 6px ${C.surfaceTint}`, pointerEvents: 'none', zIndex: 4,
    }} />
  ) : null

  const GridBg = () => (
    <>
      {periods.map(p => {
        const isNow = today >= p.start && today <= p.end
        return (
          <div key={p.key} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(p.start)}%`, width: `${pct(p.end) - pct(p.start)}%`,
            background: isNow ? `${C.primary}06` : 'transparent',
            borderRight: `1px solid ${C.outlineVar}22`,
            pointerEvents: 'none',
          }} />
        )
      })}
    </>
  )

  // ── cash flow aggregation ───────────────────────────────────────────────────
  function fmtK(n: number) {
    const abs = Math.abs(n)
    const s = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)}M`
            : abs >= 1_000     ? `${(abs / 1_000).toFixed(0)}K`
            : abs.toFixed(0)
    return (n < 0 ? '-' : '') + SYM + s
  }

  const cashIn  = costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast)
  const cashOut = costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast)

  const periodIn:  number[] = periods.map(() => 0)
  const periodOut: number[] = periods.map(() => 0)
  function addToPeriod(date: string, amount: number, arr: number[]) {
    const d = new Date(date + 'T00:00:00').getTime()
    for (let i = 0; i < periods.length; i++) {
      if (d >= periods[i].start.getTime() && d <= periods[i].end.getTime()) {
        arr[i] += amount; return
      }
    }
  }
  cashIn.forEach(t  => addToPeriod(t.date, t.amount, periodIn))
  cashOut.forEach(t => addToPeriod(t.date, t.amount, periodOut))
  const periodNet  = periods.map((_, i) => periodIn[i] - periodOut[i])
  const periodCum  = periods.map((_, i) => periodNet.slice(0, i + 1).reduce((a, b) => a + b, 0))

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <div style={{ background: C.surface, fontFamily: 'Inter, sans-serif' }}>

      {/* ── Section header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.5rem 0.75rem',
        borderBottom: `1px solid ${C.outlineVar}26`,
      }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: C.primary, letterSpacing: '-0.02em', margin: 0 }}>
            Proje Zaman Çizelgesi
          </h3>
          <p style={{ fontSize: '0.67rem', color: C.outline, margin: '0.1rem 0 0', letterSpacing: '0.03em' }}>
            {rangeStart.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
            {' — '}
            {rangeEnd.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{ width: 8, height: 8, background: C.primary, transform: 'rotate(45deg)', borderRadius: 1 }} />
              <span style={{ fontSize: '0.6rem', color: C.onSurfaceVar, fontWeight: 600 }}>Standart KM</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <div style={{ width: 8, height: 8, background: '#F59E0B', transform: 'rotate(45deg)', borderRadius: 1 }} />
              <span style={{ fontSize: '0.6rem', color: C.onSurfaceVar, fontWeight: 600 }}>Proje Milestone</span>
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: C.outlineVar }} />

          {/* Timeframe toggle */}
          <div style={{
            display: 'flex', background: C.surfCont, borderRadius: 8, padding: 3, gap: 2,
          }}>
            {(['monthly', 'quarterly'] as Timeframe[]).map(t => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding: '0.22rem 0.7rem', borderRadius: 6, fontSize: '0.65rem',
                fontWeight: 700, cursor: 'pointer', border: 'none',
                background: tf === t ? C.surfContLowest : 'transparent',
                color: tf === t ? C.primary : C.outline,
                boxShadow: tf === t ? '0 1px 4px rgba(19,27,46,0.12)' : 'none',
                transition: 'all 0.15s',
              }}>
                {t === 'monthly' ? 'Aylık' : 'Çeyreklik'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Gantt grid ── */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: LABEL_W + periods.length * (tf === 'quarterly' ? 110 : 80) }}>

          {/* Period header */}
          <div style={{
            display: 'flex', height: 40,
            background: C.surfContHighest,
            borderBottom: `1px solid ${C.outlineVar}33`,
            position: 'sticky', top: 0, zIndex: 10,
          }}>
            <div style={{
              width: LABEL_W, flexShrink: 0,
              display: 'flex', alignItems: 'center', padding: '0 1.25rem',
              borderRight: `1px solid ${C.outlineVar}33`,
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
                    background: isNow ? `${C.primary}0a` : 'transparent',
                  }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: isNow ? 800 : 600,
                      color: isNow ? C.primary : C.outline,
                      letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>
                      {p.label}{isNow ? ' ◦' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Phase rows ── */}
          {STANDARD_PROCESS.map((phase, phaseIdx) => {
            const phaseRows = assignToRows(phase.milestones, N_ROWS)
            const phaseStartMs = rangeStart.getTime() + phase.startFrac * totalMs
            const phaseEndMs   = rangeStart.getTime() + phase.endFrac   * totalMs
            const phaseMs = milestones.filter(m => {
              const t = new Date(m.target_date + 'T00:00:00').getTime()
              return t >= phaseStartMs && t <= phaseEndMs
            })

            return (
              <div key={phase.id} style={{
                display: 'flex',
                borderBottom: phaseIdx < STANDARD_PROCESS.length - 1
                  ? `1px solid ${C.outlineVar}22`
                  : `1px solid ${C.outlineVar}44`,
              }}>

                {/* Label cell */}
                <div style={{
                  width: LABEL_W, flexShrink: 0,
                  height: N_ROWS * ROW_H,
                  background: C.surfContLow,
                  borderRight: `3px solid ${phase.color}`,
                  borderLeft: phaseIdx === 0 ? 'none' : 'none',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'flex-start', justifyContent: 'center',
                  padding: '0 1rem',
                  gap: '0.1rem',
                }}>
                  <span style={{
                    fontSize: '0.58rem', fontWeight: 800,
                    color: C.outline, letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    {phase.name.split(' — ')[0]}
                  </span>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700,
                    color: C.onSurface, lineHeight: 1.2,
                  }}>
                    {phase.shortName}
                  </span>
                  <span style={{
                    fontSize: '0.55rem', fontWeight: 400,
                    color: C.outline, lineHeight: 1.3,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    maxWidth: '90%',
                  }}>
                    {phase.purpose}
                  </span>
                </div>

                {/* Timeline lanes */}
                {(() => {
                  const startPct = pct(new Date(rangeStart.getTime() + phase.startFrac * totalMs))
                  const endPct   = pct(new Date(rangeStart.getTime() + phase.endFrac   * totalMs))
                  return (
                    <div
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        background: C.surfContLowest, position: 'relative',
                        cursor: onAddMilestone ? 'crosshair' : 'default',
                      }}
                      onClick={(e) => {
                        if (!onAddMilestone) return
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                        const frac = (e.clientX - rect.left) / rect.width
                        const dt   = new Date(rangeStart.getTime() + frac * totalMs)
                        const ds   = dt.toISOString().split('T')[0]
                        setPopName('')
                        setPopDate(ds)
                        setMsPopover({ mode: 'create', x: e.clientX, y: e.clientY })
                      }}
                    >
                      {/* Phase span indicator */}
                      <div style={{
                        position: 'absolute',
                        left: `${startPct}%`,
                        width: `${endPct - startPct}%`,
                        top: 0, bottom: 0,
                        background: `${phase.color}08`,
                        borderLeft:  `2px solid ${phase.color}30`,
                        borderRight: `2px solid ${phase.color}30`,
                        pointerEvents: 'none', zIndex: 0,
                      }} />

                      {/* 2 swim lanes */}
                      {Array.from({ length: N_ROWS }, (_, ri) => (
                        <div key={ri} style={{
                          height: ROW_H, position: 'relative', overflow: 'visible',
                          borderBottom: ri < N_ROWS - 1 ? `1px dashed ${C.outlineVar}33` : 'none',
                        }}>
                          <GridBg />
                          {(phaseRows[ri] ?? []).map(km => (
                            <DiamondV4 key={km.id} km={km} color={phase.color} />
                          ))}
                          <TodayLine />
                        </div>
                      ))}

                      {/* Project milestone overlay */}
                      {phaseMs.length > 0 && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                          pointerEvents: 'none', zIndex: 30,
                        }}>
                          {phaseMs.map(m => (
                            <ProjectMarkerV4
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
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* ── Cash flow section ── */}
          {(() => {
            type CashRow = {
              key: string; label: string; sub: string
              values: number[]
              colorFn: (v: number) => string
              bold?: boolean
            }

            const cashRows: CashRow[] = [
              {
                key: 'in', label: 'Nakit Girişi', sub: 'Cash In',
                values: periodIn,
                colorFn: (v) => v > 0 ? C.tertiary : C.outline,
                bold: false,
              },
              {
                key: 'out', label: 'Nakit Çıkışı', sub: 'Cash Out',
                values: periodOut,
                colorFn: (v) => v > 0 ? C.error : C.outline,
                bold: false,
              },
              {
                key: 'net', label: 'Net Nakit Akışı', sub: 'Net Cash',
                values: periodNet,
                colorFn: (v) => v > 0 ? C.tertiary : v < 0 ? C.error : C.outline,
                bold: true,
              },
              {
                key: 'cum', label: 'Kümülatif', sub: 'Cumulative',
                values: periodCum,
                colorFn: (v) => v > 0 ? C.primary : v < 0 ? C.error : C.outline,
                bold: false,
              },
            ]

            return (
              <>
                {/* Cash section separator */}
                <div style={{
                  display: 'flex',
                  background: C.surfContHighest,
                  borderTop:  `1px solid ${C.outlineVar}44`,
                  borderBottom: `1px solid ${C.outlineVar}33`,
                }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0,
                    padding: '0.4rem 1rem',
                    borderRight: `1px solid ${C.outlineVar}33`,
                  }}>
                    <span style={{ fontSize: '0.57rem', fontWeight: 800, color: C.outline, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Finansal Nakit Akışı
                    </span>
                  </div>
                  <div style={{ flex: 1, display: 'flex' }}>
                    {periods.map(p => (
                      <div key={p.key} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        padding: '0 0.5rem',
                        borderRight: `1px solid ${C.outlineVar}33`,
                      }}>
                        <span style={{ fontSize: '0.55rem', color: C.outline }}>{p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {cashRows.map((row, ri) => (
                  <div key={row.key} style={{
                    display: 'flex',
                    borderBottom: ri < cashRows.length - 1 ? `1px solid ${C.outlineVar}22` : `2px solid ${C.outlineVar}44`,
                    background: row.bold ? `${C.primary}05` : C.surfContLowest,
                  }}>
                    {/* Label */}
                    <div style={{
                      width: LABEL_W, flexShrink: 0,
                      height: 44, background: C.surfContLow,
                      borderRight: `1px solid ${C.outlineVar}33`,
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'center', padding: '0 1rem',
                    }}>
                      <span style={{
                        fontSize: row.bold ? '0.72rem' : '0.68rem',
                        fontWeight: row.bold ? 800 : 600,
                        color: row.bold ? C.primary : C.onSurface,
                      }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: '0.55rem', color: C.outline }}>{row.sub}</span>
                    </div>

                    {/* Period values */}
                    <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                      {periods.map((p, i) => {
                        const v     = row.values[i] ?? 0
                        const color = row.colorFn(v)
                        const isNow = today >= p.start && today <= p.end
                        return (
                          <div key={p.key} style={{
                            flex: 1, height: 44,
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            padding: '0 0.6rem',
                            borderRight: `1px solid ${C.outlineVar}22`,
                            background: isNow ? `${C.primary}06` : 'transparent',
                            position: 'relative',
                          }}>
                            {v !== 0 && (
                              <span style={{
                                fontSize: row.bold ? '0.72rem' : '0.67rem',
                                fontWeight: row.bold ? 800 : 600,
                                color, whiteSpace: 'nowrap',
                                letterSpacing: '-0.01em',
                              }}>
                                {v < 0 ? '-' : ''}{fmtK(Math.abs(v))}
                              </span>
                            )}
                            {todayOn && isNow && (
                              <div style={{
                                position: 'absolute', top: 0, bottom: 0,
                                left: `${todayPct}%`, width: 1.5,
                                background: C.surfaceTint, opacity: 0.35,
                                pointerEvents: 'none',
                              }} />
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
          background: C.surfContLowest,
          border: `1px solid ${C.outlineVar}`,
          borderRadius: 12,
          boxShadow: '0 8px 40px rgba(19,27,46,0.18)',
          padding: '1rem 1.125rem',
          width: 260,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: C.primary, letterSpacing: '-0.01em' }}>
            {msPopover.mode === 'create' ? '+ Yeni Milestone' : 'Milestone Düzenle'}
          </span>
          <button onClick={() => setMsPopover(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.9rem', color: C.outline, lineHeight: 1,
          }}>✕</button>
        </div>

        <input
          value={popName} onChange={e => setPopName(e.target.value)}
          placeholder="Milestone adı..." autoFocus
          onKeyDown={e => e.key === 'Escape' && setMsPopover(null)}
          style={{
            width: '100%', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: `2px solid ${C.outlineVar}`,
            background: 'transparent', outline: 'none',
            padding: '0.35rem 0', fontSize: '0.75rem', color: C.onSurface,
            marginBottom: '0.6rem', boxSizing: 'border-box' as const,
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderBottomColor = C.primary }}
          onBlur={e =>  { (e.target as HTMLInputElement).style.borderBottomColor = C.outlineVar }}
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
              onChange={async (e) => {
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
                await onDeleteMilestone((msPopover as Extract<MilestonePopover, { mode: 'edit' }>).ms.id)
                setPopSaving(false); setMsPopover(null)
              }}
              style={{ fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: 6, border: `1px solid ${C.errorCont}`, background: C.errorCont, color: C.error, cursor: 'pointer', fontWeight: 600 }}
            >Sil</button>
          )}
          <button
            onClick={() => setMsPopover(null)}
            style={{ fontSize: '0.65rem', padding: '0.3rem 0.7rem', borderRadius: 6, border: `1px solid ${C.outlineVar}`, background: C.surfContLow, color: C.outline, cursor: 'pointer' }}
          >İptal</button>
          <button
            disabled={!popName.trim() || !popDate || popSaving}
            onClick={async () => {
              if (!popName.trim() || !popDate) return
              setPopSaving(true)
              try {
                if (msPopover.mode === 'create' && onAddMilestone) {
                  await onAddMilestone(popName.trim(), popDate)
                } else if (msPopover.mode === 'edit') {
                  const editMs = (msPopover as Extract<MilestonePopover, { mode: 'edit' }>).ms
                  if (onUpdateMilestoneName && popName.trim() !== editMs.name)
                    await onUpdateMilestoneName(editMs.id, popName.trim())
                  if (onUpdateMilestoneDate && popDate !== editMs.target_date)
                    await onUpdateMilestoneDate(editMs.id, popDate)
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
          >{popSaving ? '...' : 'Kaydet'}</button>
        </div>
      </div>
    )}
    </>
  )
}
