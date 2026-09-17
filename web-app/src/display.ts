// Translate only at the presentation boundary. Unknown firmware values stay intact.
const STATUS_LABELS: Record<string, string> = {
  Charging: '充电中', Discharging: '放电中', 'Not charging': '未充电', Full: '已充满',
  Good: '良好', Unknown: '未知', unknown: '未知', Cold: '低温', Overheat: '过热',
  Dead: '失效', Overvoltage: '过压', 'Unspecified failure': '未指定故障',
  Fast: '快充', Trickle: '涓流充电', Standard: '标准充电', None: '无',
  READY: '就绪', ready: '就绪', SIM_READY: 'SIM 卡就绪', SIM_PIN: '需要 SIM PIN 码',
  SIM_PUK: '需要 SIM PUK 码', ABSENT: '未插卡', '5G NSA': '5G NSA（非独立组网）',
  '5G SA': '5G SA（独立组网）', '4G only': '仅 4G', '3G only': '仅 3G',
}

export function statusLabel(value?: string | null): string {
  return value == null ? '不可用' : STATUS_LABELS[value] ?? value
}

const SOURCE_LABELS: Record<string, string> = {
  signal: '信号', battery: '电池', thermal: '温度', speed: '速率', device: '设备',
  wan: '广域网', wan6: 'IPv6 广域网', cpu: 'CPU', memory: '内存',
  data_usage: '流量统计', charge_control: '充电控制',
}
export function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? value
}
