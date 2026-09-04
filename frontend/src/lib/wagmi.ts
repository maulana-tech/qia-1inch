import { createConfig, http } from 'wagmi'
import { base, baseSepolia, foundry } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

import { CHAIN_ID } from './config'

/**
 * Chain yang didukung.
 *
 * Setiap pembacaan HARUS menyebut chainId secara eksplisit. Mengandalkan urutan
 * array tidak cukup: tanpa dompet terhubung, wagmi memilih chain sendiri, dan
 * pembacaan diam-diam menembak jaringan lain. Kegagalannya lalu muncul sebagai
 * error RPC yang membingungkan, bukan sebagai salah konfigurasi. Pakai
 * `ACTIVE_CHAIN_ID` di bawah.
 */
const SUPPORTED_CHAIN_IDS = [baseSepolia.id, base.id, foundry.id] as const

/**
 * @dev Diberi tipe union, bukan `number`, supaya salah ketik di
 *   `VITE_CHAIN_ID` ketahuan saat kompilasi di setiap pemanggil — termasuk
 *   `switchChain`, yang menolak `number` biasa. Nilai di luar daftar dilempar
 *   di sini, bukan dibiarkan lolos: rantai yang tidak terkonfigurasi muncul
 *   sebagai error RPC yang membingungkan, jauh dari sebabnya.
 */
export const ACTIVE_CHAIN_ID = ((): (typeof SUPPORTED_CHAIN_IDS)[number] => {
  const found = SUPPORTED_CHAIN_IDS.find((id) => id === CHAIN_ID)
  if (found === undefined) {
    throw new Error(
      `VITE_CHAIN_ID=${CHAIN_ID} tidak ada di daftar chain yang dikonfigurasi ` +
        `(${SUPPORTED_CHAIN_IDS.join(', ')}).`,
    )
  }
  return found
})()

export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, foundry],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [foundry.id]: http('http://localhost:8545'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
