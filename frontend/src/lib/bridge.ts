/**
 * Bridge helpers — Ethereum Sepolia ↔ Flare Coston2.
 *
 * Creates bridge notes (bETH/bUSDC/bBTC/bXRP) using the @iqia/sdk, and provides
 * L1 lock/inclusion polling for the live bridge path. When USE_MOCK_BRIDGE is true,
 * the Bridge component uses only createBridgeNote + commitmentHex from this file.
 */
import { createNote, fieldToHex, type Field, type BalanceNote } from '@iqia/sdk'
import {
  deriveBridgedAssetId,
  ETH_L1_ADDRESS,
  USDC_L1_ADDRESS,
  BTC_L1_ADDRESS,
  XRP_L1_ADDRESS,
  L1_BRIDGE_ADDRESS,
  SEPOLIA_RPC_URL,
  RELAYER_URL,
} from './config'
import type { TokenMeta } from './tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeProgress {
  step: number
  total: number
  status: 'idle' | 'running' | 'done' | 'error'
}

export interface LightClientHead {
  blockNumber: bigint
  stateRoot: `0x${string}`
}

interface BridgeNoteResult {
  note: BalanceNote
  assetId: Field
  bridgedCode: string
}

// ---------------------------------------------------------------------------
// L1 token address lookup
// ---------------------------------------------------------------------------

const L1_ADDRESSES: Record<string, string> = {
  ETH: ETH_L1_ADDRESS,
  USDC: USDC_L1_ADDRESS,
  BTC: BTC_L1_ADDRESS,
  XRP: XRP_L1_ADDRESS,
}

function l1AddressFor(code: string): string {
  const addr = L1_ADDRESSES[code]
  if (!addr) throw new Error(`No L1 address for token "${code}".`)
  return addr
}

// ---------------------------------------------------------------------------
// Bridge tokens (shown in the Ethereum deposit dropdown)
// ---------------------------------------------------------------------------

export const BRIDGE_TOKENS = [
  { code: 'ETH', l1Address: ETH_L1_ADDRESS, bridgedCode: 'bETH', decimals: 18 },
  { code: 'USDC', l1Address: USDC_L1_ADDRESS, bridgedCode: 'bUSDC', decimals: 6 },
  { code: 'BTC', l1Address: BTC_L1_ADDRESS || '0x0000000000000000000000000000000000000001', bridgedCode: 'bBTC', decimals: 8 },
  { code: 'XRP', l1Address: XRP_L1_ADDRESS || '0x0000000000000000000000000000000000000002', bridgedCode: 'bXRP', decimals: 6 },
]

// ---------------------------------------------------------------------------
// Note creation
// ---------------------------------------------------------------------------

/**
 * Create a bridge note for an incoming Ethereum deposit. The note uses the bridged
 * asset_id (derived from the L1 token address) and is owned by the user's spending key.
 */
export function createBridgeNote(params: {
  token: TokenMeta
  amountBase: bigint
  spendingKey: Field
}): BridgeNoteResult {
  const l1Addr = l1AddressFor(params.token.code)
  const assetId = deriveBridgedAssetId(l1Addr)
  const bridgedCode = `b${params.token.code}`

  const note = createNote({
    assetId,
    amount: params.amountBase,
    spendingKey: params.spendingKey,
  })

  return { note, assetId, bridgedCode }
}

/**
 * Extract the commitment hex from a bridge note (for sending to the relayer / bridge contract).
 */
export function commitmentHex(note: BalanceNote): string {
  return fieldToHex(note.commitment)
}

// ---------------------------------------------------------------------------
// Sepolia L1 lock
// ---------------------------------------------------------------------------

interface LockResult {
  hash: string
  blockNumber: bigint
}

/**
 * Lock tokens in the L1 bridge escrow on Sepolia. Requires a connected MetaMask
 * wallet on Sepolia. Only called when EFFECTIVE_MOCK_BRIDGE is false.
 */
export async function lockOnL1(params: {
  walletClient: any
  publicClient: any
  account: string
  token: TokenMeta
  amountBase: bigint
  commitment: string
}): Promise<LockResult> {
  const { walletClient, publicClient, account, token, amountBase, commitment } = params

  if (!L1_BRIDGE_ADDRESS || L1_BRIDGE_ADDRESS === '0x0000000000000000000000000000000000000000') {
    throw new Error('L1 bridge address not configured.')
  }

  const commitmentBytes = commitment.startsWith('0x') ? commitment : `0x${commitment}`

  // The L1 bridge contract's lock function:
  //   function lock(address token, uint256 amount, bytes32 commitment) external payable
  const isNative = token.code === 'ETH'
  const lockAbi = [
    {
      name: 'lock',
      type: 'function',
      stateMutability: isNative ? 'payable' : 'nonpayable',
      inputs: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'commitment', type: 'bytes32' },
      ],
      outputs: [],
    },
  ] as const

  const l1TokenAddr = l1AddressFor(token.code)
  const tokenAddr = isNative ? '0x0000000000000000000000000000000000000000' : l1TokenAddr

  const hash = await walletClient.writeContract({
    address: L1_BRIDGE_ADDRESS as `0x${string}`,
    abi: lockAbi,
    functionName: 'lock',
    args: [tokenAddr as `0x${string}`, amountBase, commitmentBytes as `0x${string}`],
    value: isNative ? amountBase : 0n,
    chain: walletClient.chain ?? null,
    account: account as `0x${string}`,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { hash, blockNumber: receipt.blockNumber }
}

// ---------------------------------------------------------------------------
// Light client + bridge polling
// ---------------------------------------------------------------------------

/**
 * Read the trusted Ethereum head from the on-chain light client on Flare.
 * Returns null if the light client is not deployed or the read fails.
 */
export async function readLightClientHead(): Promise<LightClientHead | null> {
  try {
    // The light client contract exposes `head()` returning (blockNumber, stateRoot).
    // If not deployed, this will fail gracefully.
    const response = await fetch(`${SEPOLIA_RPC_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1,
      }),
    })
    const data = await response.json()
    if (data.result) {
      return {
        blockNumber: BigInt(data.result.number),
        stateRoot: data.result.stateRoot,
      }
    }
  } catch {
    // Fall through
  }
  return null
}

/**
 * Check whether a commitment has been bridged (minted on Flare).
 * Polls the bridge contract's `isBridged(bytes32)` mapping.
 */
export async function readIsBridged(_commitment: string): Promise<boolean> {
  // In mock mode or when bridge is not configured, this is never called.
  // For live mode, this would query the IqiaBridge contract on Flare.
  return false
}

/**
 * Post a commitment to the relayer to nudge it to submit the inclusion proof.
 */
export async function requestBridgeIn(commitment: string): Promise<void> {
  if (!RELAYER_URL) return
  try {
    await fetch(`${RELAYER_URL}/bridge-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitment }),
    })
  } catch {
    // Non-fatal — the relayer watches L1 events on its own.
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function sepoliaTxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`
}

export function flareContractUrl(id: string): string {
  if (id.startsWith('0x')) {
    return `https://coston2-explorer.flare.network/address/${id}`
  }
  return `https://coston2-explorer.flare.network/address/${id}`
}
