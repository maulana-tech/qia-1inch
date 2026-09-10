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
import { decodeAbiParameters, erc20Abi, type Address } from 'viem'
import { ABI } from '@1inch/aqua-sdk'

import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'
import {
  AQUA_ADDRESS,
  AQUA_CONFIGURED,
  CHAIN_ID,
  LOGS_CHUNK_BLOCKS,
  MARKETS_LOOKBACK_BLOCKS,
  OFFICIAL_SWAP_VM_ROUTER,
  POOL_DEPLOY_BLOCK,
  SWAP_VM_ROUTER_ADDRESS,
} from './config'

/**
 * Tanda tangan event diambil dari ABI resmi `@1inch/aqua-sdk`.
 *
 * Sebelumnya ditulis ulang di sini lewat `parseAbiItem`. Sudah dicocokkan dan
 * sama persis — tapi salinan tanda tangan adalah hal yang diam-diam basi begitu
 * kontraknya bergerak, dan gejalanya nanti cuma daftar market yang kosong tanpa
 * satu pun error.
 *
 * SDK juga menyediakan `ShippedEvent.fromLog` untuk mengurai, tapi `getLogs`
 * viem sudah mengurai sendiri begitu diberi item event-nya, jadi memakainya
 * cuma menambah lapisan tanpa menambah kepastian.
 */
function aquaEvent(name: 'Shipped' | 'Pushed' | 'Docked' | 'Pulled') {
  const found = ABI.AQUA_ABI.find((x) => x.type === 'event' && x.name === name)
  if (!found) throw new Error(`Event ${name} is missing from the official Aqua ABI`)
  return found
}

const SHIPPED = aquaEvent('Shipped')
const PUSHED = aquaEvent('Pushed')
const DOCKED = aquaEvent('Docked')
const PULLED = aquaEvent('Pulled')

