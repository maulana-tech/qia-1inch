import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { CHAIN_NAME } from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'

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

const WalletContext = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnecting, isConnected } = useAccount()
  const { connectAsync, error: connectError } = useConnect()
  const { disconnect: disconnectWagmi } = useDisconnect()
  const chainId = useChainId()

  const status: WalletStatus = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected'
  
  const value = useMemo<WalletState>(
    () => ({
      status,
      address: address ?? null,
      // Jaringan yang benar itu yang dikonfigurasi, bukan Base Sepolia. Dulu
      // ini dipatok ke baseSepolia, jadi di anvil dompet selalu dianggap salah
      // jaringan dan bannernya tidak pernah hilang.
      network: chainId === ACTIVE_CHAIN_ID ? CHAIN_NAME : 'Jaringan lain',
      isTestnet: chainId === ACTIVE_CHAIN_ID,
      installed: true,
      error: connectError?.message ?? null,
      connect: async () => {
        try {
          await connectAsync({ connector: injected() })
        } catch (e) {
          console.error(e)
        }
      },
      disconnect: () => disconnectWagmi(),
    }),
    [status, address, chainId, connectError, connectAsync, disconnectWagmi],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}
