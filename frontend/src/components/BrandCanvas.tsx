import { useIsDark } from '../hooks/useTheme'

/**
 * Latar aplikasi. Warna solid, tanpa pola.
 *
 * Sebelumnya ada kisi garis tipis di belakang seluruh permukaan. Dengan kartu
 * yang kini bersudut membulat dan ring halus, kisi itu justru bersaing dengan
 * isinya — garisnya menembus tepi kartu dan membuat batas antar elemen kabur.
 */
export function BrandCanvas() {
  const dark = useIsDark()
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-300"
      style={{ background: dark ? '#0a0a0c' : '#f8f8fa' }}
    />
  )
}

export default BrandCanvas
