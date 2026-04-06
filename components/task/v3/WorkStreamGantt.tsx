'use client'

import React, { useState, useMemo } from 'react'
import {
  type Task, type Column, type Milestone, type MilestoneTask,
  type CostTransaction, type BudgetLine,
} from '@/lib/types'

// ─── types ────────────────────────────────────────────────────────────────────

type Timeframe = 'weekly' | 'monthly' | 'quarterly'
type LayerKey  = 'photos' | 'milestones' | 'risks' | 'process'

type Period = { label: string; start: Date; end: Date; key: string }

type Risk = {
  id: string; name: string
  severity: 'H' | 'M' | 'L'
  startFrac: number; endFrac: number
}

type ProcessMilestone = {
  id: string
  num: number
  label: string        // short 2-3 word bar label
  why: string          // ⓘ tooltip
  startFrac: number
  endFrac: number
  major: boolean
}

type ProcessPhase = {
  id: string
  name: string         // "FAZ 1 — …"
  shortName: string    // e.g. "GELİŞTİRME" — shown as second row label
  purpose: string      // ⓘ tooltip
  color: string
  startFrac: number
  endFrac: number
  milestones: ProcessMilestone[]
}

export type WorkStreamGanttProps = {
  tasks: Task[]
  columns: Column[]
  milestones: Milestone[]
  milestoneTasks?: MilestoneTask[]
  costTransactions?: CostTransaction[]
  budgetLines?: BudgetLine[]
  currency?: 'TRY' | 'USD'
  boardPhotos?: string[]
  onAddMilestone?: (name: string, date: string) => Promise<void>
  onUpdateMilestoneDate?: (id: string, date: string) => Promise<void>
}

// ─── constants ────────────────────────────────────────────────────────────────

const LABEL_W  = 130
const ROW_H    = 26   // px — height of one swim-lane row
const N_ROWS   = 2    // every phase is exactly 2 rows tall

const COL_W: Record<Timeframe, number> = { weekly: 44, monthly: 64, quarterly: 100 }

const SEV: Record<'H' | 'M' | 'L', { bg: string; text: string }> = {
  H: { bg: '#FEE2E2', text: '#DC2626' },
  M: { bg: '#FEF3C7', text: '#D97706' },
  L: { bg: '#D1FAE5', text: '#059669' },
}

const DEMO_RISKS: Risk[] = [
  { id: 'r1', name: 'Permit Approval Delay',    severity: 'H', startFrac: 0.02, endFrac: 0.20 },
  { id: 'r2', name: 'Material Cost Overrun',     severity: 'M', startFrac: 0.25, endFrac: 0.55 },
  { id: 'r3', name: 'Weather / Site Disruption', severity: 'L', startFrac: 0.60, endFrac: 0.80 },
]

// ─── Standard Construction Process — 24-month / 26 KM ────────────────────────
//
//  startFrac / endFrac are proportional to the 24-month total timeline.
//  The greedy row-assignment algorithm prevents bars from overlapping within
//  each phase's N_ROWS swim lanes.

