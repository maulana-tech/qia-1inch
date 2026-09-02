import { useTheme } from '../hooks/useTheme'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className={
        'inline-flex h-8 w-8 items-center justify-center rounded-none text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-spectral/60 dark:hover:bg-ink-800 dark:hover:text-spectral transition focus:outline-none focus-visible:ring-2 focus-visible:ring-spectral/40 ' +
        (className ?? '')
      }
    >
      {isDark ? (
        // moon — currently dark, tap for light
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" strokeLinejoin="round" />
        </svg>
      ) : (
        // sun — currently light, tap for dark
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  )
}

export default ThemeToggle
