/**
 * Pembayaran dan pembungkusan token: semua yang menyentuh rantai.
 *
 * Perakitan payment link ada di `lib/paymentLink.ts` — logika murni, dipisah
 * supaya bisa diuji tanpa wagmi.
 */
import {
  readContract,
  sendTransaction,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import { erc20Abi, type Address } from 'viem'

import type { Config } from '@wagmi/core'
import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'

/**
 * Mengirim pembayaran dari dompet yang terhubung.
 *
 * Token asli rantai (`native`) dikirim lewat `sendTransaction`, sisanya lewat
 * `transfer` ERC20 — dibedakan dari flag `native` di registry token, bukan dari
 * kode tokennya. Perbedaan itu penting: mencocokkan kode ('ETH', 'FLR', …)
 * pernah membuat jalur native tidak pernah terpilih di rantai yang kode
 * nativenya berbeda, dan uangnya diam-diam lewat jalur yang salah.
 */
export async function sendPayment(params: {
  account: Address
  to: Address
  /** Alamat ERC20; kosongkan untuk token asli rantai. */
  token?: Address
  amount: bigint
}): Promise<`0x${string}`> {
  const hash = params.token
    ? await writeContract(wagmiConfig as Config, {
        address: params.token,
        abi: erc20Abi,
        functionName: 'transfer',
        chainId: ACTIVE_CHAIN_ID,
        args: [params.to, params.amount],
        chain: null,
        account: params.account,
      })
    : await sendTransaction(wagmiConfig as Config, {
        to: params.to,
        value: params.amount,
        chainId: ACTIVE_CHAIN_ID,
        account: params.account,
      })
  await waitForTransactionReceipt(wagmiConfig as Config, { hash })
  return hash
}

const decimalsCache = new Map<string, number>()

/**
 * Desimal token, dibaca dari kontraknya.
 *
 * Angka di `lib/tokens.ts` tidak bisa dipercaya untuk ini: di sana USDC
 * ditulis 7 desimal — angka warisan dari aplikasi asal — sementara mock yang
 * benar-benar ter-deploy memakai 6. Selisih satu
 * desimal berarti kiriman sepuluh kali lipat dari yang diketik, dan tidak ada
 * yang gagal saat itu terjadi.
 *
 * Nilai native (tanpa alamat) selalu 18.
 */
export async function tokenDecimals(token?: Address): Promise<number> {
  if (!token) return 18
  const key = token.toLowerCase()
  const cached = decimalsCache.get(key)
  if (cached !== undefined) return cached
  const value = Number(
    await readContract(wagmiConfig as Config, {
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
      chainId: ACTIVE_CHAIN_ID,
    }),
  )
  decimalsCache.set(key, value)
  return value
}

const WETH_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'payable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const

/**
 * Apakah token ini WETH sungguhan yang bisa dibungkus.
 *
 * Di anvil, "WETH" adalah MockERC20 tanpa `deposit()` — mencetaknya lewat faucet.
 * Di Base (atau fork-nya) ia WETH9 asli. Membedakannya dengan menyimulasikan
 * `deposit()`, bukan menebak dari alamat, supaya jawabannya benar di rantai mana
 * pun.
 */
export async function canWrapNative(weth: Address): Promise<boolean> {
  try {
    await simulateContract(wagmiConfig as Config, {
      address: weth,
      abi: WETH_ABI,
      functionName: 'deposit',
      chainId: ACTIVE_CHAIN_ID,
      value: 0n,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Membungkus ETH jadi WETH.
 *
 * Ini satu-satunya jalan "menaruh dana" yang sungguhan di aplikasi ini — bukan
 * karena ada kontrak yang menampung, tapi karena posisi Aqua dan swap bekerja
 * dengan ERC20, sementara orang memegang ETH. Tanpa langkah ini, pemegang ETH
 * di rantai sungguhan tidak bisa berbuat apa-apa.
 */
export async function wrapNative(account: Address, weth: Address, amount: bigint): Promise<`0x${string}`> {
  const hash = await writeContract(wagmiConfig as Config, {
    address: weth,
    abi: WETH_ABI,
    functionName: 'deposit',
    chainId: ACTIVE_CHAIN_ID,
    value: amount,
    chain: null,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as Config, { hash })
  return hash
}

/** Membuka bungkus WETH kembali jadi ETH. */
export async function unwrapNative(account: Address, weth: Address, amount: bigint): Promise<`0x${string}`> {
  const hash = await writeContract(wagmiConfig as Config, {
    address: weth,
    abi: WETH_ABI,
    functionName: 'withdraw',
    chainId: ACTIVE_CHAIN_ID,
    args: [amount],
    chain: null,
    account,
  })
  await waitForTransactionReceipt(wagmiConfig as Config, { hash })
  return hash
}

export { buildPaymentLink, parsePaymentLink, type PaymentRequest } from './paymentLink'
