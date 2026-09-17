import { useEffect, useState, useSyncExternalStore } from 'react'
import { useHome } from '../../../app/HomeContext'
import { DiagnosticSession, metricSample } from './model'

export function useDiagnosticSession() {
  const home = useHome()
  const [startedAt] = useState(Date.now)
  const [session] = useState(() => new DiagnosticSession(startedAt))
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => {
    if (document.hidden || (!home.error && (!home.data || home.receivedAt == null || home.receivedAt < startedAt))) return
    const now = home.error ? Date.now() : home.receivedAt!
    const speed = home.data?.speed
    const freshness = home.data?.sources?.speed
    const observations = {
      down: metricSample(speed?.rx_bps == null || speed.rx_available === false ? null : speed.rx_bps * 8 / 1_000_000, 'speed', now, freshness),
      up: metricSample(speed?.tx_bps == null || speed.tx_available === false ? null : speed.tx_bps * 8 / 1_000_000, 'speed', now, freshness),
    }
    if (home.error) for (const row of Object.values(observations)) { row.quality = 'missing'; row.time = now }
    session.append(observations, now)
  }, [home.data, home.error, home.receivedAt, session, startedAt])
  useEffect(() => {
    const onVisibility = () => session.interrupt()
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(() => { if (!document.hidden) session.tick(Date.now()) }, 1000)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
  }, [session])
  return { ...snapshot, session, home }
}
