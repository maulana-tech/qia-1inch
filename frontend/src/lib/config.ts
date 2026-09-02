/**
 * Live deployment configuration for the Larel frontend.
 *
 * Source of truth: `deployments.json` at the repo root (testnet). The values are inlined
 * here (a typed config) so the app does not need filesystem access outside its own root,
 * and every value can be overridden at build time via `VITE_*` env vars for other
 * networks / private deployments.
 */
import { hash2, NATIVE_ASSET_ID, toField, type Field } from '@larel/sdk'
import type { AssetCode } from './larel-sdk'

// Tolerate a missing `import.meta.env` (Node/SSR/test contexts, where Vite hasn't injected it)
// by falling back to the compiled defaults rather than throwing.
const META_ENV = (import.meta.env ?? {}) as Partial<ImportMetaEnv>

function env(key: string, fallback: string): string {
  const v = META_ENV[key as keyof ImportMetaEnv] as string | undefined
  return v && v.length > 0 ? v : fallback
}

function flag(key: string): boolean {
  const v = META_ENV[key as keyof ImportMetaEnv] as string | undefined
  return v === 'true' || v === '1'
}

/**
 * LarelPool contract id on the configured network.
 *
 * Points at the Larel rebranded redeploy (2026-07-15): the pool + all 5 verifiers were rebuilt
 * from the lax-stell source (LarelPool/LarelError symbols) on a fresh tree, reusing the
 * existing faucet SACs.
 */
export const POOL_CONTRACT_ID = env(
  'VITE_LAREL_POOL',
  '0x72a86479837B87cc2aA73daBd7B54CB4DBf0AB84',
)

// ---------------------------------------------------------------------------
// Mock ERC20 token addresses on Flare Coston2
//
// These are the EVM addresses of the permissionless-mint MockERC20 contracts
// deployed for the faucet. Deploy with: cd contracts && forge script script/Deploy.s.sol
// After deployment, paste the addresses here or set VITE_*_SAC env vars.
// ---------------------------------------------------------------------------

/** Mock USDC ERC20 on Coston2 (7 decimals). */
export const MOCK_USDC_ADDRESS = env('VITE_USDC_SAC', '0x072F9Fd7Aa8F8EA6664fD77F7e264CDeC4052F74')

/** Mock ETH ERC20 on Coston2 (7 decimals). */
export const MOCK_ETH_ADDRESS = env('VITE_ETH_SAC', '0x017ACB212AE11De96fEF8bbd6F52E677eDF040bd')

/** Mock BTC ERC20 on Coston2 (7 decimals). */
export const MOCK_BTC_ADDRESS = env('VITE_BTC_SAC', '0xF84B7457B9d8Eb4ACfbc875225514A04105a70D7')

/** Mock XRP ERC20 on Coston2 (7 decimals). */
export const MOCK_XRP_ADDRESS = env('VITE_XRP_SAC', '0xb1340025b940bA91B400D8b111D728c19FcF779b')

/** TransferProcessor contract for ZK transfers. */
export const TRANSFER_PROCESSOR_ADDRESS = env('VITE_TRANSFER_PROCESSOR', '0x6258f86d8c4931bfc1ac1bd779f912d2a4288faa')

/** Whether all mock ERC20 tokens are deployed and configured. */
export const MOCK_TOKENS_DEPLOYED = Boolean(MOCK_USDC_ADDRESS) && Boolean(MOCK_ETH_ADDRESS)

/** Flare Coston2 RPC endpoint. */
export const SOROBAN_RPC_URL = env('VITE_SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org')

/** Off-chain dark-pool matcher base URL (e.g. http://localhost:8787). Empty = matching
 *  disabled: orders still place + cancel on-chain, they just won't be matched/filled. */
export const MATCHER_URL = env('VITE_MATCHER_URL', '')

/** Ledger the pool was deployed at — the client indexer's cold-start floor. */
export const POOL_DEPLOY_LEDGER = Number(env('VITE_POOL_DEPLOY_LEDGER', '3858200'))

/** Flare network passphrase. */
export const NETWORK_PASSPHRASE = env('VITE_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015')

/** When true, the app uses the offline `MockLarelSdk` instead of the live client. */
export const USE_MOCK = flag('VITE_USE_MOCK')

/** Soroban LarelSwapRouter contract id. */
export const SWAP_ROUTER_CONTRACT_ID = env(
  'VITE_LAREL_SWAP_ROUTER',
  'CAKAQG6BY6PTTH75LY5IK4F2XHKU2MJ7EDXSQMZGLL2TNF3UCYUET4BB',
)

/** Soroswap Router contract address. */
export const SOROSWAP_ROUTER_ADDRESS = env(
  'VITE_SOROSWAP_ROUTER',
  'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
)

// ---------------------------------------------------------------------------
// Cross-chain bridge (Ethereum Sepolia <-> Flare Coston2).
// ---------------------------------------------------------------------------

/** When true, the Bridge tab runs a self-contained mock walkthrough (no wallets).
 *  Auto-enabled when bridge addresses are not configured. */
export const USE_MOCK_BRIDGE = USE_MOCK || flag('VITE_USE_MOCK_BRIDGE')

