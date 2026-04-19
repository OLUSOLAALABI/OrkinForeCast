'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Top-of-page progress bar that animates during Next.js route transitions.
 * Mimics the GitHub / YouTube loading indicator.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevKeyRef = useRef(`${pathname}?${searchParams}`)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // When the route key changes, the navigation is complete → finish the bar
  useEffect(() => {
    const key = `${pathname}?${searchParams}`
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key
      // Navigation completed — snap to 100% then fade out
      cleanup()
      setProgress(100)
      const hide = setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 300)
      return () => clearTimeout(hide)
    }
  }, [pathname, searchParams, cleanup])

  // Intercept <a> clicks to start progress before navigation begins
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('#') || anchor.target === '_blank') return

      // Internal navigation detected — start progress bar
      cleanup()
      setVisible(true)
      setProgress(15)

      // Gradually increment (fast at first, slowing down — never reaches 100)
      let current = 15
      timerRef.current = setInterval(() => {
        current += (90 - current) * 0.08
        if (current > 90) current = 90
        setProgress(Math.round(current))
      }, 200)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      cleanup()
    }
  }, [cleanup])

  if (!visible && progress === 0) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px]"
      style={{ opacity: visible || progress === 100 ? 1 : 0, transition: 'opacity 300ms ease-out' }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: progress === 100 ? 'width 200ms ease-out' : 'width 400ms ease-out',
        }}
      />
    </div>
  )
}
