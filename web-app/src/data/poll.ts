import { useCallback, useEffect, useRef, useState } from 'react'
import { PollScheduler } from './pollScheduler'

const cache = new Map<string, unknown>()
const receivedTimes = new Map<string, number>()

export interface PollResult<T> {
  data: T | null
  receivedAt: number | null
  error: string | null
  refreshing: boolean
  refresh: () => void
  mutate: (value: T) => void
}

export function usePoll<T>(
  key: string,
  fn: () => Promise<T>,
  intervalMs: number,
  enabled = true,
): PollResult<T> {
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T | undefined) ?? null)
  const [receivedAt, setReceivedAt] = useState<number | null>(() => receivedTimes.get(key) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  const intervalRef = useRef(intervalMs)
  const scheduler = useRef<PollScheduler<T> | null>(null)

  useEffect(() => {
    fnRef.current = fn
    intervalRef.current = intervalMs
  })

  useEffect(() => {
    if (!enabled) return
    const poll = new PollScheduler<T>({
      read: () => fnRef.current(),
      publish: (value) => {
        const now = Date.now()
        cache.set(key, value)
        receivedTimes.set(key, now)
        setReceivedAt(now)
        setData(value)
        setError(null)
      },
      error: setError,
      refreshing: setRefreshing,
      interval: () => intervalRef.current,
      visible: () => !document.hidden,
    })
    scheduler.current = poll
    const onVisibility = () => poll.wake()
    document.addEventListener('visibilitychange', onVisibility)
    poll.start()
    return () => {
      poll.stop()
      scheduler.current = null
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key, enabled])

  const refresh = useCallback(() => scheduler.current?.refresh(), [])
  const mutate = useCallback((value: T) => scheduler.current?.mutate(value), [])
  return { data, receivedAt, error, refreshing, refresh, mutate }
}
