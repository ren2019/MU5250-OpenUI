import { useCallback, useEffect, useState } from 'react'
import { api } from '../../data/api'
import type { TtlStatus } from '../../types'
import { Button, Input } from '../../ui/controls'
import { toast, toastError } from '../../ui/feedback'
import { Card, Chip } from '../../ui/primitives'

export default function TtlTab() {
  const [status, setStatus] = useState<TtlStatus | null>(null)
  const [ttlInput, setTtlInput] = useState('65')
  const [busy, setBusy] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.ttlStatus()
      setStatus(data)
      if (data.ttl_value && data.ttl_value > 0) setTtlInput(String(data.ttl_value))
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const active = Boolean(status?.active || status?.ipv6_active)

  async function applyTtl() {
    const val = parseInt(ttlInput)
    if (!val || val < 1 || val > 255) {
      toast('TTL 必须在 1 至 255 之间', 'err')
      return
    }
    setBusy(true)
    try {
      await api.ttlSet(val)
      toast(`TTL 已设为 ${val} (IPv4 + IPv6)`)
      await fetchStatus()
    } catch (e) {
      toastError(e, '设置 TTL 失败')
    } finally {
      setBusy(false)
    }
  }

  async function clearTtl() {
    setBusy(true)
    try {
      await api.ttlClear()
      toast('已关闭 TTL 固定')
      await fetchStatus()
    } catch (e) {
      toastError(e, '清除 TTL 设置失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="固定 TTL（生存时间）">
      <div className="space-y-3">
        <p className="text-[12px] text-ink2">
          覆盖从局域网进入的流量的 TTL / 跳数限制，以规避运营商的网络共享检测。设置立即生效，重启后保留。
        </p>

        {status == null ? (
          <p className="text-[13px] text-ink3">正在检查状态…</p>
        ) : active ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="tnum text-[13px] font-semibold text-ok">已启用（TTL={status.ttl_value}）</span>
              {status.ipv6_active && <Chip tone="default">IPv4 + IPv6</Chip>}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20">
                <Input type="number" min={1} max={255} value={ttlInput} onChange={(e) => setTtlInput(e.target.value)} />
              </div>
              <Button variant="outline" onClick={applyTtl} loading={busy}>
                更新
              </Button>
              <Button variant="ghost" onClick={clearTtl} disabled={busy}>
                禁用
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-24">
              <Input type="number" min={1} max={255} value={ttlInput} onChange={(e) => setTtlInput(e.target.value)} placeholder="65" />
            </div>
            <Button variant="primary" onClick={applyTtl} loading={busy} disabled={!ttlInput}>
              启用 TTL 固定
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}
