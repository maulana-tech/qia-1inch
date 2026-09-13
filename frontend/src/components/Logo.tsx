import { useIsDark } from '../hooks/useTheme'
import darkLogo from '../assets/dark-logo.png'
import lightLogo from '../assets/light-logo.png'

/**
 * Zknull logo — mark + wordmark.
 *
 * Mark: original droplet SVG (inherits currentColor).
 * Wordmark: "zknull" text PNG, dark/light aware.
 */
export function LogoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M9 3.5c2.8 3 4.2 5.3 4.2 7.2A4.2 4.2 0 0 1 9 14.9 4.2 4.2 0 0 1 4.8 10.7C4.8 8.8 6.2 6.5 9 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M15 9.1c2.8 3 4.2 5.3 4.2 7.2A4.2 4.2 0 0 1 15 20.5a4.2 4.2 0 0 1-4.2-4.2c0-1.9 1.4-4.2 4.2-7.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  )
}

/** Mark + wordmark. */
export function Logo({ className = '', markClassName = 'h-6 w-6' }: { className?: string; markClassName?: string }) {
  const dark = useIsDark()
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <img
        src={dark ? darkLogo : lightLogo}
        alt="zknull"
        style={{ height: '1.1em', width: 'auto' }}
      />
    </span>
  )
}

export default Logo
