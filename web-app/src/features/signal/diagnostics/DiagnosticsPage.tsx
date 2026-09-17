import { useState } from 'react'
import { Button, Select } from '../../../ui/controls'
import DiagnosticChart from './DiagnosticChart'
import { clock, throughputMetrics } from './model'
import { useDiagnosticSession } from './useDiagnosticSession'
import { carrierLabel, radioKey, radioMetrics } from './radio'
import { useRadioHistory } from './useRadioHistory'
import { deviceMetrics } from './deviceMetrics'
import './diagnostics.css'
import { useDiagnosticEvents } from './useDiagnosticEvents'
import { downloadDiagnosticCsv } from './exportCsv'

export default function DiagnosticsPage() {
  const { series, now, paused, session, home, thermal, thermalFailed } = useDiagnosticSession()
  const events = useDiagnosticEvents(session, home, thermal, now)
  const radio = useRadioHistory(session, home, now)
  const selectedCarrier = radio.carriers.find(carrier => carrier.id === radio.selected)
  const [minutes, setMinutes] = useState(15)
  const [cursor, setCursor] = useState<number | null>(null)
  const start = now - minutes * 60000
  const successful = Object.values(series).flat().filter(row => row.quality === 'valid')
  const lastSuccess = successful.reduce((latest, row) => Math.max(latest, row.receivedAt), 0)
  return <div className="diagnostics">
    <header className="diagnostic-title"><div><h2>实时诊断</h2><p>共同时间轴 · WAN 为设备整体吞吐量（约 15 秒滚动平均）</p></div><span>{paused ? '采集已暂停' : '采集中 · 目标 3 秒'}</span></header>
    <div className="diagnostic-toolbar">
      <label>时间窗口<Select value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setCursor(null) }}>{[5, 15, 30, 60].map(value => <option key={value} value={value}>最近 {value} 分钟</option>)}</Select></label>
      <label>无线载波<Select value={radio.selected ?? ""} onChange={event => radio.select(event.target.value)}>{!selectedCarrier && <option value={radio.selected ?? ""}>{radio.selected ? "所选载波历史已过期" : "暂无载波"}</option>}{radio.carriers.map(carrier => <option key={carrier.id} value={carrier.id}>{carrierLabel(carrier)}{carrier.present ? "" : "（已消失 · 历史）"}</option>)}</Select></label>
      <Button variant="subtle" onClick={() => session.setPaused(!paused)}>{paused ? '恢复采集' : '暂停采集'}</Button>
      <Button variant="subtle" onClick={() => setCursor(null)}>回到最新</Button>
      <Button variant="subtle" onClick={() => downloadDiagnosticCsv({ series, events, carrier: selectedCarrier, start, end: now, simulated: new URLSearchParams(window.location.search).get('demo') === '1' })}>导出当前窗口 CSV</Button>
    </div>
    {thermalFailed && <p role="status">基带温度采集失败；其他来源继续独立更新。</p>}
    <p className="diagnostic-reading">{cursor == null ? '最新时刻' : '回看时刻'}：{clock(cursor ?? now)} · 最后成功接收：{lastSuccess ? clock(lastSuccess) : '尚无'}</p>
    <p className="diagnostic-reading">{selectedCarrier ? carrierLabel(selectedCarrier) : "尚无可用无线载波"} · 载波选择仅影响无线指标，WAN 仍为设备整体速率</p>
    <label className="diagnostic-scrubber">共同时间光标<input aria-label="共同时间光标" type="range" min={start} max={now} step={1000} value={Math.max(start, cursor ?? now)} onChange={event => setCursor(Number(event.target.value))} /></label>
    <div className="diagnostic-layout"><div>{throughputMetrics.map(metric => <DiagnosticChart key={metric.id} metric={metric} samples={series[metric.id] ?? []} start={start} end={now} cursor={cursor} onCursor={setCursor} />)}{radioMetrics.map(metric => <DiagnosticChart key={metric.id} metric={metric} samples={radio.selected ? series[radioKey(radio.selected, metric.id)] ?? [] : []} start={start} end={now} cursor={cursor} onCursor={setCursor} />)}{deviceMetrics.map(metric => <DiagnosticChart key={metric.id} metric={metric} samples={series[metric.id] ?? []} start={start} end={now} cursor={cursor} onCursor={setCursor} />)}</div><aside><h3>变化时间线</h3><p>时间为观测到变化的时刻；首次有效采样建立基线。</p><ol className="diagnostic-events">{events.filter(event => event.time >= start && event.time <= now).toReversed().map(event => <li key={event.id}><button type="button" aria-pressed={cursor === event.time} onClick={() => setCursor(event.time)}><time>{clock(event.time)}</time><strong>{event.title}</strong><span>{event.detail}</span></button></li>)}</ol>{!events.some(event => event.time >= start && event.time <= now) && <p>当前窗口尚无变化事件。</p>}<p>曲线空白表示缺失、过期或采集间断，不能据此认定设备断网。</p></aside></div>
    <p className="diagnostic-note">本会话仅保留最近 60 分钟内存数据；刷新、关闭或离开诊断页会重置记录。未采集时段不会补造历史。温度目标 10 秒、CPU 目标 3 秒更新，以各自采样时间和有效期为准。温升与掉速同时出现仅提供排查线索，不能据此确认热降频。</p>
  </div>
}
