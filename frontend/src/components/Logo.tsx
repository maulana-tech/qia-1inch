/**
 * Tanda Iqia.
 *
 * Ditulis sebagai SVG, bukan gambar. Yang lama PNG 600 KB dengan warna tertanam,
 * jadi harus diunduh dan tetap salah di salah satu tema. Yang ini mewarisi
 * `currentColor`, tajam di ukuran berapa pun, dan nol byte jaringan.
 *
 * Bentuknya dua tetes yang saling tumpang tindih: modal yang sama menopang lebih
 * dari satu posisi — properti Aqua yang membuat aplikasi ini mungkin.
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

/** Tanda plus nama, untuk header dan footer. */
export function Logo({ className = '', markClassName = 'h-6 w-6' }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[17px] font-medium lowercase tracking-[-0.01em]">iqia</span>
    </span>
  )
}

export default Logo
