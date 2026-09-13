import { useIsDark } from '../hooks/useTheme'
import darkLogo from '../assets/dark-logo.png'
import lightLogo from '../assets/light-logo.png'

/**
 * Zknull logo — dark/light theme aware PNG.
 */
export function LogoMark({ className = '' }: { className?: string }) {
  const dark = useIsDark()
  return (
    <img
      src={dark ? darkLogo : lightLogo}
      alt="Zknull"
      className={className}
    />
  )
}

/** Full logo with text. */
export function Logo({ className = '', height = 40 }: { className?: string; height?: number }) {
  const dark = useIsDark()
  return (
    <img
      src={dark ? darkLogo : lightLogo}
      alt="Zknull"
      className={className}
      style={{ height, width: 'auto' }}
    />
  )
}

export default Logo
