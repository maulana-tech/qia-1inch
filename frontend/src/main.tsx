import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import App from './App'
import { WalletProvider } from './hooks/useWallet'
import { IqiaProvider } from './hooks/useIqia'
import { RevealProvider } from './hooks/useReveal'
import { SettingsProvider } from './lib/settings'
import { wagmiConfig } from './lib/wagmi'
import './index.css'

// @stellar/stellar-sdk (stellar-base) relies on a global Buffer in the browser.
// This is still needed for some legacy dependencies during migration.
if (!globalThis.Buffer) globalThis.Buffer = Buffer

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

// One shared TanStack Query client backs wagmi's data hooks (required by wagmi v2).
const queryClient = new QueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <WalletProvider>
            <IqiaProvider>
              <RevealProvider>
                <SettingsProvider>
                  <App />
                </SettingsProvider>
              </RevealProvider>
            </IqiaProvider>
          </WalletProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
