// THROWAWAY: deterministic synthetic scenarios, never device measurements.
export type Scenario = 'handover' | 'heat' | 'gap'
export type Sample = { time: number; down: number | null; up: number | null; rsrp: number | null; sinr: number | null; rsrq: number | null; temp: number | null; cpu: number | null }
export const scenarios = { handover: '小区切换与掉速', heat: '持续升温与掉速', gap: '采集中断与恢复' }
export const metrics = {
  down: { name: '下行速率', unit: 'Mbps', color: '#3877d0', min: 0, max: 600 },
  up: { name: '上行速率', unit: 'Mbps', color: '#39a98c', min: 0, max: 60 },
  rsrp: { name: 'RSRP · 信号强度', unit: 'dBm', color: '#7771cf', min: -115, max: -65 },
  sinr: { name: 'SINR · 信干噪比', unit: 'dB', color: '#bd822c', min: -5, max: 30 },
  rsrq: { name: 'RSRQ · 信号质量', unit: 'dB', color: '#bd6688', min: -22, max: -5 },
  temp: { name: '基带温度', unit: '°C', color: '#cf7251', min: 35, max: 90 },
  cpu: { name: 'CPU 使用率', unit: '%', color: '#5b929b', min: 0, max: 100 },
}
export type Metric = keyof typeof metrics
export function sample(time: number, eventAt: number, scenario: Scenario): Sample {
  const d = (time - eventAt) / 1000
  const wave = Math.sin(time / 15000)
  const dip = d >= 0 && d < 45
  const hot = Math.max(0, Math.min(1, (d + 180) / 240))
  if (scenario === 'gap' && d >= 0 && d < 45) return { time, down: null, up: null, rsrp: null, sinr: null, rsrq: null, temp: null, cpu: null }
  return {
    time,
    down: Math.max(0, (scenario === 'heat' ? 460 - hot * 290 : dip ? 28 : 440) + wave * 22),
    up: (dip && scenario === 'handover' ? 5 : 35) + wave * 3,
    rsrp: -79 + wave * 2 - (dip && scenario === 'handover' ? 15 : 0),
    sinr: 22 + wave * 1.8 - (dip && scenario === 'handover' ? 18 : 0),
    rsrq: -10 + wave * .7 - (dip && scenario === 'handover' ? 7 : 0),
    temp: scenario === 'heat' ? 48 + hot * 33 : 49 + wave * 1.5,
    cpu: scenario === 'heat' ? 35 + hot * 28 : 28 + wave * 6,
  }
}
export function seed(eventAt: number, scenario: Scenario) {
  return Array.from({ length: 1201 }, (_, i) => sample(eventAt - 3480000 + i * 3000, eventAt, scenario))
}
export function events(eventAt: number, scenario: Scenario) {
  const rows = scenario === 'handover'
    ? [[0, 'PCI 801 → 803', 'NR n78 切换服务小区；同一时刻出现速率与 SINR 下降。'], [15000, 'NR 辅载波退出', '载波数 4 → 3；可能影响可用带宽。'], [45000, '载波恢复', '载波数 3 → 4；速率回升。']]
    : scenario === 'heat'
      ? [[-180000, '持续负载开始', '模拟传输负载开始，温度逐步上升。'], [0, '温度与速率走势分离', '基带温度持续升高、速率下降；仅为相关线索，不能确认热降频。'], [60000, '高温持续', '无线质量相对稳定，应进一步核对负载和散热。']]
      : [[0, '采集失败', '连续 45 秒无有效读数。曲线留空，不以零值或旧值补齐。'], [45000, '采集恢复', '重新收到有效读数；缺失期间的连接状态未知。']]
  return rows.map(([offset, title, detail]) => ({ time: eventAt + Number(offset), title: String(title), detail: String(detail) }))
}
export function clock(time: number) { return new Date(time).toLocaleTimeString('zh-CN', { hour12: false }) }
export function value(sample: Sample | undefined, key: Metric, carrier: string) {
  const raw = sample?.[key]
  if (raw == null) return null
  return raw + (carrier === 'LTE · B8 · PCC' ? key === 'rsrp' ? 6 : key === 'sinr' ? -5 : key === 'rsrq' ? -2 : 0 : 0)
}
