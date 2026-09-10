import { parseUnits } from 'viem'

/**
 * Mengurai jumlah yang ditulis pengguna jadi satuan dasar token.
 *
 * # Kenapa bukan `parseUnits` langsung
 *
 * `parseUnits` viem sudah benar untuk hampir semuanya, dan dipakai di sini
 * untuk bagian itu. Dua hal yang tidak boleh diwarisi:
 *
 *   - **Ia membulatkan desimal berlebih ke ATAS.** `parseUnits('1.9999999', 6)`
 *     menghasilkan `2000000` — dua token penuh, padahal orangnya menulis kurang
 *     dari dua. Mengirim lebih banyak daripada yang ditulis adalah kesalahan
 *     yang tidak boleh dibuat aplikasi uang, jadi di sini dipangkas, bukan
 *     dibulatkan.
 *   - **Ia menerima angka negatif** dan melempar untuk masukan yang belum
 *     selesai diketik (`''`, `'.'`, `'1e-7'`). Untuk kolom input, keduanya
 *     "belum ada angka", bukan galat yang perlu ditampilkan.
 *
 * Yang digantikan: jalur lama menghitung `harga * jumlah` sebagai float lalu
 * `parseUnits(String(hasil))`. `0.1 * 3` jadi `0.30000000000000004`, angka kecil
 * dicetak `1e-7` dan ditolak, dan pembulatan floatnya diam-diam mengubah jumlah
 * yang benar-benar dikirim ke rantai.
 *
 * @returns Jumlah dalam satuan dasar, atau null kalau masukannya belum berupa
 *   angka positif yang sah.
 */
export function parseAmountStrict(input: string, decimals: number): bigint | null {
  const trimmed = input.trim()
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') return null

  const [whole, frac] = trimmed.split('.')
  const truncated = frac === undefined ? whole : `${whole || '0'}.${frac.slice(0, decimals) || '0'}`

  const value = parseUnits(truncated, decimals)
  return value > 0n ? value : null
}
