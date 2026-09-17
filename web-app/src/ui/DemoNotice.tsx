export function DemoNotice() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  if (!local || new URLSearchParams(window.location.search).get('demo') !== '1') return null
  return (
    <p role="status" className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] text-warn">
      本地演示 · 使用模拟数据，非真实设备读数。此预览连接本机模拟服务。
    </p>
  )
}
