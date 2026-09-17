import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHome } from '../../app/HomeContext'
import { formatBandwidthMHz, qualityText, rsrpQuality, rsrqColorClass, sinrColorClass, sumBandwidthMHz } from '../../format'
import type { CarrierComponent } from '../../types'
import { Card, Chip, SignalBars, Skeleton } from '../../ui/primitives'

// ── Tooltip ───────────────────────────────────────────────────────────────────

const TIP_WIDTH = 224

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; top: number; bottom: number } | null>(null)

  const measure = () => {
    const r = ref.current?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, top: r.top, bottom: r.bottom } : null
  }

  const half = TIP_WIDTH / 2
  const left = pos ? Math.min(Math.max(pos.x, half + 8), window.innerWidth - half - 8) : 0
  const below = pos ? pos.top < 130 : false

  return (
    <span
      ref={ref}
      className="cursor-help"
      onMouseEnter={() => setPos(measure())}
      onMouseLeave={() => setPos(null)}
      onTouchStart={() => setPos((p) => (p ? null : measure()))}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-50 w-56 rounded-lg border border-line/10 bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-ink2 shadow-lg"
            style={
              below
                ? { left, top: pos.bottom + 8 }
                : { left, top: pos.top - 8, transform: 'translateY(-100%)' }
            }
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}

const RSRP_TIP =
  'RSRP（参考信号接收功率）：单个 LTE/NR 参考信号的功率，是衡量信号强度的主要指标。'
const RSRQ_TIP =
  'RSRQ（参考信号接收质量）：综合噪声和邻近小区干扰后衡量的信号质量。'
const SINR_TIP =
  'SINR（信号与干扰加噪声比）：信号相对于干扰和噪声的强度，是影响可达速率的关键指标。'
const RSSI_TIP =
  'RSSI（接收信号强度指示）：包括信号、噪声和干扰在内的宽带总接收功率。'

// ── Carrier table (desktop) / cards (mobile) ──────────────────────────────────

function CarrierStatus({ carrier, empty = null }: { carrier: CarrierComponent; empty?: React.ReactNode }) {
  if (carrier.ul_configured === undefined && carrier.active === undefined) return empty

  return (
    <span className="flex flex-wrap gap-1">
      {carrier.ul_configured !== undefined && (
        <Chip tone={carrier.ul_configured ? 'ok' : 'default'}>UL 上行 {carrier.ul_configured ? '\u2713' : '\u2717'}</Chip>
      )}
      {carrier.active !== undefined && (
        <Chip tone={carrier.active ? 'ok' : 'default'}>{carrier.active ? '活动' : '空闲'}</Chip>
      )}
    </span>
  )
}

