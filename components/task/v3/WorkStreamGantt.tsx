'use client'

import React, { useState, useMemo, useRef } from 'react'
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
  shortName: string      // shown in row label
  why: string            // shown in ⓘ tooltip
  frac: number           // 0–1 along project timeline
  major: boolean         // large gold diamond, all-caps in data
}

type ProcessPhase = {
  id: string
  label: string
  purpose: string
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

const LABEL_W = 160

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

// ─── Standard Construction Process (Türkiye Kat Karşılığı — 24-month / 26 KM) ─

const STANDARD_PROCESS: ProcessPhase[] = [
  {
    id: 'p1', color: '#7C3AED', startFrac: 0.00, endFrac: 0.08,
    label: 'FAZ 1 — Geliştirme & Hukuki Temel',
    purpose: 'Yatırımın fizibilitesini kesinleştirmek ve arsa kontrolünü ele almak.',
    milestones: [
      { id: 'km1',  num: 1,  shortName: 'Arsa Sahibi Ön Anlaşması',        frac: 0.02, major: false, why: 'Hukuki zırhın ilk halkası. Arsa üzerindeki hakların ticari şartlarda tescil altına alınması; kâr paylaşım modelinin netleşmesi.' },
      { id: 'km2',  num: 2,  shortName: 'Resmi Sözleşme & Tapu Şerhi',     frac: 0.05, major: false, why: 'Noter onaylı Kat Karşılığı İnşaat Sözleşmesi\'nin tapu siciline şerh düşürülmesi. Hukuki zemin tamamlanır; arsa artık "bloke".' },
    ],
  },
  {
    id: 'p2', color: '#2563EB', startFrac: 0.06, endFrac: 0.25,
    label: 'FAZ 2 — Tasarım, Mühendislik & Ruhsatlandırma',
    purpose: 'Kağıt üzerindeki projenin yasal onaylarını almak.',
    milestones: [
      { id: 'km3',  num: 3,  shortName: 'Zemin Etüdü & Veri Onayı',        frac: 0.08, major: false, why: 'Yanlış zemin verisi kaba inşaat bütçesini %20 artırabilir. Tüm statik ve zemin mühendisliği projelerinin temel girdisidir.' },
      { id: 'km4',  num: 4,  shortName: 'Konsept Proje Onayı',              frac: 0.12, major: false, why: 'Tasarımın "satılabilirlik" tescili. Ön satış ve pazarlama materyallerinin hazırlanmasına olanak sağlar; yatırımcı sunumlarında kullanılır.' },
      { id: 'km5',  num: 5,  shortName: 'Avan Proje Belediye Onayı',        frac: 0.17, major: false, why: 'Emsal ve imar haklarının yasallaşması. Finansal modelin doğrulanması için kritik eşik; proje değişikliği bu noktadan sonra çok pahalıdır.' },
      { id: 'km6',  num: 6,  shortName: 'Uygulama Projeleri (Statik/MEP)', frac: 0.21, major: false, why: 'Statik, elektrik, mekanik uygulama projelerinin tamamlanması. Ruhsat başvurusu için belediyeye sunulacak teknik dosyanın hazırlanması.' },
      { id: 'km7',  num: 7,  shortName: '⭐ YAPI RUHSATI ALIMI',            frac: 0.24, major: true,  why: 'İnşaatın resmi başlangıç tetikleyicisi ve finansmanın önünün açılması. Banka inşaat kredisi için genellikle bu belge zorunlu tutulur.' },
    ],
  },
  {
    id: 'p3', color: '#EA580C', startFrac: 0.23, endFrac: 0.50,
    label: 'FAZ 3 — Altyapı & Kaba Yapı İmalatları',
    purpose: 'Binanın taşıyıcı sistemini ve ana omurgasını kurmak.',
    milestones: [
      { id: 'km8',  num: 8,  shortName: 'Mobilizasyon & Hafriyat Başl.',   frac: 0.26, major: false, why: 'Şantiye sahasının kontrol altına alınması. Geri sayım saatinin başladığı andır; her gecikme hakediş gecikmesi anlamına gelir.' },
      { id: 'km9',  num: 9,  shortName: 'Hafriyat & İksa Sonu',            frac: 0.30, major: false, why: 'Temel dökümü için en büyük fiziksel riskin geçilmesi. Çevre yapılara zarar ve kazı göçü riski bu noktada kapanır.' },
      { id: 'km10', num: 10, shortName: 'Temel & Bodrum Betonarmesi',       frac: 0.35, major: false, why: 'Sıfır kotuna ulaşılması; finansal hakediş noktası. Bankalar genellikle bu aşamayı birinci kredi dilimi tetikleyicisi olarak kullanır.' },
      { id: 'km11', num: 11, shortName: 'Normal Katlar Betonarme',          frac: 0.40, major: false, why: 'Periyodik üretim hızı kontrolü. Kat başına beton dökme süresinin takip edildiği kritik üretim metrikleridir.' },
      { id: 'km12', num: 12, shortName: 'Alt Yüklenici İhale Sonu',         frac: 0.44, major: false, why: 'Kaba biterken ince işçilerin sahaya girmesini sağlayan kilit geçiş. Sözleşme gecikirse ince işler de kayar.' },
      { id: 'km13', num: 13, shortName: '⭐ KARKAS SONU (Çatı Kapanışı)',    frac: 0.48, major: true,  why: 'Binanın silüetinin bitişi; kaba imalatın teknik kabulü. En büyük maliyet bloğunun kapanması ve ikinci hakediş dönemi.' },
    ],
  },
  {
    id: 'p4', color: '#0D9488', startFrac: 0.48, endFrac: 0.90,
    label: 'FAZ 4 — İnce İşler, Cephe & Dış Mekan',
    purpose: 'Binayı dış hava şartlarından izole etmek ve yaşam standartlarını oluşturmak.',
    milestones: [
      { id: 'km14', num: 14, shortName: 'Dış Cephe & Doğrama Başl.',        frac: 0.50, major: false, why: 'Binayı dış şartlardan izole etme sürecinin başlangıcı. Alt yüklenici cephe ekibinin mobilizasyonunu tetikler.' },
      { id: 'km15', num: 15, shortName: '⭐ DIŞ KABUK KAPANIŞI (Watertight)', frac: 0.55, major: true,  why: 'İç mekan ahşap ve boya işlerini garantiye alan en büyük KM. Islak hasar ve şantiye hava şartlarından etkilenme riski bu noktada kapanır.' },
      { id: 'km16', num: 16, shortName: 'Kaba İnce İşler (Duvar/Sıva)',     frac: 0.59, major: false, why: 'Oda hacimlerinin ve fonksiyonun ortaya çıkması. Elektrik ve mekanik tesisat kanallarının sıva altına alınması.' },
      { id: 'km17', num: 17, shortName: 'Şap & Islak Hacim Yalıtım Test.',  frac: 0.64, major: false, why: 'Su sızıntısı riskinin elimine edilmesi. Testler başarısız olursa tamirat seramik kaplamadan önce yapılmalıdır; çok pahalı.' },
      { id: 'km18', num: 18, shortName: 'Ağır Sistem (Asansör/Trafo)',      frac: 0.68, major: false, why: 'Binanın damar ve sinir sisteminin ana cihazlarının kurulumu. Uzun tedarik süreli ekipmanlar; geç sipariş verilirse inşaatı bekletir.' },
      { id: 'km19', num: 19, shortName: '⭐ ÖRNEK DAİRE ONAYI',              frac: 0.72, major: true,  why: 'Seri imalata geçmeden önce "kalite standardının" tescili. Hem müşteri hem yüklenici tarafından imzalanan standart haline gelir.' },
      { id: 'km20', num: 20, shortName: 'Mobilya, Kapı & Seramik Montaj',   frac: 0.76, major: false, why: 'Mahal Listesi\'ndeki estetik kalitenin seri uygulanması. En yoğun iş gücü yoğunluğu; birden fazla alt yüklenici eş zamanlı.' },
      { id: 'km21', num: 21, shortName: 'İç Mekan Final Boya & Vitrifiye',  frac: 0.80, major: false, why: 'Teslimat öncesi son estetik dokunuşlar. Bu aşamadan sonra şantiyeye erişim kısıtlanır; hasar riski sıfırlanır.' },
      { id: 'km22', num: 22, shortName: 'Peyzaj & Çevre Düzenleme',         frac: 0.84, major: false, why: '"Proje bitti" algısını yaratan görsel final. İskan dosyası için belediye denetiminde aranan tamamlanma şartı.' },
      { id: 'km23', num: 23, shortName: 'Temizlik & Snag List',              frac: 0.88, major: false, why: 'Yasal kabuller öncesi son teknik kontrol. Teslimat listesindeki açık kalemlerin kapatıldığı son fırsat.' },
    ],
  },
  {
    id: 'p5', color: '#059669', startFrac: 0.88, endFrac: 1.00,
    label: 'FAZ 5 — Devreye Alma, Kabul & Teslimat',
    purpose: 'Teknik sistemleri çalıştırmak ve mülkiyeti devretmek.',
    milestones: [
      { id: 'km24', num: 24, shortName: 'Teknik Kabul & Sistem Testleri',   frac: 0.91, major: false, why: 'İskan dosyasının "itfaiye" engelini aşması. Yangın algılama, söndürme ve kaçış sistemleri testleri resmi kurumlara sunulur.' },
      { id: 'km25', num: 25, shortName: '⭐ İSKAN ALIMI (Yapı Kullanma İzni)', frac: 0.96, major: true,  why: 'Binanın mülk statüsünü kazandığı an. Tapu devri ve ipotek kurulumu için zorunlu; iskansız satış hukuki açıdan geçersizdir.' },
      { id: 'km26', num: 26, shortName: 'Nihai Teslimat & Tapu Devirleri',  frac: 1.00, major: false, why: 'Geliştiricinin finansal çıkışı (exit) ve sorumluluk devri. 2 yıllık yasal ayıp süresinin ve garanti döneminin başlangıcı.' },
    ],
  },
]

const STRIPE =
  'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.28) 3px,rgba(255,255,255,0.28) 6px)'

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

// ─── InfoTooltip ──────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    >
      <button style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(148,163,184,0.15)', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', padding: 0, fontSize: '0.48rem', color: '#64748B', fontWeight: 800, lineHeight: 1, flexShrink: 0 }}>ⓘ</button>
      {open && (
        <div style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', zIndex: 60, background: '#0F172A', color: '#CBD5E1', fontSize: '0.62rem', lineHeight: 1.55, padding: '0.55rem 0.75rem', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', width: 250, whiteSpace: 'normal', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid #0F172A' }} />
          {text}
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
  const [layers,    setLayers]    = useState<Record<LayerKey, boolean>>({ photos: false, milestones: true, risks: false, process: false })
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
    ? <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: '#2563EB', opacity: 0.45, pointerEvents: 'none', zIndex: 2 }} />
    : null

  const GridLines = () => (
    <>
      {periods.map(p => {
        const isNow = today >= p.start && today <= p.end
        return <div key={p.key} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(p.start)}%`, width: `${pct(p.end) - pct(p.start)}%`, background: isNow ? 'rgba(37,99,235,0.04)' : 'transparent', borderRight: '1px solid #F1F5F9', pointerEvents: 'none' }} />
      })}
    </>
  )

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8FAFC', borderTop: '1.5px solid #E2E8F0' }}>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', padding: '0.5rem 1rem', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>

        {/* STATUS pills */}
        <div style={{ display: 'flex', gap: '0.2rem' }}>
          {[{ id: 'all', label: 'All' }, ...columns.map(c => ({ id: c.id, label: c.name }))].map(opt => {
            const active = filter === opt.id
            return <button key={opt.id} onClick={() => setFilter(opt.id)} style={{ padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? '#0F172A' : '#F1F5F9', color: active ? '#fff' : '#64748B' }}>{opt.label}</button>
          })}
        </div>

        <div style={{ width: 1, height: 18, background: '#E2E8F0', margin: '0 0.125rem' }} />

        {/* LAYER toggles */}
        {([
          { key: 'photos',    label: 'Photos',     activeColor: '#0EA5E9' },
          { key: 'milestones', label: 'Milestones', activeColor: '#0EA5E9' },
          { key: 'risks',     label: 'Risks',      activeColor: '#0EA5E9' },
          { key: 'process',   label: 'Süreç',      activeColor: '#7C3AED' },
        ] as { key: LayerKey; label: string; activeColor: string }[]).map(({ key, label, activeColor }) => {
          const active = layers[key]
          return <button key={key} onClick={() => setLayers(p => ({ ...p, [key]: !p[key] }))} style={{ padding: '0.2rem 0.55rem', borderRadius: 99, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? activeColor : '#F1F5F9', color: active ? '#fff' : '#64748B' }}>{label}</button>
        })}

        <div style={{ flex: 1 }} />

        {/* Timeframe */}
        <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 2, gap: 1 }}>
          {(['weekly', 'monthly', 'quarterly'] as Timeframe[]).map(t => (
            <button key={t} onClick={() => setTf(t)} style={{ padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.67rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: tf === t ? '#fff' : 'transparent', color: tf === t ? '#0F172A' : '#64748B', boxShadow: tf === t ? '0 1px 3px rgba(0,0,0,0.10)' : 'none' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Gantt */}
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
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>📷 Site Chronicle</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#F8FAFC' }}>
                <GridLines />
                {boardPhotos.slice(0, 6).map((url, i) => {
                  const frac = (i + 0.5) / Math.min(boardPhotos.length, 6)
                  return <div key={i} style={{ position: 'absolute', left: `calc(${frac * 100}% - 20px)`, top: 6, width: 40, height: 52, borderRadius: 4, overflow: 'hidden', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 1 }}><img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                })}
                <TodayLine />
              </div>
            </div>
          )}

          {/* Work stream rows */}
          {visibleColumns.map(col => {
            const colTasks = tasksByCol[col.id] ?? []
            const style    = colBarStyle(col.name)
            const isOpen   = !collapsed[col.id]
            const colDates = colTasks.map(t => new Date(t.due_date! + 'T00:00:00').getTime())
            const spanL    = colDates.length ? pct(new Date(Math.min(...colDates))) : null
            const spanR    = colDates.length ? pct(new Date(Math.max(...colDates))) : null

            return (
              <React.Fragment key={col.id}>
                <div onClick={() => setCollapsed(p => ({ ...p, [col.id]: !p[col.id] }))} style={{ display: 'flex', height: 34, borderBottom: '1px solid #E2E8F0', cursor: 'pointer', background: '#fff' }}>
                  <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0 0.75rem' }}>
                    <span style={{ fontSize: '0.6rem', color: '#94A3B8', flexShrink: 0, display: 'inline-block', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: style.bg, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.69rem', fontWeight: 600, color: '#1E293B', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                    <span style={{ fontSize: '0.57rem', color: '#94A3B8', flexShrink: 0 }}>{colTasks.length}</span>
                  </div>
                  <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <GridLines />
                    {spanL !== null && spanR !== null && (
                      <div style={{ position: 'absolute', left: `${spanL}%`, width: `${Math.max(spanR - spanL, 0.6)}%`, top: '22%', height: '56%', borderRadius: 3, background: style.dashed ? 'transparent' : style.bg, backgroundImage: style.stripe ? STRIPE : 'none', border: style.dashed ? '1.5px dashed #94A3B8' : 'none', opacity: 0.85, zIndex: 1 }} />
                    )}
                    <TodayLine />
                  </div>
                </div>
                {isOpen && colTasks.map(task => {
                  const d = new Date(task.due_date! + 'T00:00:00')
                  const bL = pct(addDays(d, -7)), bR = pct(d)
                  return (
                    <div key={task.id} style={{ display: 'flex', height: 24, borderBottom: '1px solid #F8FAFC', background: '#FAFBFD' }}>
                      <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem 0 1.875rem' }}>
                        <span style={{ fontSize: '0.62rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                      </div>
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: `${bL}%`, width: `${Math.max(bR - bL, 0.4)}%`, top: '15%', height: '70%', borderRadius: 2, background: style.bg, opacity: 0.55, backgroundImage: style.stripe ? STRIPE : 'none', zIndex: 1 }} />
                        <TodayLine />
                      </div>
                    </div>
                  )
                })}
              </React.Fragment>
            )
          })}

          {/* Project Milestones */}
          {layers.milestones && milestones.length > 0 && (
            <div style={{ display: 'flex', height: 32, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>◈ Milestones</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridLines />
                {milestones.map(m => {
                  const p = pct(new Date(m.target_date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  return <div key={m.id} title={`${m.name} · ${m.target_date}`} style={{ position: 'absolute', left: `${p}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)', width: 10, height: 10, zIndex: 2, background: m.completed_at ? '#10B981' : '#F59E0B', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
                })}
                <TodayLine />
              </div>
            </div>
          )}

          {/* Risk rows */}
          {layers.risks && DEMO_RISKS.map(risk => (
            <div key={risk.id} style={{ display: 'flex', height: 28, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.5rem', fontWeight: 800, borderRadius: 3, padding: '0.1rem 0.3rem', background: SEV[risk.severity].bg, color: SEV[risk.severity].text }}>{risk.severity}</span>
                <span style={{ fontSize: '0.6rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.name}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridLines />
                <div style={{ position: 'absolute', left: `${risk.startFrac * 100}%`, width: `${(risk.endFrac - risk.startFrac) * 100}%`, top: '20%', height: '60%', borderRadius: 2, background: SEV[risk.severity].text + '22', borderLeft: `3px solid ${SEV[risk.severity].text}`, zIndex: 1 }} />
                <TodayLine />
              </div>
            </div>
          ))}

          {/* ══════ Standard Process (Süreç) ══════ */}
          {layers.process && (
            <>
              {/* Section label */}
              <div style={{ display: 'flex', height: 28, background: '#F8F5FF', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.52rem', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Standart Süreç — 24 Ay / 26 KM</span>
                </div>
                <div style={{ flex: 1, position: 'relative', background: '#F8F5FF' }}>
                  {/* Phase color blocks in header */}
                  {STANDARD_PROCESS.map(phase => (
                    <div key={phase.id} title={phase.label} style={{ position: 'absolute', top: '35%', height: '30%', left: `${phase.startFrac * 100}%`, width: `${(phase.endFrac - phase.startFrac) * 100}%`, background: phase.color, opacity: 0.18, borderRadius: 2 }} />
                  ))}
                  <TodayLine />
                </div>
              </div>

              {STANDARD_PROCESS.map(phase => {
                const phaseOpen = !collapsed[phase.id]
                return (
                  <React.Fragment key={phase.id}>
                    {/* Phase header */}
                    <div
                      onClick={() => setCollapsed(p => ({ ...p, [phase.id]: !p[phase.id] }))}
                      style={{ display: 'flex', height: 30, borderBottom: '1px solid #E2E8F0', cursor: 'pointer', background: phase.color + '08' }}
                    >
                      <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `2px solid ${phase.color}`, display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0 0.6rem' }}>
                        <span style={{ fontSize: '0.58rem', color: phase.color, flexShrink: 0, display: 'inline-block', transform: phaseOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▾</span>
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: phase.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{phase.label}</span>
                        <InfoTooltip text={phase.purpose} />
                      </div>
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <GridLines />
                        {/* Phase span bar */}
                        <div style={{ position: 'absolute', left: `${phase.startFrac * 100}%`, width: `${(phase.endFrac - phase.startFrac) * 100}%`, top: 4, bottom: 4, borderRadius: 3, background: phase.color, opacity: 0.10, border: `1px solid ${phase.color}40`, zIndex: 1 }} />
                        {/* Major milestone diamonds on phase header */}
                        {phase.milestones.filter(km => km.major).map(km => (
                          <div key={km.id} title={km.shortName} style={{ position: 'absolute', left: `${km.frac * 100}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)', width: 8, height: 8, background: '#F59E0B', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', zIndex: 3 }} />
                        ))}
                        <TodayLine />
                      </div>
                    </div>

                    {/* KM rows */}
                    {phaseOpen && phase.milestones.map((km, idx) => {
                      const prevFrac = idx > 0 ? phase.milestones[idx - 1].frac : phase.startFrac
                      return (
                        <div key={km.id} style={{ display: 'flex', height: km.major ? 30 : 26, borderBottom: '1px solid #F1F5F9', background: km.major ? `${phase.color}05` : '#fff' }}>
                          {/* Label */}
                          <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', borderLeft: `2px solid ${phase.color}25`, display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0 0.55rem 0 1rem' }}>
                            {/* KM number badge */}
                            <div style={{
                              flexShrink: 0, width: 16, height: 16, borderRadius: 3,
                              background: km.major ? phase.color : phase.color + '20',
                              color: km.major ? '#fff' : phase.color,
                              fontSize: '0.46rem', fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {km.num}
                            </div>
                            <span style={{
                              fontSize: km.major ? '0.63rem' : '0.6rem',
                              fontWeight: km.major ? 700 : 500,
                              color: km.major ? '#0F172A' : '#475569',
                              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              // strip leading ⭐ from shortName
                              ...(km.shortName.startsWith('⭐') ? { color: '#0F172A' } : {}),
                            }}>
                              {km.shortName.replace(/^⭐\s*/, '')}
                            </span>
                            <InfoTooltip text={km.why} />
                          </div>

                          {/* Timeline */}
                          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'transparent' }}>
                            <GridLines />
                            {/* Lead-in line from previous KM */}
                            <div style={{ position: 'absolute', left: `${prevFrac * 100}%`, width: `${(km.frac - prevFrac) * 100}%`, top: '50%', height: 1, background: `${phase.color}30`, zIndex: 1 }} />
                            {/* Milestone marker */}
                            {km.major
                              ? (
                                <>
                                  {/* Gold star diamond for major */}
                                  <div style={{ position: 'absolute', left: `${km.frac * 100}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)', width: 11, height: 11, background: '#F59E0B', border: '2px solid #fff', boxShadow: `0 2px 6px rgba(245,158,11,0.5), 0 0 0 2px ${phase.color}25`, zIndex: 3 }} />
                                  {/* KM label above */}
                                  <div style={{ position: 'absolute', left: `${km.frac * 100}%`, top: 2, transform: 'translateX(-50%)', fontSize: '0.47rem', fontWeight: 800, color: phase.color, whiteSpace: 'nowrap', zIndex: 4, background: 'rgba(255,255,255,0.92)', padding: '0 3px', borderRadius: 2 }}>
                                    KM{km.num}
                                  </div>
                                </>
                              )
                              : (
                                <div style={{ position: 'absolute', left: `${km.frac * 100}%`, top: '50%', transform: 'translate(-50%, -50%) rotate(45deg)', width: 7, height: 7, background: phase.color, border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.18)', zIndex: 2 }} />
                              )
                            }
                            <TodayLine />
                          </div>
                        </div>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </>
          )}

          {/* Financial Flow */}
          {(cashIn.length > 0 || cashOut.length > 0) && (
            <div style={{ display: 'flex', height: 42, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: '#fff' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748B' }}>💰 Financial Flow</span>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
                <GridLines />
                {cashOut.map(t => {
                  const p = pct(new Date(t.date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  return <div key={t.id} title={`Cash Out: ${t.amount}`} style={{ position: 'absolute', bottom: 2, left: `${p}%`, transform: 'translateX(-4px)', width: 5, height: Math.max(6, Math.min(32, 4 + t.amount / 200000)), background: '#EF4444', borderRadius: '2px 2px 0 0', opacity: 0.8, zIndex: 1 }} />
                })}
                {cashIn.map(t => {
                  const p = pct(new Date(t.date + 'T00:00:00'))
                  if (p < 0 || p > 100) return null
                  return <div key={t.id} title={`Cash In: ${t.amount}`} style={{ position: 'absolute', top: 2, left: `${p}%`, transform: 'translateX(1px)', width: 5, height: Math.max(6, Math.min(32, 4 + t.amount / 200000)), background: '#10B981', borderRadius: '0 0 2px 2px', opacity: 0.8, zIndex: 1 }} />
                })}
                <TodayLine />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
