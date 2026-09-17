import type { HomeData, SignalInfo, ThermalAll } from '../../../types'
import { RETENTION_MS } from './model'
import { temperatureSample } from './deviceMetrics'
import { carrierIdentity } from './radio'

export interface DiagnosticEvent { id: number; time: number; source: string; kind: 'change' | 'failure' | 'recovery'; title: string; detail: string }
interface Observation { token: number; time: number; fields: Record<string, string>; failed: boolean; seenValid: boolean }
const names: Record<string, string> = { signal: '无线', wan: 'WAN 连接', speed: '速率', cpu: 'CPU' }
function radioFields(signal: SignalInfo): Record<string, string> {
  const identities: string[] = [], cells: string[] = []
  for (const technology of ['LTE', 'NR'] as const) {
    for (const carrier of technology === 'LTE' ? signal.lte_carriers : signal.nr_carriers) {
      const cell = technology === 'LTE' ? signal.lte_cell_id : signal.nr_cell_id
      identities.push(carrierIdentity(technology, carrier, cell))
      if (carrier.label === 'PCC') cells.push(`${technology} PCI ${carrier.pci}${cell ? ` / ${cell}` : ''}`)
    }
  }
  return { ...(signal.type ? { 制式: signal.type } : {}), ...(cells.length ? { 服务小区: cells.sort().join('；') } : {}), 载波集合: identities.sort().join('；') }
}
/** Only received observations create events; source TTL expiry between polls is not a collection failure. */
export class EventHistory {
  private events: DiagnosticEvent[] = []
  private states = new Map<string, Observation>()
  private sequence = 0
  private listeners = new Set<() => void>()
  getSnapshot = () => this.events
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish() { this.listeners.forEach(listener => listener()) }
  interrupt = () => { this.states.clear() }
  prune(now: number) {
    const remaining = this.events.filter(event => event.time >= now - RETENTION_MS)
    if (remaining.length !== this.events.length) { this.events = remaining; this.publish() }
  }
  ingestThermal(data: ThermalAll | null, now: number, error: string | null) {
    const row = temperatureSample(data, now, error)
    const old = this.states.get('thermal')
    if (row.quality === 'unsupported') {
      this.states.delete('thermal')
      this.prune(now)
      return
    }
    const failed = row.quality !== 'valid' || Boolean(data?.source?.error)
    const token = data?.source?.sampled_at_ms ?? now
    let kind: DiagnosticEvent['kind'] | null = null
    if (failed) {
      if (old && !old.failed) kind = 'failure'
      this.states.set('thermal', { token: old?.token ?? token, time: now, fields: {}, failed: true, seenValid: old?.seenValid ?? false })
    } else if (!old || token > old.token) {
      if (old?.failed && old.seenValid) kind = 'recovery'
      this.states.set('thermal', { token, time: now, fields: {}, failed: false, seenValid: true })
    }
    if (kind) {
      this.events = [...this.events, { id: ++this.sequence, time: now, source: 'thermal', kind,
        title: kind === 'failure' ? '基带温度采集不可用' : '基带温度采集恢复',
        detail: kind === 'failure' ? '响应缺失、失败或过期；不代表设备断网。' : '以新的有效观测重建基线，缺口期间不推断状态变化。' }]
      this.publish()
    }
    this.prune(now)
  }
  ingest(data: HomeData | null, now: number, requestFailed: boolean) {
    const added: DiagnosticEvent[] = []
    const add = (source: string, kind: DiagnosticEvent['kind'], title: string, detail: string) => added.push({ id: ++this.sequence, time: now, source, kind, title, detail })
    for (const source of ['signal', 'wan', 'speed', 'cpu'] as const) {
      const value = data?.[source], meta = data?.sources?.[source]
      const old = this.states.get(source)
      const failed = requestFailed || Boolean(meta?.error || meta?.stale || (meta?.age_ms != null && meta.age_ms > meta.ttl_ms)) || value == null
      const token = meta?.sampled_at_ms ?? now
      if (failed) {
        if (old && !old.failed) add(source, 'failure', `${names[source]}采集不可用`, '响应缺失、失败或过期；不代表设备断网。')
        this.states.set(source, { token: old?.token ?? token, time: now, fields: {}, failed: true, seenValid: old?.seenValid ?? false })
        continue
      }
      // Replayed cache cannot establish recovery or create another transition.
      if (old && token <= old.token) {
        if (!old.failed) {
          // Valid cache receipts maintain continuity, but never bridge a polling gap.
          if (now - old.time > Math.max(meta?.ttl_ms ?? 6000, 6000)) old.fields = {}
          old.time = now
        }
        continue
      }
      const fields = source === 'signal' ? radioFields(data!.signal!) : source === 'wan' && typeof data!.wan!.connected === 'boolean' ? { 连接状态: data!.wan!.connected ? '已连接' : '未连接' } : {}
      if (old?.failed && old.seenValid) add(source, 'recovery', `${names[source]}采集恢复`, '以新的有效观测重建基线，缺口期间不推断状态变化。')
      if (old && !old.failed && now - old.time <= Math.max(meta?.ttl_ms ?? 6000, 6000)) {
        for (const [field, current] of Object.entries(fields)) {
          const previous = old.fields[field]
          if (previous != null && previous !== current) add(source, 'change', `${field}变化`, field === '载波集合' ? '观测到载波加入、退出或身份改变；请结合所选载波历史查看。' : `${previous} → ${current}`)
        }
      }
      this.states.set(source, { token, time: now, fields, failed: false, seenValid: true })
    }
    if (added.length) { this.events = [...this.events, ...added]; this.publish() }
    this.prune(now)
  }
}
