import { useHome } from '../../app/HomeContext'
import { formatBandwidthMHz, formatBytes, formatSpeed, formatUptime, modemMode, qualityBg, qualityLabel, qualityText, rsrpQuality, sumBandwidthMHz } from '../../format'
import { IActivity, IBolt, IDownload, IRadio, IUpload } from '../../icons'
import { Card, Chip, Meter, Row, SignalBars, Skeleton } from '../../ui/primitives'

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Skeleton className="col-span-2 h-40 xl:col-span-1" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data, error } = useHome()

  if (!data && !error) return <PageSkeleton />

  const signal = data?.signal ?? null
  const battery = data?.battery ?? null
  const speed = data?.speed ?? null
  const device = data?.device ?? null
  const wan = data?.wan ?? null
  const wan6 = data?.wan6 ?? null
  const cpu = data?.cpu ?? null
  const mem = data?.memory ?? null
  const usage = data?.usage ?? null

  const primary = signal?.lte_carriers?.[0] || signal?.nr_carriers?.[0]
  const pccRsrp = primary?.rsrp ?? signal?.rsrp
  const quality = rsrpQuality(pccRsrp)
  const mode = modemMode(signal?.type)
  const lteBw = signal ? sumBandwidthMHz(signal.lte_carriers) : 0
  const nrBw = signal ? sumBandwidthMHz(signal.nr_carriers) : 0
  const totalBw = lteBw + nrBw
  const carrierCount = (signal?.lte_carriers.length ?? 0) + (signal?.nr_carriers.length ?? 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">概览</h1>
        <p className="mt-0.5 text-[13px] text-ink2">{signal?.carrier ?? '移动网络状态'}</p>
      </div>

      {error && !data && (
        <Card>
          <p className="text-[13px] text-danger">{error}</p>
        </Card>
      )}

      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="col-span-2 xl:col-span-1">
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">信号强度</p>
                <div className="mt-1.5 flex items-end gap-2">
                  <span className={`tnum text-4xl font-bold leading-none ${qualityText(quality)}`}>
                    {pccRsrp != null ? pccRsrp : '\u2014'}
                  </span>
                  <span className="pb-0.5 text-[11px] font-medium text-ink3">dBm RSRP</span>
                </div>
                <p className={`mt-1 text-[12px] font-semibold ${qualityText(quality)}`}>{qualityLabel(quality)}</p>
              </div>
              <SignalBars bars={signal?.signal_bars} large />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line/8 pt-2.5">
              <span className={`h-2 w-2 rounded-full ${qualityBg(quality)}`} />
              <span className="text-[12px] text-ink2">{signal?.signal_bars ?? 0}/5 格</span>
              {primary?.band && (
                <Chip tone={primary.band.startsWith('n') ? 'nr' : 'lte'}>{primary.band}</Chip>
              )}
              {primary?.pci != null && primary.pci > 0 && (
                <span className="tnum text-[11px] text-ink3">PCI {primary.pci}</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex h-full flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-ink3">
                <IRadio size={14} />
                <p className="text-[10px] font-semibold uppercase tracking-wider">网络制式</p>
              </div>
              <p className="tnum mt-2 text-3xl font-bold text-ink">{mode}</p>
              <p className="mt-1 text-[12px] text-ink2">
                {carrierCount} 个活动载波
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line/8 pt-2.5">
              {nrBw > 0 && <Chip tone="nr">NR {formatBandwidthMHz(nrBw)}</Chip>}
              {lteBw > 0 && <Chip tone="lte">LTE {formatBandwidthMHz(lteBw)}</Chip>}
              {totalBw <= 0 && <span className="text-[11px] text-ink3">暂无带宽数据</span>}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex h-full flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-ink3">
                <IActivity size={14} />
                <p className="text-[10px] font-semibold uppercase tracking-wider">实时速率</p>
              </div>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <IDownload size={14} className="shrink-0 text-ok" />
                  <span className="tnum text-lg font-bold leading-none text-ink">
                    {speed ? formatSpeed(speed.rx_bps) : '\u2014'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <IUpload size={14} className="shrink-0 text-accent" />
                  <span className="tnum text-lg font-bold leading-none text-ink">
                    {speed ? formatSpeed(speed.tx_bps) : '\u2014'}
                  </span>
                </div>
              </div>
            </div>
            <p className="tnum border-t border-line/8 pt-2.5 text-[11px] text-ink3">
              下行峰值 {speed && speed.max_rx_bps > 0 ? formatSpeed(speed.max_rx_bps) : '\u2014'}
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex h-full flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-ink3">
                {battery?.charging ? <IBolt size={14} /> : <IRadio size={14} className="opacity-0" />}
                <p className="text-[10px] font-semibold uppercase tracking-wider">电池</p>
              </div>
              <p className="tnum mt-2 text-3xl font-bold text-ink">
                {battery?.percent != null ? `${battery.percent}%` : '\u2014'}
              </p>
              <p className="mt-1 text-[12px] text-ink2">{battery?.charging ? '充电中' : '电池供电'}</p>
            </div>
            <p className="tnum border-t border-line/8 pt-2.5 text-[11px] text-ink3">
              {battery?.voltage_mv ? `${(battery.voltage_mv / 1000).toFixed(2)} V` : '\u2014'}
              {battery?.temperature_c != null ? ` · ${battery.temperature_c.toFixed(1)}°C` : ''}
            </p>
          </div>
        </Card>
      </div>

      {/* Radio details */}
      {signal && (signal.lte_carriers.length > 0 || signal.nr_carriers.length > 0) && (
        <Card title="载波">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">LTE</p>
              {signal.lte_carriers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {signal.lte_carriers.map((c, i) => (
                    <Chip key={i} tone="lte">
                      {c.label} · {c.band}
                      {c.rsrp != null ? ` · ${c.rsrp} dBm` : ''}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink3">暂无活动 LTE 载波</p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                5G NR
              </p>
              {signal.nr_carriers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {signal.nr_carriers.map((c, i) => (
                    <Chip key={i} tone="nr">
                      {c.label} · {c.band}
                      {c.rsrp != null ? ` · ${c.rsrp} dBm` : ''}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-ink3">暂无活动 NR 载波</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Details row */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="连接信息">
          <Row label="运营商" value={signal?.carrier ?? '\u2014'} />
          <Row label="IPv4" value={wan?.ipv4 ?? '\u2014'} mono />
          <Row label="网关" value={wan?.gateway ?? '\u2014'} mono />
          <Row label="IPv6" value={wan6?.ipv6 ?? '\u2014'} mono wrap />
          {wan6?.prefix && <Row label="IPv6 前缀" value={wan6.prefix} mono wrap />}
          {wan?.dns && wan.dns.length > 0 && (
            <Row label="DNS" value={wan.dns.filter((d) => !d.includes(':')).join(', ') || '\u2014'} mono wrap />
          )}
        </Card>

        <Card title="设备">
          <Row label="型号" value={device?.model ?? '\u2014'} />
          <Row label="固件版本" value={device?.firmware ?? '\u2014'} />
          <Row label="运行时间" value={formatUptime(device?.uptime_secs)} />
          <div className="mt-2 space-y-2 border-t border-line/8 pt-2.5">
            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="font-medium text-ink2">CPU</span>
                <span className="tnum text-ink2">{cpu ? `${cpu.overall.toFixed(0)}%` : '\u2014'}</span>
              </div>
              <Meter pct={cpu?.overall ?? 0} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="font-medium text-ink2">内存</span>
                <span className="tnum text-ink2">{mem ? `${mem.usage_pct.toFixed(0)}%` : '\u2014'}</span>
              </div>
              <Meter pct={mem?.usage_pct ?? 0} tone="bg-warn" />
            </div>
          </div>
        </Card>

        <Card title="流量统计">
          {usage ? (
            <div className="space-y-2.5">
              {[
                { label: '今日', period: usage.day },
                { label: '本月', period: usage.month },
                { label: '累计', period: usage.total },
              ].map(({ label, period }) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{label}</p>
                  <div className="tnum mt-0.5 flex gap-3 text-[13px] font-medium">
                    <span className="flex items-center gap-1 text-ok">
                      <IDownload size={12} /> {formatBytes(period.rx_bytes)}
                    </span>
                    <span className="flex items-center gap-1 text-accent">
                      <IUpload size={12} /> {formatBytes(period.tx_bytes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ink3">暂无数据</p>
          )}
        </Card>
      </div>
    </div>
  )
}
