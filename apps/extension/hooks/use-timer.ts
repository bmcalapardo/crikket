import { useEffect, useState } from "react"

/**
 * Mirrors a duration source into React state. While `isRunning` it refreshes
 * every 100ms; otherwise it takes a single reading so a paused or stopped
 * recording shows its frozen value.
 */
export function useTimer(readDurationMs: () => number, isRunning: boolean) {
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setDuration(readDurationMs())
    if (!isRunning) {
      return
    }
    const interval = setInterval(() => {
      setDuration(readDurationMs())
    }, 100)
    return () => clearInterval(interval)
  }, [isRunning, readDurationMs])

  return duration
}
