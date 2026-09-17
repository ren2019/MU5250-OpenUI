import { useCallback, useEffect, useState } from 'react'
import { api } from '../../data/api'
import type { WifiAll, WifiBand } from '../../types'
import { Button, Field, Input, Select, Toggle } from '../../ui/controls'
import { toast, toastError } from '../../ui/feedback'
import { Card, Chip, Skeleton } from '../../ui/primitives'

const DFS_5G_CHANNELS = new Set(['52', '56', '60', '64', '100', '104', '108', '112', '116', '120', '124', '128', '132', '136', '140', '144'])

function normalizeConfiguredChannel(channel?: string) {
  const raw = (channel ?? '').trim().toLowerCase()
  return !raw || raw === '0' || raw === 'auto' ? 'auto' : raw
}

function formatBandwidthMode(mode?: string) {
  if (!mode) return '\u2014'
  if (/^(EHT|HE|VHT|HT)\d+$/.test(mode)) return `${mode.replace(/^(EHT|HE|VHT|HT)/, '')} MHz (${mode.match(/^(EHT|HE|VHT|HT)/)?.[0]})`
  return mode
}

function getBandInsights(suffix: '2g' | '5g', band: WifiBand): string[] {
  const insights: string[] = []
  const configuredChannel = normalizeConfiguredChannel(band.configuredChannel)
  const actualChannel = band.actualChannel ?? band.channel

  if (configuredChannel === 'auto' && actualChannel != null) {
    insights.push(`当前自动选择的信道为 ${actualChannel}。`)
  }
  if (configuredChannel !== 'auto') {
    const configuredNum = parseInt(configuredChannel, 10)
    if (!Number.isNaN(configuredNum)) {
      if (actualChannel != null && configuredNum !== actualChannel) {
        insights.push(`设置信道为 ${configuredNum}，当前实际使用信道 ${actualChannel}。`)
      }
      if (suffix === '2g' && ![1, 6, 11].includes(configuredNum)) {
        insights.push('2.4 GHz 通常使用 1、6 或 11 信道可减少重叠干扰。')
      }
      if (suffix === '5g' && DFS_5G_CHANNELS.has(String(configuredNum))) {
        insights.push('已选择 DFS 信道，检测到雷达时可能被强制切换信道。')
      }
    }
  }
  const configuredBw = (band.configuredBandwidth ?? '').toUpperCase()
  const actualBw = (band.actualBandwidth ?? band.bandwidth ?? '').toUpperCase()
  if (configuredBw && actualBw && configuredBw !== actualBw) {
    insights.push(`设置带宽为 ${configuredBw}，当前实际带宽为 ${actualBw}。`)
  }
  if ((band.clients ?? 0) >= 15) {
    insights.push('当前连接设备较多，固定信道可能有助于提高稳定性。')
  }
  return insights
}

// ── Band card ─────────────────────────────────────────────────────────────────

