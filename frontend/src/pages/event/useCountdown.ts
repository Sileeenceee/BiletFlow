import { useEffect, useState } from 'react'

/** Remaining time until `until`, ticking every second; null when there is no deadline. */
export function useCountdown(until?: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [until])
  if (!until) return null
  const ms = Math.max(0, new Date(until).getTime() - now)
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return { expired: ms === 0, label: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` }
}