/** ABI Aqua resmi, dipakai juga untuk pembacaan saldo. */
const aquaBalancesAbi = ABI.AQUA_ABI

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
  /** Aqua app yang menaungi posisi ini. */
  app: string
  /** True kalau likuiditas ini milik router SwapVM resmi, bukan meja kita. */
  official: boolean
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
      { address: address as Address, abi: erc20Abi, functionName: 'symbol', chainId: ACTIVE_CHAIN_ID },
      { address: address as Address, abi: erc20Abi, functionName: 'name', chainId: ACTIVE_CHAIN_ID },
      { address: address as Address, abi: erc20Abi, functionName: 'decimals', chainId: ACTIVE_CHAIN_ID },
    ],
  })
  const [symbol, name, decimals] = results
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return {
    address,
    symbol: (symbol.result as string) ?? short,
    name: (name.result as string) ?? 'Unknown token',
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
export interface ActiveStrategy {
  hash: `0x${string}`
  maker: string
  tokens: Set<string>
  /**
   * Byte strategi apa adanya, dari event `Shipped`.
   *
   * Ini yang membuat posisi orang lain bisa dikutip harganya: `quote()` menuntut
   * `Order` utuh, bukan `strategyHash`. Aqua memancarkannya di event, jadi
   * strategi siapa pun bisa dibaca dan dihargai tanpa izin apa pun.
   */
  strategy: `0x${string}`
  /** Aqua app yang menaungi posisi ini. */
  app: string
  /** True kalau app-nya router SwapVM resmi 1inch, bukan router kita. */
  official: boolean
}

/**
 * App yang kita tampilkan: router kita sendiri, dan router SwapVM resmi.
 *
 * Yang resmi dimasukkan karena di sanalah market maker sungguhan berada — di
 * Base mainnet posisinya nyata dan formatnya sama persis dengan yang dirakit
 * encoder kita. Tanpa ini, halaman Markets di rantai publik selalu kosong,
 * karena router kita belum ter-deploy di mana pun.
 */
function knownApps(): { address: string; official: boolean }[] {
  const apps: { address: string; official: boolean }[] = []
  const ours = SWAP_VM_ROUTER_ADDRESS.toLowerCase()
  // Alamat nol berarti router kita belum ter-deploy di rantai ini. Memasukkannya
  // akan mencocokkan app kosong dan menampilkan posisi yang bukan milik siapa pun.
  if (/^0x[0-9a-f]{40}$/.test(ours) && BigInt(ours) !== 0n) {
    apps.push({ address: ours, official: false })
  }
  const official = OFFICIAL_SWAP_VM_ROUTER.toLowerCase()
  if (!apps.some((a) => a.address === official)) apps.push({ address: official, official: true })
  return apps
}

/**
 * Menyapu log dalam potongan.
 *
 * RPC publik menolak rentang di atas 10.000 blok — dan pesannya,
 * `eth_getLogs is limited to a 10,000 range`, menyesatkan karena terdengar
 * seperti masalah jaringan. Anvil tidak punya batas itu, tapi jalur yang sama
 * dipakai supaya yang diuji lokal adalah yang berjalan di produksi.
 */
async function scanLogs(
  client: any,
  event: unknown,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<any[]> {
  const chunk = BigInt(Math.max(1, LOGS_CHUNK_BLOCKS))
  const ranges: [bigint, bigint][] = []
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = start + chunk - 1n
    ranges.push([start, end > toBlock ? toBlock : end])
  }

  /**
   * Kegagalan satu potongan TIDAK boleh ditelan diam-diam.
   *
   * Versi pertama fungsi ini memakai `.catch(() => [])`, dan akibatnya nyata:
   * satu potongan `Docked` yang hilang membuat posisi yang sudah ditutup tampil
   * sebagai market hidup. Data yang salah disajikan sebagai fakta lebih buruk
   * daripada halaman yang mengaku gagal.
   */
  const fetchRange = async ([from, to]: [bigint, bigint]): Promise<any[]> => {
    let lastError: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await client.getLogs({
          address: AQUA_ADDRESS as Address,
          event: event as any,
          fromBlock: from,
          toBlock: to,
        })
      } catch (e) {
        lastError = e
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    throw new Error(`Failed to read logs for blocks ${from}–${to}: ${String(lastError).slice(0, 120)}`)
  }

  const out: any[] = []
  // Dua sekaligus, bukan empat. RPC publik Base membatasi jauh lebih cepat dari
  // dugaan: tiga sapuan event yang berjalan serentak, masing-masing empat
  // paralel, berarti dua belas permintaan sekali tembak — dan itu langsung
  // ditolak. Sapuannya juga dijalankan berurutan di pemanggil, bukan Promise.all.
  for (let i = 0; i < ranges.length; i += 2) {
    const batch = await Promise.all(ranges.slice(i, i + 2).map(fetchRange))
    for (const logs of batch) out.push(...logs)
    if (i + 2 < ranges.length) await new Promise((r) => setTimeout(r, 120))
  }
  return out
}

/**
 * Strategi yang masih hidup di router ini, hasil rekonstruksi dari event.
 *
 * Dipisah dari `fetchMarkets` karena posisi milik satu orang juga perlu dicari
 * lewat jalan ini. Menghitung ulang `strategyHash` dari salt tetap TIDAK bisa
 * dipakai: Aqua menandai strategi yang sudah di-`dock` sebagai `0xff` sementara
 * `ship` menuntut `0`, jadi satu hash cuma sah sekali seumur hidup dan salt
 * harus baru tiap kali membuka posisi.
 */
export async function fetchActiveStrategies(maker?: string): Promise<ActiveStrategy[]> {
  if (!AQUA_CONFIGURED) return []

  const client = getPublicClient(wagmiConfig as any, { chainId: ACTIVE_CHAIN_ID as any })
  if (!client) return []

  const latest = await client.getBlockNumber()
  const fromBlock =
    MARKETS_LOOKBACK_BLOCKS > 0
      ? latest > BigInt(MARKETS_LOOKBACK_BLOCKS)
        ? latest - BigInt(MARKETS_LOOKBACK_BLOCKS)
        : 0n
      : BigInt(POOL_DEPLOY_BLOCK)

  const apps = knownApps()
  const appOf = new Map(apps.map((a) => [a.address, a]))
  const wanted = maker?.toLowerCase()

  const shipped = await scanLogs(client, SHIPPED, fromBlock, latest)
  const pushed = await scanLogs(client, PUSHED, fromBlock, latest)
  const docked = await scanLogs(client, DOCKED, fromBlock, latest)

  const closed = new Set(
    docked
      .filter((l: any) => appOf.has((l.args.app as string)?.toLowerCase()))
      .map((l: any) => l.args.strategyHash as string),
  )

  const strategies = new Map<string, ActiveStrategy>()
  for (const log of shipped as any[]) {
    const appAddr = (log.args.app as string)?.toLowerCase()
    const known = appOf.get(appAddr)
    const hash = log.args.strategyHash as `0x${string}`
    const owner = log.args.maker as string
    if (!known || closed.has(hash)) continue
    if (wanted && owner.toLowerCase() !== wanted) continue
    strategies.set(hash, {
      hash,
      maker: owner,
      tokens: new Set(),
      app: appAddr,
      official: known.official,
      strategy: log.args.strategy as `0x${string}`,
    })
  }
  for (const log of pushed as any[]) {
    const entry = strategies.get(log.args.strategyHash as string)
    if (entry) entry.tokens.add((log.args.token as string).toLowerCase())
  }
  return [...strategies.values()]
}

/** Bentuk `Order` seperti yang dikodekan `abi.encode` di Solidity. */
const ORDER_TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'maker', type: 'address' },
      { name: 'traits', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
] as const

