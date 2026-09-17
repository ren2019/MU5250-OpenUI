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
const { EventHistory } = load('events')
function data(token, pci = 1, stale = false) {
  const meta = { sampled_at_ms: token, age_ms: 0, ttl_ms: 1000, stale, error: null }
  return { signal: { type: '5G', nr_carriers: [{ label: 'PCC', band: 'n78', pci, earfcn: 100 }], lte_carriers: [] }, wan: { connected: true }, speed: {}, cpu: {}, sources: Object.fromEntries(['signal', 'wan', 'speed', 'cpu'].map(key => [key, meta])) }
}
test('first observation and cache repeats emit no events; fresh consecutive observations emit real differences despite 1s cache TTL', () => {
  const h = new EventHistory()
  h.ingest(data(1), 10000, false)
  h.ingest(data(1, 2), 11000, false)
  assert.equal(h.getSnapshot().length, 0)
  h.ingest(data(2, 2), 13000, false)
  assert.equal(h.getSnapshot().length, 2)
  assert.equal(h.getSnapshot()[0].title, '服务小区变化')
  assert.equal(h.getSnapshot()[0].time, 13000)
})
test('failures and new-source recovery do not invent changes across gaps; duplicate cached recovery waits', () => {
  const h = new EventHistory()
  h.ingest(data(1), 10000, false)
  h.ingest(data(1, 2, true), 13000, false)
  h.ingest(data(1, 2, true), 14000, false)
  assert.equal(h.getSnapshot().length, 4)
  h.ingest(data(1, 2), 15000, false)
  assert.equal(h.getSnapshot().length, 4)
  h.ingest(data(2, 2), 16000, false)
  assert.equal(h.getSnapshot().length, 8)
  assert.equal(h.getSnapshot().filter(event => event.kind === 'change').length, 0)
})
test('interruptions rebuild baseline; retention prunes events; unknown connection cannot be interpreted as disconnected', () => {
  const h = new EventHistory()
  h.ingest(data(1), 10000, false)
  h.interrupt()
  h.ingest(data(2, 2), 13000, false)
  assert.equal(h.getSnapshot().length, 0)
  const unknown = data(3, 2); unknown.wan = {}
  h.ingest(unknown, 16000, false)
  const disconnected = data(4, 2); disconnected.wan.connected = false
  h.ingest(disconnected, 19000, false)
  assert.equal(h.getSnapshot().length, 0)
  h.ingest(data(5, 2), 22000, false)
  assert.equal(h.getSnapshot().at(-1).title, '连接状态变化')
  h.prune(3600000 + 22001)
  assert.equal(h.getSnapshot().length, 0)
})
test('healthy WAN cache receipts preserve changes across a 30-second source refresh without bridging gaps', () => {
  const h = new EventHistory()
  const cached = data(1)
  cached.sources.wan = { ...cached.sources.wan, ttl_ms: 30000 }
  h.ingest(cached, 10000, false)
  for (let i = 1; i < 10; i++) h.ingest(cached, 10000 + i * 3001, false)
  const changed = data(2)
  changed.sources.wan = { ...changed.sources.wan, ttl_ms: 30000 }
  changed.wan.connected = false
  h.ingest(changed, 40010, false)
  assert.equal(h.getSnapshot().filter(e => e.title === '连接状态变化').length, 1)
  h.ingest(changed, 100000, false)
  const next = data(3); next.sources.wan = { ...next.sources.wan, ttl_ms: 30000 }
  h.ingest(next, 103000, false)
  assert.equal(h.getSnapshot().filter(e => e.title === '连接状态变化').length, 1)
})
function thermal(token, extra = {}) {
  return { modem: 65, modem_supported: true, source: { sampled_at_ms: token, age_ms: 0, ttl_ms: 10000, stale: false, error: null }, ...extra }
}
test('thermal failure/recovery are deduplicated and exported through the shared event history', () => {
  const h = new EventHistory()
  h.ingestThermal(thermal(1), 10000, null)
  h.ingestThermal(thermal(1), 20000, 'HTTP 503')
  h.ingestThermal(thermal(1), 21000, 'HTTP 503')
  assert.equal(h.getSnapshot().length, 1)
  h.ingestThermal(thermal(1), 22000, null)
  assert.equal(h.getSnapshot().length, 1)
  h.ingestThermal(thermal(2), 30000, null)
  assert.equal(h.getSnapshot().length, 2)
  assert.equal(h.getSnapshot()[1].kind, 'recovery')
  const { diagnosticCsv } = load('exportCsv')
  const csv = diagnosticCsv({ series: {}, events: h.getSnapshot(), start: 0, end: 40000, simulated: true })
  assert.match(csv, /基带温度采集不可用/)
  assert.match(csv, /基带温度采集恢复/)
})
test('unsupported thermal baseline, failed initial reads and pause do not produce bogus transitions', () => {
  const h = new EventHistory()
  h.ingestThermal(thermal(1, { modem: undefined, modem_supported: false }), 10000, null)
  h.ingestThermal(null, 20000, 'HTTP 503')
  h.ingestThermal(thermal(2), 30000, null)
  assert.equal(h.getSnapshot().length, 0)
  h.interrupt()
  h.ingestThermal(thermal(2), 40000, 'HTTP 503')
  h.ingestThermal(thermal(3), 50000, null)
  assert.equal(h.getSnapshot().length, 0)
  h.ingestThermal(thermal(4, { source: { sampled_at_ms: 4, age_ms: 12000, ttl_ms: 10000, stale: true, error: 'refresh failed' } }), 60000, null)
  assert.equal(h.getSnapshot().length, 1)
  h.ingestThermal(thermal(5, { modem: undefined, modem_supported: false }), 70000, null)
  h.ingestThermal(thermal(6), 80000, null)
  assert.equal(h.getSnapshot().length, 1)
})
