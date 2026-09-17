import type { SourceFreshness } from '../../../types'

export const clock = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour12: false })

export type Quality = 'valid' | 'missing' | 'stale' | 'unsupported'
export interface MetricSample {
  time: number
  receivedAt: number
  sampledAt: number | null
  value: number | null
  source: string
  quality: Quality
  ttl: number
  /** A collection interruption starts a new segment even within the source TTL. */
  segment: number
}
export type Series = Record<string, MetricSample[]>
export interface MetricDefinition { id: string; name: string; unit: string; color: string }
export const throughputMetrics: MetricDefinition[] = [
  { id: 'down', name: 'WAN 下行', unit: 'Mbps', color: '#3582c4' },
  { id: 'up', name: 'WAN 上行', unit: 'Mbps', color: '#24937d' },
]
export const RETENTION_MS = 60 * 60 * 1000
export const qualityLabels: Record<Quality, string> = { valid: '有效', missing: '缺失', stale: '过期', unsupported: '不支持' }

/** Source time is preserved verbatim; the common browser timeline uses monotonic source age to tolerate device clock skew. */
export function metricSample(value: unknown, source: string, receivedAt: number, freshness?: SourceFreshness, unsupported = false): MetricSample {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null
  const sampledAt = freshness?.sampled_at_ms ?? null
  const ttl = freshness?.ttl_ms ?? 6000
  const quality: Quality = unsupported ? 'unsupported' : freshness?.stale || (freshness?.age_ms != null && freshness.age_ms > ttl) ? 'stale' : numeric == null ? 'missing' : 'valid'
  return { time: quality === 'valid' && freshness?.age_ms != null ? receivedAt - freshness.age_ms : receivedAt, receivedAt, sampledAt, value: numeric, source, quality, ttl, segment: 0 }
}

export function readingAt(samples: MetricSample[], time: number): MetricSample | undefined {
  const sample = samples.findLast(row => row.time <= time)
  if (!sample) return undefined
  if (sample.quality === 'valid' && time - sample.time > sample.ttl) return { ...sample, quality: 'stale' }
  return sample
}

export interface DiagnosticSnapshot { series: Series; now: number; paused: boolean }
/** A page-owned in-memory session. Shared polling continues independently. */
export class DiagnosticSession {
  private snapshot: DiagnosticSnapshot
  private listeners = new Set<() => void>()
  private segment = 0
  constructor(now: number) { this.snapshot = { series: {}, now, paused: false } }
  getSnapshot = () => this.snapshot
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private publish(next: DiagnosticSnapshot) { this.snapshot = next; this.listeners.forEach(fn => fn()) }
  setPaused = (paused: boolean) => {
    if (paused === this.snapshot.paused) return
    this.segment++
    this.publish({ ...this.snapshot, paused })
  }
  interrupt = () => { this.segment++ }
  tick(now: number) {
    if (this.snapshot.paused) return
    const series = Object.fromEntries(Object.entries(this.snapshot.series).map(([key, rows]) => [key, rows.filter(row => row.time >= now - RETENTION_MS)]))
    this.publish({ ...this.snapshot, series, now })
  }
  append(observations: Record<string, MetricSample>, now: number) {
    if (this.snapshot.paused) return
    const series = { ...this.snapshot.series }
    for (const [key, sample] of Object.entries(observations)) {
      const rows = series[key] ?? []
      const previous = rows.at(-1)
      // A duplicate cached observation can mark a quality transition, but cannot
      // become another successful measurement, including after an interruption.
      if (previous && sample.quality === previous.quality && (sample.sampledAt != null ? sample.sampledAt === previous.sampledAt : sample.receivedAt === previous.receivedAt)) continue
      if (sample.quality === 'valid' && rows.some(row => row.quality === 'valid' && sample.sampledAt != null && row.sampledAt === sample.sampledAt)) continue
      if (previous && sample.time < previous.time) continue
      series[key] = [...rows, { ...sample, segment: this.segment }].filter(row => row.time >= now - RETENTION_MS)
    }
    this.publish({ ...this.snapshot, series, now })
  }
}

/** Connect only successive observations within a collection segment. */
export function chartSegments(samples: MetricSample[]): MetricSample[][] {
  const segments: MetricSample[][] = []
  let current: MetricSample[] = []
  for (const row of samples) {
    const previous = current.at(-1)
    if (row.quality !== 'valid' || row.value == null || (previous && (previous.segment !== row.segment || row.time - previous.time > Math.max(previous.ttl, 6000)))) {
      if (current.length) segments.push(current)
      current = []
    }
    if (row.quality === 'valid' && row.value != null) current.push(row)
  }
  if (current.length) segments.push(current)
  return segments
}
