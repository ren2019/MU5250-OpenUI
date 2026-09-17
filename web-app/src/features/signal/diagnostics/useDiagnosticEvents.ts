import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { useHome } from '../../../app/HomeContext'
import type { DiagnosticSession } from './model'
import type { useDiagnosticSession } from './useDiagnosticSession'
import { EventHistory } from './events'

export function useDiagnosticEvents(session: DiagnosticSession, home: ReturnType<typeof useHome>, thermal: ReturnType<typeof useDiagnosticSession>['thermal'], now: number) {
  const [startedAt] = useState(Date.now)
  const acceptingSince = useRef(startedAt)
  const [history] = useState(() => new EventHistory())
  const events = useSyncExternalStore(history.subscribe, history.getSnapshot)
  useEffect(() => {
    let paused = session.getSnapshot().paused
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot().paused
      if (next !== paused) { history.interrupt(); acceptingSince.current = Date.now(); paused = next }
    })
    const interrupt = () => { history.interrupt(); acceptingSince.current = Date.now() }
    document.addEventListener('visibilitychange', interrupt)
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', interrupt) }
  }, [session, history])
  useEffect(() => {
    if (session.getSnapshot().paused || document.hidden || (!home.error && (!home.data || home.receivedAt == null || home.receivedAt < acceptingSince.current))) return
    history.ingest(home.data, home.error ? Date.now() : home.receivedAt!, Boolean(home.error))
  }, [history, session, home.data, home.error, home.receivedAt, startedAt])
  useEffect(() => {
    if (session.getSnapshot().paused || document.hidden || (!thermal.error && (thermal.receivedAt == null || thermal.receivedAt < acceptingSince.current))) return
    history.ingestThermal(thermal.data, thermal.error ? Date.now() : thermal.receivedAt!, thermal.error)
  }, [history, session, thermal.data, thermal.error, thermal.receivedAt])
  useEffect(() => { history.prune(now) }, [history, now])
  return events
}