const STANDARD_PROCESS: ProcessPhase[] = [
  {
    id: 'p1', color: '#7C3AED', startFrac: 0.00, endFrac: 0.10,
    name: 'FAZ 1 — Geliştirme & Hukuki', shortName: 'GELİŞTİRME',
    purpose: 'Yatırımın fizibilitesini kesinleştirmek ve arsa kontrolünü ele almak.',
    milestones: [
      { id: 'km1',  num: 1,  label: 'Ön Anlaşma',       startFrac: 0.00, endFrac: 0.06, major: false, why: 'Arsa sahibiyle temel ticari şartların mutabakatı; ön protokol veya niyet mektubu. Hukuki zırhın ilk halkası.' },
      { id: 'km2',  num: 2,  label: 'Tapu Şerhi',        startFrac: 0.04, endFrac: 0.10, major: false, why: 'Noter onaylı KKİS\'nin imzalanması ve tapuya şerh düşürülmesi. Hukuki zemin tamamlanır; arsa artık "bloke".' },
    ],
  },
  {
    id: 'p2', color: '#2563EB', startFrac: 0.06, endFrac: 0.28,
    name: 'FAZ 2 — Tasarım & Ruhsat', shortName: 'TASARIM',
    purpose: 'Kağıt üzerindeki projenin yasal onaylarını almak.',
    milestones: [
      { id: 'km3',  num: 3,  label: 'Zemin Etüdü',       startFrac: 0.06, endFrac: 0.12, major: false, why: 'Yanlış zemin verisi kaba inşaat bütçesini %20 artırabilir. Tüm statik projelerin temel girdisidir.' },
      { id: 'km4',  num: 4,  label: 'Konsept Proje',      startFrac: 0.10, endFrac: 0.16, major: false, why: 'Tasarımın "satılabilirlik" tescili. Ön satış ve pazarlama materyallerinin hazırlanmasına olanak sağlar.' },
      { id: 'km5',  num: 5,  label: 'Avan Proje',         startFrac: 0.15, endFrac: 0.21, major: false, why: 'Emsal ve imar haklarının yasallaşması. Finansal modelin doğrulanması için kritik eşik.' },
      { id: 'km6',  num: 6,  label: 'Uyg. Projeleri',     startFrac: 0.19, endFrac: 0.24, major: false, why: 'Statik, elektrik, mekanik uygulama projelerinin tamamlanması. Ruhsat başvurusu için zorunlu teknik dosya.' },
      { id: 'km7',  num: 7,  label: 'YAPI RUHSATI',       startFrac: 0.22, endFrac: 0.28, major: true,  why: 'İnşaatın resmi başlangıç tetikleyicisi. Banka inşaat kredisi için bu belge zorunlu tutulur.' },
    ],
  },
  {
    id: 'p3', color: '#EA580C', startFrac: 0.24, endFrac: 0.54,
    name: 'FAZ 3 — Altyapı & Kaba Yapı', shortName: 'KABA YAPI',
    purpose: 'Binanın taşıyıcı sistemini ve ana omurgasını kurmak.',
    milestones: [
      { id: 'km8',  num: 8,  label: 'Mobilizasyon',       startFrac: 0.24, endFrac: 0.29, major: false, why: 'Şantiye sahasının kontrol altına alınması. Geri sayım saatinin başladığı andır.' },
      { id: 'km9',  num: 9,  label: 'Hafriyat & İksa',    startFrac: 0.28, endFrac: 0.34, major: false, why: 'Temel dökümü için en büyük fiziksel riskin geçilmesi. Çevre yapılara zarar riski kapanır.' },
      { id: 'km10', num: 10, label: 'Temel & Bodrum',      startFrac: 0.33, endFrac: 0.39, major: false, why: 'Sıfır kotuna ulaşılması; finansal hakediş noktası. Bankalar bu aşamayı kredi dilimi tetikleyicisi olarak kullanır.' },
      { id: 'km11', num: 11, label: 'Normal Katlar',       startFrac: 0.38, endFrac: 0.46, major: false, why: 'Periyodik üretim hızı kontrolü. Kat başına beton dökme süresinin takip edildiği metrikler.' },
      { id: 'km12', num: 12, label: 'Alt Yük. İhale',      startFrac: 0.43, endFrac: 0.49, major: false, why: 'Kaba biterken ince işçilerin sahaya girmesini sağlayan kilit geçiş. Gecikme ince işleri de kayatır.' },
      { id: 'km13', num: 13, label: 'KARKAS SONU',         startFrac: 0.46, endFrac: 0.54, major: true,  why: 'Binanın silüetinin bitişi; kaba imalatın teknik kabulü. En büyük maliyet bloğunun kapanması.' },
    ],
  },
  {
    id: 'p4', color: '#0D9488', startFrac: 0.48, endFrac: 0.93,
    name: 'FAZ 4 — İnce İşler & Cephe', shortName: 'İNCE İŞLER',
    purpose: 'Binayı dış hava şartlarından izole etmek ve yaşam standartlarını oluşturmak.',
    milestones: [
      { id: 'km14', num: 14, label: 'Cephe Başl.',         startFrac: 0.48, endFrac: 0.54, major: false, why: 'Binayı dış şartlardan izole etme sürecinin başlangıcı. Cephe ekibinin mobilizasyonunu tetikler.' },
      { id: 'km15', num: 15, label: 'WATERTIGHT',          startFrac: 0.52, endFrac: 0.59, major: true,  why: 'İç mekan ahşap ve boya işlerini garantiye alan en büyük KM. Islak hasar riski bu noktada kapanır.' },
      { id: 'km16', num: 16, label: 'Duvar/Sıva',          startFrac: 0.58, endFrac: 0.64, major: false, why: 'Oda hacimlerinin ortaya çıkması. E&M kanallarının sıva altına alınması.' },
      { id: 'km17', num: 17, label: 'Yalıtım Testi',       startFrac: 0.62, endFrac: 0.68, major: false, why: 'Su sızıntısı riskinin elimine edilmesi. Başarısız test seramikten önce tamirat gerektirir.' },
      { id: 'km18', num: 18, label: 'Ağır Sistemler',      startFrac: 0.66, endFrac: 0.72, major: false, why: 'Asansör, trafo, hidrofor ana cihazlarının kurulumu. Uzun tedarik süreli ekipmanlar.' },
      { id: 'km19', num: 19, label: 'ÖRNEK DAİRE',         startFrac: 0.70, endFrac: 0.76, major: true,  why: 'Seri imalata geçmeden önce "kalite standardının" tescili. Hem müşteri hem yüklenici imzalar.' },
      { id: 'km20', num: 20, label: 'Mobilya/Kapı',        startFrac: 0.74, endFrac: 0.80, major: false, why: 'Mahal Listesi\'ndeki estetik kalitenin seri uygulanması. En yoğun alt yüklenici dönemi.' },
      { id: 'km21', num: 21, label: 'Final Boya',          startFrac: 0.78, endFrac: 0.85, major: false, why: 'Teslimat öncesi son estetik dokunuşlar. Şantiyeye erişim kısıtlanır.' },
      { id: 'km22', num: 22, label: 'Peyzaj',              startFrac: 0.83, endFrac: 0.89, major: false, why: '"Proje bitti" algısını yaratan görsel final. İskan için belediye denetiminde aranan şart.' },
      { id: 'km23', num: 23, label: 'Snag List',           startFrac: 0.87, endFrac: 0.93, major: false, why: 'Yasal kabuller öncesi son teknik kontrol. Açık kalemlerin kapatıldığı son fırsat.' },
    ],
  },
  {
    id: 'p5', color: '#059669', startFrac: 0.88, endFrac: 1.00,
    name: 'FAZ 5 — Devreye Alma & Teslimat', shortName: 'TESLİMAT',
    purpose: 'Teknik sistemleri çalıştırmak ve mülkiyeti devretmek.',
    milestones: [
      { id: 'km24', num: 24, label: 'Teknik Kabul',        startFrac: 0.88, endFrac: 0.93, major: false, why: 'İskan dosyasının "itfaiye" engelini aşması. Yangın ve kaçış sistemleri testleri sunulur.' },
      { id: 'km25', num: 25, label: 'İSKAN',               startFrac: 0.91, endFrac: 0.97, major: true,  why: 'Binanın mülk statüsünü kazandığı an. Tapu devri için zorunlu; iskansız satış hukuken geçersiz.' },
      { id: 'km26', num: 26, label: 'Tapu Devri',          startFrac: 0.95, endFrac: 1.00, major: false, why: 'Geliştiricinin finansal çıkışı ve sorumluluk devri. 2 yıllık yasal ayıp ve garanti döneminin başlangıcı.' },
    ],
  },
]

