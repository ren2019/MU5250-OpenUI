import { errorLabel } from '../../data/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../data/api'
import { usePoll } from '../../data/poll'
import { formatBytes, formatDuration } from '../../format'
import type { LoggerDownload, LoggerStatus, ProcessListResult } from '../../types'
import { IInfo, IRefresh } from '../../icons'
import { Button, Field, Select } from '../../ui/controls'
import { confirm, toast, toastError } from '../../ui/feedback'
import { Card, Empty, Meter } from '../../ui/primitives'

function downloadCsv(csv: string, prefix: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${prefix}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const DURATION_OPTS = [
  [300, '5 分钟'],
  [900, '15 分钟'],
  [1800, '30 分钟'],
  [3600, '1 小时'],
  [7200, '2 小时'],
  [14400, '4 小时'],
  [28800, '8 小时'],
  [43200, '12 小时'],
  [86400, '24 小时'],
] as const

const INTERVAL_OPTS = [
  [1, '1 秒'],
  [3, '3 秒'],
  [5, '5 秒'],
  [10, '10 秒'],
  [30, '30 秒'],
  [60, '1 分钟'],
] as const

// ── Logger card (shared by signal + connection loggers) ───────────────────────

function LoggerCard({
  pollKey,
  title,
  description,
  countLabel,
  statusFn,
  startFn,
  stopFn,
  downloadFn,
  filePrefix,
}: {
  pollKey: string
  title: string
  description: string
  countLabel: string
  statusFn: () => Promise<LoggerStatus>
  startFn: (duration: number, interval: number) => Promise<unknown>
  stopFn: () => Promise<unknown>
  downloadFn: () => Promise<LoggerDownload>
  filePrefix: string
}) {
  const [duration, setDuration] = useState(3600)
  const [interval, setInterval_] = useState(3)
  const [busy, setBusy] = useState(false)
  // Only worth watching closely while a run is in flight; idle is the common case.
  const [live, setLive] = useState(false)
  const { data: status, refresh } = usePoll<LoggerStatus>(pollKey, statusFn, live ? 3000 : 15000)

  const isRunning = status?.running ?? false
  useEffect(() => setLive(isRunning), [isRunning])

  async function handleStart() {
    setBusy(true)
    try {
      await startFn(duration, interval)
      refresh()
    } catch (e) {
      toastError(e, '启动记录失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    try {
      await stopFn()
      refresh()
    } catch (e) {
      toastError(e, '停止记录失败')
    }
  }

  async function handleDownload() {
    try {
      const data = await downloadFn()
      downloadCsv(data.csv, filePrefix)
    } catch (e) {
      toastError(e, '暂无可下载数据')
    }
  }

  const progress = status && status.duration_secs > 0 ? (status.elapsed_secs / status.duration_secs) * 100 : 0

  return (
    <Card title={title}>
      <p className="mb-3 text-[12px] text-ink2">{description} 日志达到 8 MiB 时停止记录，至少每 30 秒写入一次存储。</p>
      {status?.last_error && <p role="alert" className="mb-3 text-[12px] text-danger">{errorLabel(status.last_error)}</p>}

      {!isRunning && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="记录时长">
            <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATION_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="采样间隔">
            <Select value={interval} onChange={(e) => setInterval_(Number(e.target.value))}>
              {INTERVAL_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isRunning ? (
          <Button variant="primary" onClick={handleStart} loading={busy}>
            开始
          </Button>
        ) : (
          <Button variant="danger" onClick={handleStop}>
            停止
          </Button>
        )}
        <Button variant="outline" onClick={handleDownload}>
          下载 CSV
        </Button>
      </div>

      {status && (
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line/8 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">状态</p>
            <p className={`mt-0.5 text-[13px] font-bold ${isRunning ? 'text-ok' : 'text-ink3'}`}>
              {isRunning ? '运行中' : '已停止'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">{countLabel}</p>
            <p className="tnum mt-0.5 text-[13px] font-bold text-ink">{status.samples ?? status.events ?? 0}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">已运行</p>
            <p className="tnum mt-0.5 text-[13px] font-medium text-ink2">
              {formatDuration(status.elapsed_secs)} / {formatDuration(status.duration_secs)}
            </p>
          </div>
          {isRunning && <Meter pct={progress} className="col-span-3" />}
        </div>
      )}
    </Card>
  )
}

// ── AT console ────────────────────────────────────────────────────────────────

function AtConsole() {
  const [command, setCommand] = useState('')
  const [timeout, setTimeout_] = useState(2)
  const [history, setHistory] = useState<{ cmd: string; response: string; error?: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [port, setPort] = useState<string | null | undefined>(undefined)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.atPort().then((p) => setPort(p.port)).catch(() => setPort(null))
  }, [])

  async function handleSend() {
    if (!command.trim() || busy) return
    const cmd = command.trim()
    setCommand('')
    setBusy(true)
    try {
      const data = await api.atSend(cmd, timeout)
      setHistory((h) => [...h, { cmd, response: data.response }])
    } catch (e) {
      setHistory((h) => [...h, { cmd, response: (e as Error).message, error: true }])
    }
    setBusy(false)
    setTimeout(() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight), 50)
  }

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          AT 控制台
          <span
            className="inline-flex cursor-help text-warn"
            title="AT 命令直接访问基带。错误的写入命令可能导致断网，或留下持久化的基带设置。"
            aria-label="AT 命令安全说明"
          >
            <IInfo size={14} />
          </span>
        </span>
      }
    >
      <div role="alert" className="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
        <strong>安全提示：</strong> AT 命令绕过常规设置 API，直接访问基带。仅使用有文档说明的只读查询；写入、重置、重启或改变无线状态的命令可能中断服务，或在管理服务退出后仍保留影响。
      </div>
      <p className="mb-3 text-[12px] text-ink2">
        管理服务仅接受只读命令白名单中的命令。
        {port !== undefined && (
          <span className={port ? 'text-ok' : 'text-warn'}>{port ? ` 端口：${port}` : ' 未检测到 AT 端口。'}</span>
        )}
      </p>

      <div
        ref={outputRef}
        className="mb-3 h-72 overflow-y-auto rounded-lg border border-line/8 bg-surface2/50 p-3 font-mono text-[12px]"
      >
        {history.length === 0 && (
          <p className="text-ink3">尚未发送命令。可尝试：AT、ATI、AT+COPS?、AT+CSQ、AT+CGDCONT?</p>
        )}
        {history.map((h, i) => (
          <div key={i} className="mb-2">
            <p className="text-accent">{'> '} {h.cmd}</p>
            <p className={`whitespace-pre-wrap break-words ${h.error ? 'text-danger' : 'text-ok'}`}>{h.response}</p>
          </div>
        ))}
        {busy && <p className="animate-pulse text-ink3">正在等待响应…</p>}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="AT+COPS?"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line/12 bg-surface2/50 px-3 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink3 focus:border-accent/60"
          autoComplete="off"
        />
        <Select value={timeout} onChange={(e) => setTimeout_(Number(e.target.value))} className="!w-20">
          <option value={2}>2 秒</option>
          <option value={5}>5 秒</option>
          <option value={10}>10 秒</option>
          <option value={30}>30 秒</option>
        </Select>
        <Button variant="primary" onClick={handleSend} disabled={!command.trim()} loading={busy}>
          发送
        </Button>
      </div>
    </Card>
  )
}