function BandCard({
  label,
  band,
  suffix,
  masterEnabled,
  onRefresh,
}: {
  label: string
  band: WifiBand
  suffix: '2g' | '5g'
  masterEnabled: boolean
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [passwordDirty, setPasswordDirty] = useState(false)
  const [channel, setChannel] = useState('')
  const [htmode, setHtmode] = useState('')
  const [txpower, setTxpower] = useState('')
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSsid(band.ssid ?? '')
    setPassword(band.password ?? '')
    setPasswordDirty(false)
    setChannel(normalizeConfiguredChannel(band.configuredChannel))
    setHtmode(band.configuredBandwidth ?? '')
    setTxpower('')
    setHidden(band.hidden)
  }, [band])

  async function handleSave() {
    setBusy(true)
    try {
      const settings: Record<string, unknown> = {
        [`ssid_${suffix}`]: ssid,
        [`hidden_${suffix}`]: hidden ? '1' : '0',
      }
      if (passwordDirty) settings[`key_${suffix}`] = password
      if (channel && channel !== normalizeConfiguredChannel(band.configuredChannel)) settings[`channel_${suffix}`] = channel
      if (htmode && htmode !== band.configuredBandwidth) settings[`htmode_${suffix}`] = htmode
      if (txpower) settings[`txpower_${suffix}`] = txpower
      await api.wifiSet(settings)
      toast('已保存，Wi-Fi 可能重新连接')
      setPasswordDirty(false)
      setEditing(false)
      onRefresh()
    } catch (e) {
      toastError(e, '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRadio() {
    setBusy(true)
    try {
      const key = suffix === '2g' ? 'radio2_disabled' : 'radio5_disabled'
      await api.wifiSet({ [key]: band.enabled ? '1' : '0' })
      toast(band.enabled ? '无线频段已禁用' : '无线频段已启用')
      onRefresh()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const channels =
    suffix === '2g'
      ? ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']
      : ['auto', '36', '40', '44', '48', '52', '56', '60', '64', '100', '104', '108', '112', '116', '120', '124', '128', '132', '136', '140', '144', '149', '153', '157', '161', '165']
  const htmodes = band.bandwidthOptions?.length ? band.bandwidthOptions : [band.configuredBandwidth].filter(Boolean) as string[]
  const configuredChannel = normalizeConfiguredChannel(band.configuredChannel)
  const insights = getBandInsights(suffix, band)

  return (
    <Card
      title={label}
      action={
        !editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            编辑
          </Button>
        ) : (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setSsid(band.ssid ?? '')
                setPassword(band.password ?? '')
                setPasswordDirty(false)
                setChannel(normalizeConfiguredChannel(band.configuredChannel))
                setHtmode(band.configuredBandwidth ?? '')
                setTxpower('')
                setHidden(band.hidden)
              }}
            >
              取消
            </Button>
            <Button size="sm" variant="primary" onClick={handleSave} loading={busy}>
              保存
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${masterEnabled ? (band.enabled ? 'bg-ok' : 'bg-danger') : 'bg-warn'}`}
            />
            <span className="text-[13px] text-ink2">
              {masterEnabled ? (band.enabled ? '已启用' : '已禁用') : '总开关已关闭'}
            </span>
            {band.clients != null && (
              <span className="text-[12px] text-ink3">
                {band.clients} 台设备
              </span>
            )}
          </div>
          <Toggle checked={band.enabled} onChange={toggleRadio} disabled={busy} label={`切换 ${label} 无线频段`} />
        </div>
        {!masterEnabled && (
          <p className="text-[12px] text-warn">Wi-Fi 总开关已关闭，各频段设置仍会保留。</p>
        )}

        {editing ? (
          <>
            <Field label="SSID（网络名称）">
              <Input value={ssid} onChange={(e) => setSsid(e.target.value)} />
            </Field>
            <Field label="密码" hint="不修改此项即可保留当前密码">
              <Input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordDirty(true)
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2 border-t border-line/8 pt-3">
              <Field label="信道">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {channels.map((c) => (
                    <option key={c} value={c}>
                      {c === 'auto' ? '自动' : c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="带宽">
                <Select value={htmode} onChange={(e) => setHtmode(e.target.value)}>
                  {htmodes.map((m) => (
                    <option key={m} value={m}>
                      {formatBandwidthMode(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="发射功率">
                <Select value={txpower} onChange={(e) => setTxpower(e.target.value)}>
                  <option value="">默认</option>
                  <option value="100">100%</option>
                  <option value="75">75%</option>
                  <option value="50">50%</option>
                  <option value="25">25%</option>
                </Select>
              </Field>
              <div className="flex items-end gap-2 pb-1.5">
                <Toggle checked={hidden} onChange={setHidden} label="隐藏 SSID" />
                <span className="text-[12px] font-medium text-ink2">隐藏 SSID</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Info label="SSID（网络名称）" value={band.ssid ?? '\u2014'} strong />
              <Info label="密码" value={band.password ?? '\u2014'} mono />
              <Info label="信道" value={configuredChannel === 'auto' ? `自动（${band.actualChannel ?? band.channel ?? '\u2014'}）` : configuredChannel} />
              <Info label="带宽" value={formatBandwidthMode(band.configuredBandwidth)} />
              <Info label="安全模式" value={band.security ?? '\u2014'} />
              <Info label="已隐藏" value={band.hidden ? '是' : '否'} />
            </div>
            <div className="rounded-lg bg-surface2/70 px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink3">信道提示</p>
              {insights.length > 0 ? (
                <div className="space-y-1">
                  {insights.map((insight, i) => (
                    <p key={i} className="text-[12px] text-ink2">
                      {insight}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-ink3">未发现明显的信道冲突。</p>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function Info({ label, value, strong = false, mono = false }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{label}</p>
      <p className={`truncate text-[13px] ${strong ? 'font-semibold text-ink' : 'text-ink2'} ${mono ? 'font-mono text-[12px]' : ''}`}>
        {value}
      </p>
    </div>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function WifiTab() {
  const [wifi, setWifi] = useState<WifiAll | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  const refresh = useCallback(() => {
    api.wifiStatus().then(setWifi).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function toggleMaster() {
    if (!wifi) return
    const next = !wifi.master_enabled
    setBusy(true)
    try {
      await api.wifiSet({ wifi_onoff: next ? '1' : '0' })
      toast(next ? 'Wi-Fi 总开关已开启' : 'Wi-Fi 总开关已关闭')
      refresh()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  async function syncBands(source: '2g' | '5g') {
    if (!wifi) return
    const sourceBand = source === '2g' ? wifi.band_2g : wifi.band_5g
    const sourceLabel = source === '2g' ? '2.4 GHz' : '5 GHz'
    const targetSuffix = source === '2g' ? '5g' : '2g'
    const targetLabel = source === '2g' ? '5 GHz' : '2.4 GHz'

    if (!sourceBand.ssid) {
      toast(`无法从 ${sourceLabel} 同步：来源 SSID 为空`, 'err')
      return
    }

    const payload: Record<string, unknown> = {
      [`ssid_${targetSuffix}`]: sourceBand.ssid,
      [`hidden_${targetSuffix}`]: sourceBand.hidden ? '1' : '0',
    }
    if (sourceBand.security) payload[`encryption_${targetSuffix}`] = sourceBand.security
    const includePassword = Boolean(sourceBand.password && sourceBand.password !== '••••••••')
    if (includePassword) payload[`key_${targetSuffix}`] = sourceBand.password

    setSyncBusy(true)
    try {
      await api.wifiSet(payload)
      toast(`已将 ${sourceLabel} 配置复制到 ${targetLabel}${includePassword ? ' （包含密码）' : ''}`)
      refresh()
    } catch (e) {
      toastError(e)
    } finally {
      setSyncBusy(false)
    }
  }

  if (!wifi) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Card title="Wi-Fi 总开关">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-ink">总开关</p>
            <p className="mt-0.5 text-[12px] text-ink2">
              {!wifi.master_supported
                ? '此固件未提供可靠的 Wi-Fi 总开关接口。'
                : wifi.master_enabled
                  ? '已开启，各无线频段按各自设置运行'
                  : '已关闭，所有 Wi-Fi 频段均已禁用'}
            </p>
          </div>
          <Toggle checked={wifi.master_enabled} onChange={toggleMaster} disabled={busy || !wifi.master_supported} label="Wi-Fi 总开关" />
        </div>
        {wifi.wifi6_supported && (
          <div className="mt-3 border-t border-line/8 pt-3">
            <Chip tone={wifi.wifi6_enabled ? 'ok' : 'default'}>Wi-Fi 6 {wifi.wifi6_enabled ? '已启用' : '已禁用'}</Chip>
          </div>
        )}
        {wifi.wifi7_supported && (
          <div className="mt-3 border-t border-line/8 pt-3">
            <Chip tone="ok">支持 Wi-Fi 7 / 802.11be</Chip>
          </div>
        )}
      </Card>

      <Card title="同步频段配置">
        <p className="mb-2.5 text-[12px] text-ink2">
          将一个频段的 SSID、密码、安全模式及隐藏状态复制到另一个频段。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => syncBands('2g')} loading={syncBusy}>
            以 2.4 GHz 配置同步两频段
          </Button>
          <Button variant="outline" onClick={() => syncBands('5g')} loading={syncBusy}>
            以 5 GHz 配置同步两频段
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BandCard label="2.4 GHz" band={wifi.band_2g} suffix="2g" masterEnabled={wifi.master_enabled} onRefresh={refresh} />
        <BandCard label="5 GHz" band={wifi.band_5g} suffix="5g" masterEnabled={wifi.master_enabled} onRefresh={refresh} />
      </div>

      {wifi.guest_ssid && (
        <Card title="访客网络">
          <p className="text-[13px] text-ink2">
            SSID： <span className="font-semibold text-ink">{wifi.guest_ssid}</span>
          </p>
        </Card>
      )}
    </div>
  )
}