const STRIPE =
  'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.22) 3px,rgba(255,255,255,0.22) 6px)'

// ─── helpers ─────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function computePeriods(start: Date, end: Date, tf: Timeframe): Period[] {
  const periods: Period[] = []
  if (tf === 'monthly') {
    const c = new Date(start.getFullYear(), start.getMonth(), 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 1, 0)
      periods.push({ label: c.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), start: new Date(c), end: pEnd, key: `${c.getFullYear()}-${c.getMonth()}` })
      c.setMonth(c.getMonth() + 1)
    }
  } else if (tf === 'quarterly') {
    const c = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1)
    while (c <= end) {
      const pEnd = new Date(c.getFullYear(), c.getMonth() + 3, 0)
      const qNum = Math.floor(c.getMonth() / 3) + 1
      periods.push({ label: `Q${qNum} '${String(c.getFullYear()).slice(2)}`, start: new Date(c), end: pEnd, key: `${c.getFullYear()}-Q${qNum}` })
      c.setMonth(c.getMonth() + 3)
    }
  } else {
    const c = new Date(start)
    c.setDate(c.getDate() - ((c.getDay() + 6) % 7))
    while (c <= end) {
      const pEnd = addDays(c, 6)
      periods.push({ label: c.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), start: new Date(c), end: pEnd, key: c.toISOString().split('T')[0] })
      c.setDate(c.getDate() + 7)
    }
  }
  return periods
}

