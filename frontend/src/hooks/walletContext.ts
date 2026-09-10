/**
 * Bentuk state dompet dan hook pembacanya.
 *
 * Terpisah dari `useWallet.tsx` karena alasan yang sama dengan `settingsContext`:
 * Vite hanya bisa mengganti modul panas kalau berkasnya cuma mengekspor
 * komponen. Provider yang berbagi berkas dengan hook-nya memaksa muat ulang
 * penuh setiap kali disunting — dan muat ulang penuh memutus dompet, yang
 * ironis untuk berkas ini.
 */
import { createContext, useContext } from 'react'

export type WalletStatus = 'checking' | 'not-installed' | 'disconnected' | 'connecting' | 'connected'

export interface WalletState {
  status: WalletStatus
  address: string | null
  network: string | null
  isTestnet: boolean
  installed: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

export const WalletContext = createContext<WalletState | null>(null)


export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}
