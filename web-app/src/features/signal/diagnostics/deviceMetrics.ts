import type { HomeData, ThermalAll } from '../../../types'
import { metricSample, type MetricDefinition } from './model'

export const deviceMetrics: MetricDefinition[] = [
  { id: 'temperature', name: '基带温度', unit: '°C', color: '#c88431' },
  { id: 'cpu', name: 'CPU 使用率', unit: '%', color: '#8261ae' },
]

export function cpuSample(data: HomeData | null, receivedAt: number, error: string | null) {
  const value = data?.cpu?.overall
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
  const row = metricSample(valid ? value : null, 'cpu', receivedAt, data?.sources?.cpu)
  if (error) { row.quality = 'missing'; row.time = receivedAt }
  return row
}

export function temperatureSample(data: ThermalAll | null, receivedAt: number, error: string | null) {
  const value = data?.modem
  const valid = typeof value === 'number' && Number.isFinite(value) && value > -40 && value < 150
  const unsupported = data?.modem_supported === false || (data?.modem_supported == null && value == null && !data?.source?.error)
  const row = metricSample(valid ? value : null, 'thermal.modem', receivedAt, data?.source, unsupported)
  // Older agents have no source metadata: explicitly retain receipt-time semantics.
  if (!data?.source) row.ttl = 10000
  if (error) { row.quality = 'missing'; row.time = receivedAt }
  return row
}
