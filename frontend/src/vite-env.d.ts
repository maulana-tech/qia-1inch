/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Use the offline MockLarelSdk instead of the live testnet client. */
  readonly VITE_USE_MOCK?: string
  /** Enable the experimental in-browser withdraw prover (heavy). */
  readonly VITE_ENABLE_WITHDRAW?: string
  /** Overrides for the live deployment (default to deployments.json / testnet). */
  readonly VITE_LAREL_POOL?: string
  readonly VITE_NATIVE_SAC?: string
  readonly VITE_USDC_SAC?: string
  readonly VITE_SOROBAN_RPC_URL?: string
  readonly VITE_NETWORK_PASSPHRASE?: string
  // --- Cross-chain bridge (Ethereum Sepolia <-> Flare Coston2) ---
  /** Run the Bridge tab as a self-contained mock walkthrough (no wallets). */
  readonly VITE_USE_MOCK_BRIDGE?: string
  /** Ethereum chain id of the L1 bridge (Sepolia = 11155111). */
  readonly VITE_L1_CHAIN_ID?: string
  /** Sepolia execution RPC for viem reads. */
  readonly VITE_SEPOLIA_RPC_URL?: string
  /** LarelBridgeL1 escrow address on Sepolia (0x…). */
  readonly VITE_L1_BRIDGE_ADDRESS?: string
  /** Soroban EthLightClient contract id (C…). */
  readonly VITE_ETH_LIGHT_CLIENT?: string
  /** Soroban LarelBridge contract id (C…). */
  readonly VITE_LAREL_BRIDGE?: string
  /** Optional relayer base URL for the bridge-in nudge. */
  readonly VITE_RELAYER_URL?: string
  /** Bridge-asset domain separator (BRIDGE_SPEC §3). */
  readonly VITE_BRIDGE_DOMAIN?: string
  /** Sepolia test-USDC ERC20 address (0x…). */
  readonly VITE_BRIDGE_USDC_L1?: string
  /** Sepolia test-BTC ERC20 address (0x…). */
  readonly VITE_BRIDGE_BTC_L1?: string
  /** Sepolia test-XRP ERC20 address (0x…). */
  readonly VITE_BRIDGE_XRP_L1?: string
  /** Mock ERC20 token addresses on Coston2 for the faucet. */
  readonly VITE_ETH_SAC?: string
  readonly VITE_BTC_SAC?: string
  readonly VITE_XRP_SAC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
