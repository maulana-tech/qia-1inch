/**
 * Posisi tabungan: sebagian saldo dompet bekerja sebagai likuiditas.
 *
 * # Kenapa tidak ada kontraknya
 *
 * Rancangan awalnya sebuah kontrak aturan tabungan dengan kunci waktu, meniru
 * YourSave. Itu tidak mungkin di atas Aqua, dan alasannya ada di `Aqua.sol`:
 * `ship()` dan `dock()` dua-duanya memakai `msg.sender` sebagai maker.
 *
 * Konsekuensinya dua, dan keduanya mematikan:
 *   - kontrak tidak bisa mengirim posisi atas nama pengguna, karena yang
 *     terkirim akan jadi saldo kontrak itu sendiri
 *   - kontrak tidak bisa mencegah pengguna menutup posisinya, karena `dock()`
 *     dipanggil langsung ke Aqua tanpa melewati siapa pun
 *
 * Kunci waktu di atas Aqua akan jadi pajangan. Jadi tidak ada kontrak baru di
 * sini — modul ini menyusun `ship()` dan `dock()` yang dipanggil dompet pengguna
 * sendiri, memakai router dan opcode yang sudah ada.
 *
 * Yang hilang: penegakan. Yang didapat: uangnya benar-benar tetap milik dan
 * kendali pengguna, yang memang inti Aqua.
 */
