import { throughputMetrics, type Series } from './model'
import { deviceMetrics } from './deviceMetrics'
import { radioKey, radioMetrics, type RadioCarrier } from './radio'
import type { DiagnosticEvent } from './events'

interface ExportSnapshot {
  series: Series
  events: DiagnosticEvent[]
  carrier?: RadioCarrier
  start: number
  end: number
  simulated: boolean
}
const iso = (time: number | null) => time == null ? '' : new Date(time).toISOString()
// Quote every field, and keep device-provided text from being interpreted as a spreadsheet formula.
const field = (value: string | number) => {
  const text = String(value)
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

/** Synchronous serialization freezes this render's window and records before collection can advance. */
export function diagnosticCsv(snapshot: ExportSnapshot): string {
  const { series, events, carrier, start, end, simulated } = snapshot
  const headers = ['record_type', 'mode', 'window_start_utc', 'window_end_utc', 'timeline_time_utc', 'source_sampled_at_utc', 'received_at_utc', 'metric', 'value', 'unit', 'source', 'carrier_id', 'technology', 'role', 'band', 'channel', 'pci', 'cell', 'quality_at_observation', 'ttl_ms', 'segment', 'event_kind', 'event_title', 'event_detail']
  const rows: { time: number; fields: (string | number)[] }[] = []
  const mode = simulated ? 'SIMULATED' : 'DEVICE'
  const prefix = (type: string, time: number) => [type, mode, iso(start), iso(end), iso(time)]
  for (const metric of [...throughputMetrics, ...radioMetrics, ...deviceMetrics]) {
    const wireless = radioMetrics.some(item => item.id === metric.id)
    if (wireless && !carrier) continue
    const key = wireless ? radioKey(carrier!.id, metric.id) : metric.id
    for (const sample of series[key] ?? []) {
      if (sample.time < start || sample.time > end) continue
      const identity = wireless && carrier ? [carrier.id, carrier.technology, carrier.role, carrier.band, carrier.channel, carrier.pci, carrier.cell ?? ''] : ['', '', '', '', '', '', '']
      rows.push({ time: sample.time, fields: [...prefix('metric', sample.time), iso(sample.sampledAt), iso(sample.receivedAt), metric.id, sample.quality === 'valid' ? sample.value ?? '' : '', metric.unit, sample.source, ...identity, sample.quality, sample.ttl, sample.segment, '', '', ''] })
    }
  }
  for (const event of events) {
    if (event.time < start || event.time > end) continue
    rows.push({ time: event.time, fields: [...prefix('event', event.time), '', iso(event.time), '', '', '', event.source, '', '', '', '', '', '', '', '', '', '', event.kind, event.title, event.detail] })
  }
  rows.sort((a, b) => a.time - b.time)
  return '\uFEFF' + [headers, ...rows.map(row => row.fields)].map(row => row.map(field).join(',')).join('\r\n') + '\r\n'
}

export function downloadDiagnosticCsv(snapshot: ExportSnapshot) {
  const csv = diagnosticCsv(snapshot)
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${snapshot.simulated ? 'SIMULATED-' : ''}diagnostics-${new Date(snapshot.end).toISOString().replaceAll(':', '-')}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
