import type { CarrierComponent, SignalInfo, SourceFreshness } from '../../../types'
import { DiagnosticSession, metricSample, RETENTION_MS, type MetricDefinition, type MetricSample } from './model'

export const radioMetrics: MetricDefinition[] = [
  { id: 'sinr', name: 'SINR', unit: 'dB', color: '#b18a22' },
  { id: 'rsrp', name: 'RSRP', unit: 'dBm', color: '#9870ad' },
  { id: 'rsrq', name: 'RSRQ', unit: 'dB', color: '#d57953' },
]
export interface RadioCarrier { id: string; technology: 'LTE' | 'NR'; role: string; band: string; pci: number; channel: number; cell?: string; lastSeen: number; present: boolean }
/** SCC indices are display ordering, not identities. The available serving-cell ID belongs to PCC only. */
export function carrierIdentity(technology: 'LTE' | 'NR', carrier: CarrierComponent, cell?: string): string {
  return JSON.stringify([technology, carrier.label === 'PCC' ? 'PCC' : 'SCC', carrier.band, carrier.earfcn, carrier.pci, carrier.label === 'PCC' ? cell ?? null : null])
}
export const radioKey = (id: string, metric: string) => `radio:${id}:${metric}`
export const carrierLabel = (carrier: RadioCarrier) => `${carrier.technology} ${carrier.role} ${carrier.band} · PCI ${carrier.pci} · 频点 ${carrier.channel}${carrier.cell ? ` · 小区 ${carrier.cell}` : ''}`
interface RadioSnapshot { carriers: RadioCarrier[]; selected: string | null }

export class RadioHistory {
  private snapshot: RadioSnapshot = { carriers: [], selected: null }
  private listeners = new Set<() => void>()
  private lastValidSource: number | null = null
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(next: RadioSnapshot) { this.snapshot = next; this.listeners.forEach(listener => listener()) }
  select = (selected: string) => this.publish({ ...this.snapshot, selected })
  prune(now: number) {
    const carriers = this.snapshot.carriers.filter(carrier => carrier.lastSeen >= now - RETENTION_MS)
    if (carriers.length !== this.snapshot.carriers.length) this.publish({ ...this.snapshot, carriers })
  }
  ingest(session: DiagnosticSession, signal: SignalInfo | null | undefined, freshness: SourceFreshness | undefined, now: number, failed: boolean) {
    if (session.getSnapshot().paused) return
    const probe = metricSample(signal ? 1 : null, 'signal', now, freshness)
    if (failed || freshness?.error) { probe.quality = 'missing'; probe.time = now }
    const valid = probe.quality === 'valid'
    // Even if another response arrives, a repeated source observation cannot change identity or history.
    const duplicate = valid && probe.sampledAt != null && probe.sampledAt === this.lastValidSource
    if (duplicate) return
    const observations: Record<string, MetricSample> = {}
    const current = new Map<string, RadioCarrier>()
    if (valid && signal) {
      for (const technology of ['LTE', 'NR'] as const) {
        for (const carrier of technology === 'LTE' ? signal.lte_carriers : signal.nr_carriers) {
          // Keep LTE and NR cell identifiers separate, including NSA dual connectivity.
          const cell = carrier.label === 'PCC' ? (technology === 'LTE' ? signal.lte_cell_id : signal.nr_cell_id) : undefined
          const id = carrierIdentity(technology, carrier, cell)
          current.set(id, { id, technology, role: carrier.label === 'PCC' ? 'PCC' : 'SCC', band: carrier.band, pci: carrier.pci, channel: carrier.earfcn, cell, lastSeen: now, present: true })
          for (const metric of radioMetrics) observations[radioKey(id, metric.id)] = metricSample(carrier[metric.id as 'sinr' | 'rsrp' | 'rsrq'], 'signal', now, freshness)
        }
      }
      this.lastValidSource = probe.sampledAt
    }
    const carriers = this.snapshot.carriers.map(previous => {
      const next = current.get(previous.id)
      if (next) { current.delete(previous.id); return next }
      // A known disappearance ends the series once. Failures invalidate readings but cannot prove removal.
      if (previous.present) for (const metric of radioMetrics) observations[radioKey(previous.id, metric.id)] = { ...probe, value: null, quality: valid ? 'missing' : probe.quality, time: now }
      return valid ? { ...previous, present: false } : previous
    })
    carriers.push(...current.values())
    session.append(observations, now)
    this.publish({ carriers: carriers.filter(carrier => carrier.lastSeen >= now - RETENTION_MS), selected: this.snapshot.selected ?? carriers[0]?.id ?? null })
  }
}
