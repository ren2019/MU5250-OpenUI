import { useEffect, useState, useSyncExternalStore } from 'react'
import type { useHome } from '../../../app/HomeContext'
import type { DiagnosticSession } from './model'
import { EventHistory } from './events'

export function useDiagnosticEvents(session: DiagnosticSession, home: ReturnType<typeof useHome>, now: number) {
  const [startedAt] = useState(Date.now)
  const [history] = useState(() => new EventHistory())
  const events = useSyncExternalStore(history.subscribe, history.getSnapshot)
  useEffect(() => {
    let paused = session.getSnapshot().paused
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot().paused
      if (next !== paused) { history.interrupt(); paused = next }
    })
    document.addEventListener('visibilitychange', history.interrupt)
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', history.interrupt) }
  }, [session, history])
  useEffect(() => {
    if (session.getSnapshot().paused || document.hidden || (!home.error && (!home.data || home.receivedAt == null || home.receivedAt < startedAt))) return
    history.ingest(home.data, home.error ? Date.now() : home.receivedAt!, Boolean(home.error))
  }, [history, session, home.data, home.error, home.receivedAt, startedAt])
  useEffect(() => { history.prune(now) }, [history, now])
  return events
}
