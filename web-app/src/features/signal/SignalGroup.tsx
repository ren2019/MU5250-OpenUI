import { useState } from 'react'
import { Tabs } from '../../ui/Tabs'
import Overview from './Overview'
import Locking from './Locking'
import DiagnosticsPage from './diagnostics/DiagnosticsPage'

type Tab = 'overview' | 'locking' | 'diagnostics'

export default function SignalGroup() {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">信号</h1>
        <p className="mt-0.5 text-[13px] text-ink2">实时无线指标、频段与小区锁定</p>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: '概览' },
          { id: 'locking', label: '模式与锁定' },
          { id: 'diagnostics', label: '实时诊断' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <p className="text-[11px] leading-relaxed text-ink3">
        PCI：物理小区标识 · ARFCN / EARFCN：射频信道号 · PCC / SCC：主 / 辅载波 · UL：上行。
        RSRP：参考信号接收功率 · RSRQ：参考信号接收质量 · SINR：信干噪比 · RSSI：接收信号强度。
      </p>

      {tab === 'overview' && <Overview />}
      {tab === 'locking' && <Locking />}
      {tab === 'diagnostics' && <DiagnosticsPage />}
    </div>
  )
}