// ── Processes ─────────────────────────────────────────────────────────────────

function Processes() {
  const [data, setData] = useState<ProcessListResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [killing, setKilling] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setData(await api.top())
    } catch (e) {
      toastError(e, '加载进程失败')
    } finally {
      setBusy(false)
    }
  }, [])

  async function killBloat() {
    if (!data) return
    const ok = await confirm({
      title: `停止 ${data.bloat_count} 个可选服务？`,
      body: `预计释放 ${formatBytes(data.bloat_rss_kb * 1024)} 内存。管理服务会重新检查当前固件的启动同步屏障，排除所有受保护的守护进程，仅发送正常终止信号。固件可能会重新启动部分服务。`,
      confirmLabel: '停止服务',
      danger: true,
    })
    if (!ok) return
    setKilling(true)
    try {
      const result = await api.killBloat()
      toast(
        result.killed.length > 0
          ? `已停止 ${result.killed.length} 个可选服务，释放 ${formatBytes(result.freed_rss_kb * 1024)}`
          : '没有正在运行的可选服务',
      )
      await load()
    } catch (e) {
      toastError(e, '停止可选服务失败')
    } finally {
      setKilling(false)
    }
  }

  const procs = data?.processes.slice(0, 15) ?? []

  return (
    <Card
      title="主要进程"
      action={
        <Button size="sm" variant="ghost" onClick={load} loading={busy}>
          <IRefresh size={13} /> {data ? '刷新' : '加载'}
        </Button>
      }
      pad={false}
    >
      {data == null ? (
        <div className="p-4">
          <Empty title="按需加载" body="读取所有进程的 /proc 信息开销较大，请按需加载。" />
        </div>
      ) : (
        <>
          <div className="px-4 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface2/70 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink3">可选服务</p>
                <p className="tnum mt-0.5 text-[13px] text-ink2">
                  {data.bloat_count} / {data.total_count} 个进程 ·{' '}
                  <span className="font-semibold text-ink">{formatBytes(data.bloat_rss_kb * 1024)}</span> 内存 ·{' '}
                  {data.bloat_cpu_pct.toFixed(1)}% CPU
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={killBloat}
                loading={killing}
                disabled={data.bloat_count === 0}
              >
                停止可选服务
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line/8 text-left text-[11px] uppercase tracking-wider text-ink3">
                <th className="pb-1.5 pr-3 font-semibold">PID</th>
                <th className="pb-1.5 pr-3 font-semibold">名称</th>
                <th className="pb-1.5 pr-3 text-right font-semibold">CPU%</th>
                <th className="pb-1.5 text-right font-semibold">内存</th>
              </tr>
            </thead>
            <tbody>
              {procs.map((p) => (
                <tr key={p.pid} className="border-b border-line/6 last:border-0">
                  <td className="tnum py-1 pr-3 text-ink3">{p.pid}</td>
                  <td className="max-w-[180px] truncate py-1 pr-3 font-medium text-ink">
                    {p.name}
                    {p.is_bloat && <span className="ml-1.5 text-[10px] font-semibold text-warn">可选服务</span>}
                  </td>
                  <td className="tnum py-1 pr-3 text-right text-ink2">{p.cpu_pct.toFixed(1)}</td>
                  <td className="tnum py-1 text-right text-ink2">{formatBytes(p.rss_kb * 1024)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Card>
  )
}

// ── Tab ───────────────────────────────────────────────────────────────────────

export default function ToolsTab() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LoggerCard
          pollKey="logger-signal"
          title="信号记录"
          description="将信号指标（RSRP、RSRQ、SINR、RSSI、频段、载波聚合 CA）记录为 CSV，最长 24 小时。"
          countLabel="采样数"
          statusFn={api.loggerSignalStatus}
          startFn={api.loggerSignalStart}
          stopFn={api.loggerSignalStop}
          downloadFn={api.loggerSignalDownload}
          filePrefix="signal_log"
        />
        <LoggerCard
          pollKey="logger-connection"
          title="连接事件记录"
          description="记录小区切换、频段变化、NR 连接/断开及 PCI 变化，最长 24 小时。"
          countLabel="事件数"
          statusFn={api.loggerConnectionStatus}
          startFn={api.loggerConnectionStart}
          stopFn={api.loggerConnectionStop}
          downloadFn={api.loggerConnectionDownload}
          filePrefix="connection_log"
        />
      </div>

      <AtConsole />
      <Processes />
    </div>
  )
}
