// THROWAWAY: three structurally different diagnostic layouts in the existing Signal host.
// Question: shared time-axis, incident-first, or live cockpit? ?prototype=diagnostics&variant=A|B|C
import { useCallback, useEffect, useState } from 'react'
import { Button, Select } from '../../../ui/controls'
import { PrototypeSwitcher, type PrototypeVariant } from '../../../ui/PrototypeSwitcher'
import { clock, events, metrics, sample, scenarios, seed, value, type Metric, type Sample, type Scenario } from './diagnostic-data'
import './diagnostic-prototype.css'

type Model = {
  rows: Sample[]; selected: Sample; cursor: number | null; choose: (t: number | null) => void
  carrier: string; eventAt: number; scenario: Scenario
}
function Chart({ model: m, metric, compact = false }: { model: Model; metric: Metric; compact?: boolean }) {
  const meta = metrics[metric]
  const start = m.rows[0].time, end = m.rows.at(-1)!.time
  const x = (time: number) => 44 + (time - start) / (end - start) * 540
  const y = (v: number) => 110 - (v - meta.min) / (meta.max - meta.min) * 96
  const segments: string[][] = [[]]
  for (const row of m.rows) {
    const v = value(row, metric, m.carrier)
    if (v == null) { if (segments.at(-1)!.length) segments.push([]) }
    else segments.at(-1)!.push(`${x(row.time)},${y(v)}`)
  }
  const current = value(m.selected, metric, m.carrier)
  return <section className={`dp-chart ${compact ? 'compact' : ''}`}>
    <div className="dp-chart-label"><span><i style={{ background: meta.color }} />{meta.name}</span><strong>{current == null ? '无读数' : current.toFixed(1)} <small>{meta.unit}</small></strong></div>
    <svg viewBox="0 0 600 135" role="img" aria-label={`${meta.name}趋势，${clock(start)} 至 ${clock(end)}`} onPointerMove={e => {
      const box = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, ((e.clientX - box.left) / box.width * 600 - 44) / 540))
      m.choose(m.rows[Math.round(ratio * (m.rows.length - 1))].time)
    }}>
      {[0, .5, 1].map(p => <g key={p}><line x1="44" x2="584" y1={14 + 96 * p} y2={14 + 96 * p} className="dp-grid" /><text x="36" y={18 + 96 * p} textAnchor="end">{Math.round(meta.max - (meta.max - meta.min) * p)}</text></g>)}
      {events(m.eventAt, m.scenario).filter(e => e.time >= start && e.time <= end).map(e => <line key={e.time} x1={x(e.time)} x2={x(e.time)} y1="10" y2="110" className="dp-event-line" />)}
      {segments.filter(s => s.length).map(s => <polyline key={s[0]} points={s.join(' ')} fill="none" stroke={meta.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      {m.cursor != null && m.cursor >= start && m.cursor <= end && <line x1={x(m.cursor)} x2={x(m.cursor)} y1="10" y2="112" className="dp-cursor" />}
      <text x="44" y="130">{clock(start)}</text><text x="584" y="130" textAnchor="end">{clock(end)}</text>
    </svg>
    {compact && <div className="dp-mini-time">{clock(start)} — {clock(end)}</div>}
  </section>
}
function EventList({ model: m }: { model: Model }) {
  return <div className="dp-events">{events(m.eventAt, m.scenario).map((e, i) => <button key={e.time} className={m.cursor === e.time ? 'selected' : ''} onClick={() => m.choose(e.time)}><span className="dp-event-index">0{i + 1}</span><div><time>{clock(e.time)}</time><strong>{e.title}</strong><p>{e.detail}</p></div></button>)}</div>
}
function Reading({ model: m }: { model: Model }) {
  const isMissing = m.selected.down == null
  const after = m.selected.time >= m.eventAt
  return <div className="dp-reading"><span>{m.cursor == null ? '最新读数' : '回看时刻'} <b>{clock(m.selected.time)}</b></span><span>{isMissing ? '采集缺失 · 连接状态未知' : `5G NSA · ${m.carrier} · PCI ${m.carrier.startsWith('LTE') ? '312' : after && m.scenario === 'handover' ? '803' : '801'}`}</span><span>温度采样 10 秒 · 无线/速率 3 秒（设计目标）</span></div>
}
export function VariantA({ model }: { model: Model }) {
  return <><div className="dp-section-heading"><h2>同一时刻，看见变化之间的关系</h2><span>移动指针联动全部曲线</span></div><Reading model={model} /><div className="dp-correlate"><div className="dp-stack">{(['down','up','sinr','rsrp','rsrq','temp','cpu'] as Metric[]).map(k => <Chart key={k} model={model} metric={k} />)}</div><aside><h3>变化时间线</h3><EventList model={model} /><div className="dp-note">先看速率下降时，无线质量、小区和温度是否同时变化。相关变化是线索，不是原因结论。</div></aside></div></>
}
export function VariantB({ model }: { model: Model }) {
  const active = events(model.eventAt, model.scenario).reduce((a, b) => Math.abs(b.time - (model.cursor ?? model.eventAt)) < Math.abs(a.time - (model.cursor ?? model.eventAt)) ? b : a)
  return <div className="dp-investigation"><aside><div className="dp-section-heading"><h2>选择一个变化</h2></div><EventList model={model} /></aside><div className="dp-evidence"><div className="dp-case"><p>事件回看 / {clock(active.time)}</p><h2>{active.title}</h2><p>{active.detail}</p><span>待核实线索 · 模拟案例</span></div><Reading model={model} /><Chart model={model} metric="down" /><div className="dp-two"><Chart model={model} metric="sinr" /><Chart model={model} metric="temp" /></div><details><summary>展开 RSRP、RSRQ、CPU 对照</summary><Chart model={model} metric="rsrp" /><Chart model={model} metric="rsrq" /><Chart model={model} metric="cpu" /></details><div className="dp-note">下一步核对：{model.scenario === 'heat' ? '同负载下改善散热后是否仍掉速；当前没有频率或降频标志，不能判定热降频。' : model.scenario === 'gap' ? '先恢复采集，再核对设备和链路是否断开；缺失样本不能等同于断网。' : '是否反复在同一对小区间切换；同时检查 Wi-Fi 链路和实际业务负载。'}</div></div></div>
}
export function VariantC({ model }: { model: Model }) {
  return <><div className="dp-live-head"><div><p>{model.cursor == null ? '实时概况' : '历史时刻'} / 模拟设备</p><h2>{model.selected.down == null ? '读数缺失' : '5G NSA 在线'}</h2><span>状态示例，不代表真实连通性</span></div><div><p>当前下行速率</p><strong>{model.selected.down?.toFixed(0) ?? '—'} <small>Mbps</small></strong></div><div><p>最近变化</p><b>{events(model.eventAt, model.scenario).at(-1)!.title}</b><span>{clock(events(model.eventAt, model.scenario).at(-1)!.time)}</span></div></div><Reading model={model} /><div className="dp-wall">{(['down','up','sinr','rsrp','rsrq','temp','cpu'] as Metric[]).map(k => <Chart key={k} model={model} metric={k} compact />)}<div className="dp-unavailable"><span>待补充的数据</span><h3>延迟 / 丢包 / 抖动</h3><p>当前接口没有主动探测数据。本原型不伪造探测读数。</p></div></div><div className="dp-ribbon"><h3>变化记录</h3><EventList model={model} /></div></>
}
export default function DiagnosticPrototype() {
  const [variant, setVariant] = useState<PrototypeVariant>(() => {
    const v = new URLSearchParams(location.search).get('variant'); return v === 'B' || v === 'C' ? v : 'A'
  })
  const [scenario, setScenario] = useState<Scenario>('handover')
  const [eventAt, setEventAt] = useState(() => Math.floor(Date.now() / 3000) * 3000 - 120000)
  const [rows, setRows] = useState(() => seed(eventAt, 'handover'))
  const [playing, setPlaying] = useState(true)
  const [minutes, setMinutes] = useState(15)
  const [carrier, setCarrier] = useState('NR · n78 · PCC')
  const [cursor, setCursor] = useState<number | null>(variant === 'B' ? eventAt : null)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setRows(prev => [...prev.slice(-1200), sample(prev.at(-1)!.time + 3000, eventAt, scenario)]), 3000)
    return () => clearInterval(id)
  }, [playing, eventAt, scenario])
  const changeVariant = useCallback((v: PrototypeVariant) => {
    setVariant(v)
    if (v === 'B' && cursor == null) setCursor(eventAt)
    const url = new URL(location.href); url.searchParams.set('variant', v); history.replaceState(null, '', url)
  }, [cursor, eventAt])
  const visible = rows.filter(r => r.time >= rows.at(-1)!.time - minutes * 60000)
  const selected = cursor == null ? rows.at(-1)! : rows.reduce((a,b) => Math.abs(b.time-cursor)<Math.abs(a.time-cursor)?b:a)
  const model: Model = { rows: visible, selected, cursor, choose: setCursor, carrier, eventAt, scenario }
  function switchScenario(s: Scenario) {
    const at = Math.floor(Date.now() / 3000) * 3000 - 120000
    setScenario(s); setEventAt(at); setRows(seed(at, s)); setCursor(variant === 'B' ? at : null)
  }
  function download() {
    const keys = Object.keys(metrics) as Metric[]
    const csv = ['time,carrier,'+keys.join(','), ...visible.map(r=>[new Date(r.time).toISOString(),carrier,...keys.map(k=>value(r,k,carrier) ?? '')].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}))
    const a = document.createElement('a'); a.href=url; a.download='PROTOTYPE-simulated-diagnostics.csv'; a.click(); URL.revokeObjectURL(url)
  }
  return <div className="diagnostic-prototype">
    <div className="dp-prototype-note">可丢弃设计原型 · 全部为模拟数据 · 不控制设备 · 比较三种信息组织方式，尚未选定方案</div>
    <header className="dp-title"><div><p>信号 / 实时诊断</p><h1>实时诊断</h1><span>速率、无线质量、设备状态与变化事件，一起回看。</span></div><span className="dp-live"><i className={playing ? 'running' : ''} />{playing ? '模拟刷新中 · 3 秒' : '模拟采集已暂停'}</span></header>
    <div className="dp-toolbar">
      <label>观察窗口<Select value={minutes} onChange={e=>{setMinutes(Number(e.target.value));setCursor(null)}}>{[5,15,30,60].map(n=><option key={n} value={n}>{n} 分钟</option>)}</Select></label>
      <label>无线载波<Select value={carrier} onChange={e=>setCarrier(e.target.value)}><option>NR · n78 · PCC</option><option>LTE · B8 · PCC</option></Select></label>
      <label>模拟场景<Select value={scenario} onChange={e=>switchScenario(e.target.value as Scenario)}>{Object.entries(scenarios).map(([key,name])=><option key={key} value={key}>{name}</option>)}</Select></label>
      <div className="dp-actions"><Button variant="outline" onClick={()=>setPlaying(p=>!p)}>{playing?'暂停采集':'继续采集'}</Button><Button variant="ghost" onClick={()=>setCursor(null)}>回到最新</Button><Button variant="ghost" onClick={download}>导出模拟 CSV</Button></div>
    </div>
    {variant === 'A' ? <VariantA model={model}/> : variant === 'B' ? <VariantB model={model}/> : <VariantC model={model}/>}
    <details className="dp-state" open><summary>当前原型状态 · 所有方案共享同一份数据</summary><p>方案 {variant} / 场景 {scenarios[scenario]} / {playing?'采集中':'已暂停'} / 窗口 {minutes} 分钟 / {carrier} / 样本 {visible.length} / 光标 {cursor == null ? '跟随最新' : clock(selected.time)} / 最近样本 {clock(rows.at(-1)!.time)} / 存储：仅内存</p><p>点击事件或移动图表指针回看；回到最新恢复最新读数。温度刷新频率只是设计标注，本原型统一用 3 秒模拟采样。没有真实诊断结论。</p></details>
    <PrototypeSwitcher variant={variant} onChange={changeVariant}/>
  </div>
}
