/**
 * Provider dompet, dan HANYA itu. Tipe dan hook-nya di `walletContext.ts`.
 */
import { useMemo, type ReactNode } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { injected } from 'wagmi/connectors'

import { CHAIN_NAME } from '../lib/config'
import { ACTIVE_CHAIN_ID } from '../lib/wagmi'
import { WalletContext, type WalletState, type WalletStatus } from './walletContext'

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
