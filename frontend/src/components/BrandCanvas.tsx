import { useEffect, useRef } from 'react'

import { useIsDark } from '../hooks/useTheme'

/**
 * Latar aplikasi, satu per tema.
 *
 *   - Terang: "Horizon Glow" — kubah bercahaya yang mengembang dari
 *     bawah-tengah, di atas bidang kertas. Teranimasi.
 *   - Gelap: satu radial hitam→violet dari atas. Diam.
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

/** Bidang di baliknya. */
const BASE = { light: '#F7F4EC', dark: '#000000' } as const

/**
 * Tema gelap: satu radial hitam→violet, diam.
 *
 * Bukan versi gelap dari kubah, dan itu disengaja. Kubah bekerja karena
 * cahayanya lebih terang dari bidangnya; di atas hitam, "lebih terang" berarti
 * satu bola menyala yang menuntut perhatian terus-menerus di belakang teks yang
 * sedang dibaca. Gradien ini bergerak ke arah sebaliknya — gelap di ATAS tempat
 * teks berada, warna terkumpul di bawah tempat halaman kosong.
 *
 * Diam, tanpa rAF: tidak ada radius yang perlu diinterpolasi, jadi merakit
 * ulang string ini tiap frame tidak akan mengubah satu piksel pun.
 */
const NIGHT = 'radial-gradient(125% 125% at 50% 10%, #000 40%, #63e 100%)'

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

    if (dark) {
      // Satu lapis, jadi `size`/`repeat`/`blend` harus ikut menyusut. Nilai
      // empat-lapis yang ditinggalkan mode terang akan tetap dipakai browser,
      // dan grain-nya menempel sebagai ubin 120px di atas gradien yang
      // seharusnya mulus.
      el.style.backgroundImage = NIGHT
      el.style.backgroundSize = 'auto'
      el.style.backgroundRepeat = 'no-repeat'
      el.style.backgroundBlendMode = 'normal'
      return
    }

    el.style.backgroundSize = '120px 120px, auto, auto, auto'
    el.style.backgroundRepeat = 'repeat, no-repeat, no-repeat, no-repeat'
    el.style.backgroundBlendMode = 'overlay, normal, normal, normal'

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
    // `dark` wajib ada di sini: tanpanya efek ini jalan sekali seumur hidup
    // komponen, dan menekan tombol tema cuma menukar warna dasarnya —
    // gradiennya tertinggal pada tema sebelumnya. Ia juga menghentikan rAF saat
    // pindah ke gelap, bukan membiarkannya menulisi latar yang sudah diganti.
  }, [dark])

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-300"
      // `backgroundColor`, bukan `background`: shorthand-nya menghapus
      // `background-image` yang ditulis efek di atas, dan latarnya hilang tanpa
      // jejak di devtools selain properti yang tidak pernah ada. Sisa properti
      // latar juga diatur di efek, karena jumlah lapisannya beda per tema.
      style={{ backgroundColor: dark ? BASE.dark : BASE.light }}
    />
  )
}

export default BrandCanvas
