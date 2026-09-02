/**
 * Daftar market yang tersedia.
 *
 * Sumbernya dua:
 *   1. Rantai — posisi Aqua yang di-`ship()` ke router Iqia. Ini market yang
 *      benar-benar bisa diperdagangkan sekarang, lengkap dengan likuiditasnya.
 *   2. Daftar token 1inch — metadata simbol, nama, dan logo.
 *
 * Yang menentukan ada tidaknya market adalah rantai, bukan daftar token. Daftar
 * 1inch hanya memperindah tampilannya; token yang tidak dikenalinya tetap muncul
 * dengan data yang dibaca langsung dari kontraknya.
 */
import { getPublicClient, readContracts } from '@wagmi/core'
import { erc20Abi, parseAbiItem, type Address } from 'viem'

import { wagmiConfig } from './wagmi'
import { AQUA_ADDRESS, CHAIN_ID, POOL_DEPLOY_BLOCK, SWAP_VM_ROUTER_ADDRESS, AQUA_CONFIGURED } from './config'

const SHIPPED = parseAbiItem('event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)')
const PUSHED = parseAbiItem('event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount)')
const DOCKED = parseAbiItem('event Docked(address maker, address app, bytes32 strategyHash)')

const aquaBalancesAbi = [
  {
    type: 'function',
    name: 'rawBalances',
    stateMutability: 'view',
    inputs: [
      { name: 'maker', type: 'address' },
      { name: 'app', type: 'address' },
      { name: 'strategyHash', type: 'bytes32' },
      { name: 'token', type: 'address' },
    ],
    outputs: [
      { name: 'balance', type: 'uint248' },
      { name: 'tokensCount', type: 'uint8' },
    ],
  },
] as const

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  /** True kalau token ini ada di daftar resmi 1inch. */
  listed: boolean
}

export interface MarketLeg extends TokenInfo {
  /** Likuiditas yang tersedia sekarang, dalam satuan dasar token. */
  balance: bigint
}

export interface Market {
  strategyHash: string
  maker: string
  legs: MarketLeg[]
  /** Label pasangan, misalnya "WETH / USDC". */
  pair: string
}

// --- daftar token 1inch ---------------------------------------------------

let tokenListCache: Promise<Record<string, TokenInfo>> | null = null

/**
 * Daftar token resmi 1inch untuk chain aktif.
 *
 * Endpoint ini terbuka tanpa API key. Kalau tidak terjangkau, market tetap
 * tampil — hanya metadatanya yang dibaca langsung dari kontrak token.
 */
export function fetchOneInchTokens(): Promise<Record<string, TokenInfo>> {
  if (tokenListCache) return tokenListCache
  tokenListCache = fetch(`https://tokens.1inch.io/v1.2/${CHAIN_ID}`)
    .then((res) => (res.ok ? res.json() : {}))
    .then((raw: Record<string, { address: string; symbol: string; name: string; decimals: number; logoURI?: string }>) => {
      const out: Record<string, TokenInfo> = {}
      for (const [addr, t] of Object.entries(raw ?? {})) {
        out[addr.toLowerCase()] = { ...t, listed: true }
      }
      return out
    })
    .catch(() => ({}))
  return tokenListCache
}

// --- market dari rantai ---------------------------------------------------

/** Metadata token yang tidak ada di daftar 1inch, dibaca dari kontraknya. */
async function readTokenOnChain(address: string): Promise<TokenInfo> {
  const results = await readContracts(wagmiConfig as any, {
    contracts: [
      { address: address as Address, abi: erc20Abi, functionName: 'symbol' },
      { address: address as Address, abi: erc20Abi, functionName: 'name' },
      { address: address as Address, abi: erc20Abi, functionName: 'decimals' },
    ],
  })
  const [symbol, name, decimals] = results
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return {
    address,
    symbol: (symbol.result as string) ?? short,
    name: (name.result as string) ?? 'Token tidak dikenal',
    decimals: (decimals.result as number) ?? 18,
    listed: false,
  }
}

/**
 * Membaca market yang hidup dari rantai.
 *
 * Aqua tidak menyimpan daftar strategi, jadi susunannya direkonstruksi dari
 * event: `Pushed` memberi tahu token apa saja yang dipegang tiap strategi, dan
 * `Docked` menandai mana yang sudah ditutup. Event Aqua tidak ber-`indexed`,
 * jadi penyaringannya dilakukan di sini.
 */
export async function fetchMarkets(): Promise<Market[]> {
  if (!AQUA_CONFIGURED) return []

  const client = getPublicClient(wagmiConfig as any)
  if (!client) return []

  const fromBlock = BigInt(POOL_DEPLOY_BLOCK)
  const router = SWAP_VM_ROUTER_ADDRESS.toLowerCase()

  const [shipped, pushed, docked] = await Promise.all([
    client.getLogs({ address: AQUA_ADDRESS as Address, event: SHIPPED, fromBlock }),
    client.getLogs({ address: AQUA_ADDRESS as Address, event: PUSHED, fromBlock }),
    client.getLogs({ address: AQUA_ADDRESS as Address, event: DOCKED, fromBlock }),
  ])

  const closed = new Set(
    docked
      .filter((l) => (l.args.app as string)?.toLowerCase() === router)
      .map((l) => l.args.strategyHash as string),
  )

  // strategyHash -> { maker, token set }
  const strategies = new Map<string, { maker: string; tokens: Set<string> }>()
  for (const log of shipped) {
    const app = (log.args.app as string)?.toLowerCase()
    const hash = log.args.strategyHash as string
    if (app !== router || closed.has(hash)) continue
    strategies.set(hash, { maker: log.args.maker as string, tokens: new Set() })
  }
  for (const log of pushed) {
    const entry = strategies.get(log.args.strategyHash as string)
    if (entry) entry.tokens.add((log.args.token as string).toLowerCase())
  }

  const listed = await fetchOneInchTokens()

  const markets: Market[] = []
  for (const [strategyHash, { maker, tokens }] of strategies) {
    const legs: MarketLeg[] = []
    for (const token of tokens) {
      const meta = listed[token] ?? (await readTokenOnChain(token))
      const [balance] = (await readContracts(wagmiConfig as any, {
        contracts: [{
          address: AQUA_ADDRESS as Address,
          abi: aquaBalancesAbi,
          functionName: 'rawBalances',
          args: [maker as Address, SWAP_VM_ROUTER_ADDRESS as Address, strategyHash as `0x${string}`, token as Address],
        }],
      }))
      const raw = (balance.result as readonly [bigint, number] | undefined)?.[0] ?? 0n
      legs.push({ ...meta, address: token, balance: raw })
    }
    if (legs.length === 0) continue
    legs.sort((a, b) => a.symbol.localeCompare(b.symbol))
    markets.push({ strategyHash, maker, legs, pair: legs.map((l) => l.symbol).join(' / ') })
  }

  return markets
}
