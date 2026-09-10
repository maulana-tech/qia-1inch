import { createConfig, http } from 'wagmi'
import { base, baseSepolia, foundry, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

import { CHAIN_ID, RPC_URL } from './config'

/**
 * Chain yang didukung.
 *
 * Setiap pembacaan HARUS menyebut chainId secara eksplisit. Mengandalkan urutan
 * array tidak cukup: tanpa dompet terhubung, wagmi memilih chain sendiri, dan
 * pembacaan diam-diam menembak jaringan lain. Kegagalannya lalu muncul sebagai
 * error RPC yang membingungkan, bukan sebagai salah konfigurasi. Pakai
 * `ACTIVE_CHAIN_ID` di bawah.
 */
const SUPPORTED_CHAIN_IDS = [sepolia.id, baseSepolia.id, base.id, foundry.id] as const

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
      `VITE_CHAIN_ID=${CHAIN_ID} is not in the list of configured chains ` +
        `(${SUPPORTED_CHAIN_IDS.join(', ')}).`,
    )
  }
  return found
})()

export const wagmiConfig = createConfig({
  chains: [sepolia, baseSepolia, base, foundry],
  connectors: [injected()],
  // `VITE_RPC_URL` menang untuk rantai yang sedang aktif. Itu yang membuat fork
  // lokal Base (chain 8453 di localhost:8546) bisa dipakai apa adanya.
  transports: {
    [sepolia.id]: sepolia.id === CHAIN_ID && RPC_URL ? http(RPC_URL) : http(),
    [baseSepolia.id]: baseSepolia.id === CHAIN_ID && RPC_URL ? http(RPC_URL) : http(),
    [base.id]: base.id === CHAIN_ID && RPC_URL ? http(RPC_URL) : http(),
    [foundry.id]: http(RPC_URL || 'http://localhost:8545'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
