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
    super('Aqua belum dikonfigurasi. Isi VITE_AQUA dan VITE_SWAP_VM_ROUTER.')
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
  const res = await readContracts(wagmiConfig as any, {
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
export async function positionBalances(
  maker: Address,
  strategyHash: Hex,
  tokenA: string,
  tokenB: string,
): Promise<[bigint, bigint]> {
  // `safeBalances` membaca kedua kaki sekaligus DAN menolak kalau strateginya
  // tidak aktif — dua hal yang sebelumnya dikerjakan dua panggilan `rawBalances`
  // plus pemeriksaan `tokensCount` tulisan tangan.
  try {
    const res = (await readContract(wagmiConfig as any, {
      address: AQUA_ADDRESS as Address,
      abi: aquaAbi,
      functionName: 'safeBalances',
      args: [maker, SWAP_VM_ROUTER_ADDRESS as Address, strategyHash, tokenA as Address, tokenB as Address],
      chainId: ACTIVE_CHAIN_ID,
    })) as readonly [bigint, bigint]
    return [res[0], res[1]]
  } catch {
    // Strategi belum dibuka atau sudah di-dock. Nol, bukan galat.
    return [0n, 0n]
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
    const allowance = await readContract(wagmiConfig as any, {
      address: token as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      chainId: ACTIVE_CHAIN_ID,
      args: [account, AQUA_ADDRESS as Address],
    })
    if ((allowance as bigint) === 0n) {
      const approveHash = await writeContract(wagmiConfig as any, {
        address: token as Address,
        abi: erc20Abi,
        functionName: 'approve',
        chainId: ACTIVE_CHAIN_ID,
        args: [AQUA_ADDRESS as Address, 2n ** 256n - 1n],
        chain: null,
        account,
      })
      await waitForTransactionReceipt(wagmiConfig as any, { hash: approveHash })
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

  const hash = await sendTransaction(wagmiConfig as any, {
    to: to as Address,
    data: data as Hex,
    value,
    chainId: ACTIVE_CHAIN_ID,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as any, { hash })
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

  const hash = await sendTransaction(wagmiConfig as any, {
    to: to as Address,
    data: data as Hex,
    value,
    chainId: ACTIVE_CHAIN_ID,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as any, { hash })
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
