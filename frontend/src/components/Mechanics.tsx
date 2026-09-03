import { useIsDark } from '../hooks/useTheme'
import { SystemArchitecture, SwapAmmMechanism } from './StorySections'

/**
 * Dua diagram: susunan sistem, dan jalur satu swap.
 *
 * Menggantikan bagian naratif lama yang menjual kerahasiaan sebagai fitur utama
 * — janji yang sudah tidak berlaku sejak lapisan enclave dibuang. Yang tersisa
 * di sini adalah mekanisme yang bisa ditelusuri sendiri di kode.
 */
export function Mechanics() {
  const dark = useIsDark()
  return (
    <section
      className="relative z-10 px-6 pb-24 sm:px-10 lg:px-16"
      style={{ backgroundColor: dark ? '#101010' : '#ffffff' }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <SystemArchitecture />
        <SwapAmmMechanism />
      </div>
    </section>
  )
}

export default Mechanics
