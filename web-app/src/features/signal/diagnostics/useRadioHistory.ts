import { useEffect, useState, useSyncExternalStore } from 'react'
import type { useHome } from '../../../app/HomeContext'
import type { DiagnosticSession } from './model'
import { RadioHistory } from './radio'

export function useRadioHistory(session: DiagnosticSession, home: ReturnType<typeof useHome>, now: number) {
  const [startedAt] = useState(Date.now)
  const [history] = useState(() => new RadioHistory())
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot)
  useEffect(() => {
    if (document.hidden || (!home.error && (!home.data || home.receivedAt == null || home.receivedAt < startedAt))) return
    history.ingest(session, home.data?.signal, home.data?.sources?.signal, home.error ? Date.now() : home.receivedAt!, Boolean(home.error))
  }, [history, session, home.data, home.receivedAt, home.error, startedAt])
  useEffect(() => { history.prune(now) }, [history, now])
  return { ...snapshot, select: history.select }
}
