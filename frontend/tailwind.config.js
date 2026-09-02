/** @type {import('tailwindcss').Config} */

// "Mist" palette — black-and-white theme, light + dark.
// A single neutral ramp (R = G = B throughout): broken white surfaces against
// near-black ink, with no gold, brass or sepia cast anywhere. Every shade
// resolves through a CSS variable (an `R G B` triplet) so a `.dark` / light class
// on <html> re-themes the whole app with no per-class edits, while Tailwind
// opacity modifiers (`/50`, `/15`) keep working via the `<alpha-value>`
// placeholder. Concrete values live in src/index.css (:root = light, .dark =
// dark). `ink`/`spectral` alias `mist`/`halo`; `zinc` is the neutral text ramp.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

const mist = {
  50: v('--mist-50'),
  100: v('--mist-100'),
  200: v('--mist-200'),
  300: v('--mist-300'),
  400: v('--mist-400'),
  500: v('--mist-500'),
  600: v('--mist-600'),
  700: v('--mist-700'),
  750: v('--mist-750'),
  800: v('--mist-800'),
  850: v('--mist-850'),
  900: v('--mist-900'),
  950: v('--mist-950'),
}

const halo = {
  DEFAULT: v('--halo'),
  soft: v('--halo-soft'),
  dim: v('--halo-dim'),
  glow: v('--halo-glow'),
  deep: v('--halo-deep'),
}

// Neutral accent for positive/confirmed states — the black-and-white stand-in
// for the old emerald "success" green. Reads as a plain grey step so it stays
// clearly apart from the `amber` still used for warnings.
const patina = {
  300: v('--patina-300'),
  400: v('--patina-400'),
  500: v('--patina-500'),
}

// Re-point the default grey text scale at the themed neutral ramp so existing
// `text-zinc-*` follows light/dark. Deep-merges with Tailwind's zinc.
const themedZinc = {
  50: v('--zinc-50'),
  100: v('--zinc-100'),
  200: v('--zinc-200'),
  300: v('--zinc-300'),
  400: v('--zinc-400'),
  500: v('--zinc-500'),
  600: v('--zinc-600'),
  700: v('--zinc-700'),
  800: v('--zinc-800'),
  900: v('--zinc-900'),
  950: v('--zinc-950'),
}

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mist,
        halo,
        ink: mist, // alias — existing bg-ink-*/border-ink-* follow the neutral ramp.
        spectral: halo, // alias — existing text-spectral/bg-spectral read as the foreground ink.
        patina,
        zinc: themedZinc,
      },
      fontFamily: {
        display: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: [
          'Montserrat',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        // Tight and quiet — no colored glow, no wide diffuse "ghost card" shadow.
        glow: '0 1px 2px 0 rgba(0,0,0,0.35)',
        panel: '0 1px 2px 0 rgba(0,0,0,0.35)',
        hair: '0 0 0 1px rgba(56,56,56,0.9)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { opacity: '0' },
        },
        // Slow drift for the background haze.
        drift: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(-1.5%, -2%, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
        drift: 'drift 22s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