function colBarStyle(colName: string): { bg: string; stripe: boolean; dashed: boolean } {
  const n = colName.toLowerCase()
  if (n.includes('done') || n.includes('complet')) return { bg: '#10B981', stripe: false, dashed: false }
  if (n.includes('doing') || n.includes('progress')) return { bg: '#3B82F6', stripe: true, dashed: false }
  if (n.includes('todo') || n.includes('to do') || n.includes('to-do')) return { bg: '#94A3B8', stripe: false, dashed: false }
  return { bg: '#CBD5E1', stripe: false, dashed: true }
}

// Greedy row assignment: sorts KMs by endFrac, assigns to first non-overlapping row.
// We use endFrac as the anchor (diamond position) + an estimated label width in frac
// units so the text of one KM doesn't overlap the diamond of the next.
function assignToRows(kms: ProcessMilestone[], n = N_ROWS): ProcessMilestone[][] {
  const rows: ProcessMilestone[][] = Array.from({ length: n }, () => [])
  // labelFrac: approximate space taken by label text after the diamond.
  // Assume ~8px per char at 0.57rem, label ~10 chars avg → ~80px.
  // For a 24-month timeline displayed at ~1200px wide, 1% ≈ 12px → 80px ≈ 6.5%
  const labelFrac = 0.072

  // "occupied until" per row = endFrac of last item + its label width
  const until: number[] = Array(n).fill(-1)

  for (const km of [...kms].sort((a, b) => a.endFrac - b.endFrac)) {
    let pick = -1
    for (let r = 0; r < n; r++) {
      if (until[r] <= km.endFrac) { pick = r; break }
    }
    if (pick === -1) pick = until.indexOf(Math.min(...until))
    rows[pick].push(km)
    until[pick] = km.endFrac + labelFrac
  }
  return rows
}

// ─── DiamondMarker ────────────────────────────────────────────────────────────
// Renders a diamond at km.endFrac with the label to its right.
// The tooltip appears on hover above the diamond.

