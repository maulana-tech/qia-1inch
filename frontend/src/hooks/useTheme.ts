import { useEffect, useState } from 'react'

const KEY = 'lax-stell.theme'
export type Theme = 'light' | 'dark'

/** The theme the pre-paint script (index.html) already resolved onto <html>. */
function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Light/dark theme, persisted to localStorage and mirrored on <html class="dark">.
 * Initial value comes from the class the head script set, so this never fights it.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* storage may be unavailable (private mode) — the class is still set */
    }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggle, setTheme }
}

/**
 * Reactively track whether the app is in dark mode by observing <html class>.
 * Unlike useTheme (which owns local state), this reflects the live class no
 * matter who flips it — so ambient visuals re-render the moment the user toggles.
 */
export function useIsDark(): boolean {
  const read = () => (typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true)
  const [dark, setDark] = useState<boolean>(read)
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    setDark(el.classList.contains('dark'))
    return () => obs.disconnect()
  }, [])
  return dark
}
