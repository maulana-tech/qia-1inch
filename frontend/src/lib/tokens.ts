// @ts-nocheck
/**
 * Token registry.
 *
 * The protocol is asset-agnostic: the pool accepts any ERC20 token address and
 * derives the note's `asset_id` from its address (native ETH = 0). So "supporting a token"
 * is purely a client concern — know its address, derive the asset id, done.
 *
 * This module holds a curated list of well-known tokens (metadata + ERC20 address where
 * available on the active network) and resolves arbitrary custom tokens from a pasted
 * contract address.
 */
import { NATIVE_ASSET_ID, toField, type Field } from '@iqia/sdk'
import {
  MOCK_USDC_ADDRESS,
  MOCK_ETH_ADDRESS,
  MOCK_BTC_ADDRESS,
  MOCK_XRP_ADDRESS,
} from './config'

export interface TokenMeta {
  code: string
  name: string
  /** CoinBadge icon key. */
  icon: string
  /** On-chain fixed-point decimals. */
  decimals: number
  /** Display price estimate (USD). */
  priceUsd: number
  /** ERC20 contract address on Coston2, or undefined if not available here. */
  sac?: string
  /** True for the native FLR (asset_id = 0). */
  native?: boolean
  /** True for cross-chain bridged assets (no native ERC20; minted by the bridge). */
  bridged?: boolean
  /** True for a testnet faucet token — the app can mint it to you on demand. */
  faucet?: boolean
}

/**
 * Curated tokens shown in the deposit picker. FLR is native; USDC/ETH/BTC/XRP
 * are testnet faucet tokens (deployed permissionless-mint MockERC20 mocks) so they're
 * depositable out of the box — the app can mint them to you. Override any address via
 * `VITE_<CODE>_SAC` (e.g. to point at the real mainnet assets).
 *
 * IMPORTANT: These must be EVM contract addresses (0x...) on Flare Coston2.
 * Deploy mock tokens: cd contracts && forge script script/Deploy.s.sol --broadcast
 */
export const CURATED_TOKENS: TokenMeta[] = [
  { code: 'FLR', name: 'Flare', icon: 'FLR', decimals: 18, priceUsd: 0.03, native: true },
  { code: 'USDC', name: 'Test USD Coin', icon: 'USDC', decimals: 7, priceUsd: 1, faucet: true,
    sac: MOCK_USDC_ADDRESS || undefined },
  { code: 'ETH', name: 'Test Ethereum', icon: 'ETH', decimals: 7, priceUsd: 3500, faucet: true,
    sac: MOCK_ETH_ADDRESS || undefined },
  { code: 'BTC', name: 'Test Bitcoin', icon: 'BTC', decimals: 7, priceUsd: 65000, faucet: true,
    sac: MOCK_BTC_ADDRESS || undefined },
  { code: 'XRP', name: 'Test XRP', icon: 'XRP', decimals: 7, priceUsd: 0.6, faucet: true,
    sac: MOCK_XRP_ADDRESS || undefined },
]

export const BRIDGED_TOKENS: TokenMeta[] = [
  { code: 'bETH', name: 'Bridged ETH', icon: 'bETH', decimals: 18, priceUsd: 3500, bridged: true },
  { code: 'bUSDC', name: 'Bridged USDC', icon: 'bUSDC', decimals: 6, priceUsd: 1, bridged: true },
  { code: 'bBTC', name: 'Bridged BTC', icon: 'bBTC', decimals: 8, priceUsd: 65000, bridged: true },
  { code: 'bXRP', name: 'Bridged XRP', icon: 'bXRP', decimals: 6, priceUsd: 0.6, bridged: true },
]

const REGISTRY = new Map<string, TokenMeta>([...CURATED_TOKENS, ...BRIDGED_TOKENS].map((t) => [t.code, t]))

export const ALL_TOKENS = [...CURATED_TOKENS, ...BRIDGED_TOKENS]

/** The canonical token codes (the global "enum") used by deposit / transfer / swap pickers. */
export const TOKEN_CODES: string[] = ALL_TOKENS.map((t) => t.code)

/** Select options for the token pickers (code — name). */
export const TOKEN_OPTIONS = ALL_TOKENS.map((t) => ({ value: t.code, label: `${t.code} — ${t.name}` }))

/** Cross-chain bridged asset codes (minted by the bridge; not curated deposit tokens). */
export const BRIDGED_ASSET_CODES: string[] = BRIDGED_TOKENS.map((t) => t.code)

/** Metadata for a code — falls back to a plain text badge for unknown/custom tokens. */
export function assetMeta(code: string): TokenMeta {
  return REGISTRY.get(code) ?? { code, name: code, icon: code, decimals: 7, priceUsd: 0 }
}

/** The `asset_id` field for a token: native FLR = 0; else Poseidon2 of its ERC20 address. */
export function assetIdFor(token: Pick<TokenMeta, 'native' | 'sac'>): Field {
  if (token.native) return NATIVE_ASSET_ID
  if (!token.sac) throw new Error('Token has no ERC20 address to derive its asset id.')
  return toField(BigInt(token.sac))
}

/** Curated tokens depositable on the active network (their ERC20 address exists here). */
export function depositableTokens(): TokenMeta[] {
  return CURATED_TOKENS.filter((t) => t.native || Boolean(t.sac))
}

/**
 * Reverse lookup: curated metadata for an ERC20 address (undefined if not curated). Used by
 * the indexer to label/format a deposit recovered from chain.
 */
export function tokenBySac(sac: string): TokenMeta | undefined {
  return CURATED_TOKENS.find((t) => t.sac === sac)
}

import { readContract } from '@wagmi/core'
import { wagmiConfig } from './wagmi'
import { erc20Abi } from 'viem'

/**
 * Resolve a custom token from its EVM contract address (`0x...`), querying the token's
 * `decimals` and `symbol` so the deposit uses the right units and label.
 */
export async function resolveCustomToken(sacAddress: string): Promise<TokenMeta> {
  const sac = sacAddress.trim()
  if (!/^0x[a-fA-F0-9]{40}$/.test(sac)) {
    throw new Error('Enter a valid ERC20 contract address — starts with "0x".')
  }
  try {
    const decimals = await readContract(wagmiConfig, {
      address: sac as `0x${string}`,
      abi: erc20Abi,
      functionName: 'decimals',
    })
    const symbol = await readContract(wagmiConfig, {
      address: sac as `0x${string}`,
      abi: erc20Abi,
      functionName: 'symbol',
    })

    return {
      code: symbol,
      name: symbol,
      icon: symbol,
      sac,
      decimals,
      priceUsd: 0,
    }
  } catch (e) {
    throw new Error('Failed to resolve ERC20 token at that address.')
  }
}
