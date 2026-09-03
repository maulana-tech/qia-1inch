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
export const ACTIVE_CHAIN_ID = CHAIN_ID

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
