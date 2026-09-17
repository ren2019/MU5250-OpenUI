import { useState } from 'react'
import { Button, Select } from '../../../ui/controls'
import DiagnosticChart from './DiagnosticChart'
import { clock, throughputMetrics } from './model'
import { useDiagnosticSession } from './useDiagnosticSession'
import './diagnostics.css'

export default function DiagnosticsPage() {
  const { series, now, paused, session } = useDiagnosticSession()
  const [minutes, setMinutes] = useState(15)
  const [cursor, setCursor] = useState<number | null>(null)
  const start = now - minutes * 60000
  const successful = Object.values(series).flat().filter(row => row.quality === 'valid')
  const lastSuccess = successful.reduce((latest, row) => Math.max(latest, row.receivedAt), 0)
  return <div className="diagnostics">
    <header className="diagnostic-title"><div><h2>实时诊断</h2><p>共同时间轴 · WAN 为设备整体吞吐量（约 15 秒滚动平均）</p></div><span>{paused ? '采集已暂停' : '采集中 · 目标 3 秒'}</span></header>
    <div className="diagnostic-toolbar">
      <label>时间窗口<Select value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setCursor(null) }}>{[5, 15, 30, 60].map(value => <option key={value} value={value}>最近 {value} 分钟</option>)}</Select></label>
      <Button variant="subtle" onClick={() => session.setPaused(!paused)}>{paused ? '恢复采集' : '暂停采集'}</Button>
      <Button variant="subtle" onClick={() => setCursor(null)}>回到最新</Button>
    </div>
    <p className="diagnostic-reading">{cursor == null ? '最新时刻' : '回看时刻'}：{clock(cursor ?? now)} · 最后成功接收：{lastSuccess ? clock(lastSuccess) : '尚无'}</p>
    <label className="diagnostic-scrubber">共同时间光标<input aria-label="共同时间光标" type="range" min={start} max={now} step={1000} value={Math.max(start, cursor ?? now)} onChange={event => setCursor(Number(event.target.value))} /></label>
    <div className="diagnostic-layout"><div>{throughputMetrics.map(metric => <DiagnosticChart key={metric.id} metric={metric} samples={series[metric.id] ?? []} start={start} end={now} cursor={cursor} onCursor={setCursor} />)}</div><aside><h3>变化时间线</h3><p>当前显示速率采样。无线与连接变化将在后续诊断功能中记录。</p><p>曲线空白表示缺失、过期或采集间断，不能据此认定设备断网。</p></aside></div>
    <p className="diagnostic-note">本会话仅保留最近 60 分钟内存数据；刷新、关闭或离开诊断页会重置记录。未采集时段不会补造历史。读数同时变化仅提供排查线索，不代表因果关系。</p>
  </div>
}
