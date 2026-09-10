import { useIsDark } from '../hooks/useTheme'

/**
 * Latar aplikasi: warna dasar solid plus cahaya biru `.app-wash`.
 *
 * Sebelumnya ada kisi garis tipis di belakang seluruh permukaan. Dengan kartu
 * yang kini bersudut membulat dan ring halus, kisi itu justru bersaing dengan
 * isinya — garisnya menembus tepi kartu dan membuat batas antar elemen kabur.
 */
export function BrandCanvas() {
  const dark = useIsDark()
  return (
    <div
      className="app-wash pointer-events-none fixed inset-0 -z-10 transition-colors duration-300"
      // `backgroundColor`, bukan `background`: shorthand-nya akan menghapus
      // `background-image` yang dipasang `.app-wash`, dan cahayanya hilang tanpa
      // jejak di devtools selain properti yang tidak pernah ada.
      style={{ backgroundColor: dark ? '#0a0a0c' : '#f8f8fa' }}
    />
  )
}

export default BrandCanvas
