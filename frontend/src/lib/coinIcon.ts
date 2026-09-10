/**
 * Ikon koin dari Cryptofonts/cryptoicons.
 *
 * # Ditautkan, tidak dibundel
 *
 * Set ikonnya berlisensi GPL-3.0. Memuat 1.000-an SVG ke dalam bundel berarti
 * mendistribusikan karya GPL bersama aplikasi ini, dengan konsekuensi copyleft
 * yang menyertainya. Menautkan berkas dari CDN bukan pendistribusian — dan
 * kebetulan itu juga pilihan yang paling sedikit kodenya: tidak ada aset yang
 * disalin, tidak ada dependensi baru, dan tidak ada 1.000 berkas yang harus
 * ikut diperbarui.
 *
 * # Kenapa berkasnya tidak bisa diwarnai ulang
 *
 * Tiap ikon adalah cakram berwarna penuh dengan lambang putih di atasnya —
 * USDC `#2775CA`, DAI gradien oranye. Sebagai CSS `mask` hasilnya cakram pekat,
 * karena seluruh isi lingkarannya buram. Jadi ikonnya dipakai apa adanya, dan
 * chip di sekelilingnya yang menyingkir.
 */

const BASE = 'https://cdn.jsdelivr.net/gh/Cryptofonts/cryptoicons@master/SVG'

/**
 * Nama berkasnya huruf kecil tanpa hiasan.
 *
 * Awalan `b` dibuang: registry token memakai `bETH`/`bUSDC` untuk varian
 * terbungkus, dan yang dimaksud tetap ikon aset yang sama.
 */
export function tokenIconUrl(symbol: string): string {
  return `${BASE}/${symbol.replace(/^b/, '').toLowerCase()}.svg`
}
