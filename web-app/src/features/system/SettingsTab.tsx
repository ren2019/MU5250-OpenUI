import { statusLabel } from '../../display'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../data/api'
import { API_BASE, errorLabel } from '../../data/client'
import { formatUptime } from '../../format'
import type { DeviceInfo, SimInfo, UsbStatus } from '../../types'
import { ILogout, IPower, IRefresh, IRestart } from '../../icons'
import { Button, Toggle } from '../../ui/controls'
import { confirm, toast, toastError } from '../../ui/feedback'
import { Card, Row } from '../../ui/primitives'

// ── USB mode + powerbank ──────────────────────────────────────────────────────

type UsbModeKey = 'rndis' | 'ecm' | 'ncm' | 'debug'

const USB_MODE_INFO: Record<UsbModeKey, { label: string; description: string; warning?: string }> = {
  rndis: {
    label: 'RNDIS',
    description: '微软 USB 网络协议。Windows 原生支持；macOS 需要已停止维护的驱动。',
  },
  ecm: {
    label: 'ECM',
    description: 'CDC-ECM USB 以太网。macOS、Linux 和较新 Windows 免驱，兼容性最好。',
  },
  ncm: {
    label: 'NCM',
    description:
      'CDC-NCM USB 以太网，理论速率更高。实验性功能：中兴未将 ncm.0 接入常规 USB 切换流程。',
    warning: '实验性',
  },
  debug: {
    label: '调试（ADB）',
    description: '包含 adbd 的 USB 调试组合。重启后恢复常规网络共享。',
  },
}

