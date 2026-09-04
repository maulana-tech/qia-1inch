/**
 * Payment link: alamat + nominal opsional, dikemas jadi satu URL.
 *
 * Tidak ada kontrak di balik ini dan memang tidak perlu — link-nya cuma
 * pra-mengisi formulir kirim di sisi penerima tautan. Pembayarannya sendiri
 * transfer ERC20 biasa dari dompet pembayar ke alamat penerima.
 */
import { readContract, sendTransaction, waitForTransactionReceipt, writeContract } from '@wagmi/core'
import { erc20Abi, getAddress, isAddress, type Address } from 'viem'

import { wagmiConfig, ACTIVE_CHAIN_ID } from './wagmi'

export interface PaymentRequest {
  /** Alamat penerima, sudah dinormalkan ke checksum. */
  address: string
  /** Label opsional yang ditampilkan ke pembayar. */
  name?: string
  /** Nominal yang disarankan, apa adanya sebagai teks. */
  amount?: string
  /** Kode token yang disarankan, mis. USDC. */
  token?: string
}

/**
 * Nominal sengaja tidak diikutkan kalau tidak masuk akal, bukan ditulis apa
 * adanya. Link dengan `amount=abc` akan mengisi formulir dengan sampah dan
 * pembayar baru sadar saat transaksinya gagal.
 */
export function buildPaymentLink(req: PaymentRequest, origin: string): string {
  const params = new URLSearchParams()
  const name = req.name?.trim()
  if (name) params.set('name', name)
  const amount = req.amount?.trim()
  if (amount && Number(amount) > 0) params.set('amount', amount)
  if (req.token) params.set('token', req.token)
  const query = params.toString()
  return `${origin}/pay/${req.address}${query === '' ? '' : `?${query}`}`
}

/**
 * Membaca kembali link jadi permintaan bayar.
 *
 * Alamatnya divalidasi dengan `isAddress` viem. Ini pernah salah di tempat
 * lain: validator yang tersisa dari silsilah Stellar menolak SETIAP alamat EVM
 * yang sah, dan gejalanya cuma tombol yang mati tanpa alasan.
 */
export function parsePaymentLink(
  rawAddress: string | undefined,
  search: URLSearchParams,
): PaymentRequest | null {
  if (!rawAddress || !isAddress(rawAddress)) return null
  const name = search.get('name')?.trim()
  const amount = search.get('amount')?.trim()
  const token = search.get('token')?.trim()
  return {
    address: getAddress(rawAddress),
    ...(name ? { name } : {}),
    ...(amount && Number(amount) > 0 ? { amount } : {}),
    ...(token ? { token } : {}),
  }
}

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
    ? await writeContract(wagmiConfig as any, {
        address: params.token,
        abi: erc20Abi,
        functionName: 'transfer',
        chainId: ACTIVE_CHAIN_ID,
        args: [params.to, params.amount],
        chain: null,
        account: params.account,
      })
    : await sendTransaction(wagmiConfig as any, {
        to: params.to,
        value: params.amount,
        chainId: ACTIVE_CHAIN_ID,
        account: params.account,
      })
  await waitForTransactionReceipt(wagmiConfig as any, { hash })
  return hash
}

const decimalsCache = new Map<string, number>()

/**
 * Desimal token, dibaca dari kontraknya.
 *
 * Angka di `lib/tokens.ts` tidak bisa dipercaya untuk ini: di sana USDC
 * ditulis 7 desimal — sisa dari sirkuit Noir yang mensyaratkan nominal muat di
 * 64 bit — sementara mock yang benar-benar ter-deploy memakai 6. Selisih satu
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
    await readContract(wagmiConfig as any, {
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
      chainId: ACTIVE_CHAIN_ID,
    }),
  )
  decimalsCache.set(key, value)
  return value
}
