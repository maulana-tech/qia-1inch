import { useEffect, useRef } from 'react'

import { useIsDark } from '../hooks/useTheme'

/**
 * Latar aplikasi: "Horizon Glow" — kubah bercahaya yang mengembang dari
 * bawah-tengah, di atas bidang kertas.
 *
 * Menggantikan `.app-wash`, tiga radial biru pada 9–18% yang secara teknis
 * terpasang tapi praktis tidak terlihat di layar.
 *
 * # Kenapa dianimasikan dari JS, bukan `@keyframes`
 *
 * Yang bergerak adalah RADIUS tiap `radial-gradient`, dan CSS tidak bisa
 * menginterpolasi ukuran stop gradien lewat animasi biasa. Jadi tiap frame
 * `background-image` dirakit ulang dari jam yang sama.
 *
 * # Kenapa modulasinya harus nol di t = 0
 *
 * Semua faktornya berbentuk `1 + sin(…) * k`, dan `sin(0) = 0`. Tanpa itu frame
 * pertama melompat dari nilai diam ke nilai teranimasi, dan kubahnya menyentak
 * tepat saat halaman selesai dimuat.
 *
 * # Kenapa tidak ada pembulatan
 *
 * Membulatkan radius per frame membuat geraknya melangkah, bukan mengalir.
 * Nilainya dibiarkan pecahan penuh dan diserahkan ke compositor.
 */

/** Kecepatan dan kedalaman gerak, dari parameter sumbernya (speed 100, amount 30). */
const SPEED = 1.0
const AMOUNT = 0.3

/** Bidang di baliknya. Tema gelap memakai backdrop navy, bukan parchment. */
const BASE = { light: '#F7F4EC', dark: '#0B1220' } as const

/**
 * Grain statis, dipisah dari perakitan per frame.
 *
 * Ia tidak ikut bergerak, jadi menyusun ulang string sepanjang ini enam puluh
 * kali sedetik hanya membuang kerja pada lapisan yang tidak berubah.
 */
const GRAIN =
  "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.210'/></svg>\")"

/**
 * @param dome Pengali radius kubah utama.
 * @param glow Pengali radius dua lapis cahaya balik di belakangnya.
 */
function layers(dome: number, glow: number): string {
  return [
    GRAIN,
    `radial-gradient(${100 * dome}% ${50 * dome}% at 50% 70%, #6950fa 0%, #4D2FF9 20.4%, #5667FF 41.1%, #78B8F9 61.8%, #FFFFFF 82.5%, rgba(255, 255, 255, 0) 85.3%)`,
    `radial-gradient(${42 * glow}% ${19 * glow}% at 50% 70%, rgba(139, 120, 251, 0.396) 0%, rgba(77, 47, 249, 0.154) 38%, rgba(77, 47, 249, 0) 72%)`,
    `radial-gradient(${53 * glow}% ${29 * glow}% at 50% 70%, rgba(86, 103, 255, 0.143) 0%, rgba(86, 103, 255, 0) 80%)`,
  ].join(', ')
}

export function BrandCanvas() {
  const dark = useIsDark()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Frame diam selalu digambar lebih dulu. Tanpa ini, pengguna dengan
    // reduced-motion mendapat bidang polos alih-alih kubahnya.
    el.style.backgroundImage = layers(1, 1)

    // Gerak halus tanpa henti di seluruh layar persis yang dimaksud
    // reduced-motion, dan kubah diamnya sudah utuh sebagai latar.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      const spin = ((now - start) / 1000) * SPEED
      const swell = Math.sin(spin * 0.8)

      el.style.backgroundImage = layers(1 + swell * AMOUNT * 0.07, 1 + swell * AMOUNT * 0.35)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-300"
      style={{
        // `backgroundColor`, bukan `background`: shorthand-nya menghapus
        // `background-image` yang ditulis efek di atas, dan kubahnya hilang
        // tanpa jejak di devtools selain properti yang tidak pernah ada.
        backgroundColor: dark ? BASE.dark : BASE.light,
        backgroundSize: '120px 120px, auto, auto, auto',
        backgroundRepeat: 'repeat, no-repeat, no-repeat, no-repeat',
        backgroundBlendMode: 'overlay, normal, normal, normal',
      }}
    />
  )
}

export default BrandCanvas
