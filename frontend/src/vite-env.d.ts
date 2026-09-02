/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Use the offline MockIqiaSdk instead of the live testnet client. */
  readonly VITE_USE_MOCK?: string
  /** Enable the experimental in-browser withdraw prover (heavy). */
  readonly VITE_ENABLE_WITHDRAW?: string

  // --- Network ---
  /** Target chain id. Base Sepolia = 84532, Base mainnet = 8453. */
  readonly VITE_CHAIN_ID?: string
  /** Display name for the target chain. */
  readonly VITE_CHAIN_NAME?: string
  /** Block explorer base URL. */
  readonly VITE_EXPLORER_URL?: string

  // --- Core contracts ---
  /** IqiaPool address (0x…). */
  readonly VITE_IQIA_POOL?: string
  /** TransferProcessor address (0x…). */
  readonly VITE_TRANSFER_PROCESSOR?: string
  /** Block the pool was deployed at — the indexer's cold-start floor. */
  readonly VITE_POOL_DEPLOY_BLOCK?: string

  // --- Aqua / SwapVM ---
  /** Aqua virtual-balance registry (0x…). */
  readonly VITE_AQUA?: string
  /** Iqia's custom SwapVM router, which doubles as the Aqua app (0x…). */
  readonly VITE_SWAP_VM_ROUTER?: string

  // --- Faucet tokens (7 decimals, see contracts/README.md) ---
  readonly VITE_USDC_ADDRESS?: string
  readonly VITE_WBTC_ADDRESS?: string
  readonly VITE_DAI_ADDRESS?: string

  // --- Services ---
  /** Off-chain dark-pool matcher base URL. Empty disables matching. */
  readonly VITE_MATCHER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