function UsbSection() {
  const [status, setStatus] = useState<UsbStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [powerbank, setPowerbank] = useState<boolean | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await api.usbStatus())
    } catch {
      /* ignore */
    }
    try {
      const charger = await api.chargerInfo()
      setPowerbank(Number(charger.otg_powerbank_state ?? 0) === 1)
    } catch {
      setPowerbank(null)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  async function setMode(mode: UsbModeKey) {
    const capability = status?.mode_capabilities?.find((c) => c.mode === mode)
    const isSupported =
      mode === 'debug' || capability?.supported || status?.supported_modes?.includes(mode)
    if (!isSupported) {
      toast(`${USB_MODE_INFO[mode].label} 在此固件上不可用`, 'err')
      return
    }
    const isExperimentalNcm = mode === 'ncm'
    if (isExperimentalNcm) {
      const ok = await confirm({
        title: '切换到实验性 NCM 模式？',
        body: 'USB 将断开并重新枚举，请保持 Wi-Fi 管理连接可用。',
        confirmLabel: '切换',
      })
      if (!ok) return
    }

    setBusy(true)
    try {
      await api.usbMode(mode, isExperimentalNcm ? { confirm_experimental: true } : undefined)
      toast(
        isExperimentalNcm
          ? '已安排切换到 NCM，USB 即将重新枚举'
          : mode === 'ecm' && status?.active_mode === 'ncm'
            ? '已安排恢复到 ECM，USB 即将重新枚举'
            : `USB 模式已设为 ${mode.toUpperCase()}，重启后生效`,
      )
      fetchStatus()
    } catch (e) {
      toastError(e, '设置 USB 模式失败')
    } finally {
      setBusy(false)
    }
  }

  async function setNcmDefault(enabled: boolean) {
    if (enabled) {
      const ok = await confirm({
        title: '开机后自动启用 NCM？',
        body: '每次开机后将自动应用 NCM，请保持 Wi-Fi 管理连接可用。',
        confirmLabel: '启用',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await api.usbDefaultMode(enabled ? 'ncm' : 'ecm', enabled ? { confirm_experimental: true } : undefined)
      toast(enabled ? '开机后将自动应用 NCM' : 'USB 开机默认模式已恢复为 ECM')
      fetchStatus()
    } catch (e) {
      toastError(e, '设置 USB 开机默认模式失败')
    } finally {
      setBusy(false)
    }
  }

  async function togglePowerbank(on: boolean) {
    try {
      await api.usbPowerbank(on)
      setPowerbank(on)
      toast(on ? '已开启反向供电（OTG）' : '已关闭反向供电')
    } catch (e) {
      toastError(e, '设置反向供电失败')
    }
  }

  const activeMode = status?.active_mode ?? null
  const ncmDefaultEnabled = status?.ncm_persist_on_boot ?? status?.default_mode === 'ncm'
  const supported = new Set(status?.supported_modes ?? ['rndis', 'ecm'])
  const modes: UsbModeKey[] = ['rndis', 'ecm', 'ncm', 'debug']

  return (
    <Card title="USB 模式">
      <div className="space-y-3">
        <p className="text-[12px] text-ink2">
          切换 USB 工作模式。多数修改需要重启才能生效。
          {activeMode && (
            <>
              {' '}当前启用： <span className="font-bold text-ink">{activeMode.toUpperCase()}</span>.
            </>
          )}
        </p>
        {status?.ncm_last_error && <p className="text-[12px] text-danger">最近一次 NCM 尝试： {errorLabel(status.ncm_last_error)}</p>}

        <div className="flex flex-wrap gap-1.5">
          {modes.map((mode) => {
            const info = USB_MODE_INFO[mode]
            const isActive = activeMode === mode
            const capability = status?.mode_capabilities?.find((c) => c.mode === mode)
            const isSupported = mode === 'debug' || capability?.supported || supported.has(mode)
            return (
              <button
                key={mode}
                onClick={() => setMode(mode)}
                disabled={busy || !isSupported}
                title={info.description}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors disabled:opacity-40 ${
                  isActive
                    ? 'border-ok/30 bg-ok/10 text-ok'
                    : !isSupported
                      ? 'border-line/8 bg-surface2/50 text-ink3'
                      : 'border-line/10 bg-surface text-ink2 hover:bg-surface2'
                }`}
              >
                {info.label}
                {!isSupported && ' · 不可用'}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/8 pt-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">开机后启用 NCM</p>
            <p className="text-[12px] text-ink2">原厂 USB 服务稳定后应用 NCM 模式。</p>
          </div>
          <Toggle checked={ncmDefaultEnabled} disabled={busy} onChange={setNcmDefault} label="开机后启用 NCM" />
        </div>

        {powerbank !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/8 pt-3">
            <div>
              <p className="text-[13px] font-semibold text-ink">反向供电 / OTG</p>
              <p className="text-[12px] text-ink2">通过 USB-C 接口向外供电。</p>
            </div>
            <Toggle checked={powerbank} onChange={togglePowerbank} label="反向供电" />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

export default function SettingsTab({ onLogout }: { onLogout: () => void }) {
  const [device, setDevice] = useState<DeviceInfo | null>(null)
  const [sim, setSim] = useState<SimInfo | null>(null)
  const [imei, setImei] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [d, s, i] = await Promise.allSettled([api.device(), api.simInfo(), api.simImei()])
    if (d.status === 'fulfilled') setDevice(d.value)
    if (s.status === 'fulfilled') setSim(s.value)
    if (i.status === 'fulfilled' && i.value) setImei((i.value as { imei?: string }).imei ?? '')
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function restartAgent() {
    setBusy('restart')
    try {
      await api.restartAgent()
      toast('管理服务正在重启，数秒后刷新页面')
      setTimeout(() => window.location.reload(), 5000)
    } catch (e) {
      toastError(e, '重启管理服务失败')
      setBusy(null)
    }
  }

  async function runPowerAction(action: 'reboot' | 'shutdown') {
    const ok = await confirm({
      title: action === 'reboot' ? '重启设备？' : '关闭设备？',
      body:
        action === 'reboot'
          ? '所有连接将中断约 10 至 30 秒。'
          : '设备将关机，需要按实体电源键重新开机。',
      confirmLabel: action === 'reboot' ? '重启' : '关机',
      danger: true,
    })
    if (!ok) return
    setBusy(action)
    try {
      if (action === 'reboot') {
        await api.reboot()
        toast('重启命令已发送')
      } else {
        await api.shutdown()
        toast('关机命令已发送')
      }
    } catch (e) {
      toastError(e, action === 'reboot' ? '重启设备失败' : '关闭设备失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="设备">
          <Row label="型号" value={device?.model ?? '\u2014'} mono />
          <Row label="固件版本" value={device?.firmware ?? '\u2014'} mono />
          <Row label="运行时间" value={formatUptime(device?.uptime_secs)} />
          <Row label="系统负载" value={device?.load_avg?.map((v) => v.toFixed(2)).join(', ') ?? '\u2014'} mono />
          <Row label="IMEI" value={imei || '\u2014'} mono />
        </Card>

        <Card title="SIM 卡">
          <Row label="状态" value={statusLabel(sim?.state)} />
          <Row label="ICCID" value={sim?.iccid ?? '\u2014'} mono />
          <Row label="IMSI" value={sim?.imsi ?? '\u2014'} mono />
          <Row label="MCC/MNC" value={sim?.mcc && sim?.mnc ? `${sim.mcc}/${sim.mnc}` : '\u2014'} mono />
        </Card>
      </div>

      <UsbSection />

      <Card title="服务控制">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={restartAgent} loading={busy === 'restart'}>
            <IRefresh size={14} /> 重启管理服务
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast('正在刷新管理面板…')
              setTimeout(() => window.location.reload(), 400)
            }}
          >
            <IRestart size={14} /> 刷新管理面板
          </Button>
          <Button variant="danger" onClick={() => runPowerAction('reboot')} loading={busy === 'reboot'}>
            <IRestart size={14} /> 重启
          </Button>
          <Button variant="danger" onClick={() => runPowerAction('shutdown')} loading={busy === 'shutdown'}>
            <IPower size={14} /> 关机
          </Button>
        </div>
        <p className="mt-2.5 text-[12px] text-ink3">
          重启管理服务会短暂中断后台服务。重启设备或关机会中断所有连接。
        </p>
      </Card>

      <Card title="连接信息">
        <Row label="API" value={API_BASE} mono />
        <Row label="管理面板" value={window.location.origin} mono />
        <div className="mt-3 border-t border-line/8 pt-3">
          <Button variant="ghost" onClick={onLogout}>
            <ILogout size={14} /> 退出登录
          </Button>
        </div>
      </Card>
    </div>
  )
}