function DiamondMarker({ km, color }: { km: ProcessMilestone; color: string }) {
  const [open, setOpen] = useState(false)

  const D = km.major ? 11 : 8          // diamond size (px)
  const LABEL_OFFSET = D / 2 + 4       // gap between diamond edge and text

  return (
    // anchor div sits at endFrac, centred vertically in the row
    <div
      style={{
        position: 'absolute',
        left: `${km.endFrac * 100}%`,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex', alignItems: 'center',
        overflow: 'visible',
        zIndex: open ? 10 : 2,
        cursor: 'default',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Diamond shape */}
      <div style={{
        width: D, height: D, flexShrink: 0,
        background: km.major ? color : '#fff',
        border: `2px solid ${color}`,
        borderRadius: 2,
        transform: 'rotate(45deg)',
        boxShadow: km.major ? `0 1px 5px ${color}66` : `0 1px 3px rgba(0,0,0,0.15)`,
      }} />

      {/* Label to the right */}
      <span style={{
        marginLeft: LABEL_OFFSET,
        fontSize: km.major ? '0.6rem' : '0.57rem',
        fontWeight: km.major ? 800 : 600,
        color: km.major ? color : '#475569',
        whiteSpace: 'nowrap',
        letterSpacing: km.major ? '0.01em' : 0,
        userSelect: 'none',
      }}>
        {km.label}
      </span>

      {/* Tooltip — appears above diamond */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: `calc(100% + ${D / 2 + 6}px)`,
          left: 0,
          transform: 'translateX(-30%)',
          zIndex: 60,
          background: '#0F172A', color: '#CBD5E1',
          fontSize: '0.62rem', lineHeight: 1.5,
          padding: '0.5rem 0.7rem', borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          width: 230, whiteSpace: 'normal', pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.25rem', fontSize: '0.65rem' }}>
            KM {km.num} — {km.label}
          </div>
          {km.why}
          <div style={{ position: 'absolute', top: '100%', left: '30%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #0F172A' }} />
        </div>
      )}
    </div>
  )
}

// ─── component ────────────────────────────────────────────────────────────────

