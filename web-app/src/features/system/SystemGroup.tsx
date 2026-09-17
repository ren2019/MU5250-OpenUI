import { useState } from 'react'
import { Tabs } from '../../ui/Tabs'
import MetricsTab from './MetricsTab'
import ToolsTab from './ToolsTab'
import SettingsTab from './SettingsTab'

type Tab = 'metrics' | 'tools' | 'settings'

export default function SystemGroup({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('metrics')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">系统</h1>
        <p className="mt-0.5 text-[13px] text-ink2">健康指标、诊断工具与设备控制</p>
      </div>

      <Tabs
        tabs={[
          { id: 'metrics', label: '运行状态' },
          { id: 'tools', label: '工具' },
          { id: 'settings', label: '设置' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'metrics' && <MetricsTab />}
      {tab === 'tools' && <ToolsTab />}
      {tab === 'settings' && <SettingsTab onLogout={onLogout} />}
    </div>
  )
}
