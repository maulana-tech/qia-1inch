import { useIsDark } from '../hooks/useTheme'

/** A clean, subtle grid backdrop for the app. */
function ChartGrid({ dark }: { dark: boolean }) {
  const v = dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'
  const h = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
  const fade = 'radial-gradient(130% 100% at 50% 32%, #000 50%, transparent 100%)'
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `
          linear-gradient(to right, ${v} 1px, transparent 1px),
          linear-gradient(to bottom, ${h} 1px, transparent 1px)
        `,
        backgroundSize: '96px 64px',
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    />
  )
}

/**
 * Clean, solid brand backdrop for the app surfaces.
 * Replaces the noisy/smoky fluid simulation with a crisp, minimal solid background + grid.
 */
export function BrandCanvas() {
  const dark = useIsDark()
  const bg = dark ? '#0a0a0c' : '#f8f8fa'
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-300" style={{ background: bg }}>
      <ChartGrid dark={dark} />
    </div>
  )
}

export default BrandCanvas