/**
 * Membongkar byte `Shipped` jadi `Order`-nya.
 *
 * `data` di dalamnya adalah program SwapVM apa adanya — itulah yang menentukan
 * perilaku posisi, dan satu-satunya cara mengenali JENIS sebuah posisi tanpa
 * bertanya ke siapa pun.
 *
 * Mengembalikan null kalau byte-nya bukan `Order`. Rantai publik berisi posisi
 * dari app lain yang formatnya bukan urusan kita, dan satu posisi asing tidak
 * boleh menjatuhkan seluruh daftar.
 */
export function decodeOrder(strategy: `0x${string}`) {
  try {
    const [order] = decodeAbiParameters(ORDER_TUPLE, strategy)
    return order
  } catch {
    return null
  }
}

/** Satu swap yang benar-benar lewat sebuah posisi. */
export interface PositionTrade {
  txHash: string
  blockNumber: bigint
  /** Token yang MASUK ke posisi — dibayar penukar. */
  tokenIn: string
  amountIn: bigint
  /** Token yang KELUAR dari dompet maker. */
  tokenOut: string
  amountOut: bigint
}

/**
 * Riwayat swap sebuah posisi, direkonstruksi dari `Pulled` dan `Pushed`.
 *
 * Ini pertanyaan pertama setiap market maker — "ada yang menukar lewat posisiku
 * belum?" — dan sampai sekarang aplikasinya tidak bisa menjawabnya sama sekali.
 *
 * `Pulled` menandai token yang keluar dari dompet maker; `Pushed` menandai yang
 * masuk. Keduanya dipasangkan lewat hash transaksi. `ship()` juga memancarkan
 * `Pushed` untuk tiap token, jadi transaksi tanpa `Pulled` dibuang — itu
 * pembukaan posisi, bukan swap.
 */
export async function fetchPositionTrades(strategyHash: string): Promise<PositionTrade[]> {
  if (!AQUA_CONFIGURED) return []
  const client = getPublicClient(wagmiConfig as any, { chainId: ACTIVE_CHAIN_ID as any })
  if (!client) return []

  const latest = await client.getBlockNumber()
  const fromBlock =
    MARKETS_LOOKBACK_BLOCKS > 0
      ? latest > BigInt(MARKETS_LOOKBACK_BLOCKS)
        ? latest - BigInt(MARKETS_LOOKBACK_BLOCKS)
        : 0n
      : BigInt(POOL_DEPLOY_BLOCK)

  const pulled = await scanLogs(client, PULLED, fromBlock, latest)
  const pushed = await scanLogs(client, PUSHED, fromBlock, latest)

  const mine = (l: any) => (l.args.strategyHash as string)?.toLowerCase() === strategyHash.toLowerCase()

  const byTx = new Map<string, { block: bigint; out?: [string, bigint]; in?: [string, bigint] }>()
  for (const l of (pulled as any[]).filter(mine)) {
    byTx.set(l.transactionHash, {
      block: l.blockNumber as bigint,
      out: [(l.args.token as string).toLowerCase(), l.args.amount as bigint],
    })
  }
  for (const l of (pushed as any[]).filter(mine)) {
    const entry = byTx.get(l.transactionHash)
    // Tanpa `Pulled` di transaksi yang sama, ini `ship()` — bukan swap.
    if (!entry) continue
    entry.in = [(l.args.token as string).toLowerCase(), l.args.amount as bigint]
  }

  const trades: PositionTrade[] = []
  for (const [txHash, v] of byTx) {
    if (!v.out || !v.in) continue
    trades.push({
      txHash,
      blockNumber: v.block,
      tokenIn: v.in[0],
      amountIn: v.in[1],
      tokenOut: v.out[0],
      amountOut: v.out[1],
    })
  }
  trades.sort((a, b) => Number(b.blockNumber - a.blockNumber))
  return trades
}