/** Ethereum chain the L1 bridge is deployed on (Sepolia testnet = 11155111). */
export const L1_CHAIN_ID = Number(env('VITE_L1_CHAIN_ID', '11155111'))

/** Sepolia execution RPC used by viem reads. */
export const SEPOLIA_RPC_URL = env('VITE_SEPOLIA_RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com')

/** `LarelBridgeL1` escrow address on Sepolia (locks/unlocks the backing). */
export const L1_BRIDGE_ADDRESS = env(
  'VITE_L1_BRIDGE_ADDRESS',
  '0x0000000000000000000000000000000000000000',
)

/** Soroban `EthLightClient` contract id (trusted Ethereum head on Flare). */
export const ETH_LIGHT_CLIENT_ID = env('VITE_ETH_LIGHT_CLIENT', '')

/** Soroban `LarelBridge` contract id (bridge_in / bridge_out). */
export const LAREL_BRIDGE_ID = env('VITE_LAREL_BRIDGE', '')

/** Relayer base URL. */
export const RELAYER_URL = env('VITE_RELAYER_URL', '')

/**
 * Bridge-asset domain separator (BRIDGE_SPEC §3):
 *   asset_id(bToken) = hash2( hash2(eth_chain_id, eth_token_address_as_field), BRIDGE_DOMAIN )
 */
export const BRIDGE_DOMAIN: Field = toField(env('VITE_BRIDGE_DOMAIN', '0x627269646765')) // "bridge"

/** Whether the live bridge contracts are configured (non-zero addresses + IDs). */
export const BRIDGE_CONFIGURED =
  L1_BRIDGE_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
  Boolean(ETH_LIGHT_CLIENT_ID) &&
  Boolean(LAREL_BRIDGE_ID)

/**
 * Effective mock-bridge flag: true when USE_MOCK is on, VITE_USE_MOCK_BRIDGE is set,
 * OR the live bridge contracts are not configured. This ensures the bridge UI is always
 * usable — in mock mode when live addresses aren't available.
 */
export const EFFECTIVE_MOCK_BRIDGE = USE_MOCK_BRIDGE || !BRIDGE_CONFIGURED

/** Map a 20-byte L1 token address (hex) to its bridged Larel `asset_id` field. */
export function deriveBridgedAssetId(tokenAddressHex: string): Field {
  const addrField = toField(BigInt(tokenAddressHex))
  return hash2(hash2(L1_CHAIN_ID, addrField), BRIDGE_DOMAIN)
}

/** Native ETH is represented on L1 by the zero address (BRIDGE_SPEC §4). */
export const ETH_L1_ADDRESS = '0x0000000000000000000000000000000000000000'

/** Sepolia test-USDC (Circle faucet token) — override via env for other deployments. */
export const USDC_L1_ADDRESS = env('VITE_BRIDGE_USDC_L1', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238')

/** Sepolia test-WBTC — override via env. Placeholder: not deployed yet. */
export const BTC_L1_ADDRESS = env('VITE_BRIDGE_BTC_L1', '0x0000000000000000000000000000000000000000')

/** Sepolia test-XRP — override via env. Placeholder: not deployed yet. */
export const XRP_L1_ADDRESS = env('VITE_BRIDGE_XRP_L1', '0x0000000000000000000000000000000000000000')

/** Per-asset on-chain config. `assetId` is the in-circuit field id (native FLR = 0). */
export interface AssetConfig {
  code: AssetCode
  /** Field identifier used in notes/commitments. */
  assetId: Field
  /** ERC20 contract address on Coston2, or undefined if not deployed on this network. */
  sac: string | undefined
  /** On-chain fixed-point decimals. */
  decimals: number
  /** Display price estimate (USD), portfolio only. */
  priceUsd: number
}

export const ASSET_CONFIG: Record<AssetCode, AssetConfig> = {
  FLR: { code: 'FLR', assetId: NATIVE_ASSET_ID, sac: undefined, decimals: 18, priceUsd: 0.03 },
  USDC: {
    code: 'USDC',
    assetId: MOCK_USDC_ADDRESS ? toField(BigInt(MOCK_USDC_ADDRESS)) : 0n,
    sac: MOCK_USDC_ADDRESS || undefined,
    decimals: 7,
    priceUsd: 1,
  },
  bETH: {
    code: 'bETH',
    assetId: deriveBridgedAssetId(ETH_L1_ADDRESS),
    sac: undefined,
    decimals: 18,
    priceUsd: 3500,
  },
  bUSDC: {
    code: 'bUSDC',
    assetId: deriveBridgedAssetId(USDC_L1_ADDRESS),
    sac: undefined,
    decimals: 6,
    priceUsd: 1,
  },
  bBTC: {
    code: 'bBTC',
    assetId: deriveBridgedAssetId(BTC_L1_ADDRESS),
    sac: undefined,
    decimals: 8,
    priceUsd: 65000,
  },
  bXRP: {
    code: 'bXRP',
    assetId: deriveBridgedAssetId(XRP_L1_ADDRESS),
    sac: undefined,
    decimals: 6,
    priceUsd: 0.6,
  },
}
