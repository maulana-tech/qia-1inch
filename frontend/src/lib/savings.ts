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
import { readContract, readContracts, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { erc20Abi, keccak256, type Address } from 'viem'
import {
  buildOrder,
  encodeOrder,
  flatFeeIn,
  program,
  salt,
  solvencyGuard,
  xycSwap,
  type Hex,
} from '@iqia/swapvm'

import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'
import {
  AQUA_ADDRESS,
  SWAP_VM_ROUTER_ADDRESS,
  DESK_SURCHARGE_BPS,
  SAVINGS_FEE_BPS,
  AQUA_CONFIGURED,
} from './config'

export const aquaAbi = [
  {
    type: 'function',
    name: 'ship',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'app', type: 'address' },
      { name: 'strategy', type: 'bytes' },
      { name: 'tokens', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [{ name: 'strategyHash', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'dock',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'app', type: 'address' },
      { name: 'strategyHash', type: 'bytes32' },
      { name: 'tokens', type: 'address[]' },
    ],
    outputs: [],
  },
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
 * `flatFeeIn` adalah sumber penghasilannya, dan tanpa itu fiturnya kehilangan
 * seluruh maknanya: pada kurva murni tanpa fee, penukar mendapat harga adil dan
 * maker hanya menanggung pergerakan inventaris. Urutan penting — fee harus
 * SEBELUM instruksi kurva, sama seperti pada program meja.
 */
export function savingsProgram(saltValue: bigint): Hex {
  return program(
    ...(DESK_SURCHARGE_BPS > 0n ? [solvencyGuard(DESK_SURCHARGE_BPS)] : []),
    ...(SAVINGS_FEE_BPS > 0n ? [flatFeeIn(SAVINGS_FEE_BPS)] : []),
    xycSwap(),
    salt(saltValue),
  )
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
  if (!AQUA_CONFIGURED) throw new SavingsNotConfiguredError()
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
  const res = await readContracts(wagmiConfig as any, {
    contracts: [tokenA, tokenB].map((token) => ({
      address: AQUA_ADDRESS as Address,
      abi: aquaAbi,
      functionName: 'rawBalances' as const,
      args: [maker, SWAP_VM_ROUTER_ADDRESS as Address, strategyHash, token as Address],
      chainId: ACTIVE_CHAIN_ID,
    })),
  })
  const read = (i: number) => (res[i].result as readonly [bigint, number] | undefined)
  // tokensCount 0xff berarti sudah di-dock; saldonya nol tapi hash-nya terkunci.
  const val = (i: number) => {
    const r = read(i)
    return r && r[1] !== 0 && r[1] !== 255 ? r[0] : 0n
  }
  return [val(0), val(1)]
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
  saltValue: bigint,
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

  const order = savingsOrder(account, saltValue)
  const hash = await writeContract(wagmiConfig as any, {
    address: AQUA_ADDRESS as Address,
    abi: aquaAbi,
    functionName: 'ship',
    chainId: ACTIVE_CHAIN_ID,
    args: [
      SWAP_VM_ROUTER_ADDRESS as Address,
      encodeOrder(order.encoded),
      [tokenA as Address, tokenB as Address],
      [amountA, amountB],
    ],
    chain: null,
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
  const hash = await writeContract(wagmiConfig as any, {
    address: AQUA_ADDRESS as Address,
    abi: aquaAbi,
    functionName: 'dock',
    chainId: ACTIVE_CHAIN_ID,
    args: [SWAP_VM_ROUTER_ADDRESS as Address, strategyHash, [tokenA as Address, tokenB as Address]],
    chain: null,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as any, { hash })
  return hash
}

// --- pengkodean order --------------------------------------------------------

/** keccak256(abi.encode(Order)) — nomor identitas posisi di Aqua. */
export function strategyHashOf(order: ReturnType<typeof savingsOrder>): Hex {
  return keccak256(encodeOrder(order.encoded)) as Hex
}
