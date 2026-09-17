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
