/**
 * Meja Aqua — swap dari dompet pengguna ke likuiditas yang tidak pernah
 * meninggalkan dompet market maker.
 *
 * Alurnya sengaja sederhana: pengguna memberi izin ke router, lalu memanggil
 * `swap`. Tidak ada kontrak perantara di sisi pengguna. Itu dimungkinkan flag
 * `useTransferFromAndAquaPush`, yang membuat SwapVM sendiri menarik tokenIn dari
 * dompet taker dan mendorongnya ke Aqua.
 *
 * Order-nya dirakit ulang di sini dari parameter konfigurasi, dan harus
 * menghasilkan byte yang persis sama dengan yang di-`ship()` maker — kalau
 * meleset satu bit, `strategyHash`-nya berbeda dan Aqua tidak menemukan
 * saldonya.
 */
// wagmiConfig di-cast saat dipakai: tipe Config generiknya tidak menyatu antar
// salinan @wagmi/core yang ter-hoist. Pola yang sama dipakai real-sdk.ts.
import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { erc20Abi, parseAbi } from 'viem'
import {
  buildOrder,
  buildTakerData,
  exclusiveFill,
  flatFeeIn,
  program,
  salt,
  solvencyGuard,
  xycSwap,
  type Hex,
} from '@iqia/swapvm'

import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'
import {
  SWAP_VM_ROUTER_ADDRESS,
  DESK_MAKER,
  DESK_SALT,
  DESK_FEE_BPS,
  DESK_SURCHARGE_BPS,
  DESK_EXCLUSIVE_TAKER,
  AQUA_CONFIGURED,
} from './config'

export const swapVmAbi = parseAbi([
  'struct Order { address maker; uint256 traits; bytes data; }',
  'function quote(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
  'function swap(Order order, address tokenIn, address tokenOut, uint256 amount, bytes takerTraitsAndData) returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash)',
])

/** Program strategi meja. Harus sama persis dengan yang di-ship maker. */
export function deskProgram(): Hex {
  return program(
    ...(DESK_EXCLUSIVE_TAKER ? [exclusiveFill(DESK_EXCLUSIVE_TAKER)] : []),
    ...(DESK_SURCHARGE_BPS > 0n ? [solvencyGuard(DESK_SURCHARGE_BPS)] : []),
    ...(DESK_FEE_BPS > 0n ? [flatFeeIn(DESK_FEE_BPS)] : []),
    xycSwap(),
    salt(DESK_SALT),
  )
}

export function deskOrder() {
  const order = buildOrder({ maker: DESK_MAKER, program: deskProgram() })
  return { maker: order.maker, traits: BigInt(order.traits), data: order.data } as const
}

export class DeskNotConfiguredError extends Error {
  constructor() {
    super('Meja Aqua belum dikonfigurasi. Isi VITE_SWAP_VM_ROUTER dan VITE_DESK_MAKER.')
  }
}

function requireConfigured() {
  if (!AQUA_CONFIGURED || !DESK_MAKER) throw new DeskNotConfiguredError()
}

/** Harga di muka. Tanpa gas, dan angkanya sama persis dengan hasil swap. */
export async function quote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint> {
  requireConfigured()
  const [, amountOut] = await readContract(wagmiConfig as any, {
    address: SWAP_VM_ROUTER_ADDRESS as `0x${string}`,
    abi: swapVmAbi,
    functionName: 'quote',
    chainId: ACTIVE_CHAIN_ID,
    args: [
      deskOrder(),
      tokenIn as `0x${string}`,
      tokenOut as `0x${string}`,
      amountIn,
      buildTakerData({ taker: DESK_MAKER, isExactIn: true, useTransferFromAndAquaPush: true }),
    ],
  })
  return amountOut
}

export interface SwapResult {
  hash: `0x${string}`
  amountIn: bigint
  amountOut: bigint
}

/**
 * Menjalankan swap dari dompet yang terhubung.
 *
 * @param minAmountOut Ambang slippage. Ditegakkan SwapVM lewat threshold di
 *   taker data, jadi transaksinya batal kalau harganya bergeser — bukan
 *   diperiksa setelah dana berpindah.
 */
export async function swap(
  account: `0x${string}`,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint,
): Promise<SwapResult> {
  requireConfigured()

  const allowance = await readContract(wagmiConfig as any, {
    address: tokenIn as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    chainId: ACTIVE_CHAIN_ID,
    args: [account, SWAP_VM_ROUTER_ADDRESS as `0x${string}`],
  })

  if (allowance < amountIn) {
    const approveHash = await writeContract(wagmiConfig as any, {
      address: tokenIn as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      chainId: ACTIVE_CHAIN_ID,
      args: [SWAP_VM_ROUTER_ADDRESS as `0x${string}`, amountIn],
      chain: null,
      account,
    })
    await waitForTransactionReceipt(wagmiConfig as any, { hash: approveHash })
  }

  const takerData = buildTakerData({
    taker: account,
    isExactIn: true,
    threshold: minAmountOut,
    useTransferFromAndAquaPush: true,
  })

  const args = [
    deskOrder(),
    tokenIn as `0x${string}`,
    tokenOut as `0x${string}`,
    amountIn,
    takerData,
  ] as const

  // Simulasi lebih dulu supaya kegagalan muncul sebagai pesan, bukan sebagai
  // transaksi gagal yang tetap memakan gas.
  const [quotedIn, quotedOut] = await readContract(wagmiConfig as any, {
    address: SWAP_VM_ROUTER_ADDRESS as `0x${string}`,
    abi: swapVmAbi,
    functionName: 'quote',
    chainId: ACTIVE_CHAIN_ID,
    args,
  })

  const hash = await writeContract(wagmiConfig as any, {
    address: SWAP_VM_ROUTER_ADDRESS as `0x${string}`,
    abi: swapVmAbi,
    functionName: 'swap',
    chainId: ACTIVE_CHAIN_ID,
    args,
    chain: null,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as any, { hash })

  return { hash, amountIn: quotedIn, amountOut: quotedOut }
}
