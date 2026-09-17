const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(relative, requireModule = () => ({})) {
  const context = { exports: {}, require: requireModule }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  return context.exports
}
const { DiagnosticSession, metricSample, readingAt, RETENTION_MS } = load('../src/features/signal/diagnostics/model.ts')

test('diagnostic history preserves zero, source timestamps, cache gaps and expiry without new responses', () => {
  const session = new DiagnosticSession(10000)
  const fresh = { sampled_at_ms: 5000, age_ms: 0, ttl_ms: 3000, stale: false, error: null }
  session.append({ down: metricSample(0, 'speed', 10000, fresh) }, 10000)
  assert.equal(readingAt(session.getSnapshot().series.down, 10000).value, 0)
  assert.equal(session.getSnapshot().series.down[0].sampledAt, 5000)
  session.append({ down: metricSample(0, 'speed', 11000, { ...fresh, age_ms: 1000 }) }, 11000)
  assert.equal(session.getSnapshot().series.down.length, 1)
  session.tick(14000)
  assert.equal(readingAt(session.getSnapshot().series.down, 14000).quality, 'stale')
  session.append({ down: metricSample(null, 'speed', 14500) }, 14500)
  assert.equal(readingAt(session.getSnapshot().series.down, 14500).quality, 'missing')
  assert.equal(readingAt(session.getSnapshot().series.down, 9999), undefined)
})

test('pause freezes history and timeline, resume never fabricates old samples, retention is bounded by real time', () => {
  const session = new DiagnosticSession(0)
  session.append({ down: metricSample(8, 'speed', 1000) }, 1000)
  session.setPaused(true)
  session.append({ down: metricSample(9, 'speed', 4000) }, 4000)
  session.tick(6000)
  assert.equal(session.getSnapshot().now, 1000)
  assert.equal(session.getSnapshot().series.down.length, 1)
  session.setPaused(false)
  session.append({ down: metricSample(10, 'speed', 10000) }, 10000)
  const rows = session.getSnapshot().series.down
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].segment, rows[1].segment)
  session.tick(RETENTION_MS + 10001)
  assert.equal(session.getSnapshot().series.down.length, 0)
})

test('source failure does not erase other series and duplicate cached recovery cannot become a new sample', () => {
  const session = new DiagnosticSession(10000)
  const f = { sampled_at_ms: 10000, age_ms: 0, ttl_ms: 6000, stale: false, error: null }
  session.append({ down: metricSample(8, 'speed', 10000, f), up: metricSample(0, 'speed', 10000, f) }, 10000)
  session.append({ down: metricSample(8, 'speed', 13000, { ...f, stale: true, error: 'failed' }) }, 13000)
  session.append({ down: metricSample(8, 'speed', 14000, f) }, 14000)
  assert.equal(session.getSnapshot().series.down.length, 2)
  assert.equal(session.getSnapshot().series.up.length, 1)
  assert.equal(readingAt(session.getSnapshot().series.down, 14000).quality, 'stale')
  assert.equal(metricSample(null, 'speed', 14000, undefined, true).quality, 'unsupported')
})

test('dashboard API preserves missing speed fields while zero remains a real measurement', async () => {
  const requests = []
  const raw = [{ speed: { rx_speed: 1000000, tx_speed: 0 } }, { speed: { tx_speed: 0 } }]
  const { api } = load('../src/data/api.ts', () => ({ get: async url => { requests.push(url); return raw.shift() } }))
  const first = await api.home()
  assert.equal(first.speed.rx_bps * 8 / 1000000, 8)
  assert.equal(first.speed.tx_available, true)
  const missing = await api.home()
  assert.equal(missing.speed.rx_available, false)
  assert.equal(missing.speed.tx_available, true)
  assert.deepEqual(requests, ['/api/dashboard', '/api/dashboard'])
})

const model = load('../src/features/signal/diagnostics/model.ts')
const { RadioHistory, carrierIdentity, radioKey } = load('../src/features/signal/diagnostics/radio.ts', () => model)
const carrier = (pci, label = 'SCC0') => ({ label, band: 'n78', pci, earfcn: 627264, bandwidth: '100 MHz', sinr: 0, rsrp: -90 })
const signal = carriers => ({ lte_carriers: [], nr_carriers: carriers })
test('radio identity survives SCC reorder; disappeared selection keeps historical values with a gap on return', () => {
  const session = new DiagnosticSession(10000), radio = new RadioHistory()
  const a = carrier(100), b = carrier(200, 'SCC1')
  radio.ingest(session, signal([a, b]), undefined, 10000, false)
  const id = carrierIdentity('NR', a), key = radioKey(id, 'sinr')
  radio.select(id)
  radio.ingest(session, signal([{ ...b, label: 'SCC0' }, { ...a, label: 'SCC1' }]), undefined, 13000, false)
  assert.equal(radio.getSnapshot().carriers.length, 2)
  assert.equal(readingAt(session.getSnapshot().series[key], 13000).value, 0)
  radio.ingest(session, signal([b]), undefined, 16000, false)
  assert.equal(radio.getSnapshot().selected, id)
  assert.equal(radio.getSnapshot().carriers.find(row => row.id === id).present, false)
  assert.equal(readingAt(session.getSnapshot().series[key], 16000).quality, 'missing')
  radio.ingest(session, signal([b]), undefined, 19000, false)
  assert.equal(session.getSnapshot().series[key].length, 3)
  radio.ingest(session, signal([a, b]), undefined, 22000, false)
  assert.equal(model.chartSegments(session.getSnapshot().series[key]).length, 2)
  assert.equal(readingAt(session.getSnapshot().series[key], 9999), undefined)
  assert.equal(readingAt(session.getSnapshot().series[radioKey(id, 'rsrq')], 22000).quality, 'missing')
})
test('radio stale cache cannot mutate identity; pause freezes metadata; history expires without changing selection', () => {
  const session = new DiagnosticSession(10000), radio = new RadioHistory()
  const fresh = { sampled_at_ms: 10000, age_ms: 0, ttl_ms: 6000, stale: false }
  radio.ingest(session, signal([carrier(100)]), fresh, 10000, false)
  const selected = radio.getSnapshot().selected
  radio.ingest(session, signal([carrier(200)]), fresh, 13000, false)
  assert.equal(radio.getSnapshot().carriers.length, 1)
  radio.ingest(session, signal([carrier(200)]), { ...fresh, stale: true }, 16000, false)
  assert.equal(radio.getSnapshot().carriers.length, 1)
  session.setPaused(true)
  radio.ingest(session, signal([carrier(300)]), undefined, 19000, false)
  assert.equal(radio.getSnapshot().carriers.length, 1)
  radio.prune(RETENTION_MS + 10001)
  assert.equal(radio.getSnapshot().carriers.length, 0)
  assert.equal(radio.getSnapshot().selected, selected)
})
test('known radio identity remains available when only signal readings are missing', () => {
  const { mapSignal } = load('../src/data/api.ts')
  const result = mapSignal({ wan_active_band: 'B3', wan_active_channel: 1300, lte_pci: 0, cell_id: 123, nr5g_action_band: 'n78', nr5g_action_channel: 627264, nr5g_pci: 100, nr5g_cell_id: 456 })
  assert.equal(result.lte_carriers.length, 1)
  assert.equal(result.nr_carriers.length, 1)
  assert.equal(result.lte_carriers[0].rsrp, undefined)
  assert.notEqual(result.lte_cell_id, result.nr_cell_id)
})