export function WorkStreamGantt({
  tasks, columns, milestones,
  costTransactions = [], budgetLines = [],
  currency = 'USD', boardPhotos = [],
}: WorkStreamGanttProps) {

  const [filter,    setFilter]    = useState<string>('all')
  const [layers,    setLayers]    = useState<Record<LayerKey, boolean>>({ photos: true, milestones: false, risks: false, process: true })
  const [tf,        setTf]        = useState<Timeframe>('monthly')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // ── date range ────────────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const ts: number[] = []
    tasks.forEach(t => { if (t.due_date) ts.push(new Date(t.due_date + 'T00:00:00').getTime()) })
    milestones.forEach(m => ts.push(new Date(m.target_date + 'T00:00:00').getTime()))
    costTransactions.forEach(t => ts.push(new Date(t.date + 'T00:00:00').getTime()))
    if (!ts.length) {
      const now = new Date()
      return { rangeStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), rangeEnd: new Date(now.getFullYear(), now.getMonth() + 11, 0) }
    }
    const s = new Date(Math.min(...ts)); s.setMonth(s.getMonth() - 1); s.setDate(1)
    const e = new Date(Math.max(...ts)); e.setMonth(e.getMonth() + 1); e.setDate(0)
    return { rangeStart: s, rangeEnd: e }
  }, [tasks, milestones, costTransactions])

  const periods = useMemo(() => computePeriods(rangeStart, rangeEnd, tf), [rangeStart, rangeEnd, tf])
  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const pct = (d: Date) => Math.max(0, Math.min(100, (d.getTime() - rangeStart.getTime()) / totalMs * 100))

  const today        = new Date()
  const todayPct     = pct(today)
  const todayInRange = todayPct > 0 && todayPct < 100

  const visibleColumns = useMemo(() => filter === 'all' ? columns : columns.filter(c => c.id === filter), [columns, filter])
  const tasksByCol = useMemo(() => {
    const map: Record<string, Task[]> = {}
    columns.forEach(c => { map[c.id] = [] })
    tasks.forEach(t => { if (map[t.column_id] !== undefined && t.due_date) map[t.column_id].push(t) })
    return map
  }, [tasks, columns])

  const cashIn  = costTransactions.filter(t => t.type === 'cash_in'  && !t.is_forecast)
  const cashOut = costTransactions.filter(t => t.type === 'cash_out' && !t.is_forecast)

  // ── shared primitives ──────────────────────────────────────────────────────
  const TodayLine = () => todayInRange
    ? <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: '#2563EB', opacity: 0.45, pointerEvents: 'none', zIndex: 3 }} />
    : null

  const GridBg = ({ bg }: { bg?: string }) => (
    <>
      {periods.map(p => {
        const isNow = today >= p.start && today <= p.end
        return <div key={p.key} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(p.start)}%`, width: `${pct(p.end) - pct(p.start)}%`, background: isNow ? 'rgba(37,99,235,0.06)' : (bg ?? 'transparent'), borderRight: '1px solid rgba(226,232,240,0.7)', pointerEvents: 'none' }} />
      })}
    </>
  )

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8FAFC', borderTop: '1.5px solid #E2E8F0' }}>

      {/* ── Controls bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', padding: '0.5rem 1rem', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', gap: '0.2rem' }}>
          {[{ id: 'all', label: 'All' }, ...columns.map(c => ({ id: c.id, label: c.name }))].map(opt => {
            const active = filter === opt.id
            return <button key={opt.id} onClick={() => setFilter(opt.id)} style={{ padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? '#0F172A' : '#F1F5F9', color: active ? '#fff' : '#64748B' }}>{opt.label}</button>
          })}
        </div>
        <div style={{ width: 1, height: 18, background: '#E2E8F0', margin: '0 0.125rem' }} />
        {([
          { key: 'photos',    label: 'Photos',     ac: '#0EA5E9' },
          { key: 'risks',     label: 'Risks',      ac: '#0EA5E9' },
          { key: 'process',   label: 'Süreç',      ac: '#7C3AED' },
        ] as { key: LayerKey; label: string; ac: string }[]).map(({ key, label, ac }) => {
          const on = layers[key]
          return <button key={key} onClick={() => setLayers(p => ({ ...p, [key]: !p[key] }))} style={{ padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: on ? ac : '#F1F5F9', color: on ? '#fff' : '#64748B' }}>{label}</button>
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2, gap: 1 }}>
          {(['weekly', 'monthly', 'quarterly'] as Timeframe[]).map(t => (
            <button key={t} onClick={() => setTf(t)} style={{ padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: tf === t ? '#fff' : 'transparent', color: tf === t ? '#0F172A' : '#64748B', boxShadow: tf === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Gantt ── */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: LABEL_W + periods.length * COL_W[tf] }}>

          {/* Period header */}
          <div style={{ display: 'flex', height: 36, background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 5 }}>
            <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#F1F5F9' }}>
              <span style={{ fontSize: '0.57rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Work Stream</span>
            </div>
            <div style={{ flex: 1, display: 'flex' }}>
              {periods.map(p => {
                const isNow = today >= p.start && today <= p.end
                return (
                  <div key={p.key} style={{ flex: 1, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isNow ? '#EFF6FF' : 'transparent' }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: isNow ? 800 : 500, color: isNow ? '#2563EB' : '#94A3B8', whiteSpace: 'nowrap' }}>{p.label}{isNow ? ' · Now' : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Site Chronicle */}
          {layers.photos && boardPhotos.length > 0 && (
            <div style={{ display: 'flex', height: 64, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>📷 Site Chronicle</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#F8FAFC' }}>
                <GridBg />
                {boardPhotos.slice(0, 6).map((url, i) => {
                  const frac = (i + 0.5) / Math.min(boardPhotos.length, 6)
                  return <div key={i} style={{ position: 'absolute', left: `calc(${frac * 100}% - 20px)`, top: 6, width: 40, height: 52, borderRadius: 4, overflow: 'hidden', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 1 }}><img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                })}
                <TodayLine />
              </div>
            </div>
          )}

          {/* (work stream rows removed) */}


          {/* Risks */}
          {layers.risks && DEMO_RISKS.map(risk => (
            <div key={risk.id} style={{ display: 'flex', height: 28, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.5rem', fontWeight: 800, borderRadius: 3, padding: '0.1rem 0.3rem', background: SEV[risk.severity].bg, color: SEV[risk.severity].text }}>{risk.severity}</span>
                <span style={{ fontSize: '0.6rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.name}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridBg />
                <div style={{ position: 'absolute', left: `${risk.startFrac * 100}%`, width: `${(risk.endFrac - risk.startFrac) * 100}%`, top: '20%', height: '60%', borderRadius: 2, background: SEV[risk.severity].text + '22', borderLeft: `3px solid ${SEV[risk.severity].text}`, zIndex: 1 }} />
                <TodayLine />
              </div>
            </div>
          ))}

          {/* ══ STANDARD PROCESS — 2-row swim lanes per phase ══ */}
          {layers.process && STANDARD_PROCESS.map((phase, phaseIdx) => {
            const rows   = assignToRows(phase.milestones, N_ROWS)
            const fazNum = phase.name.split(' — ')[0]   // "FAZ 1" … "FAZ 5"
            const phaseH = N_ROWS * ROW_H

            return (
              <div key={phase.id} style={{
                display: 'flex',
                borderTop:    phaseIdx === 0 ? `1.5px solid ${phase.color}40` : 'none',
                borderBottom: `1.5px solid ${phase.color}40`,
              }}>

                {/* Label cell — spans full phase height, text centred */}
                <div style={{
                  width: LABEL_W, flexShrink: 0,
                  height: phaseH,
                  borderRight: `2px solid ${phase.color}`,
                  background: '#fff',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '0.1rem',
                  padding: '0 0.5rem',
                }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: phase.color, letterSpacing: '0.03em', userSelect: 'none', lineHeight: 1.2 }}>
                    {fazNum}
                  </span>
                  <span style={{ fontSize: '0.54rem', fontWeight: 700, color: phase.color, letterSpacing: '0.06em', userSelect: 'none', opacity: 0.75, lineHeight: 1.2 }}>
                    {phase.shortName}
                  </span>
                </div>

                {/* 2 timeline lanes stacked */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                  {Array.from({ length: N_ROWS }, (_, rowIdx) => {
                    const rowKms = rows[rowIdx] ?? []
                    return (
                      <div key={rowIdx} style={{
                        height: ROW_H, position: 'relative', overflow: 'visible',
                        borderBottom: rowIdx < N_ROWS - 1 ? `1px dashed ${phase.color}20` : 'none',
                      }}>
                        <GridBg bg="transparent" />
                        {rowKms.map(km => (
                          <DiamondMarker key={km.id} km={km} color={phase.color} />
                        ))}
                        <TodayLine />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* ══ Cash rows — 3 × 2-row blocks ══ */}
          {(() => {
            const SYM = currency === 'TRY' ? '₺' : '$'
            function fmtK(n: number) {
              const abs = Math.abs(n)
              const s   = abs >= 1_000_000 ? `${(abs / 1_000_000).toFixed(1)}M`
                        : abs >= 1_000     ? `${(abs / 1_000).toFixed(0)}K`
                        : abs.toFixed(0)
              return (n < 0 ? '-' : '') + SYM + s
            }

            const periodOut: number[] = periods.map(() => 0)
            const periodIn:  number[] = periods.map(() => 0)

            function addToPeriod(date: string, amount: number, arr: number[]) {
              const d = new Date(date + 'T00:00:00').getTime()
              for (let i = 0; i < periods.length; i++) {
                if (d >= periods[i].start.getTime() && d <= periods[i].end.getTime()) {
                  arr[i] += amount; return
                }
              }
            }
            cashOut.forEach(t => addToPeriod(t.date, t.amount, periodOut))
            cashIn.forEach(t  => addToPeriod(t.date, t.amount, periodIn))
            const periodNet = periodOut.map((o, i) => periodIn[i] - o)

            const maxOut = Math.max(...periodOut, 1)
            const maxIn  = Math.max(...periodIn,  1)
            const maxNet = Math.max(...periodNet.map(Math.abs), 1)

            const C_OUT = '#EF4444'
            const C_IN  = '#10B981'

            // period mid-point as pct of full timeline
            function periodMidPct(i: number) {
              const mid = new Date((periods[i].start.getTime() + periods[i].end.getTime()) / 2)
              return pct(mid)
            }
            // width of one period slot as % of full timeline
            const slotW = periods.length > 0
              ? ((periods[0].end.getTime() - periods[0].start.getTime()) / (rangeEnd.getTime() - rangeStart.getTime())) * 100
              : 0
            const barW  = Math.max(slotW * 0.45, 0.4) // 45% of slot width

            type CashRowDef = {
              label: string; sub: string
              accentColor: string
              values: number[]; maxVal: number; isNet: boolean
            }

            const cashRowDefs: CashRowDef[] = [
              { label: 'Cash Out', sub: 'Harcama',  accentColor: C_OUT,     values: periodOut, maxVal: maxOut, isNet: false },
              { label: 'Cash In',  sub: 'Tahsilat', accentColor: C_IN,      values: periodIn,  maxVal: maxIn,  isNet: false },
              { label: 'Net Cash', sub: 'Bakiye',   accentColor: '#2563EB', values: periodNet, maxVal: maxNet, isNet: true  },
            ]

            return cashRowDefs.map((row, ri) => (
              <div key={row.label} style={{
                display: 'flex',
                borderTop:    ri === 0 ? '1.5px solid #E2E8F0' : 'none',
                borderBottom: '1.5px solid #E2E8F0',
              }}>
                {/* Label cell */}
                <div style={{
                  width: LABEL_W, flexShrink: 0,
                  height: N_ROWS * ROW_H,
                  borderRight: `2px solid ${row.accentColor}`,
                  background: '#fff',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '0.1rem', padding: '0 0.5rem',
                }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: row.accentColor, letterSpacing: '0.03em', userSelect: 'none', lineHeight: 1.2 }}>{row.label}</span>
                  <span style={{ fontSize: '0.54rem', fontWeight: 600, color: row.accentColor, opacity: 0.65, letterSpacing: '0.06em', userSelect: 'none', lineHeight: 1.2 }}>{row.sub}</span>
                </div>

                {/* Timeline area — 2 stacked rows, absolute positioning like phase rows */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                  {/* Row 0 — bar chart */}
                  <div style={{ height: ROW_H, position: 'relative', overflow: 'visible', borderBottom: '1px dashed #E2E8F0' }}>
                    <GridBg bg="transparent" />
                    {periods.map((_, i) => {
                      const val = row.values[i]
                      if (val === 0) return null
                      const barH  = Math.round(Math.max(3, (Math.abs(val) / row.maxVal) * (ROW_H - 5)))
                      const color = row.isNet ? (val >= 0 ? C_IN : C_OUT) : row.accentColor
                      const midPct = periodMidPct(i)
                      if (midPct < 0 || midPct > 100) return null
                      return (
                        <div
                          key={i}
                          title={fmtK(val)}
                          style={{
                            position: 'absolute',
                            left: `${midPct}%`,
                            bottom: 2,
                            transform: 'translateX(-50%)',
                            width: `${barW}%`,
                            height: barH,
                            background: color,
                            borderRadius: '2px 2px 0 0',
                            opacity: 0.8,
                            zIndex: 2,
                          }}
                        />
                      )
                    })}
                    <TodayLine />
                  </div>
                  {/* Row 1 — value labels */}
                  <div style={{ height: ROW_H, position: 'relative', overflow: 'visible' }}>
                    <GridBg bg="transparent" />
                    {periods.map((_, i) => {
                      const val   = row.values[i]
                      if (val === 0) return null
                      const color = row.isNet ? (val > 0 ? C_IN : val < 0 ? C_OUT : '#94A3B8') : row.accentColor
                      const midPct = periodMidPct(i)
                      if (midPct < 0 || midPct > 100) return null
                      return (
                        <span
                          key={i}
                          style={{
                            position: 'absolute',
                            left: `${midPct}%`,
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '0.5rem',
                            fontWeight: 700,
                            color,
                            whiteSpace: 'nowrap',
                            zIndex: 2,
                          }}
                        >
                          {fmtK(val)}
                        </span>
                      )
                    })}
                    <TodayLine />
                  </div>
                </div>
              </div>
            ))
          })()}

        </div>
      </div>
    </div>
  )
}
