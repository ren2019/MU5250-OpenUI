const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(name) {
  const context = { exports: {}, require: name => load(name.slice(2)) }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/features/signal/diagnostics', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}
const { diagnosticCsv } = load('exportCsv')
const { radioKey } = load('radio')
// Parse RFC4180 quoting, including embedded delimiters and newlines, like a downstream consumer.
function parse(csv) {
  const rows = []; let row = [], value = '', quoted = false
  const text = csv.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (c === ',' || c === '\r')) {
      row.push(value); value = ''
      if (c === '\r') { rows.push(row); row = []; i++ }
    } else value += c
  }
  const [header, ...records] = rows
  return records.map(values => { assert.equal(values.length, header.length); return Object.fromEntries(header.map((key, i) => [key, values[i]])) })
}
const sample = (time, value, quality = 'valid') => ({ time, receivedAt: time + 100, sampledAt: time - 999999, source: 'speed', value, quality, ttl: 1000, segment: 0 })
const carrier = { id: '["NR","PCC","n78",100,2,null]', technology: 'NR', role: 'PCC', band: 'n78', channel: 100, pci: 2, present: true, lastSeen: 12000 }
test('export is a frozen window with seven metrics, selected radio identity, events, exact source and aligned times', () => {
  const series = { down: [sample(9999, 1), sample(10000, 8), sample(12001, 2)], up: [sample(10000, 0)], cpu: [sample(10000, 20)], temperature: [sample(10000, 60)], secret: [sample(10000, 'password')] }
  for (const metric of ['sinr', 'rsrp', 'rsrq']) series[radioKey(carrier.id, metric)] = [sample(10000, -5)]
  series[radioKey('unselected', 'sinr')] = [sample(10000, 999)]
  const snapshot = { series, carrier, start: 10000, end: 12000, simulated: true, token: 'secret-token', events: [{ time: 11000, source: 'signal', kind: 'change', title: '小区变化', detail: 'a,"b"\nc' }, { time: 12001, title: 'outside' }] }
  const csv = diagnosticCsv(snapshot)
  series.down.push(sample(11000, 555))
  const rows = parse(csv)
  assert.equal(rows.length, 8)
  assert.ok(rows.every(row => row.mode === 'SIMULATED'))
  const down = rows.find(row => row.metric === 'down')
  assert.equal(down.value, '8'); assert.equal(down.unit, 'Mbps')
  assert.equal(down.timeline_time_utc, new Date(10000).toISOString())
  assert.equal(down.source_sampled_at_utc, new Date(-989999).toISOString())
  assert.equal(down.received_at_utc, new Date(10100).toISOString())
  assert.equal(rows.find(row => row.metric === 'up').value, '0')
  assert.equal(rows.find(row => row.metric === 'temperature').unit, '°C')
  assert.equal(rows.find(row => row.metric === 'cpu').unit, '%')
  assert.equal(rows.find(row => row.metric === 'sinr').carrier_id, carrier.id)
  assert.equal(rows.find(row => row.record_type === 'event').event_detail, 'a,"b"\nc')
  assert.ok(!csv.includes('secret-token') && !csv.includes('password') && !csv.includes('unselected'))
})
test('missing/stale/unsupported values stay blank, missing source time stays blank and device text is inert', () => {
  const rows = parse(diagnosticCsv({ series: { down: ['missing', 'stale', 'unsupported'].map((q, i) => ({ ...sample(10000 + i, 100, q), sampledAt: null, source: '=unsafe' })) }, events: [], start: 10000, end: 12000, simulated: false }))
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.equal(row.value, ''); assert.equal(row.source_sampled_at_utc, ''); assert.equal(row.mode, 'DEVICE'); assert.equal(row.source, "'=unsafe")
  }
  assert.deepEqual(rows.map(row => row.quality_at_observation), ['missing', 'stale', 'unsupported'])
})