function CarrierTable({ carriers, tech }: { carriers: CarrierComponent[]; tech: 'NR' | 'LTE' }) {
  if (carriers.length === 0) return null
  const isNR = tech === 'NR'
  const sorted = [...carriers].sort((a, b) => (a.label === 'PCC' ? -1 : b.label === 'PCC' ? 1 : 0))
  const bandText = isNR ? 'text-violet-600 dark:text-violet-400' : 'text-accent'

  return (
    <div className={isNR ? 'mb-4' : ''}>
      <p className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${bandText}`}>
        {isNR ? 'NR 5G' : 'LTE'} 载波
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line/8 text-[11px] uppercase tracking-wider text-ink3">
              <th className="pb-1.5 pr-3 font-semibold">类型</th>
              <th className="pb-1.5 pr-3 font-semibold">频段</th>
              <th className="pb-1.5 pr-3 font-semibold">状态</th>
              <th className="pb-1.5 pr-3 font-semibold">PCI</th>
              <th className="pb-1.5 pr-3 font-semibold">{isNR ? 'ARFCN' : 'EARFCN'}</th>
              <th className="pb-1.5 pr-3 font-semibold">带宽</th>
              <th className="pb-1.5 pr-3 font-semibold">频率</th>
              <th className="pb-1.5 pr-3 font-semibold">
                <Tip text={RSRP_TIP}>
                  <span className="underline decoration-dotted underline-offset-2">RSRP</span>
                </Tip>
              </th>
              <th className="pb-1.5 pr-3 font-semibold">
                <Tip text={RSRQ_TIP}>
                  <span className="underline decoration-dotted underline-offset-2">RSRQ</span>
                </Tip>
              </th>
              <th className="pb-1.5 pr-3 font-semibold">
                <Tip text={SINR_TIP}>
                  <span className="underline decoration-dotted underline-offset-2">SINR</span>
                </Tip>
              </th>
              <th className="pb-1.5 font-semibold">
                <Tip text={RSSI_TIP}>
                  <span className="underline decoration-dotted underline-offset-2">RSSI</span>
                </Tip>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const isPcc = c.label === 'PCC'
              return (
                <tr
                  key={i}
                  className={`border-b border-line/6 last:border-0 ${isPcc ? 'bg-accent/4' : ''}`}
                >
                  <td className="py-1.5 pr-3">
                    <Chip tone={isPcc ? (isNR ? 'nr' : 'lte') : 'default'}>{c.label}</Chip>
                  </td>
                  <td className={`py-1.5 pr-3 font-semibold ${bandText}`}>{c.band}</td>
                  <td className="py-1.5 pr-3 text-ink3">
                    <CarrierStatus carrier={c} empty={'\u2014'} />
                  </td>
                  <td className="tnum py-1.5 pr-3 text-ink">{c.pci}</td>
                  <td className="tnum py-1.5 pr-3 text-ink">{c.earfcn}</td>
                  <td className="tnum py-1.5 pr-3 text-ink2">{c.bandwidth}</td>
                  <td className="tnum py-1.5 pr-3 text-ink2">
                    {c.freq ? `${c.freq.toFixed(1)} MHz` : '\u2014'}
                  </td>
                  <td className={`tnum py-1.5 pr-3 font-semibold ${qualityText(rsrpQuality(c.rsrp))}`}>
                    {c.rsrp ?? '\u2014'}
                  </td>
                  <td className={`tnum py-1.5 pr-3 font-medium ${rsrqColorClass(c.rsrq)}`}>
                    {c.rsrq ?? '\u2014'}
                  </td>
                  <td className={`tnum py-1.5 pr-3 font-medium ${sinrColorClass(c.sinr)}`}>
                    {c.sinr ?? '\u2014'}
                  </td>
                  <td className="tnum py-1.5 text-ink2">{c.rssi ?? '\u2014'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {sorted.map((c, i) => {
          const isPcc = c.label === 'PCC'
          const metrics = [
            { label: 'RSRP', value: c.rsrp, cls: qualityText(rsrpQuality(c.rsrp)) },
            { label: 'RSRQ', value: c.rsrq, cls: rsrqColorClass(c.rsrq) },
            { label: 'SINR', value: c.sinr, cls: sinrColorClass(c.sinr) },
            { label: 'RSSI', value: c.rssi, cls: 'text-ink2' },
          ]
          return (
            <div
              key={i}
              className={`rounded-lg border p-3 ${isPcc ? 'border-accent/25 bg-accent/4' : 'border-line/8'}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Chip tone={isPcc ? (isNR ? 'nr' : 'lte') : 'default'}>{c.label}</Chip>
                <span className={`text-sm font-bold ${bandText}`}>{c.band}</span>
                <div className="ml-auto">
                  <CarrierStatus carrier={c} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-ink3">{m.label}</p>
                    <p className={`tnum text-sm font-bold ${m.cls}`}>{m.value ?? '\u2014'}</p>
                  </div>
                ))}
              </div>
              <div className="tnum mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-line/8 pt-2 text-[11px] text-ink3">
                <span>PCI {c.pci}</span>
                <span>
                  {isNR ? 'ARFCN' : 'EARFCN'} {c.earfcn}
                </span>
                <span>带宽 {c.bandwidth}</span>
                {c.freq != null && <span>{c.freq.toFixed(1)} MHz</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Overview() {
  // Served by the shared home poll — the batch already carries this exact
  // payload, so a second /api/network/signal poll was pure duplicate load.
  const { data: home } = useHome()

  if (!home) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const data = home.signal
  if (!data) {
    return (
      <Card>
        <p className="text-[13px] text-ink3">设备尚未上报无线信号数据。</p>
      </Card>
    )
  }

  const hasNR = data.nr_carriers.length > 0
  const hasLTE = data.lte_carriers.length > 0
  const nrBw = sumBandwidthMHz(data.nr_carriers)
  const lteBw = sumBandwidthMHz(data.lte_carriers)
  const totalBw = nrBw + lteBw

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">连接信息</p>
            <p className="mt-0.5 text-sm font-bold text-ink">{data.type ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">运营商</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{data.carrier ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">小区 ID</p>
            <p className="tnum mt-0.5 font-mono text-[13px] text-ink2">{data.cell_id ?? '\u2014'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">载波</p>
            <p className="mt-0.5 text-sm text-ink2">
              {hasNR ? `${data.nr_carriers.length} NR` : ''}
              {hasNR && hasLTE ? ' + ' : ''}
              {hasLTE ? `${data.lte_carriers.length} LTE` : ''}
              {!hasNR && !hasLTE ? '\u2014' : ''}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">带宽</p>
            <p className="tnum mt-0.5 text-sm font-bold text-ink">{formatBandwidthMHz(totalBw)}</p>
            {hasNR && hasLTE && (
              <p className="tnum text-[10px] text-ink3">
                NR {formatBandwidthMHz(nrBw)} + LTE {formatBandwidthMHz(lteBw)}
              </p>
            )}
          </div>
          <div className="ml-auto">
            <SignalBars bars={data.signal_bars} large />
          </div>
        </div>
      </Card>

      {(hasNR || hasLTE) && (
        <Card title="当前小区信息">
          <CarrierTable carriers={data.nr_carriers} tech="NR" />
          <CarrierTable carriers={data.lte_carriers} tech="LTE" />
        </Card>
      )}

      <Card title="信号质量参考">
        <div className="grid grid-cols-1 gap-4 text-[13px] md:grid-cols-3">
          <div>
            <p className="mb-1.5 font-semibold text-ink">RSRP 参考信号接收功率（dBm）</p>
            <div className="space-y-0.5 text-ink2">
              <div className="flex justify-between"><span className="text-ok">极好</span><span className="tnum text-ink3">&gt; -80</span></div>
              <div className="flex justify-between"><span className="text-ok">良好</span><span className="tnum text-ink3">-80 至 -90</span></div>
              <div className="flex justify-between"><span className="text-warn">一般</span><span className="tnum text-ink3">-90 至 -100</span></div>
              <div className="flex justify-between"><span className="text-danger">较差</span><span className="tnum text-ink3">&lt; -100</span></div>
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-ink">RSRQ 参考信号接收质量（dB）</p>
            <div className="space-y-0.5 text-ink2">
              <div className="flex justify-between"><span className="text-ok">良好</span><span className="tnum text-ink3">&gt; -10</span></div>
              <div className="flex justify-between"><span className="text-warn">一般</span><span className="tnum text-ink3">-10 至 -15</span></div>
              <div className="flex justify-between"><span className="text-danger">较差</span><span className="tnum text-ink3">&lt; -15</span></div>
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-semibold text-ink">SINR 信干噪比（dB）</p>
            <div className="space-y-0.5 text-ink2">
              <div className="flex justify-between"><span className="text-ok">极好</span><span className="tnum text-ink3">&gt; 20</span></div>
              <div className="flex justify-between"><span className="text-ok">良好</span><span className="tnum text-ink3">10 至 20</span></div>
              <div className="flex justify-between"><span className="text-warn">一般</span><span className="tnum text-ink3">0 至 10</span></div>
              <div className="flex justify-between"><span className="text-danger">较差</span><span className="tnum text-ink3">&lt; 0</span></div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
