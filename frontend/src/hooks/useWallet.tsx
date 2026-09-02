import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { flareTestnet } from 'wagmi/chains'

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
      network: chainId === flareTestnet.id ? 'COSTON2' : 'UNKNOWN',
      isTestnet: chainId === flareTestnet.id,
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
