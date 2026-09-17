import { chartSegments, clock, qualityLabels, readingAt, type MetricDefinition, type MetricSample } from './model'

export default function DiagnosticChart({ metric, samples, start, end, cursor, onCursor }: {
  metric: MetricDefinition; samples: MetricSample[]; start: number; end: number
  cursor: number | null; onCursor: (time: number) => void
}) {
  const selected = readingAt(samples, cursor ?? end)
  const visible = samples.filter(row => row.time >= start && row.time <= end)
  const values = visible.filter(row => row.quality === 'valid' && row.value != null).map(row => row.value!)
  const min = Math.min(0, ...values), max = Math.max(1, ...values)
  const x = (time: number) => 48 + (time - start) / Math.max(1, end - start) * 532
  const y = (value: number) => 100 - (value - min) / (max - min) * 86
  const segments = chartSegments(visible)
  const valid = selected?.quality === 'valid'
  return <section className="diagnostic-chart" aria-label={metric.name}>
    <header><span>{metric.name}</span><strong>{valid ? selected.value?.toFixed(1) : '无有效读数'} <small>{metric.unit}</small></strong></header>
    <p className="diagnostic-quality">{selected ? <>{qualityLabels[selected.quality]} · {selected.sampledAt == null ? '接收时间' : '源采样时间'} {clock(selected.sampledAt ?? selected.receivedAt)}{!valid && selected.value != null && ` · 上次读数 ${selected.value.toFixed(1)} ${metric.unit}`}</> : '尚无读数'}</p>
    <svg viewBox="0 0 600 122" role="img" aria-label={`${metric.name}趋势，空白代表无有效采样`} onPointerMove={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const fraction = Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * 600 - 48) / 532))
      onCursor(start + fraction * (end - start))
    }} onPointerDown={event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onCursor(start + Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * 600 - 48) / 532)) * (end - start))
    }}>
      {[0, .5, 1].map(p => <g key={p}><line x1="48" x2="580" y1={14 + 86 * p} y2={14 + 86 * p} className="diagnostic-grid" /><text x="40" y={18 + 86 * p} textAnchor="end">{(max - (max - min) * p).toFixed(1)}</text></g>)}
      {segments.map(rows => <g key={`${rows[0].time}-${rows[0].segment}`}><polyline points={rows.map(row => `${x(row.time)},${y(row.value!)}`).join(' ')} fill="none" stroke={metric.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />{rows.length === 1 && <circle cx={x(rows[0].time)} cy={y(rows[0].value!)} r="2.5" fill={metric.color} />}</g>)}
      {cursor != null && cursor >= start && cursor <= end && <line x1={x(cursor)} x2={x(cursor)} y1="12" y2="100" className="diagnostic-cursor" />}
    </svg>
    <div className="diagnostic-times"><time>{clock(start)}</time><time>{clock(end)}</time></div>
  </section>
}
