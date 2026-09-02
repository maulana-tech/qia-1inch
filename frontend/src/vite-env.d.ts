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
  /** Market maker backing the desk (0x…). */
  readonly VITE_DESK_MAKER?: string
  /** Strategy salt. Must match what the maker used at ship() time. */
  readonly VITE_DESK_SALT?: string
  /** Flat input fee, 1e9 basis. */
  readonly VITE_DESK_FEE_BPS?: string
  /** SolvencyGuard max surcharge, 1e9 basis. */
  readonly VITE_DESK_SURCHARGE_BPS?: string
  /** If set, only this address may fill the desk's order (0x…). */
  readonly VITE_DESK_EXCLUSIVE_TAKER?: string
  /** Comma-separated PAIR=ADDRESS list, legacy AMM pools. */
  readonly VITE_AMM_POOLS?: string

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
