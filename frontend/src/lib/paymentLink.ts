/**
 * Payment link: alamat + nominal opsional, dikemas jadi satu URL.
 *
 * Tidak ada kontrak di balik ini dan memang tidak perlu — link-nya cuma
 * pra-mengisi formulir kirim di sisi penerima tautan. Pembayarannya sendiri
 * transfer ERC20 biasa dari dompet pembayar ke alamat penerima.
 *
 * # Kenapa terpisah dari `payments.ts`
 *
 * Merakit dan mengurai link itu logika murni: masuk string, keluar string. Ia
 * tidak menyentuh rantai sama sekali. Dipisah supaya bisa diuji di node tanpa
 * menyeret wagmi — dan logika uang yang tidak bisa diuji adalah logika uang yang
 * tidak diperiksa siapa pun.
 */
import { getAddress, isAddress } from 'viem'

export interface PaymentRequest {
  /** Alamat penerima, sudah dinormalkan ke checksum. */
  address: string
  /** Label opsional yang ditampilkan ke pembayar. */
  name?: string
  /** Nominal yang disarankan, apa adanya sebagai teks. */
  amount?: string
  /** Kode token yang disarankan, mis. USDC. */
  token?: string
  /**
   * Rantai tempat link ini dibuat.
   *
   * Ikut dibawa karena alamat EVM sah di SETIAP rantai, dan token dengan kode
   * sama bisa berupa kontrak yang sama sekali berbeda di rantai lain. Link tanpa
   * penanda rantai adalah permintaan bayar yang tidak menyebut mata uangnya —
   * ia akan tetap "berhasil", ke aset yang salah.
   */
  chainId?: number
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
  if (req.chainId) params.set('chain', String(req.chainId))
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
  const chainId = Number(search.get('chain'))
  return {
    address: getAddress(rawAddress),
    ...(name ? { name } : {}),
    ...(amount && Number(amount) > 0 ? { amount } : {}),
    ...(token ? { token } : {}),
    ...(Number.isInteger(chainId) && chainId > 0 ? { chainId } : {}),
  }
}

