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
import type { Config } from '@wagmi/core'
import { decodeAbiParameters, erc20Abi, type AbiEvent, type Address, type PublicClient } from 'viem'
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

/**
 * Bentuk argumen event Aqua, ditulis eksplisit.
 *
 * Tanda tangan event-nya di-resolve saat RUNTIME dari ABI resmi SDK, jadi viem
 * tidak bisa menyimpulkan tipe `args`-nya — dan tanpa deklarasi ini seluruh
 * pembacaan log jatuh ke `any`. Akibatnya bukan teoretis: salah ketik
 * `args.strategyhash` akan diam-diam bernilai `undefined`, dan yang memutuskan
 * pasar mana yang hidup adalah kode ini.
 *
 * Field-nya disalin dari `IAqua.sol`; kalau kontraknya bergerak, yang gagal
 * lebih dulu adalah `aquaEvent()` di atas — ia melempar kalau nama event-nya
 * hilang dari ABI.
 */
interface ShippedArgs {
  maker: string
  app: string
  strategyHash: `0x${string}`
  strategy: `0x${string}`
}
interface DockedArgs {
  maker: string
  app: string
  strategyHash: `0x${string}`
}
interface TransferArgs {
  maker: string
  app: string
  strategyHash: `0x${string}`
  token: string
  amount: bigint
}

