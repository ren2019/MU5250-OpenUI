import { statusLabel } from '../../display'
import { useEffect, useState } from 'react'
import { useHome } from '../../app/HomeContext'
import { api } from '../../data/api'
import type { ModemCapabilities, SignalInfo } from '../../types'
import { Button, Field, Input } from '../../ui/controls'
import { toast, toastError, confirm } from '../../ui/feedback'
import { Card, Chip, Skeleton } from '../../ui/primitives'

// ── Network mode ──────────────────────────────────────────────────────────────

function NetworkMode({ currentMode, modes, onApplied }: { currentMode: string; modes: ModemCapabilities['network_modes']; onApplied: () => void }) {
  const [selected, setSelected] = useState(currentMode)
  const [busy, setBusy] = useState(false)

  useEffect(() => setSelected(currentMode), [currentMode])

  async function apply() {
    setBusy(true)
    try {
      await api.networkModeSet(selected)
      toast('网络模式已应用，连接可能短暂中断')
      onApplied()
    } catch (e) {
      toastError(e, '设置网络模式失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="网络模式">
      <p className="mb-3 text-[12px] text-ink2">
        选择首选网络制式。修改后设备会重新连接网络。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelected(m.value)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              selected === m.value
                ? 'bg-accent text-white'
                : 'bg-surface2 text-ink2 hover:bg-line/10 hover:text-ink'
            }`}
          >
            {statusLabel(m.label)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={apply} loading={busy} disabled={selected === currentMode}>
          应用
        </Button>
        {selected !== currentMode && (
          <span className="text-[12px] text-ink3">
            当前： {statusLabel(modes.find((m) => m.value === currentMode)?.label ?? currentMode)}
          </span>
        )}
      </div>
    </Card>
  )
}

// ── Serving cells with one-tap lock ───────────────────────────────────────────

function ServingCells({ signal, onLock }: { signal: SignalInfo; onLock: (type: 'nr' | 'lte', pci: number, earfcn: number, band?: string) => void }) {
  const { lte_carriers, nr_carriers } = signal
  if (lte_carriers.length === 0 && nr_carriers.length === 0) return null

  const renderRows = (carriers: typeof nr_carriers, tech: 'nr' | 'lte') =>
    carriers.map((c, i) => {
      const bandNum = c.band.replace(/\D/g, '')
      return (
        <tr key={i} className="border-b border-line/6 last:border-0">
          <td className="py-1.5 pr-3">
            <Chip tone={c.label === 'PCC' ? (tech === 'nr' ? 'nr' : 'lte') : 'default'}>{c.label}</Chip>
          </td>
          <td className={`py-1.5 pr-3 font-semibold ${tech === 'nr' ? 'text-violet-600 dark:text-violet-400' : 'text-accent'}`}>
            {c.band}
          </td>
          <td className="tnum py-1.5 pr-3">{c.pci}</td>
          <td className="tnum py-1.5 pr-3">{c.earfcn}</td>
          <td className="tnum hidden py-1.5 pr-3 text-ink2 sm:table-cell">{c.bandwidth}</td>
          <td className="tnum py-1.5 pr-3">{c.rsrp ?? '\u2014'}</td>
          <td className="tnum hidden py-1.5 pr-3 sm:table-cell">{c.sinr ?? '\u2014'}</td>
          <td className="py-1.5 text-right">
            <Button size="sm" variant="outline" onClick={() => onLock(tech, c.pci, c.earfcn, tech === 'nr' ? bandNum : undefined)}>
              锁定
            </Button>
          </td>
        </tr>
      )
    })

  return (
    <Card title="服务小区">
      <p className="mb-3 text-[12px] text-ink2">当前活动小区，可直接从列表中锁定。</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line/8 text-[11px] uppercase tracking-wider text-ink3">
              <th className="pb-1.5 pr-3 font-semibold">类型</th>
              <th className="pb-1.5 pr-3 font-semibold">频段</th>
              <th className="pb-1.5 pr-3 font-semibold">PCI</th>
              <th className="pb-1.5 pr-3 font-semibold">ARFCN</th>
              <th className="hidden pb-1.5 pr-3 font-semibold sm:table-cell">带宽</th>
              <th className="pb-1.5 pr-3 font-semibold">RSRP</th>
              <th className="hidden pb-1.5 pr-3 font-semibold sm:table-cell">SINR</th>
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {nr_carriers.length > 0 && renderRows(nr_carriers, 'nr')}
            {lte_carriers.length > 0 && renderRows(lte_carriers, 'lte')}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Band lock grid ────────────────────────────────────────────────────────────

function BandLock({
  title,
  description,
  bands,
  type,
  lockedBands,
  onApplied,
}: {
  title: string
  description: string
  bands: number[]
  type: 'nr' | 'lte'
  lockedBands?: number[]
  onApplied: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (lockedBands) setSelected(new Set(lockedBands))
  }, [lockedBands])

  function toggle(band: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(band)) next.delete(band)
      else next.add(band)
      return next
    })
  }

  async function apply() {
    if (selected.size === 0) {
      toast('请至少选择一个频段', 'err')
      return
    }
    setBusy(true)
    try {
      const sorted = Array.from(selected).sort((a, b) => a - b)
      if (type === 'nr') await api.bandLockNr(sorted.join(','))
      else await api.bandLockLte(sorted)
      toast(`${type === 'nr' ? 'NR' : 'LTE'} 已锁定到 ${sorted.map((b) => (type === 'nr' ? `n${b}` : `B${b}`)).join(', ')}`)
      onApplied()
    } catch (e) {
      toastError(e, '锁定频段失败')
    } finally {
      setBusy(false)
    }
  }

  const activeCls = type === 'nr' ? 'bg-violet-600 text-white' : 'bg-accent text-white'

  return (
    <Card title={title}>
      <p className="mb-2.5 text-[12px] text-ink2">{description}</p>
      {lockedBands && lockedBands.length > 0 && (
        <p className="mb-2 text-[12px] font-medium text-ok">
          已锁定： {[...lockedBands].sort((a, b) => a - b).map((b) => (type === 'nr' ? `n${b}` : `B${b}`)).join(', ')}
        </p>
      )}
      <div className="mb-2 flex gap-3 text-[12px] font-semibold">
        <button className="text-accent hover:underline" onClick={() => setSelected(new Set(bands))}>
          全选
        </button>
        <button className="text-ink3 hover:text-ink hover:underline" onClick={() => setSelected(new Set())}>
          清空
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {bands.map((b) => (
          <button
            key={b}
            onClick={() => toggle(b)}
            className={`tnum rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
              selected.has(b) ? activeCls : 'bg-surface2 text-ink2 hover:bg-line/10 hover:text-ink'
            }`}
          >
            {type === 'nr' ? `n${b}` : `B${b}`}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Button variant="primary" onClick={apply} loading={busy} disabled={selected.size === 0}>
          锁定 {selected.size} 个频段
        </Button>
      </div>
    </Card>
  )
}

// ── Manual cell lock ──────────────────────────────────────────────────────────

function CellLock({ type, onApplied }: { type: 'nr' | 'lte'; onApplied: () => void }) {
  const [pci, setPci] = useState('')
  const [earfcn, setEarfcn] = useState('')
  const [band, setBand] = useState('')
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!pci || !earfcn) {
      toast('请填写 PCI（物理小区标识）和 ARFCN（绝对射频信道号）', 'err')
      return
    }
    if (type === 'nr' && !band) {
      toast('锁定 NR 小区时必须填写频段', 'err')
      return
    }
    setBusy(true)
    try {
      if (type === 'nr') await api.cellLockNr(pci, earfcn, band)
      else await api.cellLockLte(pci, earfcn)
      toast(`${type === 'nr' ? 'NR' : 'LTE'} 小区已锁定（PCI ${pci}）`)
      onApplied()
    } catch (e) {
      toastError(e, '锁定小区失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={`${type === 'nr' ? 'NR' : 'LTE'} 小区锁定`}>
      <p className="mb-3 text-[12px] text-ink2">
        按 PCI（物理小区标识）及 {type === 'nr' ? 'NR-ARFCN' : 'EARFCN'}（信道号）锁定指定小区。
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="PCI">
          <Input type="number" inputMode="numeric" value={pci} onChange={(e) => setPci(e.target.value)} placeholder="30" />
        </Field>
        <Field label={type === 'nr' ? 'NR-ARFCN' : 'EARFCN'}>
          <Input type="number" inputMode="numeric" value={earfcn} onChange={(e) => setEarfcn(e.target.value)} placeholder={type === 'nr' ? '630912' : '3650'} />
        </Field>
        {type === 'nr' && (
          <Field label="频段">
            <Input type="number" inputMode="numeric" value={band} onChange={(e) => setBand(e.target.value)} placeholder="78" />
          </Field>
        )}
        <div className="flex items-end">
          <Button variant="primary" onClick={apply} loading={busy} className="w-full">
            锁定
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ── Group ─────────────────────────────────────────────────────────────────────

export default function Locking() {
  // Shares the home poll rather than fetching /api/network/signal separately;
  // `refresh` re-runs that batch after a lock is applied.
  const { data: home, refresh } = useHome()
  const signal = home?.signal ?? null
  const [capabilities, setCapabilities] = useState<ModemCapabilities | null | undefined>(undefined)

  useEffect(() => {
    api.modemCapabilities().then(setCapabilities).catch(() => setCapabilities(null))
  }, [])

  async function handleLockCell(type: 'nr' | 'lte', pci: number, earfcn: number, band?: string) {
    try {
      if (type === 'nr') await api.cellLockNr(String(pci), String(earfcn), band ?? '')
      else await api.cellLockLte(String(pci), String(earfcn))
      toast(`已锁定到 ${type === 'nr' ? 'NR' : 'LTE'} 小区，PCI ${pci}`)
      refresh()
    } catch (e) {
      toastError(e, '锁定失败')
    }
  }

  async function resetBands() {
    const ok = await confirm({
      title: '清除频段锁定？',
      body: '设备将恢复自动选择频段。',
      confirmLabel: '重置',
      danger: true,
    })
    if (!ok) return
    try {
      await api.bandLockReset()
      toast('已清除所有频段锁定')
      refresh()
    } catch (e) {
      toastError(e, '重置失败')
    }
  }

  async function resetCells() {
    const ok = await confirm({
      title: '清除小区锁定？',
      body: '设备将恢复自动选择小区。',
      confirmLabel: '重置',
      danger: true,
    })
    if (!ok) return
    try {
      await api.cellLockReset()
      toast('已清除所有小区锁定')
      refresh()
    } catch (e) {
      toastError(e, '重置失败')
    }
  }

  if (!signal) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {capabilities ? (
        <NetworkMode currentMode={signal.net_select ?? 'WL_AND_5G'} modes={capabilities.network_modes} onApplied={refresh} />
      ) : capabilities === undefined ? (
        <Skeleton className="h-40" />
      ) : (
        <Card title="网络模式与频段">
          <p className="text-[12px] text-warn">无法获取固件能力信息，已禁用网络制式和频段修改。</p>
        </Card>
      )}

      <ServingCells signal={signal} onLock={handleLockCell} />

      {capabilities && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BandLock
          title="NR 5G 频段锁定"
          description="选择允许使用的 NR 频段。仅适用于 5G SA 独立组网模式；固件不支持 NSA 非独立组网频段锁定。"
          bands={capabilities.nr_sa_bands}
          type="nr"
          lockedBands={signal.nr_band_lock}
          onApplied={refresh}
        />
        <BandLock
          title="LTE 频段锁定"
          description="选择允许使用的 LTE 频段。"
          bands={capabilities.lte_bands}
          type="lte"
          lockedBands={signal.lte_band_lock}
          onApplied={refresh}
        />
      </div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CellLock type="nr" onApplied={refresh} />
        <CellLock type="lte" onApplied={refresh} />
      </div>

      <Card title="清除锁定">
        <p className="mb-3 text-[12px] text-ink2">
          清除所有频段和小区锁定，使设备恢复自动选择。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetBands}>
            清除频段锁定
          </Button>
          <Button variant="outline" onClick={resetCells}>
            清除小区锁定
          </Button>
        </div>
      </Card>

      <Card title="诊断信息">
        <div className="tnum space-y-1 font-mono text-[11px] text-ink3">
          <p>
            LTE 锁定（原始值）： <span className="text-ink">{signal.raw_lte_band_lock || '（空）'}</span>
          </p>
          <p>
            NR 锁定（原始值）： <span className="text-ink">{signal.raw_nr_band_lock || '（空）'}</span>
          </p>
          <p>
            LTE 锁定（解析值）： <span className="text-ink">{signal.lte_band_lock?.join(', ') || '（无）'}</span>
          </p>
          <p>
            NR 锁定（解析值）： <span className="text-ink">{signal.nr_band_lock?.join(', ') || '（无）'}</span>
          </p>
          <p>
            网络模式： <span className="text-ink">{signal.net_select || '（未知）'}</span>
          </p>
        </div>
      </Card>
    </div>
  )
}