export async function fetchMarkets(): Promise<Market[]> {
  if (!AQUA_CONFIGURED) return []

  const strategies = await fetchActiveStrategies()
  const listed = await fetchOneInchTokens()

  /**
   * Penanda posisi tertutup di `rawBalances.tokensCount`.
   *
   * `dock()` menulis 0xff ke sana. Ini KEADAAN SEBENARNYA di rantai, tidak
   * seperti daftar dari event yang cuma sebaik jendela sapuan kita. Sebuah
   * posisi di Base sempat tampil sebagai market hidup padahal sudah ditutup,
   * karena event `Docked`-nya di luar jangkauan. Angka ini yang memutuskan.
   */
  const DOCKED_MARKER = 255

  const markets: Market[] = []
  for (const { hash: strategyHash, maker, tokens, app, official } of strategies) {
    const legs: MarketLeg[] = []
    let dockedOnChain = false
    for (const token of tokens) {
      const meta = listed[token] ?? (await readTokenOnChain(token))
      const [balance] = (await readContracts(wagmiConfig as any, {
        contracts: [{
          address: AQUA_ADDRESS as Address,
          abi: aquaBalancesAbi,
          functionName: 'rawBalances',
          // App-nya per posisi, bukan router kita: saldo posisi milik router
          // resmi hanya terbaca kalau ditanyakan dengan app-nya sendiri.
          args: [maker as Address, app as Address, strategyHash as `0x${string}`, token as Address],
          chainId: ACTIVE_CHAIN_ID,
        }],
      }))
      // Pembacaan yang GAGAL tidak boleh menjadi nol. Nol yang sungguhan dan
      // nol karena panggilan gagal terlihat sama persis di layar, dan yang
      // kedua membuat orang menyimpulkan likuiditasnya habis padahal tidak.
      //
      // Kasus nyatanya: di rantai yang mengaku Base Sepolia tapi tidak punya
      // Multicall3, viem tetap memakai multicall karena definisi rantainya
      // menyatakan ada — seluruh pembacaan gagal, dan halamannya menampilkan
      // market dengan saldo nol tanpa satu pun tanda ada yang salah.
      if (balance.status !== 'success') {
        throw new Error(
          `Failed to read the ${meta.symbol} balance for position ${strategyHash.slice(0, 10)}: ` +
            String(balance.error).slice(0, 120),
        )
      }
      const result = balance.result as readonly [bigint, number]
      if (result[1] === DOCKED_MARKER) {
        dockedOnChain = true
        break
      }
      legs.push({ ...meta, address: token, balance: result[0] })
    }
    if (dockedOnChain || legs.length === 0) continue
    legs.sort((a, b) => a.symbol.localeCompare(b.symbol))
    markets.push({ strategyHash, maker, app, official, legs, pair: legs.map((l) => l.symbol).join(' / ') })
  }

  // Yang masih punya likuiditas naik ke atas. Posisi terdaftar tapi sudah
  // terkuras habis tetap ditampilkan — itu keadaan nyata di rantai, bukan galat —
  // tapi tidak berguna buat orang yang datang untuk menukar.
  const punyaLikuiditas = (m: Market) => m.legs.some((l) => l.balance > 0n)
  markets.sort((a, b) => Number(punyaLikuiditas(b)) - Number(punyaLikuiditas(a)))

  return markets
}
