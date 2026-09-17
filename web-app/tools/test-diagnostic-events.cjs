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
