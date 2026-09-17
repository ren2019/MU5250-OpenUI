// THROWAWAY launcher: local mock + Vite. Never starts or changes a device service.
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
let mock
let vite
async function isMock() {
  const response = await fetch('http://127.0.0.1:9090/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'demo' }), signal: AbortSignal.timeout(1000),
  })
  return (await response.json()).data?.token === 'demo-token'
}
let existing = false
try { existing = await isMock(); if (!existing) throw new Error('not mock') }
catch (error) {
  if (error.message === 'not mock') throw new Error('9090 端口不是本项目模拟服务，请先释放该端口。')
  mock = spawn('python3', ['-u', '-c', 'from tools.mock_agent import Handler, ThreadingHTTPServer; ThreadingHTTPServer(("127.0.0.1", 9090), Handler).serve_forever()'], { stdio: 'inherit' })
  for (let i = 0; i < 20; i++) {
    await delay(200)
    try { if (await isMock()) { existing = true; break } } catch { /* waiting for local mock */ }
  }
}
function stop() { vite?.kill(); mock?.kill() }
process.on('SIGINT', () => { stop(); process.exit(0) })
process.on('SIGTERM', () => { stop(); process.exit(0) })
process.on('exit', stop)
if (!existing) throw new Error('本机模拟服务未能启动。')
console.log('\n诊断设计原型：http://127.0.0.1:8089/?demo=1&prototype=diagnostics&variant=A\n登录演示密码：demo；退出仅停止本命令启动的进程。\n')
vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '8089', '--strictPort'], { stdio: 'inherit' })
vite.on('exit', code => { mock?.kill(); process.exit(code ?? 0) })