/** Log dengan `args` yang sudah diurai viem. */
type AquaLog<A> = { args: A; blockNumber: bigint; transactionHash: `0x${string}` }

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
  /** Asal posisi: meja kita, router resmi 1inch, atau app tim lain. */
  source: AppSource
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
  const results = await readContracts(wagmiConfig as Config, {
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
  /** Asal posisi: meja kita, router resmi 1inch, atau app tim lain. */
  source: AppSource
}

/**
 * App yang kita tampilkan: router kita sendiri, dan router SwapVM resmi.
 *
 * Yang resmi dimasukkan karena di sanalah market maker sungguhan berada — di
 * Base mainnet posisinya nyata dan formatnya sama persis dengan yang dirakit
 * encoder kita. Tanpa ini, halaman Markets di rantai publik selalu kosong,
 * karena router kita belum ter-deploy di mana pun.
 */
/** Dari mana sebuah posisi berasal. */
export type AppSource = 'ours' | 'official' | 'other'

/**
 * Menggolongkan app sebuah posisi, TANPA menyaringnya.
 *
 * Sebelumnya fungsi ini daftar putih: hanya router kita dan router SwapVM resmi
 * yang lolos, sisanya dibuang diam-diam. Itu masuk akal saat kita memakai
 * registry Aqua sendiri, karena isinya memang cuma posisi kita.
 *
 * Sejak meja pindah ke registry Aqua RESMI, daftar putih itu justru membuang
 * hal yang paling menarik: pada satu jendela pengukuran ada 37 posisi aktif
 * dari 11 maker dan 12 app berbeda di sana, dan kita cuma menampilkan satu.
 * Registry itu memang milik bersama — `Shipped` memancarkan seluruh `Order`,
 * jadi posisi siapa pun bisa dibaca dan dihargai tanpa izin.
 *
 * Yang tetap dijaga: ASALNYA disebut terang-terangan. Menampilkan posisi maker
 * lain seolah milik meja kita akan menyesatkan, dan hanya posisi di router kita
 * yang benar-benar bisa diisi dari aplikasi ini.
 */
export function appSource(app: string): AppSource {
  const a = app.toLowerCase()
  const ours = SWAP_VM_ROUTER_ADDRESS.toLowerCase()
  if (/^0x[0-9a-f]{40}$/.test(ours) && BigInt(ours) !== 0n && a === ours) return 'ours'
  if (a === OFFICIAL_SWAP_VM_ROUTER.toLowerCase()) return 'official'
  return 'other'
}

/**
 * Menyapu log dalam potongan.
 *
 * RPC publik menolak rentang di atas 10.000 blok — dan pesannya,
 * `eth_getLogs is limited to a 10,000 range`, menyesatkan karena terdengar
 * seperti masalah jaringan. Anvil tidak punya batas itu, tapi jalur yang sama
 * dipakai supaya yang diuji lokal adalah yang berjalan di produksi.
 */
async function scanLogs<A>(
  client: PublicClient,
  event: unknown,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<AquaLog<A>[]> {
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
  const readOnce = (from: bigint, to: bigint) =>
    client.getLogs({
      address: AQUA_ADDRESS as Address,
      event: event as AbiEvent,
      fromBlock: from,
      toBlock: to,
    }) as Promise<AquaLog<A>[]>

  const fetchRange = async ([from, to]: [bigint, bigint]): Promise<AquaLog<A>[]> => {
    let lastError: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const found = await readOnce(from, to)

        /**
         * Hasil KOSONG tidak langsung dipercaya.
         *
         * Percobaan-ulang di atas hanya menangkap kegagalan yang MELEMPAR. Ada
         * mode gagal yang lebih jahat: RPC publik menjawab `200 OK` dengan array
         * kosong padahal lognya ada. Diukur di Sepolia — enam permintaan
         * identik ke endpoint yang sama, berurutan, mengembalikan 11, 11, 11,
         * 11, 0, 11. Sekitar satu dari tiga jawaban bohong, tanpa satu pun
         * error yang bisa ditangkap.
         *
         * Akibatnya persis yang terlihat pengguna: halaman Markets menulis
         * "No active markets yet" pada rantai yang punya posisi hidup, dan tidak
         * ada apa pun di layar yang menunjukkan itu keliru.
         *
         * Kosong itu satu-satunya jawaban yang kita ragukan, dan itulah yang
         * membuat pemeriksaan ini murah: ia hanya berbiaya saat memang tidak ada
         * apa-apa — kasus di mana halamannya toh sedang menunggu. Arah gagalnya
         * juga cuma satu; RPC menjatuhkan log, tidak pernah mengarangnya. Jadi
         * satu jawaban tidak-kosong sudah cukup untuk menyanggah.
         *
         * Enam kali, bukan dua. Diukur pada endpoint yang sama: `Shipped`
         * kosong 6 dari 10 kali, `Docked` 4 dari 10. Pada tingkat 0,6 dua
         * pemeriksaan ulang menyisakan 22% pemuatan yang tetap salah — masih
         * cukup sering untuk terlihat rusak. Enam menekannya ke bawah 5%.
         *
         * Memperkecil potongan blok TIDAK menolong, dan itu sudah dicoba:
         * jendela 1.000 blok mengembalikan dua log padahal cuma satu yang ada
         * di dalamnya. Jawabannya tidak berhubungan dengan rentang yang diminta,
         * jadi ini bukan soal ukuran permintaan.
         */
        if (found.length > 0) return found
        for (let recheck = 0; recheck < 6; recheck++) {
          await new Promise((r) => setTimeout(r, 200 + recheck * 100))
          const again = await readOnce(from, to)
          if (again.length > 0) return again
        }
        return found
      } catch (e) {
        lastError = e
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    throw new Error(`Failed to read logs for blocks ${from}–${to}: ${String(lastError).slice(0, 120)}`)
  }

  const out: AquaLog<A>[] = []
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

  const client = getPublicClient(wagmiConfig as Config, { chainId: ACTIVE_CHAIN_ID })
  if (!client) return []

  const latest = await client.getBlockNumber()
  const fromBlock =
    MARKETS_LOOKBACK_BLOCKS > 0
      ? latest > BigInt(MARKETS_LOOKBACK_BLOCKS)
        ? latest - BigInt(MARKETS_LOOKBACK_BLOCKS)
        : 0n
      : BigInt(POOL_DEPLOY_BLOCK)

  const wanted = maker?.toLowerCase()

  const shipped = await scanLogs<ShippedArgs>(client, SHIPPED, fromBlock, latest)
  const pushed = await scanLogs<TransferArgs>(client, PUSHED, fromBlock, latest)
  const docked = await scanLogs<DockedArgs>(client, DOCKED, fromBlock, latest)

  /**
   * Tiga sapuan itu harus konsisten satu sama lain, dan kalau tidak, RPC-nya
   * yang salah — bukan rantainya.
   *
   * `Pushed` dan `Docked` mustahil ada tanpa `Shipped` di jendela yang sama:
   * keduanya menunjuk `strategyHash` yang hanya bisa lahir dari `ship()`.
   * Jadi kombinasi ini adalah bukti langsung bahwa sapuan `Shipped` menerima
   * jawaban kosong yang bohong, walaupun semua percobaan ulang di atas sudah
   * habis.
   *
   * Dilempar, bukan dikembalikan sebagai daftar kosong. "Tidak ada market" dan
   * "aku tidak berhasil membaca" adalah dua kalimat yang sangat berbeda, dan
   * yang pertama membuat orang menyimpulkan aplikasinya belum dipakai siapa
   * pun. Halaman Markets sudah punya tempat untuk menampilkan galat.
   */
  if (shipped.length === 0 && pushed.length + docked.length > 0) {
    throw new Error(
      'The RPC returned inconsistent logs: swap and close events exist, but no position events. ' +
        'This endpoint drops results silently — set VITE_RPC_URL to a more reliable one and reload.',
    )
  }

  // `strategyHash` unik lintas app, jadi daftar tutup tidak perlu disaring per
  // app lagi — dan menyaringnya justru berbahaya sekarang: posisi tim lain yang
  // sudah di-dock akan tampil sebagai hidup kalau event `Docked`-nya dibuang.
  const closed = new Set(docked.map((l) => l.args.strategyHash as string))

  const strategies = new Map<string, ActiveStrategy>()
  for (const log of shipped) {
    const appAddr = (log.args.app as string)?.toLowerCase()
    const hash = log.args.strategyHash as `0x${string}`
    const owner = log.args.maker as string
    if (closed.has(hash)) continue
    if (wanted && owner.toLowerCase() !== wanted) continue
    strategies.set(hash, {
      hash,
      maker: owner,
      tokens: new Set(),
      app: appAddr,
      source: appSource(appAddr),
      strategy: log.args.strategy as `0x${string}`,
    })
  }
  for (const log of pushed) {
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
  const client = getPublicClient(wagmiConfig as Config, { chainId: ACTIVE_CHAIN_ID })
  if (!client) return []

  const latest = await client.getBlockNumber()
  const fromBlock =
    MARKETS_LOOKBACK_BLOCKS > 0
      ? latest > BigInt(MARKETS_LOOKBACK_BLOCKS)
        ? latest - BigInt(MARKETS_LOOKBACK_BLOCKS)
        : 0n
      : BigInt(POOL_DEPLOY_BLOCK)

  const pulled = await scanLogs<TransferArgs>(client, PULLED, fromBlock, latest)
  const pushed = await scanLogs<TransferArgs>(client, PUSHED, fromBlock, latest)

  const mine = (l: AquaLog<TransferArgs>) =>
    l.args.strategyHash?.toLowerCase() === strategyHash.toLowerCase()

  const byTx = new Map<string, { block: bigint; out?: [string, bigint]; in?: [string, bigint] }>()
  for (const l of (pulled).filter(mine)) {
    byTx.set(l.transactionHash, {
      block: l.blockNumber,
      out: [l.args.token.toLowerCase(), l.args.amount],
    })
  }
  for (const l of (pushed).filter(mine)) {
    const entry = byTx.get(l.transactionHash)
    // Tanpa `Pulled` di transaksi yang sama, ini `ship()` — bukan swap.
    if (!entry) continue
    entry.in = [l.args.token.toLowerCase(), l.args.amount]
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

  /**
   * Saldo seluruh posisi dibaca dalam SATU multicall.
   *
   * Versi sebelumnya menunggu satu panggilan per token, berurutan. Dengan satu
   * posisi itu tidak terasa; dengan 37 posisi milik 11 maker di registry resmi
   * itu 74 perjalanan bolak-balik dan belasan detik layar kosong. Metadata token
   * juga di-dedup lebih dulu — pasangan yang sama muncul di banyak posisi, dan
   * tanpa dedup token yang sama dibaca berulang kali.
   */
  const wantedReads: { s: ActiveStrategy; token: string }[] = []
  for (const st of strategies) for (const token of st.tokens) wantedReads.push({ s: st, token })

  const unknown = [...new Set(wantedReads.map((w) => w.token))].filter((t) => !listed[t])
  const resolved = new Map<string, TokenInfo>()
  for (const t of unknown) resolved.set(t, await readTokenOnChain(t))
  const metaOf = (t: string) => listed[t] ?? resolved.get(t)!

  const balances = await readContracts(wagmiConfig as Config, {
    contracts: wantedReads.map((w) => ({
      address: AQUA_ADDRESS as Address,
      abi: aquaBalancesAbi,
      functionName: 'rawBalances',
      // App-nya per posisi, bukan router kita: saldo posisi milik app lain
      // hanya terbaca kalau ditanyakan dengan app-nya sendiri.
      args: [w.s.maker as Address, w.s.app as Address, w.s.hash, w.token as Address],
      chainId: ACTIVE_CHAIN_ID,
    })),
  })

  const perStrategy = new Map<string, MarketLeg[]>()
  const dockedOnChain = new Set<string>()
  /**
   * Posisi yang gagal dibaca DILEWATI, tidak ditampilkan dengan saldo nol.
   *
   * Dulu satu pembacaan gagal melempar dan menjatuhkan seluruh halaman. Itu
   * benar saat semua posisi milik kita sendiri. Sekarang daftarnya memuat posisi
   * tim lain dengan token yang tidak kita kenal, dan satu token aneh tidak boleh
   * mengosongkan papan untuk semua orang.
   *
   * Yang TIDAK berubah: gagal baca tidak pernah menjadi nol. Nol sungguhan dan
   * nol karena panggilan gagal terlihat sama persis di layar, dan yang kedua
   * membuat orang menyimpulkan likuiditasnya habis padahal tidak.
   */
  const unreadable = new Set<string>()

  for (const [i, w] of wantedReads.entries()) {
    const r = balances[i]
    if (r.status !== 'success') { unreadable.add(w.s.hash); continue }
    const [amount, tokensCount] = r.result as readonly [bigint, number]
    if (tokensCount === DOCKED_MARKER) { dockedOnChain.add(w.s.hash); continue }
    const legs = perStrategy.get(w.s.hash) ?? []
    legs.push({ ...metaOf(w.token), address: w.token, balance: amount })
    perStrategy.set(w.s.hash, legs)
  }

  const markets: Market[] = []
  for (const { hash: strategyHash, maker, app, source } of strategies) {
    if (dockedOnChain.has(strategyHash) || unreadable.has(strategyHash)) continue
    const legs = perStrategy.get(strategyHash)
    if (!legs || legs.length === 0) continue
    legs.sort((a, b) => a.symbol.localeCompare(b.symbol))
    markets.push({ strategyHash, maker, app, source, legs, pair: legs.map((l) => l.symbol).join(' / ') })
  }

  /**
   * Yang bisa DIPAKAI naik ke atas, baru yang punya likuiditas.
   *
   * Urutannya penting sejak papan ini memuat posisi tim lain: dari 37 baris,
   * hanya yang di router kita yang benar-benar bisa diisi dari aplikasi ini.
   * Tanpa aturan pertama, satu-satunya baris yang bisa ditukar terkubur di
   * tengah selusin posisi yang cuma bisa dibaca.
   *
   * Posisi yang terdaftar tapi sudah terkuras tetap ditampilkan — itu keadaan
   * nyata di rantai, bukan galat — tapi tidak berguna buat orang yang datang
   * untuk menukar, jadi ia turun.
   */
  const bisaDiisi = (m: Market) => Number(m.source === 'ours')
  const punyaLikuiditas = (m: Market) => Number(m.legs.some((l) => l.balance > 0n))
  markets.sort(
    (a, b) => bisaDiisi(b) - bisaDiisi(a) || punyaLikuiditas(b) - punyaLikuiditas(a),
  )

  return markets
}