import { readContract, readContracts, writeContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import { erc20Abi, type Address } from 'viem'
import { buildOrder, encodeOrder, type Hex } from '@iqia/swapvm'
import {
  ABI,
  Address as AquaAddress,
  AquaProtocolContract,
  HexString,
} from '@1inch/aqua-sdk'

const { AQUA_ABI } = ABI

import { strategyProgram } from './strategies'
import { fetchPositionTrades } from './markets'
import { quote, swap } from './desk'

import type { Config } from '@wagmi/core'
import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'
import {
  AQUA_ADDRESS,
  SWAP_VM_ROUTER_ADDRESS,
  DESK_SURCHARGE_BPS,
  SAVINGS_FEE_BPS,
  DESK_CONFIGURED,
} from './config'

/**
 * ABI Aqua resmi dari `@1inch/aqua-sdk`.
 *
 * Sebelumnya ditulis tangan di sini. Sudah dibandingkan dan cocok, tapi ABI
 * salinan adalah hal yang diam-diam basi ketika kontraknya bergerak — dan
 * satu-satunya gejalanya nanti panggilan yang gagal tanpa sebab yang jelas.
 */
export const aquaAbi = AQUA_ABI

/** Pembungkus kontrak Aqua resmi, dibuat saat dipakai supaya alamatnya selalu terkini. */
function aquaContract(): AquaProtocolContract {
  return new AquaProtocolContract(new AquaAddress(AQUA_ADDRESS))
}

/** Basis basis-point SwapVM. 1e9, bukan 10_000. */
export const BPS = 1_000_000_000n

export interface SavingsRule {
  /** Bagian saldo dompet yang dijadikan likuiditas, dalam persen. */
  percent: number
  /** Pembeda posisi. Mengubahnya membuat posisi baru, bukan mengubah yang lama. */
  salt: bigint
}

/**
 * Program untuk posisi tabungan.
 *
 * Sengaja tidak memakai `ExclusiveFill`: tabungan pengguna biasa seharusnya bisa
 * diisi siapa saja, supaya fee-nya benar-benar mengalir. Gerbang eksklusif itu
 * untuk market maker yang punya kesepakatan dengan penyalur tertentu.
 *
 * `SolvencyGuard` justru penting di sini, dan inilah alasannya. Saldo tabungan
 * naik-turun karena pemiliknya membelanjakannya — persis keadaan yang membuat
 * `pull()` gagal mentah tanpa penjaga. Dengan penjaga, harga memburuk bertahap
 * saat saldo menipis, dan swap berukuran wajar tetap terlayani.
 *
 * Savings adalah strategi "Santai". Definisinya tinggal satu di
 * `lib/strategies.ts` supaya keduanya tidak bisa menyimpang — dulu program ini
 * berdiri sendiri dan sempat kehilangan `flatFeeIn` tanpa ada yang sadar.
 */
export function savingsProgram(saltValue: bigint): Hex {
  return strategyProgram('santai', {
    salt: saltValue,
    feeBps: SAVINGS_FEE_BPS,
    surchargeBps: DESK_SURCHARGE_BPS,
  })
}

export function savingsOrder(maker: string, saltValue: bigint) {
  const o = buildOrder({ maker, program: savingsProgram(saltValue) })
  return { maker: o.maker, traits: BigInt(o.traits), data: o.data, encoded: o } as const
}

export class SavingsNotConfiguredError extends Error {
  constructor() {
    super('Aqua is not configured. Set VITE_AQUA and VITE_SWAP_VM_ROUTER.')
  }
}

function requireConfigured() {
  if (!DESK_CONFIGURED) throw new SavingsNotConfiguredError()
}

/** Saldo dompet untuk sepasang token. */
export async function walletBalances(
  account: Address,
  tokenA: string,
  tokenB: string,
): Promise<[bigint, bigint]> {
  const res = await readContracts(wagmiConfig as Config, {
    contracts: [
      { address: tokenA as Address, abi: erc20Abi, functionName: 'balanceOf', args: [account], chainId: ACTIVE_CHAIN_ID },
      { address: tokenB as Address, abi: erc20Abi, functionName: 'balanceOf', args: [account], chainId: ACTIVE_CHAIN_ID },
    ],
  })
  return [(res[0].result as bigint) ?? 0n, (res[1].result as bigint) ?? 0n]
}

/** Berapa yang akan disisihkan untuk aturan ini. */
export function splitAmounts(
  balances: [bigint, bigint],
  percent: number,
): [bigint, bigint] {
  const pct = BigInt(Math.max(0, Math.min(100, Math.round(percent))))
  return [(balances[0] * pct) / 100n, (balances[1] * pct) / 100n]
}

/** Saldo virtual posisi di Aqua. Nol berarti belum dikirim atau sudah ditutup. */
/**
 * @param app Aqua app yang menaungi posisi ini. WAJIB dari posisinya sendiri,
 *   bukan dari config: papan Markets sekarang memuat posisi tim lain di router
 *   mereka, dan menanyakan saldo mereka dengan router KITA sebagai app selalu
 *   menghasilkan nol. Default-nya router kita, untuk pemanggil lama yang memang
 *   hanya berurusan dengan posisi sendiri.
 */
export async function positionBalances(
  maker: Address,
  strategyHash: Hex,
  tokenA: string,
  tokenB: string,
  app: string = SWAP_VM_ROUTER_ADDRESS,
): Promise<[bigint, bigint]> {
  // `safeBalances` membaca kedua kaki sekaligus DAN menolak kalau strateginya
  // tidak aktif — dua hal yang sebelumnya dikerjakan dua panggilan `rawBalances`
  // plus pemeriksaan `tokensCount` tulisan tangan.
  const res = (await readContract(wagmiConfig as Config, {
    address: AQUA_ADDRESS as Address,
    abi: aquaAbi,
    functionName: 'safeBalances',
    args: [maker, app as Address, strategyHash, tokenA as Address, tokenB as Address],
    chainId: ACTIVE_CHAIN_ID,
  })) as readonly [bigint, bigint]
  return [res[0], res[1]]
}

/**
 * Sama, tapi posisi yang tidak aktif dijawab nol alih-alih melempar.
 *
 * `safeBalances` menolak strategi yang belum dibuka atau sudah di-dock, dan itu
 * jawaban yang sah untuk halaman yang memang menanyakan "ada isinya tidak".
 *
 * Yang TIDAK boleh dipakai di sini: `catch` telanjang yang mengubah SETIAP
 * kegagalan jadi nol. Itu yang menyembunyikan bug alamat salah-kapitalisasi
 * selama satu putaran penuh — halaman menampilkan "0" dengan percaya diri
 * sementara rantainya menyimpan 20 WETH.
 */
export async function positionBalancesOrZero(
  maker: Address,
  strategyHash: Hex,
  tokenA: string,
  tokenB: string,
  app?: string,
): Promise<[bigint, bigint]> {
  try {
    return await positionBalances(maker, strategyHash, tokenA, tokenB, app)
  } catch (e) {
    if (String(e).includes('NotInActiveStrategy') || String(e).includes('reverted')) return [0n, 0n]
    throw e
  }
}

/**
 * Membuka posisi tabungan.
 *
 * Izin diberikan penuh sekali, bukan sebesar jumlahnya: Aqua menarik token saat
 * swap terjadi, bukan saat `ship()`, jadi izin yang pas-pasan akan habis setelah
 * satu perdagangan dan posisinya berhenti melayani.
 */
export async function openPosition(
  account: Address,
  tokenA: string,
  tokenB: string,
  amountA: bigint,
  amountB: bigint,
  /** Order yang mau dikirim — `savingsOrder` atau `strategyOrder`. */
  order: ReturnType<typeof savingsOrder>,
): Promise<{ hash: `0x${string}`; strategyHash: Hex }> {
  requireConfigured()

  for (const token of [tokenA, tokenB]) {
    const allowance = await readContract(wagmiConfig as Config, {
      address: token as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      chainId: ACTIVE_CHAIN_ID,
      args: [account, AQUA_ADDRESS as Address],
    })
    if ((allowance as bigint) === 0n) {
      const approveHash = await writeContract(wagmiConfig as Config, {
        address: token as Address,
        abi: erc20Abi,
        functionName: 'approve',
        chainId: ACTIVE_CHAIN_ID,
        args: [AQUA_ADDRESS as Address, 2n ** 256n - 1n],
        chain: null,
        account,
      })
      await waitForTransactionReceipt(wagmiConfig as Config, { hash: approveHash })
    }
  }

  // Calldata dirakit SDK resmi, bukan tangan. Sudah dibandingkan byte-per-byte
  // dengan versi tulisan tangan sebelumnya dan identik.
  const { to, data, value } = aquaContract().ship({
    app: new AquaAddress(SWAP_VM_ROUTER_ADDRESS),
    strategy: new HexString(encodeOrder(order.encoded)),
    amountsAndTokens: [
      { token: new AquaAddress(tokenA), amount: amountA },
      { token: new AquaAddress(tokenB), amount: amountB },
    ],
  })

  const hash = await sendTransaction(wagmiConfig as Config, {
    to: to as Address,
    data: data as Hex,
    value,
    chainId: ACTIVE_CHAIN_ID,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as Config, { hash })
  return { hash, strategyHash: strategyHashOf(order) }
}

/** Menutup posisi. Nol transfer token — murni pembukuan. */
export async function closePosition(
  account: Address,
  strategyHash: Hex,
  tokenA: string,
  tokenB: string,
): Promise<`0x${string}`> {
  requireConfigured()
  const { to, data, value } = aquaContract().dock({
    app: new AquaAddress(SWAP_VM_ROUTER_ADDRESS),
    strategyHash: new HexString(strategyHash),
    tokens: [new AquaAddress(tokenA), new AquaAddress(tokenB)],
  })

  const hash = await sendTransaction(wagmiConfig as Config, {
    to: to as Address,
    data: data as Hex,
    value,
    chainId: ACTIVE_CHAIN_ID,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as Config, { hash })
  return hash
}

// --- pengkodean order --------------------------------------------------------

/** keccak256(abi.encode(Order)) — nomor identitas posisi di Aqua. */
export function strategyHashOf(order: ReturnType<typeof savingsOrder>): Hex {
  // Lewat SDK resmi, bukan keccak256 sendiri. Hasilnya sama — tapi kalau Aqua
  // suatu saat mengubah cara menurunkan hash-nya, yang ikut cuma satu tempat.
  return AquaProtocolContract.calculateStrategyHash(
    new HexString(encodeOrder(order.encoded)),
  ).toString() as Hex
}

/** Hasil yang benar-benar sudah dipungut sebuah posisi tabungan. */
export interface SavingsEarnings {
  /** Berapa kali ada yang menukar lewat posisi ini. */
  swaps: number
  /** Yang dipungut, per token masuk, dalam satuan dasar token itu. */
  earned: Map<string, bigint>
  /** Volume yang lewat, per token masuk. */
  volume: Map<string, bigint>
  /** Blok swap pertama, atau null kalau belum ada swap. */
  sinceBlock: bigint | null
}

/**
 * Menghitung hasil posisi dari event, bukan dari perkiraan.
 *
 * Tidak ada APY di sini dan tidak akan ada. APY sebuah posisi likuiditas adalah
 * ramalan yang menyamar jadi angka; yang bisa dipertanggungjawabkan cuma apa
 * yang sudah terjadi.
 *
 * `flatFeeIn` memungut `feeBps` dari masukan SETELAH fee protokol, dan yang
 * sampai ke dompet maker adalah masukan setelah fee protokol itu — persisnya
 * jumlah pada event `Pushed`. Jadi bagian maker = jumlah itu × feeBps ÷ BPS,
 * bukan taksiran.
 */
export async function savingsEarnings(
  strategyHash: string,
  feeBps: bigint = SAVINGS_FEE_BPS,
): Promise<SavingsEarnings> {
  const trades = await fetchPositionTrades(strategyHash)
  const earned = new Map<string, bigint>()
  const volume = new Map<string, bigint>()

  for (const t of trades) {
    const token = t.tokenIn.toLowerCase()
    volume.set(token, (volume.get(token) ?? 0n) + t.amountIn)
    earned.set(token, (earned.get(token) ?? 0n) + (t.amountIn * feeBps) / BPS)
  }

  return {
    swaps: trades.length,
    earned,
    volume,
    sinceBlock: trades.length ? trades.reduce((a, t) => (t.blockNumber < a ? t.blockNumber : a), trades[0].blockNumber) : null,
  }
}

/** Seberapa jauh satu kantong modal terpakai di banyak pasar sekaligus. */
export interface SharedCapital {
  /** Jumlah posisi aktif yang mendaftarkan salah satu dari kedua token. */
  positions: number
  /** Yang benar-benar ada di dompet, per token. */
  real: [bigint, bigint]
  /** Jumlah yang terdaftar di seluruh posisi, per token. */
  committed: [bigint, bigint]
  /** Berapa kali lipat modal nyata terdaftar. 1 kalau tidak ada lipatan. */
  multiple: number
}

/**
 * Properti Aqua yang tidak dimiliki AMM mana pun, diukur di dompet pengguna.
 *
 * `ship()` tidak memindahkan token dan tidak memeriksa saldo, jadi saldo yang
 * sama bisa terdaftar sebagai likuiditas di beberapa pasar sekaligus. Di pool
 * mana pun, modal yang sudah masuk satu pool tidak bisa ikut bekerja di pool
 * lain.
 *
 * Yang menjaganya tetap waras: `SolvencyGuard` membaca dompet yang sama di tiap
 * pasar, jadi begitu satu pasar menghabiskan modalnya, harga pasar lain ikut
 * memburuk. Diukur di `contracts/test/SharedCapital.t.sol`.
 */
export async function sharedCapital(
  account: Address,
  positions: { hash: `0x${string}`; tokens: Set<string> }[],
  tokenA: string,
  tokenB: string,
): Promise<SharedCapital> {
  const pair = [tokenA.toLowerCase(), tokenB.toLowerCase()]
  const relevant = positions.filter((p) => [...p.tokens].some((t) => pair.includes(t.toLowerCase())))

  const committed: [bigint, bigint] = [0n, 0n]
  for (const p of relevant) {
    const [a, b] = await positionBalances(account, p.hash, tokenA, tokenB)
    committed[0] += a
    committed[1] += b
  }

  const real = await walletBalances(account, tokenA, tokenB)
  const ratios = [0, 1]
    .filter((i) => real[i] > 0n && committed[i] > 0n)
    .map((i) => Number((committed[i] * 100n) / real[i]) / 100)

  return { positions: relevant.length, real, committed, multiple: ratios.length ? Math.max(...ratios) : 1 }
}

/** Sandaran nyata satu sisi posisi, dilihat dari sudut pandang SolvencyGuard. */
export interface SideBacking {
  token: string
  /** Yang tercatat di Aqua saat posisi dibuka. */
  registered: bigint
  /** Yang benar-benar bisa ditarik Aqua sekarang. */
  backing: bigint
  /** Biaya tambahan yang akan dikenakan pada sisi ini, basis-point 1e9. */
  surchargeBps: bigint
}

/**
 * Menghitung ulang apa yang dilihat `SolvencyGuard`, di luar rantai.
 *
 * # Kenapa ini perlu ada
 *
 * Angka yang selama ini ditampilkan halaman Savings sebagai "sedang bekerja"
 * adalah jumlah TERDAFTAR — apa yang dicatat Aqua saat `ship()`. Ia tidak
 * bergerak sedikit pun ketika penggunanya membelanjakan dompetnya besok. Jadi
 * layar bisa menulis "20 WETH bekerja" sementara dompetnya tinggal 2, dan tidak
 * ada apa pun di halaman itu yang menunjukkan selisihnya.
 *
 * Inti Aqua justru selisih itu: token tidak pernah pindah, jadi sandarannya
 * boleh berubah kapan saja. Yang menjaga posisinya tetap waras adalah
 * `SolvencyGuard`, dan fungsi ini menampilkan pekerjaannya alih-alih
 * menjanjikannya.
 *
 * # Rumusnya disalin dari opcode-nya, bukan dikarang
 *
 * `SolvencyGuard._makerBacking` mengambil `min(balanceOf, allowance)` — izin
 * ikut dihitung karena maker bisa mencabutnya kapan saja tanpa menyentuh saldo.
 * `_surchargeBps` lalu menghitung `max × (terdaftar − sandaran) / terdaftar`,
 * nol saat tertutup penuh. Kalau salah satu berubah di Solidity, angka di sini
 * ikut basi — itu risikonya, dan alasan komentar ini menyebut nama fungsinya.
 */
export async function positionBacking(
  maker: Address,
  tokens: readonly string[],
  registered: readonly bigint[],
  maxSurchargeBps: bigint = DESK_SURCHARGE_BPS,
): Promise<SideBacking[]> {
  const res = await readContracts(wagmiConfig as Config, {
    contracts: tokens.flatMap((t) => [
      {
        address: t as Address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [maker],
        chainId: ACTIVE_CHAIN_ID,
      },
      {
        address: t as Address,
        abi: erc20Abi,
        functionName: 'allowance' as const,
        args: [maker, AQUA_ADDRESS as Address],
        chainId: ACTIVE_CHAIN_ID,
      },
    ]),
  })

  return tokens.map((token, i) => {
    const balance = res[i * 2]
    const allowance = res[i * 2 + 1]
    // Pembacaan gagal TIDAK boleh jadi nol: nol berarti "tidak ada sandaran",
    // dan itu peringatan paling keras yang bisa ditampilkan halaman ini.
    if (balance.status !== 'success' || allowance.status !== 'success') {
      throw new Error(`Could not read the backing for ${token.slice(0, 10)}`)
    }
    const b = balance.result as bigint
    const a = allowance.result as bigint
    const backing = b < a ? b : a
    const reg = registered[i] ?? 0n
    const surchargeBps =
      reg === 0n || backing >= reg ? 0n : (maxSurchargeBps * (reg - backing)) / reg
    return { token, registered: reg, backing, surchargeBps }
  })
}

/** Langkah yang sedang berjalan, untuk ditampilkan selagi menunggu tanda tangan. */
export interface ZapStep {
  phase: 'swapping' | 'opening'
  detail: string
}

export interface ZapOptions {
  /** Toleransi slippage untuk tukar penyeimbangnya, basis-point 1e4. */
  slippageBps?: number
  onStep?: (step: ZapStep) => void
}

/**
 * Membuka posisi tabungan dari SATU token, dengan menukar separuhnya lebih dulu.
 *
 * # Masalah yang diselesaikan
 *
 * Posisi Aqua butuh kedua sisi terisi — `XYCSwap` menolak `balanceIn = 0` dengan
 * `XYCSwapRequiresBothBalancesNonZero`, jadi posisi satu sisi terlihat hidup dan
 * tidak pernah melayani satu swap pun. Halaman Savings karena itu memblokir
 * pengguna yang cuma memegang satu token, dan menyuruhnya menukar sendiri di
 * halaman lain lalu kembali. Itu pekerjaan aplikasi yang dilempar ke pengguna.
 *
 * # Kenapa TIDAK bisa satu transaksi
 *
 * Kontrak yang mengerjakan tukar-lalu-kirim sekaligus tidak mungkin dibuat:
 * `Aqua.ship()` memakai `msg.sender` sebagai maker, jadi kontrak yang mencoba
 * mengirim untuk pengguna akan menjadi maker atas saldonya sendiri. `ship()`
 * WAJIB datang dari dompet penggunanya.
 *
 * Jadi langkahnya tidak bisa disembunyikan. Yang bisa: menjadikannya satu
 * keputusan, dan melaporkan progresnya apa adanya lewat `onStep`.
 *
 * # Kenapa separuh, dan kenapa separuh menurut NILAI
 *
 * Rasio kedua sisi itulah yang menetapkan harga posisi. Membagi rata menurut
 * nilai menaruh harga pembukaan dekat harga pasar; membagi menurut JUMLAH akan
 * melahirkan posisi yang langsung salah harga dan jadi sasaran arbitrase.
 */
export async function zapAndOpen(
  account: Address,
  tokenA: string,
  tokenB: string,
  wallet: [bigint, bigint],
  percent: number,
  order: ReturnType<typeof savingsOrder>,
  opts: ZapOptions = {},
): Promise<{ hash: `0x${string}`; strategyHash: Hex }> {
  requireConfigured()
  const { slippageBps = 100, onStep } = opts

  const aside = splitAmounts(wallet, percent)
  const tokens = [tokenA, tokenB] as const

  // Dua sisi sudah terisi: tidak ada yang perlu ditukar.
  if (aside[0] > 0n && aside[1] > 0n) {
    onStep?.({ phase: 'opening', detail: 'Opening position…' })
    return openPosition(account, tokenA, tokenB, aside[0], aside[1], order)
  }

  const have = aside[0] > 0n ? 0 : 1
  const want = have === 0 ? 1 : 0
  if (aside[have] === 0n) throw new Error('Nothing to set aside — your wallet is empty.')

  const toSwap = aside[have] / 2n
  if (toSwap === 0n) throw new Error('That share is too small to split into a position.')

  // Diperiksa SEBELUM transaksi pertama, bukan di tengah. Kutipan yang gagal di
  // sini berarti meja tidak bisa melayani tukarnya — dan mengetahuinya setelah
  // pengguna menandatangani satu transaksi adalah cara terburuk menyampaikannya.
  const expected = await quote(tokens[have], tokens[want], toSwap, account)
  if (expected === 0n) {
    throw new Error('The desk cannot price this swap right now — try a larger share.')
  }

  const minOut = (expected * BigInt(10_000 - slippageBps)) / 10_000n
  onStep?.({ phase: 'swapping', detail: 'Balancing your position…' })
  await swap(account, tokens[have], tokens[want], toSwap, minOut)

  /**
   * Saldo dibaca ULANG, bukan diambil dari kutipan.
   *
   * Kutipan itu perkiraan sebelum transaksi; yang benar-benar diterima bisa
   * lebih kecil kalau harganya bergeser. Mendaftarkan angka kutipan berarti
   * `ship()` mengalokasikan jumlah yang mungkin tidak dimiliki penggunanya —
   * dan Aqua TIDAK memeriksa saldo saat `ship`, jadi kesalahannya tidak akan
   * ketahuan sampai swap pertama gagal.
   */
  const after = await walletBalances(account, tokenA, tokenB)

  const ship: [bigint, bigint] = [0n, 0n]
  ship[have] = aside[have] - toSwap
  ship[want] = after[want] < wallet[want] ? 0n : after[want] - wallet[want]
  if (ship[want] === 0n) {
    throw new Error('The swap produced nothing to pair with. Your tokens are still in your wallet.')
  }

  onStep?.({ phase: 'opening', detail: 'Opening position…' })
  return openPosition(account, tokenA, tokenB, ship[0], ship[1], order)
}
