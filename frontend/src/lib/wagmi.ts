import { createConfig, http } from 'wagmi'
import { flareTestnet, sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [flareTestnet, sepolia],
  connectors: [injected()],
  transports: {
    [flareTestnet.id]: http(),
    [sepolia.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
